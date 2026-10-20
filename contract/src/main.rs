//! Open Auto Battler Arena — PolkaVM Smart Contract
//!
//! Built on the `pvm-contract-sdk` (cargo-pvm-contract) framework. Game data is
//! SCALE-encoded inside ABI `bytes` parameters; persistent state is stored as
//! SCALE blobs via raw host storage at keccak-derived keys (the shared engine
//! types are SCALE-encoded, not Solidity-ABI, so we keep them out of the typed
//! `Mapping`/`Lazy` layer).

#![cfg_attr(not(any(test, feature = "std", feature = "abi-gen")), no_main, no_std)]

// The contract macro declares `extern crate alloc` at the crate root (except on
// the abi-gen build) but no longer injects `use` imports, so import them here.
#[cfg(all(feature = "abi-gen", not(test)))]
extern crate alloc;
#[allow(unused_imports)]
use alloc::{collections::BTreeMap, vec, vec::Vec};

use parity_scale_codec::{Decode, Encode};

use oab_battle::battle::{resolve_battle, BattleResult, CombatUnit};
use oab_battle::rng::{BattleRng, XorShiftRng};
use oab_battle::state::CardSet;
use oab_battle::types::*;
use oab_battle::{apply_shop_start_triggers, verify_and_apply_turn};
use oab_game::GamePhase;

// ── Game config + session types ───────────────────────────────────────────────

#[derive(Debug, Clone, Encode, Decode)]
struct GameConfig {
    starting_lives: RoundValue,
    wins_to_victory: RoundValue,
    starting_mana_limit: ManaValue,
    max_mana_limit: ManaValue,
    full_mana_each_round: bool,
    board_size: IndexValue,
    hand_size: IndexValue,
    bag_size: IndexValue,
}

impl GameConfig {
    fn mana_limit_for_round(&self, round: RoundValue) -> ManaValue {
        (self.starting_mana_limit + round.saturating_sub(1)).min(self.max_mana_limit)
    }
}

fn default_config() -> GameConfig {
    GameConfig {
        starting_lives: 3,
        wins_to_victory: 10,
        starting_mana_limit: 3,
        max_mana_limit: 10,
        full_mana_each_round: false,
        board_size: 5,
        hand_size: 5,
        bag_size: 50,
    }
}

#[derive(Debug, Clone, Encode, Decode)]
struct ArenaSession {
    bag: Vec<CardId>,
    hand: Vec<CardId>,
    board: Vec<Option<BoardUnit>>,
    mana_limit: ManaValue,
    shop_mana: ManaValue,
    round: RoundValue,
    lives: RoundValue,
    wins: RoundValue,
    phase: GamePhase,
    next_card_id: u16,
    game_seed: u64,
    set_id: SetIdValue,
}

type GhostPool = Vec<Vec<GhostBoardUnit>>;
const MAX_GHOSTS_PER_BRACKET: usize = 10;

// ── Personhood + ranked leaderboard ───────────────────────────────────────────

/// Personhood precompile (individuality `precompiles/personhood`), fixed at
/// `AddressMatcher::Fixed(0x0A01)` = `0x…0a010000` on Paseo Asset Hub Next.
const PERSONHOOD_PRECOMPILE: [u8; 20] = [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x0a, 0x01, 0x00, 0x00,
];
/// `IPersonhood.PersonhoodInfo.status` tiers. Ranked play accepts Lite and
/// Full (Shawn's decision); None and any unknown future tier are rejected.
const PERSONHOOD_LITE: u8 = 1;
const PERSONHOOD_FULL: u8 = 2;

/// Top-N ranked runs kept per set. Bounds storage and the size of the
/// `getLeaderboard` blob (~46 bytes/entry => ~4.6 KB, under the 16 KB read
/// buffer).
const LEADERBOARD_SIZE: usize = 100;

pvm_contract_sdk::abi_import! {
    #![abi_import(alloc = true)]
    // Subset of individuality `precompiles/personhood/sol/IPersonhood.sol`.
    pragma solidity ^0.8.30;

    struct PersonhoodInfo {
        uint8 status;
        bytes32 contextAlias;
    }

    interface IPersonhood {
        function personhoodStatus(address account, bytes32 context) external view returns (PersonhoodInfo memory info);
    }
}

/// One ranked run on the leaderboard. `alias` is the personhood context alias,
/// so every account of one person shares a single entry.
#[derive(Debug, Clone, PartialEq, Eq, Encode, Decode)]
pub struct LeaderboardEntry {
    pub alias: [u8; 32],
    pub set_id: SetIdValue,
    pub wins: RoundValue,
    pub lives: RoundValue,
    pub rounds: RoundValue,
    pub block: u64,
}

/// Ranking order: more wins, then more lives left, then the earlier block (the
/// first to reach a result keeps the place on a tie).
fn ranks_above(a: &LeaderboardEntry, b: &LeaderboardEntry) -> bool {
    (a.wins, a.lives, core::cmp::Reverse(a.block)) > (b.wins, b.lives, core::cmp::Reverse(b.block))
}

/// Insert `entry` into the sorted, bounded `board`, keeping one entry per
/// alias. Returns true if the board changed. A run that is not better than the
/// alias's current entry, or that falls below the last place of a full board,
/// changes nothing.
fn insert_ranked(board: &mut Vec<LeaderboardEntry>, entry: LeaderboardEntry, cap: usize) -> bool {
    if let Some(i) = board.iter().position(|e| e.alias == entry.alias) {
        if !ranks_above(&entry, &board[i]) {
            return false;
        }
        board.remove(i);
    }
    let pos = board
        .iter()
        .position(|e| ranks_above(&entry, e))
        .unwrap_or(board.len());
    if pos >= cap {
        return false;
    }
    board.insert(pos, entry);
    board.truncate(cap);
    true
}

// ── Achievement badges (Scarcity soulbound NFTs) ──────────────────────────────
//
// See `docs/NFT_DESIGN.md` §8. The arena owns an "OAB Achievements" Scarcity
// collection and mints a soulbound badge when a ranked run qualifies.

/// `ScarcityFactory` precompile, `AddressMatcher::Fixed(0x0521)`.
const SCARCITY_FACTORY: [u8; 20] = [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x05, 0x21, 0x00, 0x00,
];

/// ERC-721 address of Scarcity collection `id`: the id big-endian in the first
/// four bytes, the collection precompile prefix `0x0520` in bytes 16..18.
fn collection_address(id: u32) -> [u8; 20] {
    let mut a = [0u8; 20];
    a[..4].copy_from_slice(&id.to_be_bytes());
    a[16] = 0x05;
    a[17] = 0x20;
    a
}

/// Badge types. The value is the index into [`BADGES`] and into
/// `BadgeConfig::items`. Never reorder: stored records refer to these values.
pub const BADGE_VICTORY: u8 = 0;
pub const BADGE_FLAWLESS: u8 = 1;

/// Season 0 badges as `(oab.badge, oab.name)` item metadata. Mirrors the
/// pallet-era silver (`wins >= wins_to_victory`) and gold (also no life lost)
/// achievements, but per set instead of per card.
const BADGES: [(&[u8], &[u8]); 2] = [(b"victory", b"Victory"), (b"flawless", b"Flawless")];

/// Collection metadata the arena writes in `init_achievements`.
const BADGE_COLLECTION_NAME: &[u8] = b"Open Auto Battler Achievements";
const BADGE_COLLECTION_SYMBOL: &[u8] = b"OABA";

/// ASCII decimal digits of `n` (badge instance metadata `oab.set`).
fn decimal(mut n: u64) -> Vec<u8> {
    let mut out = Vec::new();
    loop {
        out.push(b'0' + (n % 10) as u8);
        n /= 10;
        if n == 0 {
            break;
        }
    }
    out.reverse();
    out
}

/// The badges a finished run earns, in badge order.
fn qualifying_badges(session: &ArenaSession, config: &GameConfig) -> Vec<u8> {
    let mut out = Vec::new();
    if session.wins >= config.wins_to_victory {
        out.push(BADGE_VICTORY);
        if session.lives >= config.starting_lives {
            out.push(BADGE_FLAWLESS);
        }
    }
    out
}

/// Where the arena's badge collection lives. Written once by `init_achievements`.
#[derive(Debug, Clone, PartialEq, Eq, Encode, Decode)]
pub struct BadgeConfig {
    pub collection: u32,
    /// Scarcity item index per badge type (`items[BADGE_VICTORY]`, ...).
    pub items: Vec<u32>,
}

/// One earned badge of one account. `token` is `None` while the mint is
/// pending (the mint failed; `claim_pending_badges` retries it).
#[derive(Debug, Clone, PartialEq, Eq, Encode, Decode)]
pub struct BadgeRecord {
    pub badge: u8,
    pub set_id: SetIdValue,
    pub block: u64,
    pub token: Option<u64>,
}

pvm_contract_sdk::abi_import! {
    #![abi_import(alloc = true)]
    // Subset of individuality `precompiles/scarcity/sol/IScarcityFactory.sol`.
    pragma solidity ^0.8.30;

    interface IScarcityFactory {
        function createCollection() external returns (uint32 collection);
    }
}

pvm_contract_sdk::abi_import! {
    #![abi_import(alloc = true)]
    // Subset of individuality `precompiles/scarcity/sol/IScarcityCollection.sol`.
    pragma solidity ^0.8.30;

    interface IScarcityCollection {
        function setCollectionMetadata(bytes calldata key, bytes calldata value) external;
        function defineItem(bool soulbound, bytes[] calldata keys, bytes[] calldata values) external returns (uint32 item);
        function mint(uint32 item, address to, bytes[] calldata keys, bytes[] calldata values) external returns (uint256 tokenId);
    }
}

// keccak256("BadgeMinted(address,uint8,uint16,uint256)"); player indexed.
const BADGE_MINTED_TOPIC: [u8; 32] = [
    0xbd, 0x13, 0x56, 0xc5, 0xae, 0xb0, 0x23, 0x33, 0x82, 0x6f, 0x94, 0x68, 0x2d, 0x66, 0xbd, 0x82,
    0xdc, 0x7e, 0xbf, 0xc1, 0x40, 0x42, 0x28, 0xd1, 0x19, 0xf6, 0xeb, 0xdf, 0x61, 0x6b, 0x7d, 0xb7,
];
// keccak256("BadgePending(address,uint8,uint16)"); player indexed.
const BADGE_PENDING_TOPIC: [u8; 32] = [
    0xd3, 0x94, 0x03, 0x25, 0x2e, 0x3d, 0x7e, 0xb9, 0x9a, 0xf7, 0x4a, 0xcb, 0x5b, 0x83, 0xb0, 0x12,
    0xf0, 0xbe, 0x64, 0xb8, 0x7d, 0x35, 0x9f, 0xdd, 0xdd, 0x26, 0x79, 0x7e, 0xa8, 0x35, 0x32, 0x56,
];

// ── Storage domain prefixes (keccak namespace separation) ─────────────────────

