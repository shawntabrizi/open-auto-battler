//! Open Auto Battler Arena — PolkaVM Smart Contract
//!
//! Built with `cargo-pvm-contract` macros for automatic dispatch, ABI
//! encoding/decoding, allocator setup, and panic handler generation.
//!
//! Game data (cards, sessions, actions) is SCALE-encoded inside ABI `bytes`
//! parameters. The `oab-battle` crate provides the game engine.

#![cfg_attr(not(feature = "abi-gen"), no_main, no_std)]

use pallet_revive_uapi::{HostFn, HostFnImpl as api, StorageFlags};
use parity_scale_codec::{Decode, Encode};

use oab_battle::battle::{resolve_battle, BattleResult, CombatUnit};
use oab_battle::rng::{BattleRng, XorShiftRng};
use oab_battle::state::CardSet;
use oab_battle::types::*;
use oab_battle::{apply_shop_start_triggers, verify_and_apply_turn};

// allocator = "bump" with 120 KB heap for game state processing
#[pvm_contract_macros::contract("OabArena.sol", allocator = "bump", allocator_size = 122880)]
mod oab_arena {
    use super::*;
    use alloc::collections::BTreeMap;

    // ── Error type (required by the macro for Result returns) ───────────

    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    pub enum Error {
        NotAdmin,
        AlreadyRegistered,
        NoActiveGame,
        GameAlreadyActive,
        InvalidInput,
        InvalidPhase,
        InvalidTurn,
        CardSetNotFound,
        GameNotComplete,
    }

    impl AsRef<[u8]> for Error {
        fn as_ref(&self) -> &[u8] {
            match *self {
                Error::NotAdmin => b"NotAdmin",
                Error::AlreadyRegistered => b"AlreadyRegistered",
                Error::NoActiveGame => b"NoActiveGame",
                Error::GameAlreadyActive => b"GameAlreadyActive",
                Error::InvalidInput => b"InvalidInput",
                Error::InvalidPhase => b"InvalidPhase",
                Error::InvalidTurn => b"InvalidTurn",
                Error::CardSetNotFound => b"CardSetNotFound",
                Error::GameNotComplete => b"GameNotComplete",
            }
        }
    }

    // ── Game config ─────────────────────────────────────────────────────

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

