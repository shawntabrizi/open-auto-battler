//! Open Auto Battler Arena (`@oab/arena` version 3, casual mode) — PolkaVM
//! contract.
//!
//! The casual game of arena v2 (`contract/src/main.rs`) on the layered
//! contracts (`docs/CONTRACT_ARCHITECTURE.md` sections 4.4 and 4.4.1):
//!
//! - **The engine is linked.** `oab-engine` runs the start and every turn in
//!   this contract. No call to the `@oab/engine` contract.
//! - **Identity resolves every game call.** `@oab/identity.resolve(msg.sender)`
//!   gives the player: a session key plays for its owner, a plain account
//!   plays as itself. A failed resolve reverts (decision Q3).
//! - **Content is read once per set.** Admin `cacheSet` copies the set bundle
//!   and the house ghosts from `@oab/content`, checks the bundle hash against
//!   Content's `setHash`, and stores them here. Turns never call Content.
//! - **House ghosts** (decision Q1). When a bracket holds fewer than
//!   [`THIN_POOL`] boards, the set's house ghosts of that round join the
//!   draw, so an empty bracket is not a free win.
//! - **Every failure reverts** with a typed error.
//!
//! The rules and the flow are arena v2's: start with a set id, shop turns,
//! battle against a ghost of the same bracket (set, round, wins, lives), lives
//! and wins, game over, end. Seeds are arena v2's, keyed by the resolved
//! player instead of `msg.sender`.
//!
//! Storage: SCALE values at `keccak256(domain ++ key)`, written with
//! `set_storage` (variable keys) only. pallet-revive stores at most 416 bytes
//! per item (`pallet_revive::limits::STORAGE_BYTES`); every write checks it,
//! and the set bundle is stored in 416-byte pages.

#![cfg_attr(not(any(test, feature = "std", feature = "abi-gen")), no_main, no_std)]

// The contract macro declares `extern crate alloc` at the crate root (except on
// the abi-gen build) but injects no `use` imports, so import them here.
#[cfg(all(feature = "abi-gen", not(test)))]
extern crate alloc;
#[allow(unused_imports)]
use alloc::{vec, vec::Vec};

use parity_scale_codec::{Decode, DecodeAll, Encode};

use oab_battle::rng::{BattleRng, XorShiftRng};
use oab_battle::types::{CommitTurnAction, GhostBoardUnit, RoundValue, SetIdValue};
use oab_engine::{SetBundle, TurnInput, ENGINE_VERSION};
use oab_game::{GameConfig, GamePhase};
use oab_protocol::{BattleReport, HouseGhost, ModeGame, MAX_HOUSE_GHOST_UNITS};

/// Largest value pallet-revive stores in one item.
pub const STORAGE_BYTES: usize = 416;

/// Boards kept per ghost bracket (arena v2 `MAX_GHOSTS_PER_BRACKET`). Ten
/// boards of five units encode to 311 bytes.
pub const MAX_GHOSTS_PER_BRACKET: usize = 10;

/// A bracket with fewer boards than this is thin: the house ghosts of the
/// round join the draw (decision Q1). The published sets have three house
/// ghosts per round.
pub const THIN_POOL: usize = 3;

/// House ghosts of a round above this are not cached. A game in a later
/// round meets the house ghosts of the last cached round.
pub const MAX_HOUSE_ROUND: RoundValue = 32;

/// Pages of one cached bundle at most (255 × 416 bytes = 106 KB).
pub const MAX_PAGES: usize = 255;

// ── Storage domains ───────────────────────────────────────────────────────────

/// () -> admin address.
const DOM_ADMIN: u8 = 0;
/// () -> `Config` (dependency addresses and the draining flag).
const DOM_CONFIG: u8 = 1;
/// () -> next run id (`u64`, starts at 1).
const DOM_NEXT_RUN: u8 = 2;
/// set id -> `SetMeta`.
const DOM_SET_META: u8 = 3;
/// set id ++ page (u8) -> up to 416 bytes of SCALE(SetBundle).
const DOM_SET_PAGE: u8 = 4;
/// set id ++ round (u8) -> house ghost boards of that round (gaps filled).
const DOM_HOUSE: u8 = 5;
/// bracket (set id LE ++ round ++ wins ++ lives) -> `GhostPool`.
const DOM_GHOST: u8 = 6;
/// player -> `Option<ModeGame>`. Never deleted: `None` after a game ends, so
/// the next game overwrites the item and pays no new item deposit.
const DOM_GAME: u8 = 7;