const DOM_ADMIN: u8 = 0;
const DOM_CARD: u8 = 1;
const DOM_SET: u8 = 2;
const DOM_SESSION: u8 = 3;
const DOM_SESSION_ACTIVE: u8 = 4;
const DOM_GHOST: u8 = 5;
/// caller -> personhood alias of the caller's active ranked game (absent = casual).
const DOM_RANKED: u8 = 6;
/// () -> personhood context (bytes32) the contract queries aliases in.
const DOM_PERSONHOOD_CTX: u8 = 7;
/// set_id ++ alias -> best ranked run of that person on that set.
const DOM_BEST_RUN: u8 = 8;
/// set_id -> top-N `Vec<LeaderboardEntry>`, best first.
const DOM_LEADERBOARD: u8 = 9;
/// () -> `BadgeConfig` of the arena-owned achievements collection.
const DOM_BADGE_CONFIG: u8 = 10;
/// player -> `Vec<BadgeRecord>`; at most one record per (badge, set).
const DOM_BADGES: u8 = 11;

// keccak256("BattleReported(uint8,uint8,uint8,uint8,uint64,bytes)")
const BATTLE_REPORTED_TOPIC: [u8; 32] = [
    0x96, 0xfd, 0x17, 0x36, 0xea, 0x4f, 0xbe, 0xf3, 0x2e, 0x32, 0x8d, 0x70, 0x05, 0x02, 0x1b, 0x05,
    0xc7, 0xee, 0x31, 0xf3, 0x26, 0x94, 0xdd, 0xef, 0x23, 0xdd, 0x55, 0xaf, 0x68, 0xe0, 0x89, 0xbd,
];

fn bracket_bytes(
    set_id: SetIdValue,
    round: RoundValue,
    wins: RoundValue,
    lives: RoundValue,
) -> [u8; 5] {
    let s = set_id.to_le_bytes();
    [s[0], s[1], round, wins, lives]
}

// ── Pure helpers (no storage/host access) ─────────────────────────────────────

fn create_starting_bag(set: &CardSet, seed: u64, bag_size: usize) -> Vec<CardId> {
    if set.cards.is_empty() {
        return Vec::new();
    }
    let mut bag = Vec::with_capacity(bag_size);
    let mut rng = XorShiftRng::seed_from_u64(seed);
    let total_weight: u32 = set.cards.iter().map(|e| e.rarity as u32).sum();
    if total_weight == 0 {
        return Vec::new();
    }
    for _ in 0..bag_size {
        let mut target = rng.gen_range(total_weight as usize) as u32;
        for entry in &set.cards {
            if entry.rarity == 0 {
                continue;
            }
            if target < entry.rarity as u32 {
                bag.push(entry.card_id);
                break;
            }
            target -= entry.rarity as u32;
        }
    }
    bag
}

fn draw_hand(session: &mut ArenaSession, hand_size: usize) {
    session.bag.append(&mut session.hand);
    let bag_len = session.bag.len();
    if bag_len == 0 {
        return;
    }
    let hand_count = hand_size.min(bag_len);
    let seed = session.game_seed ^ (session.round as u64);
    let mut rng = XorShiftRng::seed_from_u64(seed);
    let mut indices: Vec<usize> = (0..bag_len).collect();
    for i in 0..hand_count {
        let j = i + rng.gen_range(bag_len - i);
        indices.swap(i, j);
    }
    indices.truncate(hand_count);
    indices.sort_unstable_by(|a, b| b.cmp(a));
    let mut drawn = Vec::with_capacity(hand_count);
    for idx in indices {
        drawn.push(session.bag.remove(idx));
    }
    drawn.reverse();
    session.hand = drawn;
}

fn make_shop_state(
    session: &ArenaSession,
    card_pool: &BTreeMap<CardId, UnitCard>,
) -> oab_battle::state::ShopState {
    oab_battle::state::ShopState {
        card_pool: card_pool.clone(),
        set_id: 0,
        hand: session.hand.clone(),
        board: session.board.clone(),
        mana_limit: session.mana_limit,
        shop_mana: session.shop_mana,
        round: session.round,
        game_seed: session.game_seed,
    }
}

fn sync_from_shop_state(session: &mut ArenaSession, shop: &oab_battle::state::ShopState) {
    session.hand = shop.hand.clone();
    session.board = shop.board.clone();
    session.shop_mana = shop.shop_mana;
}