    // ── Session type ────────────────────────────────────────────────────

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
        phase: u8,
        next_card_id: u16,
        game_seed: u64,
        set_id: SetIdValue,
    }

    const PHASE_SHOP: u8 = 0;
    const PHASE_COMPLETED: u8 = 1;

    // ── Storage keys ────────────────────────────────────────────────────

    const ADMIN_KEY: [u8; 32] = [
        0xad, 0xad, 0xad, 0xad, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ];

    fn hash_key(prefix: &[u8], suffix: &[u8]) -> [u8; 32] {
        let mut input = vec![0u8; prefix.len() + suffix.len()];
        input[..prefix.len()].copy_from_slice(prefix);
        input[prefix.len()..].copy_from_slice(suffix);
        let mut key = [0u8; 32];
        api::hash_keccak_256(&input, &mut key);
        key
    }

    fn card_storage_key(card_id: CardId) -> [u8; 32] {
        hash_key(b"card", &card_id.0.to_le_bytes())
    }

    fn set_storage_key(set_id: SetIdValue) -> [u8; 32] {
        hash_key(b"set_", &set_id.to_le_bytes())
    }

    fn game_storage_key(addr: &[u8; 20]) -> [u8; 32] {
        hash_key(b"game", addr)
    }

    fn ghost_pool_key(set_id: SetIdValue, round: RoundValue, wins: RoundValue, lives: RoundValue) -> [u8; 32] {
        let mut suffix = [0u8; 5];
        suffix[0..2].copy_from_slice(&set_id.to_le_bytes());
        suffix[2] = round;
        suffix[3] = wins;
        suffix[4] = lives;
        hash_key(b"ghst", &suffix)
    }

    // ── Storage helpers ─────────────────────────────────────────────────

    fn storage_read<T: Decode>(key: &[u8; 32], buf: &mut [u8]) -> Option<T> {
        let mut buf_ref: &mut [u8] = buf;
        match api::get_storage(StorageFlags::empty(), key, &mut buf_ref) {
            Ok(()) => T::decode(&mut &*buf_ref).ok(),
            Err(_) => None,
        }
    }

    fn storage_write(key: &[u8; 32], data: &[u8]) {
        api::set_storage(StorageFlags::empty(), key, data);
    }

    fn storage_delete(key: &[u8; 32]) {
        api::set_storage(StorageFlags::empty(), key, &[]);
    }

    // ── Admin helpers ───────────────────────────────────────────────────

    fn save_admin(addr: &[u8; 20]) {
        api::set_storage(StorageFlags::empty(), &ADMIN_KEY, addr);
    }

    fn is_admin(addr: &[u8; 20]) -> bool {
        let mut buf = [0u8; 20];
        let mut buf_ref: &mut [u8] = &mut buf;
        match api::get_storage(StorageFlags::empty(), &ADMIN_KEY, &mut buf_ref) {
            Ok(()) => buf_ref == *addr,
            Err(_) => false,
        }
    }

    fn caller_address() -> [u8; 20] {
        let mut addr = [0u8; 20];
        api::caller(&mut addr);
        addr
    }

    // ── Session persistence ─────────────────────────────────────────────

    fn load_session(addr: &[u8; 20]) -> Option<ArenaSession> {
        let key = game_storage_key(addr);
        let mut buf = [0u8; 512];
        storage_read(&key, &mut buf)
    }

    fn save_session(addr: &[u8; 20], session: &ArenaSession) {
        storage_write(&game_storage_key(addr), &session.encode());
    }

    fn delete_session(addr: &[u8; 20]) {
        storage_delete(&game_storage_key(addr));
    }

    // ── Card/set persistence ────────────────────────────────────────────

    fn load_card(card_id: CardId) -> Option<UnitCard> {
        let key = card_storage_key(card_id);
        let mut buf = [0u8; 256];
        storage_read(&key, &mut buf)
    }

    fn save_card(card: &UnitCard) {
        storage_write(&card_storage_key(card.id), &card.encode());
    }

    fn load_card_set(set_id: SetIdValue) -> Option<CardSet> {
        let key = set_storage_key(set_id);
        let mut buf = [0u8; 416];
        storage_read(&key, &mut buf)
    }

    fn save_card_set(set_id: SetIdValue, card_set: &CardSet) {
        storage_write(&set_storage_key(set_id), &card_set.encode());
    }

    fn build_card_pool_from_storage(card_set: &CardSet) -> BTreeMap<CardId, UnitCard> {
        let mut pool = BTreeMap::new();
        for entry in &card_set.cards {
            if let Some(card) = load_card(entry.card_id) {
                pool.insert(card.id, card);
            }
        }
        pool
    }

    // ── Ghost opponent system ───────────────────────────────────────────

    type GhostPool = Vec<Vec<GhostBoardUnit>>;
    const MAX_GHOSTS_PER_BRACKET: usize = 10;

    fn load_ghost_pool(set_id: SetIdValue, round: RoundValue, wins: RoundValue, lives: RoundValue) -> GhostPool {
        let key = ghost_pool_key(set_id, round, wins, lives);
        let mut buf = [0u8; 416];
        storage_read::<GhostPool>(&key, &mut buf).unwrap_or_default()
    }

    fn save_ghost_pool(set_id: SetIdValue, round: RoundValue, wins: RoundValue, lives: RoundValue, pool: &GhostPool) {
        let key = ghost_pool_key(set_id, round, wins, lives);
        storage_write(&key, &pool.encode());
    }

    fn push_ghost(set_id: SetIdValue, round: RoundValue, wins: RoundValue, lives: RoundValue, board: Vec<GhostBoardUnit>) {
        if board.is_empty() { return; }
        let mut pool = load_ghost_pool(set_id, round, wins, lives);
        if pool.len() >= MAX_GHOSTS_PER_BRACKET {
            pool.remove(0);
        }
        pool.push(board);
        save_ghost_pool(set_id, round, wins, lives, &pool);
    }

    fn select_ghost(set_id: SetIdValue, round: RoundValue, wins: RoundValue, lives: RoundValue, seed: u64, card_pool: &BTreeMap<CardId, UnitCard>) -> (Vec<CombatUnit>, Vec<GhostBoardUnit>) {
        let pool = load_ghost_pool(set_id, round, wins, lives);
        if pool.is_empty() { return (Vec::new(), Vec::new()); }

        let mut rng = XorShiftRng::seed_from_u64(seed);
        let index = rng.gen_range(pool.len());
        let ghost = &pool[index];

        let units = ghost.iter().filter_map(|unit| {
            card_pool.get(&unit.card_id).map(|card| {
                let mut cu = CombatUnit::from_card(card.clone());
                cu.attack_buff = unit.perm_attack;
                cu.health_buff = unit.perm_health;
                cu.health = cu.health.saturating_add(unit.perm_health);
                cu
            })
        }).collect();

        (units, ghost.clone())
    }

    fn create_ghost_from_board(board: &[Option<BoardUnit>]) -> Vec<GhostBoardUnit> {
        board.iter().flatten().map(|bu| GhostBoardUnit {
            card_id: bu.card_id,
            perm_attack: bu.perm_attack,
            perm_health: bu.perm_health,
        }).collect()
    }

    // ── Game helpers ────────────────────────────────────────────────────

    fn create_starting_bag(set: &CardSet, seed: u64, bag_size: usize) -> Vec<CardId> {
        if set.cards.is_empty() { return Vec::new(); }
        let mut bag = Vec::with_capacity(bag_size);
        let mut rng = XorShiftRng::seed_from_u64(seed);
        let total_weight: u32 = set.cards.iter().map(|e| e.rarity as u32).sum();
        if total_weight == 0 { return Vec::new(); }
        for _ in 0..bag_size {
            let mut target = rng.gen_range(total_weight as usize) as u32;
            for entry in &set.cards {
                if entry.rarity == 0 { continue; }
                if target < entry.rarity as u32 { bag.push(entry.card_id); break; }
                target -= entry.rarity as u32;
            }
        }
        bag
    }

    fn draw_hand(session: &mut ArenaSession, hand_size: usize) {
        session.bag.append(&mut session.hand);
        let bag_len = session.bag.len();
        if bag_len == 0 { return; }
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
        for idx in indices { drawn.push(session.bag.remove(idx)); }
        drawn.reverse();
        session.hand = drawn;
    }

    fn derive_seed(addr: &[u8; 20], context: &[u8], nonce: u64) -> u64 {
        let mut input = Vec::with_capacity(20 + context.len() + 8);
        input.extend_from_slice(addr);
        input.extend_from_slice(context);
        input.extend_from_slice(&nonce.to_le_bytes());
        let mut hash = [0u8; 32];
        api::hash_keccak_256(&input, &mut hash);
        u64::from_le_bytes(hash[0..8].try_into().unwrap())
    }

    fn make_shop_state(session: &ArenaSession, card_pool: &BTreeMap<CardId, UnitCard>) -> oab_battle::state::ShopState {
        oab_battle::state::ShopState {
            card_pool: card_pool.clone(), set_id: 0,
            hand: session.hand.clone(), board: session.board.clone(),
            mana_limit: session.mana_limit, shop_mana: session.shop_mana,
            round: session.round, game_seed: session.game_seed,
        }
    }

    fn sync_from_shop_state(session: &mut ArenaSession, shop: &oab_battle::state::ShopState) {
        session.hand = shop.hand.clone();
        session.board = shop.board.clone();
        session.shop_mana = shop.shop_mana;
    }

    // ── Event constants ─────────────────────────────────────────────────

    // keccak256("BattleReported(uint8,uint8,uint8,uint8,uint64,bytes)")
    const BATTLE_REPORTED_TOPIC: [u8; 32] = [
        0x96, 0xfd, 0x17, 0x36, 0xea, 0x4f, 0xbe, 0xf3,
        0x2e, 0x32, 0x8d, 0x70, 0x05, 0x02, 0x1b, 0x05,
        0xc7, 0xee, 0x31, 0xf3, 0x26, 0x94, 0xdd, 0xef,
        0x23, 0xdd, 0x55, 0xaf, 0x68, 0xe0, 0x89, 0xbd,
    ];

    // ── Contract entry points ───────────────────────────────────────────

    #[pvm_contract_macros::constructor]
    pub fn new() -> Result<(), Error> {
        save_admin(&caller_address());
        Ok(())
    }

    /// Admin: store a SCALE-encoded card definition on-chain.
    #[pvm_contract_macros::method]
    pub fn register_card(data: Vec<u8>) -> Result<bool, Error> {
        if !is_admin(&caller_address()) { return Err(Error::NotAdmin); }
        let card: UnitCard = Decode::decode(&mut &data[..]).map_err(|_| Error::InvalidInput)?;
        if load_card(card.id).is_some() { return Err(Error::AlreadyRegistered); }
        save_card(&card);
        Ok(true)
    }

    /// Admin: store a SCALE-encoded card set on-chain.
    #[pvm_contract_macros::method]
    pub fn register_set(set_id: u16, data: Vec<u8>) -> Result<bool, Error> {
        if !is_admin(&caller_address()) { return Err(Error::NotAdmin); }
        let card_set: CardSet = Decode::decode(&mut &data[..]).map_err(|_| Error::InvalidInput)?;
        if load_card_set(set_id).is_some() { return Err(Error::AlreadyRegistered); }
        save_card_set(set_id, &card_set);
        Ok(true)
    }

    /// Start a new arena game with the given card set and seed nonce.
    #[pvm_contract_macros::method]
    pub fn start_game(set_id: u16, seed_nonce: u64) -> Result<u64, Error> {
        let addr = caller_address();
        if load_session(&addr).is_some() { return Err(Error::GameAlreadyActive); }

        let card_set = load_card_set(set_id).ok_or(Error::CardSetNotFound)?;
        let card_pool = build_card_pool_from_storage(&card_set);
        if card_pool.is_empty() { return Err(Error::CardSetNotFound); }

        let config = default_config();
        let seed = derive_seed(&addr, b"start", seed_nonce);
        let bag = create_starting_bag(&card_set, seed, config.bag_size as usize);

        let mut session = ArenaSession {
            bag, hand: Vec::new(),
            board: vec![None; config.board_size as usize],
            mana_limit: config.mana_limit_for_round(1), shop_mana: 0,
            round: 1, lives: config.starting_lives, wins: 0,
            phase: PHASE_SHOP, next_card_id: 1000, game_seed: seed, set_id,
        };

        draw_hand(&mut session, config.hand_size as usize);
        let mut shop = make_shop_state(&session, &card_pool);
        apply_shop_start_triggers(&mut shop);
        sync_from_shop_state(&mut session, &shop);

        save_session(&addr, &session);
        Ok(seed)
    }

    /// Submit shop actions (SCALE-encoded CommitTurnAction). Resolves battle on-chain.
    /// Returns (result, wins, lives, round, battleSeed).
    #[pvm_contract_macros::method]
    pub fn submit_turn(action: Vec<u8>) -> Result<(u8, u8, u8, u8, u64), Error> {
        let addr = caller_address();
        let mut session = load_session(&addr).ok_or(Error::NoActiveGame)?;
        if session.phase != PHASE_SHOP { return Err(Error::InvalidPhase); }

        let action: CommitTurnAction = Decode::decode(&mut &action[..]).map_err(|_| Error::InvalidInput)?;

        let card_set = load_card_set(session.set_id).ok_or(Error::CardSetNotFound)?;
        let card_pool = build_card_pool_from_storage(&card_set);
        let config = default_config();

        let mut shop_state = make_shop_state(&session, &card_pool);
        if verify_and_apply_turn(&mut shop_state, &action).is_err() { return Err(Error::InvalidTurn); }
        shop_state.shop_mana = 0;

        // Extract player combat units
        let mut player_slots = Vec::new();
        let player_units: Vec<CombatUnit> = shop_state.board.iter().enumerate()
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
            }).collect();

        // Select ghost opponent BEFORE storing player's board
        let battle_seed = derive_seed(&addr, b"battle", session.game_seed);
        let (enemy_units, opponent_ghost) = select_ghost(session.set_id, session.round, session.wins, session.lives, battle_seed, &card_pool);

        // Store player's board as ghost for future opponents
        let player_ghost = create_ghost_from_board(&shop_state.board);
        push_ghost(session.set_id, session.round, session.wins, session.lives, player_ghost);

        let mut rng = XorShiftRng::seed_from_u64(battle_seed);
        let events = resolve_battle(player_units, enemy_units, &mut rng, &card_pool, config.board_size as usize);

        let result = events.iter().rev().find_map(|e| {
            if let oab_battle::battle::CombatEvent::BattleEnd { result } = e { Some(result.clone()) } else { None }
        }).unwrap_or(BattleResult::Draw);

        let mana_delta: ManaValue = oab_battle::battle::player_shop_mana_delta_from_events(&events).max(0) as ManaValue;
        let permanent_deltas = oab_battle::battle::player_permanent_stat_deltas_from_events(&events);
        for (unit_id, (attack_delta, health_delta)) in &permanent_deltas {
            let idx = unit_id.raw() as usize;
            if idx == 0 || idx > player_slots.len() { continue; }
            let slot = player_slots[idx - 1];
            let remove = if let Some(Some(bu)) = shop_state.board.get_mut(slot) {
                bu.perm_attack = bu.perm_attack.saturating_add(*attack_delta);
                bu.perm_health = bu.perm_health.saturating_add(*health_delta);
                card_pool.get(&bu.card_id).map(|c| c.stats.health.saturating_add(bu.perm_health) <= 0).unwrap_or(false)
            } else { false };
            if remove { shop_state.board[slot] = None; }
        }

        match result {
            BattleResult::Victory => session.wins += 1,
            BattleResult::Defeat => session.lives -= 1,
            BattleResult::Draw => {}
        }

        let completed_round = session.round;
        let game_over = session.lives == 0 || session.wins >= config.wins_to_victory;

        if !game_over {
            let new_seed = derive_seed(&addr, b"shop", session.game_seed);
            session.game_seed = new_seed;
            session.round += 1;
            session.mana_limit = config.mana_limit_for_round(session.round);
            session.shop_mana = if config.full_mana_each_round { session.mana_limit } else { mana_delta };
            session.board = shop_state.board;
            let mut bag = session.bag.clone();
            bag.extend(shop_state.hand.iter());
            session.bag = bag;
            session.hand = Vec::new();
            session.phase = PHASE_SHOP;

            draw_hand(&mut session, config.hand_size as usize);
            let mut shop = make_shop_state(&session, &card_pool);
            oab_battle::apply_shop_start_triggers_with_result(&mut shop, Some(result.clone()));
            sync_from_shop_state(&mut session, &shop);
        } else {
            session.board = shop_state.board;
            session.hand = shop_state.hand;
            session.shop_mana = mana_delta;
            session.phase = PHASE_COMPLETED;
        }

        save_session(&addr, &session);

        // Emit BattleReported event with opponent board for frontend replay
        let ghost_encoded = opponent_ghost.encode();
        let mut event_data = Vec::with_capacity(12 + ghost_encoded.len());
        let result_byte = match result { BattleResult::Victory => 0u8, BattleResult::Defeat => 1, BattleResult::Draw => 2 };
        event_data.push(result_byte);
        event_data.push(session.wins);
        event_data.push(session.lives);
        event_data.push(completed_round);
        event_data.extend_from_slice(&battle_seed.to_be_bytes());
        event_data.extend_from_slice(&ghost_encoded);
        api::deposit_event(&[BATTLE_REPORTED_TOPIC], &event_data);

        Ok((result_byte, session.wins, session.lives, completed_round, battle_seed))
    }

    /// Read the caller's current game state (SCALE-encoded ArenaSession).
    #[pvm_contract_macros::method]
    pub fn get_game_state() -> Vec<u8> {
        let addr = caller_address();
        match load_session(&addr) {
            Some(session) => session.encode(),
            None => Vec::new(),
        }
    }

    /// Forfeit the current game.
    #[pvm_contract_macros::method]
    pub fn abandon_game() -> Result<bool, Error> {
        let addr = caller_address();
        if load_session(&addr).is_none() { return Err(Error::NoActiveGame); }
        delete_session(&addr);
        Ok(true)
    }

    /// End a completed game, archiving the final board as a ghost.
    #[pvm_contract_macros::method]
    pub fn end_game() -> Result<bool, Error> {
        let addr = caller_address();
        let session = load_session(&addr).ok_or(Error::NoActiveGame)?;
        if session.phase != PHASE_COMPLETED { return Err(Error::GameNotComplete); }

        let ghost = create_ghost_from_board(&session.board);
        if !ghost.is_empty() {
            push_ghost(session.set_id, session.round, session.wins, session.lives, ghost);
        }

        delete_session(&addr);
        Ok(true)
    }

    /// Read a SCALE-encoded card definition.
    #[pvm_contract_macros::method]
    pub fn get_card(card_id: u16) -> Vec<u8> {
        match load_card(CardId(card_id)) {
            Some(card) => card.encode(),
            None => Vec::new(),
        }
    }

    /// Read a SCALE-encoded card set.
    #[pvm_contract_macros::method]
    pub fn get_set(set_id: u16) -> Vec<u8> {
        match load_card_set(set_id) {
            Some(card_set) => card_set.encode(),
            None => Vec::new(),
        }
    }

    #[pvm_contract_macros::fallback]
    pub fn fallback() -> Result<(), Error> {
        Ok(())
    }
}