/// Ghost boards of one bracket, oldest first.
pub type GhostPool = Vec<Vec<GhostBoardUnit>>;

/// Dependency addresses (set once after deploy with `setDeps`, section 11)
/// and the draining flag.
#[derive(Debug, Clone, Default, PartialEq, Eq, Encode, Decode)]
pub struct Config {
    pub identity: [u8; 20],
    pub content: [u8; 20],
    /// The `@oab/engine` contract that runs [`ENGINE_VERSION`]. Never called
    /// by the arena; stored so clients and auditors can find it.
    pub engine: [u8; 20],
    /// No new games. Running games finish.
    pub draining: bool,
}

/// A cached set.
#[derive(Debug, Clone, PartialEq, Eq, Encode, Decode)]
pub struct SetMeta {
    /// keccak256(SCALE(SetBundle)), checked against Content's `setHash`.
    pub hash: [u8; 32],
    /// Length of SCALE(SetBundle) in bytes.
    pub len: u32,
    pub pages: u8,
    /// House ghosts are cached for rounds `1..=house_rounds` (0: none).
    pub house_rounds: RoundValue,
    /// New games may use the set.
    pub allowed: bool,
}

/// The rules of every Arena game (arena v2 `default_config`).
pub fn arena_config() -> GameConfig {
    oab_game::sealed::default_config()
}

/// The bracket key of arena v2 (`bracket_bytes`).
pub fn bracket_bytes(set_id: SetIdValue, round: RoundValue, wins: RoundValue, lives: RoundValue) -> [u8; 5] {
    let s = set_id.to_le_bytes();
    [s[0], s[1], round, wins, lives]
}

/// Add `board` as the newest ghost of `pool`, dropping the oldest when the
/// pool is full. An empty board is not a ghost (arena v2 `push_ghost`).
pub fn push_ghost(pool: &mut GhostPool, board: Vec<GhostBoardUnit>) {
    if board.is_empty() {
        return;
    }
    if pool.len() >= MAX_GHOSTS_PER_BRACKET {
        pool.remove(0);
    }
    pool.push(board);
}

/// The opponent of a turn. A full enough pool is drawn from alone, exactly
/// as arena v2 `select_ghost` does; a thin pool draws from the pool and the
/// round's house ghosts together. Empty when both are empty.
pub fn pick_opponent(pool: &GhostPool, house: &GhostPool, battle_seed: u64) -> Vec<GhostBoardUnit> {
    let mut candidates: Vec<&Vec<GhostBoardUnit>> = pool.iter().collect();
    if pool.len() < THIN_POOL {
        candidates.extend(house.iter());
    }
    if candidates.is_empty() {
        return Vec::new();
    }
    let mut rng = XorShiftRng::seed_from_u64(battle_seed);
    candidates[rng.gen_range(candidates.len())].clone()
}

/// House ghosts by round for rounds `1..=n`: at most
/// [`MAX_GHOSTS_PER_BRACKET`] boards per round (first in list order), boards
/// of 1 to 5 units, rounds up to [`MAX_HOUSE_ROUND`]. A round without a board
/// takes the boards of the nearest lower round, or else of the nearest higher
/// round. Empty when there is no usable board.
pub fn house_by_round(ghosts: &[HouseGhost]) -> Vec<GhostPool> {
    let mut rounds: Vec<GhostPool> = Vec::new();
    for g in ghosts {
        if g.round == 0 || g.round > MAX_HOUSE_ROUND || g.board.is_empty() || g.board.len() > MAX_HOUSE_GHOST_UNITS {
            continue;
        }
        let r = g.round as usize;
        if rounds.len() < r {
            rounds.resize(r, Vec::new());
        }
        if rounds[r - 1].len() < MAX_GHOSTS_PER_BRACKET {
            rounds[r - 1].push(g.board.clone());
        }
    }
    for r in 1..rounds.len() {
        if rounds[r].is_empty() {
            rounds[r] = rounds[r - 1].clone();
        }
    }
    if let Some(first) = rounds.iter().position(|p| !p.is_empty()) {
        for r in 0..first {
            rounds[r] = rounds[first].clone();
        }
    }
    rounds
}

