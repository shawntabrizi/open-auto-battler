//! Open Auto Battler Arena — PolkaVM Smart Contract
//!
//! Built with `pvm_contract` for macros, storage abstractions, and type-safe
//! contract dispatch. Game data is SCALE-encoded inside ABI `bytes` parameters.

#![no_main]
#![no_std]

use pvm::{Address, Decode, Encode};
use pvm_contract as pvm;

use oab_battle::battle::{resolve_battle, BattleResult, CombatUnit};
use oab_battle::rng::{BattleRng, XorShiftRng};
use oab_battle::state::CardSet;
use oab_battle::types::*;
use oab_battle::{apply_shop_start_triggers, verify_and_apply_turn};
use oab_game::GamePhase;

// ── Storage layout ──────────────────────────────────────────────────────────

#[pvm::storage]
struct Storage {
    admin: Address,
    cards: pvm::storage::Mapping<u16, UnitCard>,
    card_sets: pvm::storage::Mapping<u16, CardSet>,
    sessions: pvm::storage::Mapping<Address, ArenaSession>,
    ghost_pools: pvm::storage::Mapping<(u16, u8, u8, u8), GhostPool>,
}

// ── Game types ──────────────────────────────────────────────────────────────

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
    bag: alloc::vec::Vec<CardId>,
    hand: alloc::vec::Vec<CardId>,
    board: alloc::vec::Vec<Option<BoardUnit>>,
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

type GhostPool = alloc::vec::Vec<alloc::vec::Vec<GhostBoardUnit>>;
const MAX_GHOSTS_PER_BRACKET: usize = 10;

// ── Contract ────────────────────────────────────────────────────────────────

#[pvm::contract(cdm = "@oab/arena")]
mod oab_arena {
    use super::*;
    use alloc::collections::BTreeMap;
    use alloc::vec;
    use alloc::vec::Vec;

    // ── Ghost helpers ───────────────────────────────────────────────────

    fn push_ghost(
        set_id: SetIdValue,
        round: RoundValue,
        wins: RoundValue,
        lives: RoundValue,
        board: Vec<GhostBoardUnit>,
    ) {
        if board.is_empty() {
            return;
        }
        let bracket = (set_id, round, wins, lives);
        let mut pool = Storage::ghost_pools().get(&bracket).unwrap_or_default();
        if pool.len() >= MAX_GHOSTS_PER_BRACKET {
            pool.remove(0);
        }
        pool.push(board);
        Storage::ghost_pools().insert(&bracket, &pool);
    }

