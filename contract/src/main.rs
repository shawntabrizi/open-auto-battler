//! Open Auto Battler Arena — PolkaVM Smart Contract
//!
//! Built on the `pvm-contract-sdk` (cargo-pvm-contract) framework. Game data is
//! SCALE-encoded inside ABI `bytes` parameters; persistent state is stored as
//! SCALE blobs via raw host storage at keccak-derived keys (the shared engine
//! types are SCALE-encoded, not Solidity-ABI, so we keep them out of the typed
//! `Mapping`/`Lazy` layer).

#![cfg_attr(not(any(test, feature = "std", feature = "abi-gen")), no_main, no_std)]

// `alloc`, `vec!` and `Vec` come from the contract macro's crate-root injection
// on the no_std (on-chain) build and from the std prelude on host/test/abi-gen
// builds. `BTreeMap` is not in any prelude, so import it from the right crate
// per build mode: `alloc` for the no_std on-chain build, `std` otherwise.
#[cfg(not(any(test, feature = "std", feature = "abi-gen")))]
use alloc::collections::BTreeMap;
#[cfg(any(test, feature = "std", feature = "abi-gen"))]
use std::collections::BTreeMap;

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

// ── Storage domain prefixes (keccak namespace separation) ─────────────────────

const DOM_ADMIN: u8 = 0;
const DOM_CARD: u8 = 1;
const DOM_SET: u8 = 2;
const DOM_SESSION: u8 = 3;
const DOM_SESSION_ACTIVE: u8 = 4;
const DOM_GHOST: u8 = 5;

// keccak256("BattleReported(uint8,uint8,uint8,uint8,uint64,bytes)")
const BATTLE_REPORTED_TOPIC: [u8; 32] = [
    0x96, 0xfd, 0x17, 0x36, 0xea, 0x4f, 0xbe, 0xf3, 0x2e, 0x32, 0x8d, 0x70, 0x05, 0x02, 0x1b, 0x05,
    0xc7, 0xee, 0x31, 0xf3, 0x26, 0x94, 0xdd, 0xef, 0x23, 0xdd, 0x55, 0xaf, 0x68, 0xe0, 0x89, 0xbd,
];

fn bracket_bytes(set_id: SetIdValue, round: RoundValue, wins: RoundValue, lives: RoundValue) -> [u8; 5] {
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
            match self.host().get_storage(StorageFlags::empty(), key, &mut out) {
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

        /// Start a new arena game with the given card set and seed nonce.
        #[pvm_contract_sdk::method]
        pub fn start_game(&mut self, set_id: u16, seed_nonce: u64) -> u64 {
            let caller = self.caller_bytes();
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
            let seed = self.derive_seed(&caller, b"start", seed_nonce);
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
                session.round += 1;
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
            self.clear_session(&caller);
            true
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
        Bytes(CommitTurnAction { actions: Vec::new() }.encode())
    }

    /// Contract with ADMIN as caller, constructor run, and all genesis cards +
    /// sets registered (set ids = index, matching pallet genesis; set 0 exists).
    fn setup() -> (OabArena, MockHost) {
        let mock = MockHostBuilder::new().caller(ADMIN).build();
        let mut c = OabArena::with_host(mock.clone());
        c.new();
        for card in oab_assets::cards::get_all() {
            assert!(c.register_card(Bytes(card.encode())), "register_card failed");
        }
        for (i, set) in oab_assets::sets::get_all().iter().enumerate() {
            assert!(c.register_set(i as u16, Bytes(set.encode())), "register_set failed");
        }
        (c, mock)
    }

    // ── start_game ──

    #[test]
    fn start_game_initializes_session() {
        let (mut c, _m) = setup();
        let seed = c.start_game(0, 42);
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
        assert_ne!(c.start_game(0, 1), 0);
        assert_eq!(c.start_game(0, 2), 0, "GameAlreadyActive => 0");
    }

    #[test]
    fn start_game_unknown_set_returns_zero() {
        let (mut c, _m) = setup();
        assert_eq!(c.start_game(999, 1), 0, "CardSetNotFound => 0");
    }

    // ── submit_turn ──

    #[test]
    fn submit_turn_empty_advances_round_and_mana() {
        let (mut c, _m) = setup();
        c.start_game(0, 7);
        // Empty board vs empty ghost pool => Draw => no life lost => round advances.
        let battle_seed = c.submit_turn(empty_turn());
        assert_ne!(battle_seed, 0, "submit_turn returns the battle seed");

        let session = decode_session(&c.get_game_state()).expect("session still active after draw");
        assert_eq!(session.phase, GamePhase::Shop);
        assert_eq!(session.round, 2, "round advances after a non-game-over turn");
        assert_eq!(session.mana_limit, 4, "mana_limit = min(3 + (round-1), 10) = 4");
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
        c.start_game(0, 1);
        assert!(decode_session(&c.get_game_state()).is_some());
        assert!(c.abandon_game(), "abandon active game => true");
        assert!(decode_session(&c.get_game_state()).is_none(), "session cleared");
    }

    #[test]
    fn abandon_without_game_is_false() {
        let (mut c, _m) = setup();
        assert!(!c.abandon_game(), "NoActiveGame => false");
    }

    #[test]
    fn end_game_requires_completed_phase() {
        let (mut c, _m) = setup();
        c.start_game(0, 1); // phase = Shop
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
        assert!(c.register_card(Bytes(card.encode())), "first registration ok");
        assert!(!c.register_card(Bytes(card.encode())), "CardAlreadyExists => false");
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
        assert!(!c.register_set(0, Bytes(set.encode())), "SetAlreadyExists => false");
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
        mock.set_raw_storage(
            skey(super::DOM_SESSION, caller).to_vec(),
            session.encode(),
        );
    }

    #[test]
    fn submit_turn_multi_round_progression() {
        let (mut c, _m) = setup();
        c.start_game(0, 99);
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
        c.start_game(0, 1);
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
        c.start_game(0, 1);

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
}