/// Arena v2 `derive_seed`: `keccak(addr ++ context ++ nonce_le)[..8]` LE.
fn seed_input(addr: &[u8; 20], context: &[u8], nonce: u64) -> Vec<u8> {
    let mut input = Vec::with_capacity(20 + context.len() + 8);
    input.extend_from_slice(addr);
    input.extend_from_slice(context);
    input.extend_from_slice(&nonce.to_le_bytes());
    input
}

pvm_contract_sdk::abi_import! {
    #![abi_import(alloc = true)]
    pragma solidity ^0.8.30;

    interface IIdentity {
        function resolve(address account) external view returns (address);
    }
}

pvm_contract_sdk::abi_import! {
    #![abi_import(alloc = true)]
    pragma solidity ^0.8.30;

    interface IContent {
        function getSetBundle(uint16 setId) external view returns (bytes memory);
        function setHash(uint16 setId) external view returns (bytes32);
        function getHouseGhosts(uint16 setId) external view returns (bytes memory);
    }
}

#[pvm_contract_sdk::contract(allocator = "pico", allocator_size = 262144)]
mod oab_arena {
    use super::*;
    use pvm_contract_sdk::{Address, Bytes, CallError, StorageFlags};

    /// The caller is not the admin.
    #[derive(Debug, pvm_contract_sdk::SolError)]
    pub struct NotAdmin;

    /// `setDeps` was never called.
    #[derive(Debug, pvm_contract_sdk::SolError)]
    pub struct NotConfigured;

    /// `account` is a session key that is expired or revoked (Identity
    /// reverted). The arena never guesses the player (Q3).
    #[derive(Debug, pvm_contract_sdk::SolError)]
    pub struct InvalidSession {
        pub account: Address,
    }

    /// The Identity call failed without a revert (no contract, bad reply).
    #[derive(Debug, pvm_contract_sdk::SolError)]
    pub struct IdentityUnavailable;

    /// The player has no game.
    #[derive(Debug, pvm_contract_sdk::SolError)]
    pub struct NoGame;

    /// The player already has a game.
    #[derive(Debug, pvm_contract_sdk::SolError)]
    pub struct GameActive;

    /// The game is not in the phase this call needs.
    #[derive(Debug, pvm_contract_sdk::SolError)]
    pub struct WrongPhase;

    /// The set is cached but not allowed for new games.
    #[derive(Debug, pvm_contract_sdk::SolError)]
    pub struct SetNotAllowed;

    /// The set is not cached here (or Content has no such set).
    #[derive(Debug, pvm_contract_sdk::SolError)]
    pub struct SetUnavailable;

    /// The set is cached already.
    #[derive(Debug, pvm_contract_sdk::SolError)]
    pub struct AlreadyCached;

    /// Content gave a bundle or ghost list that does not decode, does not
    /// match its `setHash`, or is too large.
    #[derive(Debug, pvm_contract_sdk::SolError)]
    pub struct BadContent;

    /// A Content call failed.
    #[derive(Debug, pvm_contract_sdk::SolError)]
    pub struct ContentUnavailable;

    /// The mode is draining: no new games.
    #[derive(Debug, pvm_contract_sdk::SolError)]
    pub struct Draining;

    /// The turn bytes are not a SCALE `CommitTurnAction`.
    #[derive(Debug, pvm_contract_sdk::SolError)]
    pub struct BadInput;

    /// The turn breaks a game rule. `error` is SCALE `oab_battle::GameError`.
    #[derive(Debug, pvm_contract_sdk::SolError)]
    pub struct InvalidTurn {
        pub error: Bytes,
    }

    /// A value would exceed the 416-byte storage item limit.
    #[derive(Debug, pvm_contract_sdk::SolError)]
    pub struct ItemTooLarge;

    #[derive(Debug, pvm_contract_sdk::SolError)]
    pub enum ArenaError {
        NotAdmin(NotAdmin),
        NotConfigured(NotConfigured),
        InvalidSession(InvalidSession),
        IdentityUnavailable(IdentityUnavailable),
        NoGame(NoGame),
        GameActive(GameActive),
        WrongPhase(WrongPhase),
        SetNotAllowed(SetNotAllowed),
        SetUnavailable(SetUnavailable),
        AlreadyCached(AlreadyCached),
        BadContent(BadContent),
        ContentUnavailable(ContentUnavailable),
        Draining(Draining),
        BadInput(BadInput),
        InvalidTurn(InvalidTurn),
        ItemTooLarge(ItemTooLarge),
    }