    fn select_ghost(
        set_id: SetIdValue,
        round: RoundValue,
        wins: RoundValue,
        lives: RoundValue,
        seed: u64,
        card_pool: &BTreeMap<CardId, UnitCard>,
    ) -> (Vec<CombatUnit>, Vec<GhostBoardUnit>) {
        let bracket = (set_id, round, wins, lives);
        let pool = Storage::ghost_pools().get(&bracket).unwrap_or_default();
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

    // ── Card pool ───────────────────────────────────────────────────────

    fn build_card_pool_from_storage(card_set: &CardSet) -> BTreeMap<CardId, UnitCard> {
        let mut pool = BTreeMap::new();
        for entry in &card_set.cards {
            if let Some(card) = Storage::cards().get(&entry.card_id.0) {
                pool.insert(card.id, card);
            }
        }
        pool
    }

    // ── Game helpers ────────────────────────────────────────────────────

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

    fn derive_seed(addr: &Address, context: &[u8], nonce: u64) -> u64 {
        let mut input = Vec::with_capacity(20 + context.len() + 8);
        input.extend_from_slice(addr.as_bytes());
        input.extend_from_slice(context);
        input.extend_from_slice(&nonce.to_le_bytes());
        let mut hash = [0u8; 32];
        pvm::api::hash_keccak_256(&input, &mut hash);
        u64::from_le_bytes(hash[0..8].try_into().unwrap())
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

    // ── Event constants ─────────────────────────────────────────────────

    // keccak256("BattleReported(uint8,uint8,uint8,uint8,uint64,bytes)")
    const BATTLE_REPORTED_TOPIC: [u8; 32] = [
        0x96, 0xfd, 0x17, 0x36, 0xea, 0x4f, 0xbe, 0xf3, 0x2e, 0x32, 0x8d, 0x70, 0x05, 0x02, 0x1b,
        0x05, 0xc7, 0xee, 0x31, 0xf3, 0x26, 0x94, 0xdd, 0xef, 0x23, 0xdd, 0x55, 0xaf, 0x68, 0xe0,
        0x89, 0xbd,
    ];

    // ── Contract entry points ───────────────────────────────────────────

    #[pvm::constructor]
    pub fn new() -> Result<(), Error> {
        Storage::admin().set(&pvm::caller());
        Ok(())
    }

    /// Admin: store a SCALE-encoded card definition on-chain.
    #[pvm::method]
    pub fn register_card(data: Vec<u8>) -> bool {
        if Storage::admin().get() != Some(pvm::caller()) {
            return false;
        }
        let card: UnitCard = match Decode::decode(&mut &data[..]) {
            Ok(v) => v,
            Err(_) => return false,
        };
        if Storage::cards().contains(&card.id.0) {
            return false;
        }
        Storage::cards().insert(&card.id.0, &card);
        true
    }

    /// Admin: store a SCALE-encoded card set on-chain.
    #[pvm::method]
    pub fn register_set(set_id: u16, data: Vec<u8>) -> bool {
        if Storage::admin().get() != Some(pvm::caller()) {
            return false;
        }
        let card_set: CardSet = match Decode::decode(&mut &data[..]) {
            Ok(v) => v,
            Err(_) => return false,
        };
        if Storage::card_sets().contains(&set_id) {
            return false;
        }
        Storage::card_sets().insert(&set_id, &card_set);
        true
    }

    /// Start a new arena game with the given card set and seed nonce.
    #[pvm::method]
    pub fn start_game(set_id: u16, seed_nonce: u64) -> u64 {
        let caller = pvm::caller();
        if Storage::sessions().contains(&caller) {
            return 0;
        }

        let card_set = match Storage::card_sets().get(&set_id) {
            Some(cs) => cs,
            None => return 0,
        };
        let card_pool = build_card_pool_from_storage(&card_set);
        if card_pool.is_empty() {
            return 0;
        }

        let config = default_config();
        let seed = derive_seed(&caller, b"start", seed_nonce);
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

        Storage::sessions().insert(&caller, &session);
        seed
    }

    /// Submit shop actions (SCALE-encoded CommitTurnAction). Resolves battle on-chain.
    /// Returns SCALE-encoded result bytes via the BattleReported event.
    /// Direct return is the battle seed (0 on error).
    #[pvm::method]
    pub fn submit_turn(action: Vec<u8>) -> u64 {
        let caller = pvm::caller();
        let mut session = match Storage::sessions().get(&caller) {
            Some(s) => s,
            None => return 0,
        };
        if session.phase != GamePhase::Shop {
            return 0;
        }

        let action: CommitTurnAction = match Decode::decode(&mut &action[..]) {
            Ok(v) => v,
            Err(_) => return 0,
        };

        let card_set = match Storage::card_sets().get(&session.set_id) {
            Some(cs) => cs,
            None => return 0,
        };
        let card_pool = build_card_pool_from_storage(&card_set);
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
        let battle_seed = derive_seed(&caller, b"battle", session.game_seed);
        let (enemy_units, opponent_ghost) = select_ghost(
            session.set_id,
            session.round,
            session.wins,
            session.lives,
            battle_seed,
            &card_pool,
        );

        // Store player's board as ghost for future opponents
        let player_ghost = create_ghost_from_board(&shop_state.board);
        push_ghost(
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
            let new_seed = derive_seed(&caller, b"shop", session.game_seed);
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

        Storage::sessions().insert(&caller, &session);

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
        pvm::api::deposit_event(&[BATTLE_REPORTED_TOPIC], &event_data);

        battle_seed
    }

    /// Read the caller's current game state (SCALE-encoded ArenaSession).
    #[pvm::method]
    pub fn get_game_state() -> Vec<u8> {
        match Storage::sessions().get(&pvm::caller()) {
            Some(session) => session.encode(),
            None => Vec::new(),
        }
    }

    /// Forfeit the current game.
    #[pvm::method]
    pub fn abandon_game() -> bool {
        let caller = pvm::caller();
        if !Storage::sessions().contains(&caller) {
            return false;
        }
        Storage::sessions().remove(&caller);
        true
    }

    /// End a completed game, archiving the final board as a ghost.
    #[pvm::method]
    pub fn end_game() -> bool {
        let caller = pvm::caller();
        let session = match Storage::sessions().get(&caller) {
            Some(s) => s,
            None => return false,
        };
        if session.phase != GamePhase::Completed {
            return false;
        }

        let ghost = create_ghost_from_board(&session.board);
        if !ghost.is_empty() {
            push_ghost(
                session.set_id,
                session.round,
                session.wins,
                session.lives,
                ghost,
            );
        }

        Storage::sessions().remove(&caller);
        true
    }

    /// Read a SCALE-encoded card definition.
    #[pvm::method]
    pub fn get_card(card_id: u16) -> Vec<u8> {
        match Storage::cards().get(&card_id) {
            Some(card) => card.encode(),
            None => Vec::new(),
        }
    }

    /// Read a SCALE-encoded card set.
    #[pvm::method]
    pub fn get_set(set_id: u16) -> Vec<u8> {
        match Storage::card_sets().get(&set_id) {
            Some(card_set) => card_set.encode(),
            None => Vec::new(),
        }
    }

    #[pvm::fallback]
    pub fn fallback() -> Result<(), Error> {
        Ok(())
    }
}