fn create_ghost_from_board(board: &[Option<BoardUnit>]) -> Vec<GhostBoardUnit> {
    board
        .iter()
        .flatten()
        .map(|bu| GhostBoardUnit {
            card_id: bu.card_id,
            perm_attack: bu.perm_attack,
            perm_health: bu.perm_health,
        })
        .collect()
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[pvm_contract_sdk::contract(allocator = "pico", allocator_size = 262144)]
mod oab_arena {
    use super::*;
    use pvm_contract_sdk::{Bytes, StorageFlags};

    /// An admin badge-setup call failed (not admin, already set up, or a
    /// Scarcity precompile call reverted). The whole call is undone.
    #[derive(Debug, pvm_contract_sdk::SolError)]
    pub struct BadgeSetupFailed;

    pub struct OabArena;

    impl OabArena {
        // ── low-level raw storage (SCALE blobs at keccak(domain ++ key)) ──

        fn caller_bytes(&self) -> [u8; 20] {
            let mut a = [0u8; 20];
            self.host().caller(&mut a);
            a
        }

        fn skey(&self, domain: u8, k: &[u8]) -> [u8; 32] {
            let mut input = Vec::with_capacity(1 + k.len());
            input.push(domain);
            input.extend_from_slice(k);
            let mut key = [0u8; 32];
            self.host().hash_keccak_256(&input, &mut key);
            key
        }

        fn read_raw(&self, key: &[u8; 32]) -> Option<Vec<u8>> {
            let mut buf = vec![0u8; 16384];
            let mut out = buf.as_mut_slice();
            match self
                .host()
                .get_storage(StorageFlags::empty(), key, &mut out)
            {
                Ok(_) => Some(out.to_vec()),
                Err(_) => None,
            }
        }

        fn write_raw(&self, key: &[u8; 32], value: &[u8]) {
            self.host().set_storage(StorageFlags::empty(), key, value);
        }

        fn read_scale<T: Decode>(&self, domain: u8, k: &[u8]) -> Option<T> {
            let key = self.skey(domain, k);
            let bytes = self.read_raw(&key)?;
            if bytes.is_empty() {
                return None;
            }
            T::decode(&mut &bytes[..]).ok()
        }

        fn write_scale<T: Encode>(&self, domain: u8, k: &[u8], v: &T) {
            let key = self.skey(domain, k);
            self.write_raw(&key, &v.encode());
        }

        fn clear_scale(&self, domain: u8, k: &[u8]) {
            let key = self.skey(domain, k);
            self.write_raw(&key, &[]);
        }

        // ── domain accessors ──

        fn admin(&self) -> Option<[u8; 20]> {
            self.read_scale(DOM_ADMIN, &[])
        }

        fn load_card(&self, id: u16) -> Option<UnitCard> {
            self.read_scale(DOM_CARD, &id.to_le_bytes())
        }

        fn load_set(&self, id: u16) -> Option<CardSet> {
            self.read_scale(DOM_SET, &id.to_le_bytes())
        }

        fn session_is_active(&self, caller: &[u8; 20]) -> bool {
            self.read_scale::<bool>(DOM_SESSION_ACTIVE, caller)
                .unwrap_or(false)
        }

        fn load_session(&self, caller: &[u8; 20]) -> Option<ArenaSession> {
            if !self.session_is_active(caller) {
                return None;
            }
            self.read_scale(DOM_SESSION, caller)
        }

        fn store_session(&self, caller: &[u8; 20], session: &ArenaSession) {
            self.write_scale(DOM_SESSION, caller, session);
            self.write_scale(DOM_SESSION_ACTIVE, caller, &true);
        }

        fn clear_session(&self, caller: &[u8; 20]) {
            self.write_scale(DOM_SESSION_ACTIVE, caller, &false);
            self.clear_scale(DOM_SESSION, caller);
            self.clear_scale(DOM_RANKED, caller);
        }

        // ── personhood / ranked ──

        fn personhood_context(&self) -> Option<[u8; 32]> {
            self.read_scale(DOM_PERSONHOOD_CTX, &[])
        }

        fn ranked_alias(&self, caller: &[u8; 20]) -> Option<[u8; 32]> {
            self.read_scale(DOM_RANKED, caller)
        }

        /// Ask the personhood precompile for `account`'s tier and context
        /// alias. A failed call (e.g. no precompile on this chain) reads as
        /// `(0, zero alias)`: ranked play fails closed.
        fn personhood_status(&self, account: &[u8; 20], context: [u8; 32]) -> (u8, [u8; 32]) {
            use i_personhood::IPersonhood;
            use pvm_contract_sdk::Address;
            match IPersonhood::from_address(Address(PERSONHOOD_PRECOMPILE))
                .personhood_status(Address(*account), context)
                .call(self)
            {
                Ok(info) => (info.status, info.context_alias),
                Err(_) => (0, [0u8; 32]),
            }
        }

        /// The caller's alias if they hold Lite or Full personhood in the
        /// configured context; `None` otherwise (or if no context is set).
        fn ranked_identity(&self, caller: &[u8; 20]) -> Option<[u8; 32]> {
            let context = self.personhood_context()?;
            let (status, alias) = self.personhood_status(caller, context);
            let eligible = status == PERSONHOOD_LITE || status == PERSONHOOD_FULL;
            if !eligible || alias == [0u8; 32] {
                return None;
            }
            Some(alias)
        }

        fn block_number_u64(&self) -> u64 {
            let mut number = [0u8; 32];
            self.host().block_number(&mut number);
            u64::from_le_bytes(number[0..8].try_into().unwrap())
        }

        fn best_run_key(set_id: SetIdValue, alias: &[u8; 32]) -> [u8; 34] {
            let mut k = [0u8; 34];
            k[..2].copy_from_slice(&set_id.to_le_bytes());
            k[2..].copy_from_slice(alias);
            k
        }

        fn load_leaderboard(&self, set_id: SetIdValue) -> Vec<LeaderboardEntry> {
            self.read_scale(DOM_LEADERBOARD, &set_id.to_le_bytes())
                .unwrap_or_default()
        }

        /// Record a finished ranked run: keep it as the alias's best run if it
        /// beats the stored one, and place it on the set's bounded board.
        fn record_ranked_result(&self, alias: [u8; 32], session: &ArenaSession) {
            let entry = LeaderboardEntry {
                alias,
                set_id: session.set_id,
                wins: session.wins,
                lives: session.lives,
                rounds: session.round,
                block: self.block_number_u64(),
            };
            let key = Self::best_run_key(session.set_id, &alias);
            let better = match self.read_scale::<LeaderboardEntry>(DOM_BEST_RUN, &key) {
                Some(best) => ranks_above(&entry, &best),
                None => true,
            };
            if !better {
                return;
            }
            self.write_scale(DOM_BEST_RUN, &key, &entry);
            let mut board = self.load_leaderboard(session.set_id);
            if insert_ranked(&mut board, entry, LEADERBOARD_SIZE) {
                self.write_scale(DOM_LEADERBOARD, &session.set_id.to_le_bytes(), &board);
            }
        }

        // ── achievement badges ──

        fn badge_config(&self) -> Option<BadgeConfig> {
            self.read_scale(DOM_BADGE_CONFIG, &[])
        }

        fn load_badges(&self, player: &[u8; 20]) -> Vec<BadgeRecord> {
            self.read_scale(DOM_BADGES, player).unwrap_or_default()
        }

        /// The purse key a badge is minted to. Scarcity holds one NFT per key
        /// (globally, across all collections), so every badge needs its own
        /// empty key; the player's own account could hold only one. The key
        /// is a pure function of this arena, the player, the badge and the
        /// set, so anyone can check `ownerOf(token) == badge_purse(...)`.
        /// Nobody holds its private key: the badge is soulbound anyway.
        fn badge_purse(&self, player: &[u8; 20], badge: u8, set_id: SetIdValue) -> [u8; 20] {
            let mut arena = [0u8; 20];
            self.host().address(&mut arena);
            let mut input = Vec::with_capacity(16 + 20 + 20 + 3);
            input.extend_from_slice(b"oab/badge-purse/");
            input.extend_from_slice(&arena);
            input.extend_from_slice(player);
            input.push(badge);
            input.extend_from_slice(&set_id.to_le_bytes());
            let mut hash = [0u8; 32];
            self.host().hash_keccak_256(&input, &mut hash);
            let mut out = [0u8; 20];
            out.copy_from_slice(&hash[12..]);
            out
        }

        /// Mint one badge. Returns the token id, or `None` if the collection
        /// is not set up or the precompile call fails (e.g. the arena cannot
        /// pay the deposit). Never reverts the caller.
        fn mint_badge(&mut self, player: &[u8; 20], badge: u8, set_id: SetIdValue) -> Option<u64> {
            use i_scarcity_collection::IScarcityCollection;
            use pvm_contract_sdk::Address;
            let config = self.badge_config()?;
            let item = *config.items.get(badge as usize)?;
            let to = self.badge_purse(player, badge, set_id);
            let set_label = Bytes::from(decimal(set_id as u64));
            let token =
                IScarcityCollection::from_address(Address(collection_address(config.collection)))
                    .mint(
                        item,
                        Address(to),
                        vec![Bytes::from(b"oab.set".to_vec())],
                        vec![set_label],
                    )
                    .call(self)
                    .ok()?;
            // Scarcity instance ids are u64; a larger token id cannot occur.
            u64::try_from(token).ok()
        }

        fn emit_badge_event(&self, player: &[u8; 20], record: &BadgeRecord) {
            let mut topic1 = [0u8; 32];
            topic1[12..].copy_from_slice(player);
            let mut data = vec![0u8; 64];
            data[31] = record.badge;
            data[62..64].copy_from_slice(&record.set_id.to_be_bytes());
            match record.token {
                Some(token) => {
                    data.extend_from_slice(&[0u8; 24]);
                    data.extend_from_slice(&token.to_be_bytes());
                    self.host()
                        .deposit_event(&[BADGE_MINTED_TOPIC, topic1], &data);
                }
                None => self
                    .host()
                    .deposit_event(&[BADGE_PENDING_TOPIC, topic1], &data),
            }
        }

        /// Give `player` every badge this finished run earns that they do not
        /// hold yet. A failed mint is stored as pending; the game result is
        /// never at risk.
        fn award_badges(&mut self, player: &[u8; 20], session: &ArenaSession) {
            let earned = qualifying_badges(session, &default_config());
            if earned.is_empty() {
                return;
            }
            let mut records = self.load_badges(player);
            let before = records.len();
            for badge in earned {
                if records
                    .iter()
                    .any(|r| r.badge == badge && r.set_id == session.set_id)
                {
                    continue;
                }
                let record = BadgeRecord {
                    badge,
                    set_id: session.set_id,
                    block: self.block_number_u64(),
                    token: self.mint_badge(player, badge, session.set_id),
                };
                self.emit_badge_event(player, &record);
                records.push(record);
            }
            if records.len() != before {
                self.write_scale(DOM_BADGES, player, &records);
            }
        }

        fn ensure_admin(&self) -> Result<(), BadgeSetupFailed> {
            if self.admin() != Some(self.caller_bytes()) {
                return Err(BadgeSetupFailed);
            }
            Ok(())
        }

        // ── ghost pools ──

        fn push_ghost(
            &self,
            set_id: SetIdValue,
            round: RoundValue,
            wins: RoundValue,
            lives: RoundValue,
            board: Vec<GhostBoardUnit>,
        ) {
            if board.is_empty() {
                return;
            }
            let bk = bracket_bytes(set_id, round, wins, lives);
            let mut pool: GhostPool = self.read_scale(DOM_GHOST, &bk).unwrap_or_default();
            if pool.len() >= MAX_GHOSTS_PER_BRACKET {
                pool.remove(0);
            }
            pool.push(board);
            self.write_scale(DOM_GHOST, &bk, &pool);
        }

        fn select_ghost(
            &self,
            set_id: SetIdValue,
            round: RoundValue,
            wins: RoundValue,
            lives: RoundValue,
            seed: u64,
            card_pool: &BTreeMap<CardId, UnitCard>,
        ) -> (Vec<CombatUnit>, Vec<GhostBoardUnit>) {
            let bk = bracket_bytes(set_id, round, wins, lives);
            let pool: GhostPool = self.read_scale(DOM_GHOST, &bk).unwrap_or_default();
            if pool.is_empty() {
                return (Vec::new(), Vec::new());
            }
            let mut rng = XorShiftRng::seed_from_u64(seed);
            let index = rng.gen_range(pool.len());
            let ghost = &pool[index];
            let units = ghost
                .iter()
                .filter_map(|unit| {
                    card_pool.get(&unit.card_id).map(|card| {
                        let mut cu = CombatUnit::from_card(card.clone());
                        cu.attack_buff = unit.perm_attack;
                        cu.health_buff = unit.perm_health;
                        cu.health = cu.health.saturating_add(unit.perm_health);
                        cu
                    })
                })
                .collect();
            (units, ghost.clone())
        }

        fn build_card_pool_from_storage(&self, card_set: &CardSet) -> BTreeMap<CardId, UnitCard> {
            let mut pool = BTreeMap::new();
            for entry in &card_set.cards {
                if let Some(card) = self.load_card(entry.card_id.0) {
                    pool.insert(card.id, card);
                }
            }
            pool
        }

        fn derive_seed(&self, addr: &[u8; 20], context: &[u8], nonce: u64) -> u64 {
            let mut input = Vec::with_capacity(20 + context.len() + 8);
            input.extend_from_slice(addr);
            input.extend_from_slice(context);
            input.extend_from_slice(&nonce.to_le_bytes());
            let mut hash = [0u8; 32];
            self.host().hash_keccak_256(&input, &mut hash);
            u64::from_le_bytes(hash[0..8].try_into().unwrap())
        }

        /// Entropy the caller cannot choose: keccak(block_number ++ parent
        /// block hash). A caller-supplied nonce let players grind millions of
        /// seeds offline for a favorable game; with block entropy the best
        /// they can do is delay `start_game` a block for one fresh roll.
        /// (Collators retain marginal influence over block hashes — acceptable
        /// while nothing of value rides on the outcome.)
        fn block_entropy(&self) -> u64 {
            let mut number = [0u8; 32];
            self.host().block_number(&mut number);
            // Parent block: a block's own hash is unknowable mid-execution.
            // uapi U256 buffers are little-endian; decrement with borrow.
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

            let mut input = Vec::with_capacity(64);
            input.extend_from_slice(&number);
            input.extend_from_slice(&parent_hash);
            let mut hash = [0u8; 32];
            self.host().hash_keccak_256(&input, &mut hash);
            u64::from_le_bytes(hash[0..8].try_into().unwrap())
        }

        // ── entry points ──

        #[pvm_contract_sdk::constructor]
        pub fn new(&mut self) {
            let caller = self.caller_bytes();
            self.write_scale(DOM_ADMIN, &[], &caller);
        }

        /// Admin: store a SCALE-encoded card definition on-chain.
        #[pvm_contract_sdk::method]
        pub fn register_card(&mut self, data: Bytes) -> bool {
            if self.admin() != Some(self.caller_bytes()) {
                return false;
            }
            let card: UnitCard = match Decode::decode(&mut &data.0[..]) {
                Ok(v) => v,
                Err(_) => return false,
            };
            if self.load_card(card.id.0).is_some() {
                return false;
            }
            self.write_scale(DOM_CARD, &card.id.0.to_le_bytes(), &card);
            true
        }

        /// Admin: store a SCALE-encoded card set on-chain.
        #[pvm_contract_sdk::method]
        pub fn register_set(&mut self, set_id: u16, data: Bytes) -> bool {
            if self.admin() != Some(self.caller_bytes()) {
                return false;
            }
            let card_set: CardSet = match Decode::decode(&mut &data.0[..]) {
                Ok(v) => v,
                Err(_) => return false,
            };
            if self.load_set(set_id).is_some() {
                return false;
            }
            self.write_scale(DOM_SET, &set_id.to_le_bytes(), &card_set);
            true
        }

        /// Start a new arena game with the given card set. The game seed is
        /// derived from block entropy, never from caller input.
        #[pvm_contract_sdk::method]
        pub fn start_game(&mut self, set_id: u16) -> u64 {
            let caller = self.caller_bytes();
            self.start_session(&caller, set_id)
        }

        /// Start a ranked game: same as `start_game`, but the caller must hold
        /// Lite or Full personhood. The result goes on the leaderboard under
        /// the caller's personhood alias when `end_game` finalizes it. Returns
        /// 0 if the caller is not eligible or the game cannot start.
        #[pvm_contract_sdk::method]
        pub fn start_ranked_game(&mut self, set_id: u16) -> u64 {
            let caller = self.caller_bytes();
            if self.session_is_active(&caller) {
                return 0;
            }
            let alias = match self.ranked_identity(&caller) {
                Some(a) => a,
                None => return 0,
            };
            let seed = self.start_session(&caller, set_id);
            if seed != 0 {
                self.write_scale(DOM_RANKED, &caller, &alias);
            }
            seed
        }

        fn start_session(&mut self, caller: &[u8; 20], set_id: u16) -> u64 {
            let caller = *caller;
            if self.session_is_active(&caller) {
                return 0;
            }
            let card_set = match self.load_set(set_id) {
                Some(cs) => cs,
                None => return 0,
            };
            let card_pool = self.build_card_pool_from_storage(&card_set);
            if card_pool.is_empty() {
                return 0;
            }

            let config = default_config();
            let seed = self.derive_seed(&caller, b"start", self.block_entropy());
            let bag = create_starting_bag(&card_set, seed, config.bag_size as usize);

            let mut session = ArenaSession {
                bag,
                hand: Vec::new(),
                board: vec![None; config.board_size as usize],
                mana_limit: config.mana_limit_for_round(1),
                shop_mana: 0,
                round: 1,
                lives: config.starting_lives,
                wins: 0,
                phase: GamePhase::Shop,
                next_card_id: 1000,
                game_seed: seed,
                set_id,
            };

            draw_hand(&mut session, config.hand_size as usize);
            let mut shop = make_shop_state(&session, &card_pool);
            apply_shop_start_triggers(&mut shop);
            sync_from_shop_state(&mut session, &shop);

            self.store_session(&caller, &session);
            seed
        }

        /// Submit shop actions (SCALE-encoded CommitTurnAction). Resolves battle
        /// on-chain and emits the result via the BattleReported event. Returns
        /// the battle seed (0 on error).
        #[pvm_contract_sdk::method]
        pub fn submit_turn(&mut self, action: Bytes) -> u64 {
            let caller = self.caller_bytes();
            let mut session = match self.load_session(&caller) {
                Some(s) => s,
                None => return 0,
            };
            if session.phase != GamePhase::Shop {
                return 0;
            }

            let action: CommitTurnAction = match Decode::decode(&mut &action.0[..]) {
                Ok(v) => v,
                Err(_) => return 0,
            };

            let card_set = match self.load_set(session.set_id) {
                Some(cs) => cs,
                None => return 0,
            };
            let card_pool = self.build_card_pool_from_storage(&card_set);
            let config = default_config();

            let mut shop_state = make_shop_state(&session, &card_pool);
            if verify_and_apply_turn(&mut shop_state, &action).is_err() {
                return 0;
            }
            shop_state.shop_mana = 0;

            // Extract player combat units
            let mut player_slots = Vec::new();
            let player_units: Vec<CombatUnit> = shop_state
                .board
                .iter()
                .enumerate()
                .filter_map(|(slot, bu)| {
                    let bu = bu.as_ref()?;
                    player_slots.push(slot);
                    card_pool.get(&bu.card_id).map(|card| {
                        let mut cu = CombatUnit::from_card(card.clone());
                        cu.attack_buff = bu.perm_attack;
                        cu.health_buff = bu.perm_health;
                        cu.health = cu.health.saturating_add(bu.perm_health).max(0);
                        cu
                    })
                })
                .collect();

            // Select ghost opponent BEFORE storing player's board
            let battle_seed = self.derive_seed(&caller, b"battle", session.game_seed);
            let (enemy_units, opponent_ghost) = self.select_ghost(
                session.set_id,
                session.round,
                session.wins,
                session.lives,
                battle_seed,
                &card_pool,
            );

            // Store player's board as ghost for future opponents
            let player_ghost = create_ghost_from_board(&shop_state.board);
            self.push_ghost(
                session.set_id,
                session.round,
                session.wins,
                session.lives,
                player_ghost,
            );

            let mut rng = XorShiftRng::seed_from_u64(battle_seed);
            let events = resolve_battle(
                player_units,
                enemy_units,
                &mut rng,
                &card_pool,
                config.board_size as usize,
            );

            let result = events
                .iter()
                .rev()
                .find_map(|e| {
                    if let oab_battle::battle::CombatEvent::BattleEnd { result } = e {
                        Some(result.clone())
                    } else {
                        None
                    }
                })
                .unwrap_or(BattleResult::Draw);

            let mana_delta: ManaValue =
                oab_battle::battle::player_shop_mana_delta_from_events(&events).max(0) as ManaValue;
            let permanent_deltas =
                oab_battle::battle::player_permanent_stat_deltas_from_events(&events);
            for (unit_id, (attack_delta, health_delta)) in &permanent_deltas {
                let idx = unit_id.raw() as usize;
                if idx == 0 || idx > player_slots.len() {
                    continue;
                }
                let slot = player_slots[idx - 1];
                let remove = if let Some(Some(bu)) = shop_state.board.get_mut(slot) {
                    bu.perm_attack = bu.perm_attack.saturating_add(*attack_delta);
                    bu.perm_health = bu.perm_health.saturating_add(*health_delta);
                    card_pool
                        .get(&bu.card_id)
                        .map(|c| c.stats.health.saturating_add(bu.perm_health) <= 0)
                        .unwrap_or(false)
                } else {
                    false
                };
                if remove {
                    shop_state.board[slot] = None;
                }
            }

            match result {
                BattleResult::Victory => session.wins += 1,
                BattleResult::Defeat => session.lives -= 1,
                BattleResult::Draw => {}
            }

            let completed_round = session.round;
            let game_over = session.lives == 0 || session.wins >= config.wins_to_victory;

            if !game_over {
                let new_seed = self.derive_seed(&caller, b"shop", session.game_seed);
                session.game_seed = new_seed;
                // Saturating: endless empty-board draws never lose a life, so
                // the round counter can otherwise wrap past u8::MAX (silently,
                // since the release profile builds with overflow-checks off).
                session.round = session.round.saturating_add(1);
                session.mana_limit = config.mana_limit_for_round(session.round);
                session.shop_mana = if config.full_mana_each_round {
                    session.mana_limit
                } else {
                    mana_delta
                };
                session.board = shop_state.board;
                let mut bag = session.bag.clone();
                bag.extend(shop_state.hand.iter());
                session.bag = bag;
                session.hand = Vec::new();
                session.phase = GamePhase::Shop;

                draw_hand(&mut session, config.hand_size as usize);
                let mut shop = make_shop_state(&session, &card_pool);
                oab_battle::apply_shop_start_triggers_with_result(&mut shop, Some(result.clone()));
                sync_from_shop_state(&mut session, &shop);
            } else {
                session.board = shop_state.board;
                session.hand = shop_state.hand;
                session.shop_mana = mana_delta;
                session.phase = GamePhase::Completed;
            }

            self.store_session(&caller, &session);

            // Emit BattleReported event with opponent board for frontend replay
            let ghost_encoded = opponent_ghost.encode();
            let mut event_data = Vec::with_capacity(12 + ghost_encoded.len());
            let result_byte = match result {
                BattleResult::Victory => 0u8,
                BattleResult::Defeat => 1,
                BattleResult::Draw => 2,
            };
            event_data.push(result_byte);
            event_data.push(session.wins);
            event_data.push(session.lives);
            event_data.push(completed_round);
            event_data.extend_from_slice(&battle_seed.to_be_bytes());
            event_data.extend_from_slice(&ghost_encoded);
            self.host()
                .deposit_event(&[BATTLE_REPORTED_TOPIC], &event_data);

            battle_seed
        }

        /// Read the caller's current game state (SCALE-encoded ArenaSession).
        #[pvm_contract_sdk::method]
        pub fn get_game_state(&self) -> Bytes {
            let caller = self.caller_bytes();
            match self.load_session(&caller) {
                Some(session) => Bytes::from(session.encode()),
                None => Bytes::from(Vec::new()),
            }
        }

        /// Forfeit the current game.
        #[pvm_contract_sdk::method]
        pub fn abandon_game(&mut self) -> bool {
            let caller = self.caller_bytes();
            if !self.session_is_active(&caller) {
                return false;
            }
            self.clear_session(&caller);
            true
        }

        /// End a completed game, archiving the final board as a ghost.
        #[pvm_contract_sdk::method]
        pub fn end_game(&mut self) -> bool {
            let caller = self.caller_bytes();
            let session = match self.load_session(&caller) {
                Some(s) => s,
                None => return false,
            };
            if session.phase != GamePhase::Completed {
                return false;
            }
            let ghost = create_ghost_from_board(&session.board);
            if !ghost.is_empty() {
                self.push_ghost(
                    session.set_id,
                    session.round,
                    session.wins,
                    session.lives,
                    ghost,
                );
            }
            let ranked = self.ranked_alias(&caller);
            if let Some(alias) = ranked {
                self.record_ranked_result(alias, &session);
            }
            self.clear_session(&caller);
            // Badges are ranked-only: the arena pays a deposit per badge, and
            // casual play is open to unlimited throwaway accounts.
            if ranked.is_some() {
                self.award_badges(&caller, &session);
            }
            true
        }

        /// Admin, once: create the arena-owned "OAB Achievements" Scarcity
        /// collection, name it, and define one soulbound item per badge type.
        /// The arena account pays every deposit, so fund it first. Reverts
        /// (and so undoes every step) on any failure. Returns the collection id.
        #[pvm_contract_sdk::method]
        pub fn init_achievements(&mut self) -> Result<u32, BadgeSetupFailed> {
            use i_scarcity_collection::IScarcityCollection;
            use i_scarcity_factory::IScarcityFactory;
            use pvm_contract_sdk::Address;
            self.ensure_admin()?;
            if self.badge_config().is_some() {
                return Err(BadgeSetupFailed);
            }
            let collection = IScarcityFactory::from_address(Address(SCARCITY_FACTORY))
                .create_collection()
                .call(self)
                .map_err(|_| BadgeSetupFailed)?;
            let at = Address(collection_address(collection));
            for (key, value) in [
                (&b"name"[..], BADGE_COLLECTION_NAME),
                (&b"symbol"[..], BADGE_COLLECTION_SYMBOL),
            ] {
                IScarcityCollection::from_address(at)
                    .set_collection_metadata(Bytes::from(key.to_vec()), Bytes::from(value.to_vec()))
                    .call(self)
                    .map_err(|_| BadgeSetupFailed)?;
            }
            let mut items = Vec::with_capacity(BADGES.len());
            for (key, name) in BADGES {
                let item = IScarcityCollection::from_address(at)
                    .define_item(
                        true,
                        vec![
                            Bytes::from(b"oab.badge".to_vec()),
                            Bytes::from(b"oab.name".to_vec()),
                        ],
                        vec![Bytes::from(key.to_vec()), Bytes::from(name.to_vec())],
                    )
                    .call(self)
                    .map_err(|_| BadgeSetupFailed)?;
                items.push(item);
            }
            self.write_scale(DOM_BADGE_CONFIG, &[], &BadgeConfig { collection, items });
            Ok(collection)
        }

        /// SCALE `BadgeConfig { collection: u32, items: Vec<u32> }`, or empty
        /// bytes before `init_achievements`.
        #[pvm_contract_sdk::method]
        pub fn get_badge_config(&self) -> Bytes {
            match self.badge_config() {
                Some(config) => Bytes::from(config.encode()),
                None => Bytes::from(Vec::new()),
            }
        }

        /// SCALE `Vec<BadgeRecord>` of `player`'s badges, in the order earned.
        /// `token: None` means earned but not minted yet.
        #[pvm_contract_sdk::method]
        pub fn get_badges(&self, player: pvm_contract_sdk::Address) -> Bytes {
            Bytes::from(self.load_badges(&player.0).encode())
        }

        /// Retry the mint of every pending badge of the caller (badges earned
        /// while the collection was not set up or the arena could not pay the
        /// deposit). Returns how many were minted now.
        #[pvm_contract_sdk::method]
        pub fn claim_pending_badges(&mut self) -> u32 {
            let caller = self.caller_bytes();
            let mut records = self.load_badges(&caller);
            let mut minted = 0u32;
            for i in 0..records.len() {
                if records[i].token.is_some() {
                    continue;
                }
                if let Some(token) = self.mint_badge(&caller, records[i].badge, records[i].set_id) {
                    records[i].token = Some(token);
                    self.emit_badge_event(&caller, &records[i]);
                    minted += 1;
                }
            }
            if minted > 0 {
                self.write_scale(DOM_BADGES, &caller, &records);
            }
            minted
        }

        /// The personhood alias of the caller's active ranked game, or zero
        /// bytes if the caller has no game or a casual one.
        #[pvm_contract_sdk::method]
        pub fn get_ranked_alias(&self) -> [u8; 32] {
            let caller = self.caller_bytes();
            if !self.session_is_active(&caller) {
                return [0u8; 32];
            }
            self.ranked_alias(&caller).unwrap_or([0u8; 32])
        }

        /// Admin: set the personhood context (bytes32) the contract reads
        /// aliases in. Ranked play is closed until this is set. Players must
        /// bind their account to an alias in this same context.
        #[pvm_contract_sdk::method]
        pub fn set_personhood_context(&mut self, context: [u8; 32]) -> bool {
            if self.admin() != Some(self.caller_bytes()) {
                return false;
            }
            self.write_scale(DOM_PERSONHOOD_CTX, &[], &context);
            true
        }

        /// The configured personhood context (zero bytes if unset).
        #[pvm_contract_sdk::method]
        pub fn get_personhood_context(&self) -> [u8; 32] {
            self.personhood_context().unwrap_or([0u8; 32])
        }

        /// SCALE-encoded `Vec<LeaderboardEntry>` for `set_id`, best first,
        /// sliced to `[offset, offset + limit)`.
        #[pvm_contract_sdk::method]
        pub fn get_leaderboard(&self, set_id: u16, offset: u32, limit: u32) -> Bytes {
            let board = self.load_leaderboard(set_id);
            let start = (offset as usize).min(board.len());
            let end = start.saturating_add(limit as usize).min(board.len());
            Bytes::from(board[start..end].to_vec().encode())
        }

        /// 1-based place of `alias` on the `set_id` board; 0 if not on it.
        #[pvm_contract_sdk::method]
        pub fn get_player_rank(&self, set_id: u16, alias: [u8; 32]) -> u32 {
            self.load_leaderboard(set_id)
                .iter()
                .position(|e| e.alias == alias)
                .map(|i| i as u32 + 1)
                .unwrap_or(0)
        }

        /// SCALE-encoded best `LeaderboardEntry` of `alias` on `set_id`, or
        /// empty bytes if that person has no finished ranked run on the set.
        #[pvm_contract_sdk::method]
        pub fn get_best_run(&self, set_id: u16, alias: [u8; 32]) -> Bytes {
            let key = Self::best_run_key(set_id, &alias);
            match self.read_scale::<LeaderboardEntry>(DOM_BEST_RUN, &key) {
                Some(entry) => Bytes::from(entry.encode()),
                None => Bytes::from(Vec::new()),
            }
        }

        /// Read a SCALE-encoded card definition.
        #[pvm_contract_sdk::method]
        pub fn get_card(&self, card_id: u16) -> Bytes {
            match self.load_card(card_id) {
                Some(card) => Bytes::from(card.encode()),
                None => Bytes::from(Vec::new()),
            }
        }

        /// Read a SCALE-encoded card set.
        #[pvm_contract_sdk::method]
        pub fn get_set(&self, set_id: u16) -> Bytes {
            match self.load_set(set_id) {
                Some(card_set) => Bytes::from(card_set.encode()),
                None => Bytes::from(Vec::new()),
            }
        }

        #[pvm_contract_sdk::fallback]
        pub fn fallback(&mut self) {}
    }
}

// ── Native tests: drive the real contract via MockHost ────────────────────────
//
// These exercise the migrated contract's actual methods (storage, keccak keys,
// caller, events all backed by MockHost) against the behaviours asserted by the
// pallet-demo `arena` test suite. Run with: `cargo test --features std`.

#[cfg(test)]
mod tests {
    use super::oab_arena::OabArena;
    use super::ArenaSession;
    use oab_battle::types::CommitTurnAction;
    use oab_game::GamePhase;
    use parity_scale_codec::{Decode, Encode};
    use pvm_contract_sdk::{Bytes, MockHost, MockHostBuilder};

    const ADMIN: [u8; 20] = [0x11; 20];

    fn decode_session(bytes: &Bytes) -> Option<ArenaSession> {
        if bytes.0.is_empty() {
            return None;
        }
        ArenaSession::decode(&mut &bytes.0[..]).ok()
    }

    fn empty_turn() -> Bytes {
        Bytes(
            CommitTurnAction {
                actions: Vec::new(),
            }
            .encode(),
        )
    }

    /// Contract with ADMIN as caller, constructor run, and all genesis cards +
    /// sets registered (set ids = index, matching pallet genesis; set 0 exists).
    fn setup() -> (OabArena, MockHost) {
        let mock = MockHostBuilder::new().caller(ADMIN).build();
        let mut c = OabArena::with_host(mock.clone());
        c.new();
        for card in oab_assets::cards::get_all() {
            assert!(
                c.register_card(Bytes(card.encode())),
                "register_card failed"
            );
        }
        for (i, set) in oab_assets::sets::get_all().iter().enumerate() {
            assert!(
                c.register_set(i as u16, Bytes(set.encode())),
                "register_set failed"
            );
        }
        (c, mock)
    }

    // ── start_game ──

    #[test]
    fn start_game_initializes_session() {
        let (mut c, _m) = setup();
        let seed = c.start_game(0);
        assert_ne!(seed, 0, "start_game should return a non-zero seed");

        let session = decode_session(&c.get_game_state()).expect("active session");
        assert_eq!(session.round, 1);
        assert_eq!(session.phase, GamePhase::Shop);
        assert_eq!(session.hand.len(), 5, "draws 5 cards");
        assert_eq!(session.bag.len(), 45, "bag 50 - 5 drawn");
        assert_eq!(session.lives, 3);
        assert_eq!(session.wins, 0);
        assert_eq!(session.mana_limit, 3, "round 1 mana limit");
    }

    #[test]
    fn start_game_twice_is_rejected() {
        let (mut c, _m) = setup();
        assert_ne!(c.start_game(0), 0);
        assert_eq!(c.start_game(0), 0, "GameAlreadyActive => 0");
    }

    #[test]
    fn start_game_unknown_set_returns_zero() {
        let (mut c, _m) = setup();
        assert_eq!(c.start_game(999), 0, "CardSetNotFound => 0");
    }

    // ── submit_turn ──

    #[test]
    fn submit_turn_empty_advances_round_and_mana() {
        let (mut c, _m) = setup();
        c.start_game(0);
        // Empty board vs empty ghost pool => Draw => no life lost => round advances.
        let battle_seed = c.submit_turn(empty_turn());
        assert_ne!(battle_seed, 0, "submit_turn returns the battle seed");

        let session = decode_session(&c.get_game_state()).expect("session still active after draw");
        assert_eq!(session.phase, GamePhase::Shop);
        assert_eq!(
            session.round, 2,
            "round advances after a non-game-over turn"
        );
        assert_eq!(
            session.mana_limit, 4,
            "mana_limit = min(3 + (round-1), 10) = 4"
        );
        assert_eq!(session.lives, 3, "draw costs no life");
        assert_eq!(session.wins, 0);
    }

    #[test]
    fn submit_turn_without_game_returns_zero() {
        let (mut c, _m) = setup();
        assert_eq!(c.submit_turn(empty_turn()), 0, "NoActiveGame => 0");
    }

    // ── state / abandon / end ──

    #[test]
    fn get_game_state_empty_without_game() {
        let (c, _m) = setup();
        assert!(decode_session(&c.get_game_state()).is_none());
    }

    #[test]
    fn abandon_game_clears_session() {
        let (mut c, _m) = setup();
        c.start_game(0);
        assert!(decode_session(&c.get_game_state()).is_some());
        assert!(c.abandon_game(), "abandon active game => true");
        assert!(
            decode_session(&c.get_game_state()).is_none(),
            "session cleared"
        );
    }

    #[test]
    fn abandon_without_game_is_false() {
        let (mut c, _m) = setup();
        assert!(!c.abandon_game(), "NoActiveGame => false");
    }

    #[test]
    fn end_game_requires_completed_phase() {
        let (mut c, _m) = setup();
        c.start_game(0); // phase = Shop
        assert!(!c.end_game(), "WrongPhase (Shop) => false");
    }

    #[test]
    fn end_game_without_game_is_false() {
        let (mut c, _m) = setup();
        assert!(!c.end_game(), "NoActiveGame => false");
    }

    // ── registry ──

    #[test]
    fn register_card_dedup() {
        let mock = MockHostBuilder::new().caller(ADMIN).build();
        let mut c = OabArena::with_host(mock);
        c.new();
        let card = oab_assets::cards::get_all()[0].clone();
        assert!(
            c.register_card(Bytes(card.encode())),
            "first registration ok"
        );
        assert!(
            !c.register_card(Bytes(card.encode())),
            "CardAlreadyExists => false"
        );
    }

    #[test]
    fn register_set_dedup() {
        let mock = MockHostBuilder::new().caller(ADMIN).build();
        let mut c = OabArena::with_host(mock);
        c.new();
        for card in oab_assets::cards::get_all() {
            c.register_card(Bytes(card.encode()));
        }
        let set = oab_assets::sets::get_all()[0].clone();
        assert!(c.register_set(0, Bytes(set.encode())), "first set ok");
        assert!(
            !c.register_set(0, Bytes(set.encode())),
            "SetAlreadyExists => false"
        );
    }

    #[test]
    fn register_requires_admin() {
        // Fresh contract WITHOUT running the constructor => admin unset =>
        // a non-admin caller cannot register.
        let mock = MockHostBuilder::new().caller([0x22; 20]).build();
        let mut c = OabArena::with_host(mock);
        let card = oab_assets::cards::get_all()[0].clone();
        assert!(!c.register_card(Bytes(card.encode())), "non-admin => false");
    }

    // ── read-through ──

    #[test]
    fn get_card_and_set_round_trip() {
        let (c, _m) = setup();
        let first = oab_assets::cards::get_all()[0].clone();
        let card_bytes = c.get_card(first.id.0);
        assert!(!card_bytes.0.is_empty(), "registered card is readable");
        let set_bytes = c.get_set(0);
        assert!(!set_bytes.0.is_empty(), "registered set 0 is readable");
        assert!(c.get_set(999).0.is_empty(), "unknown set => empty");
    }

    // ── deeper game-flow (forced state via computed storage keys) ──

    fn keccak256(input: &[u8]) -> [u8; 32] {
        use tiny_keccak::{Hasher, Keccak};
        let mut h = Keccak::v256();
        let mut out = [0u8; 32];
        h.update(input);
        h.finalize(&mut out);
        out
    }

    /// Mirror the contract's keccak(domain ++ key) storage-key derivation so the
    /// test can force on-chain state directly (matches `OabArena::skey`).
    fn skey(domain: u8, k: &[u8]) -> [u8; 32] {
        let mut input = Vec::with_capacity(1 + k.len());
        input.push(domain);
        input.extend_from_slice(k);
        keccak256(&input)
    }

    fn force_session(mock: &MockHost, caller: &[u8; 20], session: &ArenaSession) {
        mock.set_raw_storage(skey(super::DOM_SESSION, caller).to_vec(), session.encode());
    }

    #[test]
    fn submit_turn_multi_round_progression() {
        let (mut c, _m) = setup();
        c.start_game(0);
        // Three empty turns; empty-vs-empty draws never lose a life nor end the game.
        for _ in 0..3 {
            assert_ne!(c.submit_turn(empty_turn()), 0);
        }
        let s = decode_session(&c.get_game_state()).expect("active");
        assert_eq!(s.round, 4, "round advances once per non-game-over turn");
        assert_eq!(s.mana_limit, 6, "mana_limit = min(3 + (4-1), 10) = 6");
        assert_eq!(s.lives, 3, "draws cost no lives");
    }

    #[test]
    fn forced_victory_completes_and_end_game_archives() {
        let (mut c, mock) = setup();
        c.start_game(0);
        // Simulate the wins>=10 game-over outcome and the Completed phase.
        let mut s = decode_session(&c.get_game_state()).unwrap();
        s.wins = 10;
        s.phase = GamePhase::Completed;
        force_session(&mock, &ADMIN, &s);

        assert!(c.end_game(), "end_game on a Completed game => true");
        assert!(
            decode_session(&c.get_game_state()).is_none(),
            "session removed after end_game"
        );
    }

    #[test]
    fn forced_loss_to_zero_lives_ends_game() {
        use oab_battle::types::GhostBoardUnit;
        let (mut c, mock) = setup();
        c.start_game(0);

        let mut s = decode_session(&c.get_game_state()).unwrap();
        s.lives = 1; // one loss from elimination
        let (round, wins) = (s.round, s.wins);
        force_session(&mock, &ADMIN, &s);

        // Seed a strong ghost in the matching bracket so the empty player board loses.
        let set0 = oab_assets::sets::get_all()[0].clone();
        let cid = set0.cards[0].card_id;
        let pool: Vec<Vec<GhostBoardUnit>> = vec![vec![GhostBoardUnit {
            card_id: cid,
            perm_attack: 50,
            perm_health: 50,
        }]];
        mock.set_raw_storage(
            skey(super::DOM_GHOST, &super::bracket_bytes(0, round, wins, 1)).to_vec(),
            pool.encode(),
        );

        assert_ne!(c.submit_turn(empty_turn()), 0);
        let s2 = decode_session(&c.get_game_state()).expect("session present at game over");
        assert_eq!(s2.lives, 0, "defeat drops the last life");
        assert_eq!(s2.phase, GamePhase::Completed, "lives==0 => game over");
        // The game is over but not yet removed; end_game finalizes it.
        assert!(c.end_game(), "end_game on the completed game => true");
        assert!(decode_session(&c.get_game_state()).is_none());
    }

    /// End-to-end lifecycle through the real contract methods: register all
    /// genesis cards + set 0, start a game, lose three battles against seeded
    /// ghosts (an empty board always loses to a non-empty opponent) so the game
    /// reaches its natural lives==0 game-over, then finalize with end_game.
    #[test]
    fn e2e_full_game_lifecycle_to_defeat() {
        use oab_battle::types::GhostBoardUnit;
        let (mut c, mock) = setup();
        let cid = oab_assets::sets::get_all()[0].clone().cards[0].card_id;

        // Seed a strong ghost in the (set 0, round, wins=0, lives) bracket the
        // contract will match when resolving this turn's battle.
        let seed_strong_ghost = |round: u8, lives: u8| {
            let pool: Vec<Vec<GhostBoardUnit>> = vec![vec![GhostBoardUnit {
                card_id: cid,
                perm_attack: 50,
                perm_health: 50,
            }]];
            mock.set_raw_storage(
                skey(super::DOM_GHOST, &super::bracket_bytes(0, round, 0, lives)).to_vec(),
                pool.encode(),
            );
        };

        assert_ne!(c.start_game(0), 0, "game starts");
        let s = decode_session(&c.get_game_state()).unwrap();
        assert_eq!((s.round, s.lives, s.wins), (1, 3, 0), "fresh game state");

        // Round 1 (lives 3) -> lose -> lives 2, round 2
        // Round 2 (lives 2) -> lose -> lives 1, round 3
        // Round 3 (lives 1) -> lose -> lives 0 -> game over
        let mut expected_lives = 3u8;
        let mut round = 1u8;
        while expected_lives > 0 {
            seed_strong_ghost(round, expected_lives);
            assert_ne!(
                c.submit_turn(empty_turn()),
                0,
                "turn resolves at round {round}"
            );
            let s =
                decode_session(&c.get_game_state()).expect("session persists through game over");
            expected_lives -= 1;
            assert_eq!(s.lives, expected_lives, "a defeat costs exactly one life");
            if expected_lives > 0 {
                round += 1;
                assert_eq!(s.round, round, "round advances while the game continues");
                assert_eq!(s.phase, GamePhase::Shop, "back to Shop for the next round");
            }
        }

        let s = decode_session(&c.get_game_state()).unwrap();
        assert_eq!(s.lives, 0);
        assert_eq!(s.phase, GamePhase::Completed, "lives==0 ends the game");

        assert!(c.end_game(), "end_game finalizes the completed game");
        assert!(
            decode_session(&c.get_game_state()).is_none(),
            "game removed after end_game"
        );
    }

    // ── personhood gate + ranked leaderboard ──
    //
    // Product rule (Shawn): casual play is open to anyone; ranked play and the
    // leaderboard need personhood Lite or Full. Ranked identity is the
    // personhood context alias, so one person has one leaderboard identity no
    // matter how many accounts they use.

    use super::{insert_ranked, LeaderboardEntry, PERSONHOOD_PRECOMPILE};

    const CTX: [u8; 32] = [0xC7; 32];
    const ALIAS_A: [u8; 32] = [0xA1; 32];
    const ALIAS_B: [u8; 32] = [0xB2; 32];
    const PLAYER_1: [u8; 20] = [0x31; 20];
    const PLAYER_2: [u8; 20] = [0x32; 20];

    /// ABI return of `personhoodStatus`: `(uint8 status, bytes32 alias)` as two
    /// 32-byte words — the exact shape the live precompile returned on Paseo
    /// Asset Hub Next (2026-10-20).
    fn personhood_reply(status: u8, alias: [u8; 32]) -> Vec<u8> {
        let mut out = vec![0u8; 64];
        out[31] = status;
        out[32..].copy_from_slice(&alias);
        out
    }

    fn mock_personhood(mock: &MockHost, status: u8, alias: [u8; 32]) {
        mock.mock_call(PERSONHOOD_PRECOMPILE, Ok(personhood_reply(status, alias)));
    }

    /// Cards + sets registered and the personhood context configured.
    fn setup_ranked() -> (OabArena, MockHost) {
        let (mut c, m) = setup();
        assert!(c.set_personhood_context(CTX));
        (c, m)
    }

    /// The same contract storage seen from another caller at another block.
    /// MockHost fixes the caller at build time, so copy the storage across.
    fn as_caller(from: &MockHost, caller: [u8; 20], block: u64) -> (OabArena, MockHost) {
        let mock = MockHostBuilder::new()
            .caller(caller)
            .block_number(block)
            .build();
        for (k, v) in from.storage_dump() {
            mock.set_raw_storage(k, v);
        }
        (OabArena::with_host(mock.clone()), mock)
    }

    /// Force the caller's active game to a finished state and finalize it.
    fn finish_game(c: &mut OabArena, mock: &MockHost, caller: [u8; 20], wins: u8, lives: u8) {
        let mut s = decode_session(&c.get_game_state()).expect("active game");
        s.wins = wins;
        s.lives = lives;
        s.phase = GamePhase::Completed;
        force_session(mock, &caller, &s);
        assert!(c.end_game());
    }

    fn board(c: &OabArena, set_id: u16) -> Vec<LeaderboardEntry> {
        Vec::<LeaderboardEntry>::decode(&mut &c.get_leaderboard(set_id, 0, u32::MAX).0[..]).unwrap()
    }

    #[test]
    fn ranked_rejects_no_personhood_but_casual_stays_open() {
        let (mut c, m) = setup_ranked();
        mock_personhood(&m, 0, [0u8; 32]);
        assert_eq!(
            c.start_ranked_game(0),
            0,
            "status None must not enter ranked play"
        );
        assert!(
            decode_session(&c.get_game_state()).is_none(),
            "rejected ranked start leaves no game"
        );
        assert_ne!(c.start_game(0), 0, "casual play needs no personhood");
        assert_eq!(
            c.get_ranked_alias(),
            [0u8; 32],
            "a casual game is not ranked"
        );
    }

    #[test]
    fn ranked_accepts_lite_and_full() {
        for status in [1u8, 2u8] {
            let (mut c, m) = setup_ranked();
            mock_personhood(&m, status, ALIAS_A);
            assert_ne!(
                c.start_ranked_game(0),
                0,
                "status {status} is eligible for ranked"
            );
            assert_eq!(
                c.get_ranked_alias(),
                ALIAS_A,
                "the game is bound to the person's alias"
            );
        }
    }

    #[test]
    fn ranked_rejects_unknown_tier() {
        // Only Lite and Full were approved; a future tier needs a decision.
        let (mut c, m) = setup_ranked();
        mock_personhood(&m, 3, ALIAS_A);
        assert_eq!(c.start_ranked_game(0), 0);
    }

    #[test]
    fn ranked_fails_closed_without_context_or_precompile() {
        // No context configured: an alias from an arbitrary context would let
        // one person appear under several identities.
        let (mut c, m) = setup();
        mock_personhood(&m, 2, ALIAS_A);
        assert_eq!(c.start_ranked_game(0), 0, "no context => ranked closed");

        // Context set but no precompile answer (a chain without it).
        let (mut c, m) = setup_ranked();
        m.mock_call(PERSONHOOD_PRECOMPILE, Err(()));
        assert_eq!(
            c.start_ranked_game(0),
            0,
            "reverting precompile => ranked closed"
        );
        let (mut c, _m) = setup_ranked();
        assert_eq!(
            c.start_ranked_game(0),
            0,
            "empty precompile reply => ranked closed"
        );
    }

    #[test]
    fn precompile_is_queried_for_the_caller_in_the_configured_context() {
        // The alias is only meaningful for this account in this context; a
        // wrong selector, account or context would gate on someone else.
        let (mut c, m) = setup_ranked();
        mock_personhood(&m, 1, ALIAS_A);
        m.take_recorded_calls();
        assert_ne!(c.start_ranked_game(0), 0);
        let calls = m.take_recorded_calls();
        assert_eq!(calls.len(), 1, "one personhood lookup per ranked start");
        let (callee, input) = &calls[0];
        assert_eq!(*callee, PERSONHOOD_PRECOMPILE);
        // keccak256("personhoodStatus(address,bytes32)")[..4]
        assert_eq!(input[..4], [0x88, 0x6a, 0xf1, 0x33]);
        assert_eq!(input[4..16], [0u8; 12]);
        assert_eq!(input[16..36], ADMIN, "queries the caller's address");
        assert_eq!(input[36..68], CTX, "queries the configured context");
    }

    #[test]
    fn set_personhood_context_is_admin_only() {
        let (c, m) = setup();
        let (mut other, _) = as_caller(&m, PLAYER_1, 1);
        assert!(
            !other.set_personhood_context(CTX),
            "non-admin cannot redirect the gate"
        );
        assert_eq!(c.get_personhood_context(), [0u8; 32]);
    }

    #[test]
    fn ranked_end_game_records_the_run_under_the_alias() {
        let (c0, m0) = setup_ranked();
        drop(c0);
        let (mut c, m) = as_caller(&m0, PLAYER_1, 77);
        mock_personhood(&m, 2, ALIAS_A);
        assert_ne!(c.start_ranked_game(0), 0);
        finish_game(&mut c, &m, PLAYER_1, 7, 2);

        let b = board(&c, 0);
        assert_eq!(b.len(), 1);
        assert_eq!(
            (b[0].alias, b[0].set_id, b[0].wins, b[0].lives, b[0].block),
            (ALIAS_A, 0, 7, 2, 77)
        );
        assert_eq!(c.get_player_rank(0, ALIAS_A), 1);
        let best = LeaderboardEntry::decode(&mut &c.get_best_run(0, ALIAS_A).0[..]).unwrap();
        assert_eq!(best, b[0]);
        assert_eq!(
            c.get_ranked_alias(),
            [0u8; 32],
            "ranked marker cleared with the game"
        );
        assert!(board(&c, 1).is_empty(), "boards are per set");
    }

    #[test]
    fn casual_and_abandoned_games_never_reach_the_leaderboard() {
        let (mut c, m) = setup_ranked();
        mock_personhood(&m, 2, ALIAS_A);
        // Casual game by an eligible person: still casual, no entry.
        assert_ne!(c.start_game(0), 0);
        finish_game(&mut c, &m, ADMIN, 10, 3);
        assert!(
            board(&c, 0).is_empty(),
            "casual results are unverified and stay off the board"
        );

        // Abandoned ranked game: no entry, and the ranked flag does not leak
        // into the next (casual) game.
        assert_ne!(c.start_ranked_game(0), 0);
        assert!(c.abandon_game());
        assert!(board(&c, 0).is_empty());
        assert_ne!(c.start_game(0), 0);
        assert_eq!(c.get_ranked_alias(), [0u8; 32]);
        finish_game(&mut c, &m, ADMIN, 10, 3);
        assert!(board(&c, 0).is_empty());
        assert!(c.get_best_run(0, ALIAS_A).0.is_empty());
    }

    #[test]
    fn two_accounts_of_one_person_share_one_entry() {
        let (_c, m0) = setup_ranked();

        let (mut c1, m1) = as_caller(&m0, PLAYER_1, 10);
        mock_personhood(&m1, 1, ALIAS_A);
        assert_ne!(c1.start_ranked_game(0), 0);
        finish_game(&mut c1, &m1, PLAYER_1, 5, 1);

        // Same person, second account, better run: replaces, not adds.
        let (mut c2, m2) = as_caller(&m1, PLAYER_2, 20);
        mock_personhood(&m2, 2, ALIAS_A);
        assert_ne!(c2.start_ranked_game(0), 0);
        finish_game(&mut c2, &m2, PLAYER_2, 8, 2);
        let b = board(&c2, 0);
        assert_eq!(b.len(), 1, "one person => one leaderboard entry");
        assert_eq!((b[0].wins, b[0].lives, b[0].block), (8, 2, 20));

        // Worse run from the first account does not lower the person's best.
        let (mut c3, m3) = as_caller(&m2, PLAYER_1, 30);
        mock_personhood(&m3, 1, ALIAS_A);
        assert_ne!(c3.start_ranked_game(0), 0);
        finish_game(&mut c3, &m3, PLAYER_1, 2, 0);
        let b = board(&c3, 0);
        assert_eq!(b.len(), 1);
        assert_eq!((b[0].wins, b[0].lives), (8, 2), "best run kept");
        let best = LeaderboardEntry::decode(&mut &c3.get_best_run(0, ALIAS_A).0[..]).unwrap();
        assert_eq!(best.wins, 8);

        // A different person gets their own entry.
        let (mut c4, m4) = as_caller(&m3, PLAYER_2, 40);
        mock_personhood(&m4, 1, ALIAS_B);
        assert_ne!(c4.start_ranked_game(0), 0);
        finish_game(&mut c4, &m4, PLAYER_2, 9, 0);
        let b = board(&c4, 0);
        assert_eq!(
            b.iter().map(|e| e.alias).collect::<Vec<_>>(),
            vec![ALIAS_B, ALIAS_A]
        );
        assert_eq!(c4.get_player_rank(0, ALIAS_A), 2);
        assert_eq!(c4.get_player_rank(0, [0xEE; 32]), 0, "unranked alias => 0");
    }

    fn entry(tag: u8, wins: u8, lives: u8, block: u64) -> LeaderboardEntry {
        LeaderboardEntry {
            alias: [tag; 32],
            set_id: 0,
            wins,
            lives,
            rounds: 0,
            block,
        }
    }

    #[test]
    fn leaderboard_orders_by_wins_then_lives_then_earliest() {
        let mut b = Vec::new();
        insert_ranked(&mut b, entry(1, 5, 3, 10), 10);
        insert_ranked(&mut b, entry(2, 6, 0, 11), 10); // more wins beats more lives
        insert_ranked(&mut b, entry(3, 5, 2, 9), 10); // same wins, fewer lives
        insert_ranked(&mut b, entry(4, 5, 3, 12), 10); // exact tie, later block
        let order: Vec<u8> = b.iter().map(|e| e.alias[0]).collect();
        assert_eq!(order, vec![2, 1, 4, 3]);
    }

    #[test]
    fn leaderboard_is_bounded_and_keeps_the_best() {
        let mut b = Vec::new();
        for i in 0..5u8 {
            insert_ranked(&mut b, entry(i, i, 0, 1), 3);
        }
        let wins: Vec<u8> = b.iter().map(|e| e.wins).collect();
        assert_eq!(
            wins,
            vec![4, 3, 2],
            "storage stays bounded at the cap, weakest dropped"
        );
        assert!(
            !insert_ranked(&mut b, entry(9, 1, 0, 1), 3),
            "below last place on a full board => no change"
        );
        assert!(
            !insert_ranked(&mut b, entry(4, 1, 0, 1), 3),
            "worse run of a listed alias => no change"
        );
        assert!(
            insert_ranked(&mut b, entry(2, 9, 0, 1), 3),
            "better run moves the alias up, no duplicate"
        );
        assert_eq!(
            b.iter().map(|e| e.alias[0]).collect::<Vec<_>>(),
            vec![2, 4, 3]
        );
    }

    #[test]
    fn get_leaderboard_pages() {
        let (_c, m0) = setup_ranked();
        let mut m = m0;
        for (i, wins) in [3u8, 9, 6].iter().enumerate() {
            let (mut c, mi) = as_caller(&m, PLAYER_1, i as u64 + 1);
            mock_personhood(&mi, 1, [i as u8 + 1; 32]);
            assert_ne!(c.start_ranked_game(0), 0);
            finish_game(&mut c, &mi, PLAYER_1, *wins, 1);
            m = mi;
        }
        let (c, _) = as_caller(&m, PLAYER_1, 9);
        let page =
            |o, l| Vec::<LeaderboardEntry>::decode(&mut &c.get_leaderboard(0, o, l).0[..]).unwrap();
        assert_eq!(
            page(0, 2).iter().map(|e| e.wins).collect::<Vec<_>>(),
            vec![9, 6]
        );
        assert_eq!(
            page(2, 2).iter().map(|e| e.wins).collect::<Vec<_>>(),
            vec![3]
        );
        assert!(page(5, 2).is_empty(), "offset past the end => empty list");
    }

    // ── achievement badges ──
    //
    // Product rules: a qualifying ranked run earns a soulbound badge NFT,
    // at most once per (account, badge, set) because the arena pays a deposit
    // for each; a failed mint must never cost the player the game result.

    use super::{
        collection_address, BadgeConfig, BadgeRecord, BADGE_FLAWLESS, BADGE_MINTED_TOPIC,
        BADGE_PENDING_TOPIC, BADGE_VICTORY, SCARCITY_FACTORY,
    };

    const COLL: u32 = 29;
    const ITEM: u32 = 4;
    const TOKEN: u64 = 1234;

    fn word(n: u64) -> Vec<u8> {
        let mut w = vec![0u8; 32];
        w[24..].copy_from_slice(&n.to_be_bytes());
        w
    }

    fn selector(sig: &str) -> [u8; 4] {
        keccak256(sig.as_bytes())[..4].try_into().unwrap()
    }

    /// Scarcity precompiles that accept every setup call. MockHost gives one
    /// reply per address, so every collection call (metadata, defineItem)
    /// gets the word ITEM.
    fn mock_scarcity_ok(mock: &MockHost) {
        mock.mock_call(SCARCITY_FACTORY, Ok(word(COLL as u64)));
        mock.mock_call(collection_address(COLL), Ok(word(ITEM as u64)));
    }

    /// Ranked setup plus an initialized badge collection.
    fn setup_badges() -> (OabArena, MockHost) {
        let (mut c, m) = setup_ranked();
        mock_scarcity_ok(&m);
        assert_eq!(c.init_achievements().ok(), Some(COLL));
        (c, m)
    }

    /// `caller` plays one ranked game on `set_id` and finishes it with
    /// `wins`/`lives`. The collection answers `mint` with `mint_reply`.
    fn ranked_run(
        from: &MockHost,
        caller: [u8; 20],
        set_id: u16,
        wins: u8,
        lives: u8,
        mint_reply: Result<Vec<u8>, ()>,
    ) -> (OabArena, MockHost) {
        let (mut c, m) = as_caller(from, caller, 50);
        mock_personhood(&m, 2, ALIAS_A);
        m.mock_call(collection_address(COLL), mint_reply);
        assert_ne!(c.start_ranked_game(set_id), 0);
        m.take_recorded_calls();
        finish_game(&mut c, &m, caller, wins, lives);
        (c, m)
    }

    fn badges_of(c: &OabArena, player: [u8; 20]) -> Vec<BadgeRecord> {
        Vec::<BadgeRecord>::decode(&mut &c.get_badges(pvm_contract_sdk::Address(player)).0[..])
            .unwrap()
    }

    /// The `mint` calls the arena made, as (item, to, oab.set value).
    fn mint_calls(mock: &MockHost) -> Vec<(u32, [u8; 20], Vec<u8>)> {
        let mint = selector("mint(uint32,address,bytes[],bytes[])");
        mock.take_recorded_calls()
            .into_iter()
            .filter(|(callee, input)| *callee == collection_address(COLL) && input[..4] == mint)
            .map(|(_, input)| {
                let args = &input[4..];
                let item = u32::from_be_bytes(args[28..32].try_into().unwrap());
                let to: [u8; 20] = args[44..64].try_into().unwrap();
                // values: bytes[] with one element; follow the ABI offsets.
                let off = |at: usize| {
                    u64::from_be_bytes(args[at + 24..at + 32].try_into().unwrap()) as usize
                };
                let values = off(96);
                let first = values + 32 + off(values + 32);
                let len = off(first);
                (item, to, args[first + 32..first + 32 + len].to_vec())
            })
            .collect()
    }

    #[test]
    fn scarcity_addresses_match_the_live_chain() {
        // Collection 29 is live at this address on Paseo Asset Hub Next.
        assert_eq!(
            collection_address(29).to_vec(),
            [0, 0, 0, 0x1d, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x05, 0x20, 0, 0].to_vec()
        );
        assert_eq!(
            BADGE_MINTED_TOPIC,
            keccak256(b"BadgeMinted(address,uint8,uint16,uint256)")
        );
        assert_eq!(
            BADGE_PENDING_TOPIC,
            keccak256(b"BadgePending(address,uint8,uint16)")
        );
    }

    #[test]
    fn init_achievements_is_admin_only_and_runs_once() {
        let (c, m) = setup();
        let (mut other, om) = as_caller(&m, PLAYER_1, 1);
        mock_scarcity_ok(&om);
        assert!(
            other.init_achievements().is_err(),
            "a non-admin must not create a collection paid by the arena"
        );
        assert!(
            om.take_recorded_calls().is_empty(),
            "no precompile call for a non-admin"
        );
        assert!(c.get_badge_config().0.is_empty());

        let (mut c, m) = setup();
        m.mock_call(SCARCITY_FACTORY, Ok(word(COLL as u64)));
        m.mock_call(collection_address(COLL), Ok(word(ITEM as u64)));
        assert_eq!(c.init_achievements().ok(), Some(COLL));
        let config = BadgeConfig::decode(&mut &c.get_badge_config().0[..]).unwrap();
        assert_eq!(
            config,
            BadgeConfig {
                collection: COLL,
                items: vec![ITEM, ITEM]
            }
        );

        // Badges must be soulbound: a tradable badge would be a bought badge.
        let define = selector("defineItem(bool,bytes[],bytes[])");
        let defines: Vec<_> = m
            .take_recorded_calls()
            .into_iter()
            .filter(|(callee, input)| *callee == collection_address(COLL) && input[..4] == define)
            .collect();
        assert_eq!(defines.len(), 2, "one item per badge type");
        assert!(
            defines.iter().all(|(_, input)| input[4 + 31] == 1),
            "soulbound = true"
        );

        assert!(
            c.init_achievements().is_err(),
            "a second collection would strand the first"
        );
        assert!(m.take_recorded_calls().is_empty());
    }

    #[test]
    fn init_achievements_fails_if_the_factory_reverts() {
        // E.g. the arena cannot pay the collection deposit: nothing is stored,
        // so the admin can fund the arena and retry.
        let (mut c, m) = setup();
        m.mock_call(SCARCITY_FACTORY, Err(()));
        assert!(c.init_achievements().is_err());
        assert!(c.get_badge_config().0.is_empty());
    }

    #[test]
    fn qualifying_run_mints_exactly_one_badge_to_a_derived_purse() {
        let (_c, m0) = setup_badges();
        let (c, m) = ranked_run(&m0, PLAYER_1, 1, 10, 2, Ok(word(TOKEN)));
        let mints = mint_calls(&m);
        assert_eq!(mints.len(), 1, "10 wins with a life lost => Victory only");
        let (item, to, set_label) = &mints[0];
        assert_eq!(*item, ITEM);
        assert_eq!(set_label, b"1", "the NFT records its set");
        // Scarcity keeps one NFT per key, across all collections. Minting to
        // the player's own account would block every later badge.
        assert_ne!(*to, PLAYER_1);
        assert_ne!(*to, [0u8; 20]);
        assert_eq!(
            badges_of(&c, PLAYER_1),
            vec![BadgeRecord {
                badge: BADGE_VICTORY,
                set_id: 1,
                block: 50,
                token: Some(TOKEN)
            }]
        );
        let minted: Vec<_> = m
            .events()
            .into_iter()
            .filter(|(topics, _)| topics[0] == BADGE_MINTED_TOPIC)
            .collect();
        assert_eq!(minted.len(), 1);
        assert_eq!(
            minted[0].0[1][12..],
            PLAYER_1,
            "player is the indexed topic"
        );
    }

    #[test]
    fn flawless_run_earns_both_badges_with_distinct_purses() {
        let (_c, m0) = setup_badges();
        let (c, m) = ranked_run(&m0, PLAYER_1, 0, 10, 3, Ok(word(TOKEN)));
        let mints = mint_calls(&m);
        assert_eq!(mints.len(), 2);
        assert_ne!(
            mints[0].1, mints[1].1,
            "each badge needs its own empty purse key"
        );
        let kinds: Vec<u8> = badges_of(&c, PLAYER_1).iter().map(|r| r.badge).collect();
        assert_eq!(kinds, vec![BADGE_VICTORY, BADGE_FLAWLESS]);
    }

    #[test]
    fn repeat_qualifying_run_does_not_mint_again() {
        // The arena pays a deposit per badge: farming the same badge must not
        // drain it.
        let (_c, m0) = setup_badges();
        let (_c1, m1) = ranked_run(&m0, PLAYER_1, 0, 10, 2, Ok(word(TOKEN)));
        assert_eq!(mint_calls(&m1).len(), 1);
        let (c2, m2) = ranked_run(&m1, PLAYER_1, 0, 10, 2, Ok(word(TOKEN)));
        assert!(
            mint_calls(&m2).is_empty(),
            "second Victory on set 0 => no mint"
        );
        assert_eq!(badges_of(&c2, PLAYER_1).len(), 1);

        // Badges are per set, and per account.
        let (c3, m3) = ranked_run(&m2, PLAYER_1, 1, 10, 2, Ok(word(TOKEN)));
        assert_eq!(
            mint_calls(&m3).len(),
            1,
            "Victory on another set is a new badge"
        );
        assert_eq!(badges_of(&c3, PLAYER_1).len(), 2);
        let (c4, m4) = ranked_run(&m3, PLAYER_2, 0, 10, 2, Ok(word(TOKEN)));
        assert_eq!(
            mint_calls(&m4).len(),
            1,
            "another account earns its own badge"
        );
        assert_eq!(badges_of(&c4, PLAYER_2).len(), 1);
    }

    #[test]
    fn non_qualifying_and_casual_runs_mint_nothing() {
        let (_c, m0) = setup_badges();
        let (c, m) = ranked_run(&m0, PLAYER_1, 0, 9, 3, Ok(word(TOKEN)));
        assert!(mint_calls(&m).is_empty(), "9 wins is not a victory");
        assert!(badges_of(&c, PLAYER_1).is_empty());

        // Casual: open to throwaway accounts, so it must not spend arena funds.
        let (mut c, m) = as_caller(&m, PLAYER_1, 60);
        m.mock_call(collection_address(COLL), Ok(word(TOKEN)));
        assert_ne!(c.start_game(0), 0);
        finish_game(&mut c, &m, PLAYER_1, 10, 3);
        assert!(mint_calls(&m).is_empty(), "casual flawless run => no badge");
        assert!(badges_of(&c, PLAYER_1).is_empty());
    }

    #[test]
    fn mint_failure_keeps_the_game_result_and_leaves_a_claimable_badge() {
        let (_c, m0) = setup_badges();
        // e.g. the arena ran out of PAS for the instance deposit.
        let (c, m) = ranked_run(&m0, PLAYER_1, 0, 10, 2, Err(()));
        assert_eq!(
            board(&c, 0).len(),
            1,
            "the leaderboard record survives the failed mint"
        );
        assert!(
            decode_session(&c.get_game_state()).is_none(),
            "the game is finalized"
        );
        assert_eq!(
            badges_of(&c, PLAYER_1),
            vec![BadgeRecord {
                badge: BADGE_VICTORY,
                set_id: 0,
                block: 50,
                token: None
            }],
            "the badge is earned, its mint pending"
        );
        assert!(m.events().iter().any(|(t, _)| t[0] == BADGE_PENDING_TOPIC));

        // Still failing: nothing changes.
        let (mut c, m) = as_caller(&m, PLAYER_1, 70);
        m.mock_call(collection_address(COLL), Err(()));
        assert_eq!(c.claim_pending_badges(), 0);
        assert_eq!(badges_of(&c, PLAYER_1)[0].token, None);
        m.take_recorded_calls();

        // Arena funded again: the player claims the earned badge.
        m.mock_call(collection_address(COLL), Ok(word(TOKEN)));
        assert_eq!(c.claim_pending_badges(), 1);
        assert_eq!(badges_of(&c, PLAYER_1)[0].token, Some(TOKEN));
        assert_eq!(mint_calls(&m).len(), 1);
        assert_eq!(
            c.claim_pending_badges(),
            0,
            "a minted badge is never minted twice"
        );
        assert!(mint_calls(&m).is_empty());

        // A repeat qualifying run does not create a second record either.
        let (c, _m) = ranked_run(&m, PLAYER_1, 0, 10, 2, Ok(word(TOKEN)));
        assert_eq!(badges_of(&c, PLAYER_1).len(), 1);
    }

    #[test]
    fn badges_earned_before_setup_are_claimable_after_it() {
        let (_c, m0) = setup_ranked();
        let (c, m) = ranked_run(&m0, PLAYER_1, 0, 10, 2, Ok(word(TOKEN)));
        assert!(
            mint_calls(&m).is_empty(),
            "no collection yet => no mint call"
        );
        assert_eq!(badges_of(&c, PLAYER_1)[0].token, None);

        let (mut admin, am) = as_caller(&m, ADMIN, 80);
        am.mock_call(SCARCITY_FACTORY, Ok(word(COLL as u64)));
        am.mock_call(collection_address(COLL), Ok(word(ITEM as u64)));
        assert_eq!(admin.init_achievements().ok(), Some(COLL));

        let (mut p, pm) = as_caller(&am, PLAYER_1, 90);
        pm.mock_call(collection_address(COLL), Ok(word(TOKEN)));
        assert_eq!(p.claim_pending_badges(), 1);
        assert_eq!(badges_of(&p, PLAYER_1)[0].token, Some(TOKEN));
    }
    /// The frontend decodes `getLeaderboard` / `getBestRun` / `getBadges` /
    /// `getBadgeConfig` from these bytes (`web/src/contract/codec.test.ts`).
    /// This test pins them to the Rust types, so a layout change here fails
    /// until the fixtures (and the TS decoders) follow. Regenerate with
    /// `OAB_WRITE_FIXTURES=1`.
    #[test]
    fn frontend_scale_fixtures() {
        use super::{BadgeConfig, BadgeRecord, LeaderboardEntry};
        let first = LeaderboardEntry {
            alias: [0x11; 32],
            set_id: 2,
            wins: 10,
            lives: 3,
            rounds: 10,
            block: 2_050_400,
        };
        let second = LeaderboardEntry {
            alias: [0xab; 32],
            set_id: 0x0102,
            wins: 7,
            lives: 0,
            rounds: 9,
            block: 0x0102_0304_0506_0708,
        };
        // A full board: 100 entries needs the two-byte compact length prefix.
        let full: Vec<LeaderboardEntry> = (0..100u8)
            .map(|i| LeaderboardEntry {
                alias: [i; 32],
                set_id: 1,
                wins: 10 - i / 10,
                lives: 3 - i % 4,
                rounds: 10 + i % 3,
                block: 1_000 + i as u64,
            })
            .collect();
        let badges = vec![
            BadgeRecord {
                badge: 0,
                set_id: 2,
                block: 2_050_400,
                token: Some(42),
            },
            BadgeRecord {
                badge: 1,
                set_id: 2,
                block: 2_050_400,
                token: None,
            },
        ];
        let config = BadgeConfig {
            collection: 30,
            items: vec![0, 1],
        };
        let hex = |b: Vec<u8>| b.iter().map(|x| format!("{x:02x}")).collect::<String>();
        let lines = [
            (
                "leaderboard_empty",
                hex(Vec::<LeaderboardEntry>::new().encode()),
            ),
            ("leaderboard_two", hex(vec![first.clone(), second].encode())),
            ("leaderboard_full", hex(full.encode())),
            ("best_run", hex(first.encode())),
            ("badges", hex(badges.encode())),
            ("badges_empty", hex(Vec::<BadgeRecord>::new().encode())),
            ("badge_config", hex(config.encode())),
        ];
        let text: String = lines.iter().map(|(k, v)| format!("{k}=0x{v}\n")).collect();
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../web/src/contract/fixtures/scale.txt"
        );
        if std::env::var("OAB_WRITE_FIXTURES").is_ok() {
            std::fs::write(path, &text).unwrap();
        }
        assert_eq!(std::fs::read_to_string(path).unwrap(), text);
    }
}