    #[derive(pvm_contract_sdk::SolEvent)]
    pub struct GameStarted {
        #[indexed]
        pub player: Address,
        pub run_id: u64,
        pub set_id: u16,
        pub engine_version: u32,
        pub set_hash: [u8; 32],
    }

    /// `report` is SCALE `oab_protocol::BattleReport`.
    #[derive(pvm_contract_sdk::SolEvent)]
    #[alloc]
    pub struct BattleReported {
        #[indexed]
        pub player: Address,
        #[indexed]
        pub run_id: u64,
        pub report: Bytes,
    }

    /// `reported` is always false until Records exists (M4).
    #[derive(pvm_contract_sdk::SolEvent)]
    pub struct GameEnded {
        #[indexed]
        pub player: Address,
        #[indexed]
        pub run_id: u64,
        pub wins: u8,
        pub lives: u8,
        pub rounds: u8,
        pub reported: bool,
    }

    #[derive(pvm_contract_sdk::SolEvent)]
    pub struct GameAbandoned {
        #[indexed]
        pub player: Address,
        #[indexed]
        pub run_id: u64,
    }

    #[derive(pvm_contract_sdk::SolEvent)]
    pub struct DepsSet {
        pub identity: Address,
        pub content: Address,
        pub engine: Address,
    }

    #[derive(pvm_contract_sdk::SolEvent)]
    pub struct SetCached {
        #[indexed]
        pub set_id: u16,
        pub set_hash: [u8; 32],
        pub pages: u8,
        pub house_rounds: u8,
    }

    #[derive(pvm_contract_sdk::SolEvent)]
    pub struct SetAllowed {
        #[indexed]
        pub set_id: u16,
        pub allowed: bool,
    }

    #[derive(pvm_contract_sdk::SolEvent)]
    pub struct DrainingSet {
        pub draining: bool,
    }

    pub struct OabArena;

    impl OabArena {
        // ── host helpers ──

        fn caller_bytes(&self) -> [u8; 20] {
            let mut a = [0u8; 20];
            self.host().caller(&mut a);
            a
        }

        fn block_number_u64(&self) -> u64 {
            let mut number = [0u8; 32];
            self.host().block_number(&mut number);
            let mut b = [0u8; 8];
            b.copy_from_slice(&number[0..8]);
            u64::from_le_bytes(b)
        }

        fn keccak(&self, data: &[u8]) -> [u8; 32] {
            let mut h = [0u8; 32];
            self.host().hash_keccak_256(data, &mut h);
            h
        }

        fn derive_seed(&self, addr: &[u8; 20], context: &[u8], nonce: u64) -> u64 {
            let h = self.keccak(&seed_input(addr, context, nonce));
            u64::from_le_bytes([h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7]])
        }

        /// Arena v2 `block_entropy`: keccak(block number ++ parent block
        /// hash). The caller cannot choose it.
        fn block_entropy(&self) -> u64 {
            let mut number = [0u8; 32];
            self.host().block_number(&mut number);
            let mut parent = number;
            for byte in parent.iter_mut() {
                if *byte > 0 {
                    *byte -= 1;
                    break;
                }
                *byte = u8::MAX;
            }
            let mut parent_hash = [0u8; 32];
            self.host().block_hash(&parent, &mut parent_hash);
            let mut input = [0u8; 64];
            input[..32].copy_from_slice(&number);
            input[32..].copy_from_slice(&parent_hash);
            let h = self.keccak(&input);
            u64::from_le_bytes([h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7]])
        }

        // ── raw storage: SCALE at keccak(domain ++ key), variable keys ──

        fn skey(&self, domain: u8, k: &[u8]) -> [u8; 32] {
            let mut input = Vec::with_capacity(1 + k.len());
            input.push(domain);
            input.extend_from_slice(k);
            self.keccak(&input)
        }

        fn read(&self, domain: u8, k: &[u8]) -> Option<Vec<u8>> {
            let key = self.skey(domain, k);
            let mut buf = vec![0u8; STORAGE_BYTES];
            let mut out = buf.as_mut_slice();
            self.host()
                .get_storage(StorageFlags::empty(), &key, &mut out)
                .ok()?;
            Some(out.to_vec())
        }

        fn read_scale<T: Decode>(&self, domain: u8, k: &[u8]) -> Option<T> {
            let bytes = self.read(domain, k)?;
            T::decode_all(&mut &bytes[..]).ok()
        }

        /// Write raw bytes. Reverts `ItemTooLarge` above 416 bytes.
        fn write(&self, domain: u8, k: &[u8], value: &[u8]) -> Result<(), ArenaError> {
            if value.len() > STORAGE_BYTES {
                return Err(ItemTooLarge.into());
            }
            let key = self.skey(domain, k);
            self.host().set_storage(StorageFlags::empty(), &key, value);
            Ok(())
        }

        fn write_scale<T: Encode>(&self, domain: u8, k: &[u8], v: &T) -> Result<(), ArenaError> {
            self.write(domain, k, &v.encode())
        }

        // ── accessors ──

        fn admin(&self) -> [u8; 20] {
            self.read_scale(DOM_ADMIN, &[]).unwrap_or([0u8; 20])
        }

        fn ensure_admin(&self) -> Result<(), ArenaError> {
            if self.admin() != self.caller_bytes() {
                return Err(NotAdmin.into());
            }
            Ok(())
        }

        fn config(&self) -> Config {
            self.read_scale(DOM_CONFIG, &[]).unwrap_or_default()
        }

        fn set_meta(&self, set_id: u16) -> Option<SetMeta> {
            self.read_scale(DOM_SET_META, &set_id.to_le_bytes())
        }

        fn page_key(set_id: u16, page: u8) -> [u8; 3] {
            let s = set_id.to_le_bytes();
            [s[0], s[1], page]
        }

        fn round_key(set_id: u16, round: u8) -> [u8; 3] {
            let s = set_id.to_le_bytes();
            [s[0], s[1], round]
        }

        /// SCALE(SetBundle) of a cached set, from its pages.
        fn bundle_bytes(&self, set_id: u16, meta: &SetMeta) -> Option<Vec<u8>> {
            let mut bytes = Vec::with_capacity(meta.len as usize);
            for page in 0..meta.pages {
                bytes.extend_from_slice(&self.read(DOM_SET_PAGE, &Self::page_key(set_id, page))?);
            }
            (bytes.len() == meta.len as usize).then_some(bytes)
        }

        fn bundle(&self, set_id: u16, meta: &SetMeta) -> Option<SetBundle> {
            SetBundle::decode_all(&mut &self.bundle_bytes(set_id, meta)?[..]).ok()
        }

        fn load_game(&self, player: &[u8; 20]) -> Option<ModeGame> {
            self.read_scale::<Option<ModeGame>>(DOM_GAME, player).flatten()
        }

        fn store_game(&self, player: &[u8; 20], game: Option<&ModeGame>) -> Result<(), ArenaError> {
            self.write_scale(DOM_GAME, player, &game)
        }

        fn pool(&self, bracket: &[u8; 5]) -> GhostPool {
            self.read_scale(DOM_GHOST, bracket).unwrap_or_default()
        }

        fn house(&self, set_id: u16, round: RoundValue, meta: &SetMeta) -> GhostPool {
            if meta.house_rounds == 0 {
                return Vec::new();
            }
            let r = round.clamp(1, meta.house_rounds);
            self.read_scale(DOM_HOUSE, &Self::round_key(set_id, r))
                .unwrap_or_default()
        }

        /// The player `msg.sender` acts for (Identity, every game call).
        fn player(&self, cfg: &Config) -> Result<[u8; 20], ArenaError> {
            use i_identity::IIdentity;
            if cfg.identity == [0u8; 20] {
                return Err(NotConfigured.into());
            }
            let caller = self.caller_bytes();
            match IIdentity::from_address(Address(cfg.identity))
                .resolve(Address(caller))
                .call(self)
            {
                Ok(player) if player.0 != [0u8; 20] => Ok(player.0),
                Err(CallError::CalleeReverted) => Err(InvalidSession {
                    account: Address(caller),
                }
                .into()),
                _ => Err(IdentityUnavailable.into()),
            }
        }

        // ── entry points ──

        /// The deployer becomes the admin. Call `setDeps` next.
        #[pvm_contract_sdk::constructor]
        pub fn new(&mut self) {
            let caller = self.caller_bytes();
            let _ = self.write_scale(DOM_ADMIN, &[], &caller);
        }

        /// Admin: the Identity, Content, and engine contract addresses (exact
        /// CDM versions, section 11). Keeps the draining flag.
        #[pvm_contract_sdk::method]
        pub fn set_deps(&mut self, identity: Address, content: Address, engine: Address) -> Result<(), ArenaError> {
            self.ensure_admin()?;
            let mut cfg = self.config();
            cfg.identity = identity.0;
            cfg.content = content.0;
            cfg.engine = engine.0;
            self.write_scale(DOM_CONFIG, &[], &cfg)?;
            DepsSet {
                identity,
                content,
                engine,
            }
            .emit(self.host());
            Ok(())
        }

        /// Admin: copy a set from Content (bundle and house ghosts). The
        /// bundle must hash to Content's `setHash`. New games need
        /// `setAllowedSet` too.
        #[pvm_contract_sdk::method]
        pub fn cache_set(&mut self, set_id: u16) -> Result<(), ArenaError> {
            use i_content::IContent;
            self.ensure_admin()?;
            let cfg = self.config();
            if cfg.content == [0u8; 20] {
                return Err(NotConfigured.into());
            }
            if self.set_meta(set_id).is_some() {
                return Err(AlreadyCached.into());
            }
            let content = IContent::from_address(Address(cfg.content));
            let bytes = content
                .get_set_bundle(set_id)
                .call(self)
                .map_err(|_| ContentUnavailable)?
                .0;
            if bytes.is_empty() {
                return Err(SetUnavailable.into());
            }
            let bundle = SetBundle::decode_all(&mut &bytes[..]).map_err(|_| BadContent)?;
            if bundle.set_id != set_id || bundle.cards.is_empty() || bytes.len() > MAX_PAGES * STORAGE_BYTES {
                return Err(BadContent.into());
            }
            let hash = self.keccak(&bytes);
            let pinned = content
                .set_hash(set_id)
                .call(self)
                .map_err(|_| ContentUnavailable)?;
            if hash != pinned {
                return Err(BadContent.into());
            }
            let ghost_bytes = content
                .get_house_ghosts(set_id)
                .call(self)
                .map_err(|_| ContentUnavailable)?
                .0;
            let ghosts = Vec::<HouseGhost>::decode_all(&mut &ghost_bytes[..]).map_err(|_| BadContent)?;
            let house = house_by_round(&ghosts);

            let pages = bytes.chunks(STORAGE_BYTES).count();
            for (i, chunk) in bytes.chunks(STORAGE_BYTES).enumerate() {
                self.write(DOM_SET_PAGE, &Self::page_key(set_id, i as u8), chunk)?;
            }
            for (i, boards) in house.iter().enumerate() {
                self.write_scale(DOM_HOUSE, &Self::round_key(set_id, i as u8 + 1), boards)?;
            }
            let meta = SetMeta {
                hash,
                len: bytes.len() as u32,
                pages: pages as u8,
                house_rounds: house.len() as u8,
                allowed: false,
            };
            self.write_scale(DOM_SET_META, &set_id.to_le_bytes(), &meta)?;
            SetCached {
                set_id,
                set_hash: hash,
                pages: meta.pages,
                house_rounds: meta.house_rounds,
            }
            .emit(self.host());
            Ok(())
        }

        /// Admin: allow or stop new games on a cached set. Running games are
        /// not affected.
        #[pvm_contract_sdk::method]
        pub fn set_allowed_set(&mut self, set_id: u16, allowed: bool) -> Result<(), ArenaError> {
            self.ensure_admin()?;
            let mut meta = self.set_meta(set_id).ok_or(SetUnavailable)?;
            meta.allowed = allowed;
            self.write_scale(DOM_SET_META, &set_id.to_le_bytes(), &meta)?;
            SetAllowed { set_id, allowed }.emit(self.host());
            Ok(())
        }

        /// Admin: stop (or reopen) new games. Running games finish.
        #[pvm_contract_sdk::method]
        pub fn set_draining(&mut self, draining: bool) -> Result<(), ArenaError> {
            self.ensure_admin()?;
            let mut cfg = self.config();
            cfg.draining = draining;
            self.write_scale(DOM_CONFIG, &[], &cfg)?;
            DrainingSet { draining }.emit(self.host());
            Ok(())
        }

        /// Start a casual game on `setId` for the resolved player. The seed
        /// comes from block entropy and the player, never from the caller's
        /// input. Returns the run id.
        #[pvm_contract_sdk::method]
        pub fn start_game(&mut self, set_id: u16) -> Result<u64, ArenaError> {
            let cfg = self.config();
            if cfg.draining {
                return Err(Draining.into());
            }
            let player = self.player(&cfg)?;
            if self.load_game(&player).is_some() {
                return Err(GameActive.into());
            }
            let meta = self.set_meta(set_id).ok_or(SetUnavailable)?;
            if !meta.allowed {
                return Err(SetNotAllowed.into());
            }
            let bundle = self.bundle(set_id, &meta).ok_or(SetUnavailable)?;
            let config = arena_config();
            let seed = self.derive_seed(&player, b"start", self.block_entropy());
            let state = oab_engine::new_game(&config, &bundle, seed);

            let run_id: u64 = self.read_scale(DOM_NEXT_RUN, &[]).unwrap_or(1);
            self.write_scale(DOM_NEXT_RUN, &[], &run_id.saturating_add(1))?;
            let game = ModeGame {
                run_id,
                engine_version: ENGINE_VERSION,
                set_id,
                set_hash: meta.hash,
                config,
                state,
                alias: None,
                started_block: self.block_number_u64(),
            };
            self.store_game(&player, Some(&game))?;
            GameStarted {
                player: Address(player),
                run_id,
                set_id,
                engine_version: ENGINE_VERSION,
                set_hash: meta.hash,
            }
            .emit(self.host());
            Ok(run_id)
        }

        /// Submit one shop turn (SCALE `CommitTurnAction`). Runs the shop
        /// actions and the battle against a ghost of the player's bracket,
        /// adds the player's board to that bracket, and emits
        /// `BattleReported`. Returns the battle seed.
        #[pvm_contract_sdk::method]
        pub fn submit_turn(&mut self, action: Bytes) -> Result<u64, ArenaError> {
            let cfg = self.config();
            let player = self.player(&cfg)?;
            let mut game = self.load_game(&player).ok_or(NoGame)?;
            if game.state.phase != GamePhase::Shop {
                return Err(WrongPhase.into());
            }
            let action = CommitTurnAction::decode_all(&mut &action.0[..]).map_err(|_| BadInput)?;
            let meta = self.set_meta(game.set_id).ok_or(SetUnavailable)?;
            let bundle = self.bundle(game.set_id, &meta).ok_or(SetUnavailable)?;
            let pool_map = bundle.card_pool();

            let s = &game.state;
            let (round, wins, lives) = (s.round, s.wins, s.lives);
            let battle_seed = self.derive_seed(&player, b"battle", s.game_seed);
            let next_shop_seed = self.derive_seed(&player, b"shop", s.game_seed);
            let bracket = bracket_bytes(game.set_id, round, wins, lives);
            let mut ghosts = self.pool(&bracket);
            let house = if ghosts.len() < THIN_POOL {
                self.house(game.set_id, round, &meta)
            } else {
                Vec::new()
            };
            let opponent = pick_opponent(&ghosts, &house, battle_seed);

            let out = oab_engine::resolve_turn(TurnInput {
                config: &game.config,
                pool: &pool_map,
                state: game.state.clone(),
                action,
                opponent: opponent.clone(),
                battle_seed,
                next_shop_seed,
            })
            .map_err(|e| InvalidTurn {
                error: Bytes::from(e.encode()),
            })?;

            push_ghost(&mut ghosts, out.player_board.clone());
            self.write_scale(DOM_GHOST, &bracket, &ghosts)?;
            game.state = out.state;
            self.store_game(&player, Some(&game))?;

            let report = BattleReport {
                engine_version: game.engine_version,
                set_id: game.set_id,
                round,
                result: out.result,
                wins: game.state.wins,
                lives: game.state.lives,
                battle_seed,
                player_board: out.player_board,
                opponent,
            };
            BattleReported {
                player: Address(player),
                run_id: game.run_id,
                report: Bytes::from(report.encode()),
            }
            .emit(self.host());
            Ok(battle_seed)
        }

        /// End a completed game. The final board joins the ghost pool of the
        /// final bracket (arena v2). Returns whether Records took the run:
        /// always false until Records exists (M4).
        #[pvm_contract_sdk::method]
        pub fn end_game(&mut self) -> Result<bool, ArenaError> {
            let cfg = self.config();
            let player = self.player(&cfg)?;
            let game = self.load_game(&player).ok_or(NoGame)?;
            let s = &game.state;
            if s.phase != GamePhase::Completed {
                return Err(WrongPhase.into());
            }
            let ghost = oab_engine::board_to_ghost(&s.board);
            if !ghost.is_empty() {
                let bracket = bracket_bytes(game.set_id, s.round, s.wins, s.lives);
                let mut ghosts = self.pool(&bracket);
                push_ghost(&mut ghosts, ghost);
                self.write_scale(DOM_GHOST, &bracket, &ghosts)?;
            }
            self.store_game(&player, None)?;
            GameEnded {
                player: Address(player),
                run_id: game.run_id,
                wins: s.wins,
                lives: s.lives,
                rounds: s.round,
                reported: false,
            }
            .emit(self.host());
            Ok(false)
        }

        /// Forfeit the current game (any phase). Nothing joins a ghost pool.
        #[pvm_contract_sdk::method]
        pub fn abandon_game(&mut self) -> Result<(), ArenaError> {
            let cfg = self.config();
            let player = self.player(&cfg)?;
            let game = self.load_game(&player).ok_or(NoGame)?;
            self.store_game(&player, None)?;
            GameAbandoned {
                player: Address(player),
                run_id: game.run_id,
            }
            .emit(self.host());
            Ok(())
        }

        // ── views ──

        /// The engine this deployment links.
        #[pvm_contract_sdk::method]
        pub fn engine_version() -> u32 {
            ENGINE_VERSION
        }

        /// SCALE `ModeGame` of `player`, or empty.
        #[pvm_contract_sdk::method]
        pub fn get_game(&self, player: Address) -> Bytes {
            match self.load_game(&player.0) {
                Some(g) => Bytes::from(g.encode()),
                None => Bytes::from(Vec::new()),
            }
        }

        /// SCALE `SetBundle` of a cached set, or empty. The client replays
        /// a `BattleReported` with it (section 7.7).
        #[pvm_contract_sdk::method]
        pub fn get_set_bundle(&self, set_id: u16) -> Bytes {
            let bytes = self
                .set_meta(set_id)
                .and_then(|m| self.bundle_bytes(set_id, &m))
                .unwrap_or_default();
            Bytes::from(bytes)
        }

        /// A cached set: bundle hash, bundle length, pages, cached house
        /// rounds, allowed. All zero if not cached.
        #[pvm_contract_sdk::method]
        pub fn set_info(&self, set_id: u16) -> ([u8; 32], u32, u8, u8, bool) {
            match self.set_meta(set_id) {
                Some(m) => (m.hash, m.len, m.pages, m.house_rounds, m.allowed),
                None => ([0u8; 32], 0, 0, 0, false),
            }
        }

        /// SCALE `Vec<Vec<GhostBoardUnit>>` of one bracket (oldest first).
        #[pvm_contract_sdk::method]
        pub fn get_ghosts(&self, set_id: u16, round: u8, wins: u8, lives: u8) -> Bytes {
            let pool = self.pool(&bracket_bytes(set_id, round, wins, lives));
            Bytes::from(pool.encode())
        }

        /// SCALE `Vec<Vec<GhostBoardUnit>>`: the house ghosts a thin bracket
        /// of `round` adds to the draw.
        #[pvm_contract_sdk::method]
        pub fn get_house_ghosts(&self, set_id: u16, round: u8) -> Bytes {
            let pool = self
                .set_meta(set_id)
                .map(|m| self.house(set_id, round, &m))
                .unwrap_or_default();
            Bytes::from(pool.encode())
        }

        /// Identity, Content, and engine addresses, and the draining flag.
        #[pvm_contract_sdk::method]
        pub fn deps(&self) -> (Address, Address, Address, bool) {
            let c = self.config();
            (Address(c.identity), Address(c.content), Address(c.engine), c.draining)
        }

        /// The run id the next game gets.
        #[pvm_contract_sdk::method]
        pub fn next_run_id(&self) -> u64 {
            self.read_scale(DOM_NEXT_RUN, &[]).unwrap_or(1)
        }

        #[pvm_contract_sdk::method]
        pub fn admin_address(&self) -> Address {
            Address(self.admin())
        }
    }
}

#[cfg(test)]
mod tests;
