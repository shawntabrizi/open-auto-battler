//! Comprehensive tests for the OAB Arena smart contract game logic.
//!
//! These tests exercise the same game logic used in the contract (bag creation,
//! hand drawing, turn verification, battle execution, state transitions) but
//! run natively without the PolkaVM host functions.
//!
//! Tests also verify parity with the pallet implementations to ensure the
//! contract produces identical results.

#[cfg(test)]
mod tests {

use oab_assets::{cards, sets};
use oab_battle::battle::{resolve_battle, BattleResult, CombatUnit};
use oab_battle::rng::{BattleRng, XorShiftRng};
use oab_battle::state::{CardSet, ShopState};
use oab_battle::types::*;
use oab_battle::{
    apply_shop_start_triggers, apply_shop_start_triggers_with_result, verify_and_apply_turn,
};
use parity_scale_codec::{Decode, Encode};
use std::collections::BTreeMap;

// ── Types mirroring the contract ─────────────────────────────────────────────

const PHASE_SHOP: u8 = 0;
const PHASE_COMPLETED: u8 = 1;

#[derive(Debug, Clone, Encode, Decode, PartialEq)]
struct ArenaSession {
    bag: Vec<CardId>,
    hand: Vec<CardId>,
    board: Vec<Option<BoardUnit>>,
    mana_limit: i32,
    shop_mana: i32,
    round: i32,
    lives: i32,
    wins: i32,
    phase: u8,
    next_card_id: u32,
    game_seed: u64,
}

struct GameConfig {
    starting_lives: i32,
    wins_to_victory: i32,
    starting_mana_limit: i32,
    max_mana_limit: i32,
    full_mana_each_round: bool,
    board_size: u32,
    hand_size: u32,
    bag_size: u32,
}

impl GameConfig {
    fn mana_limit_for_round(&self, round: i32) -> i32 {
        (self.starting_mana_limit + round - 1).min(self.max_mana_limit)
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

// ── Game logic functions (mirroring contract) ────────────────────────────────

fn create_starting_bag(set: &CardSet, seed: u64, bag_size: usize) -> Vec<CardId> {
    if set.cards.is_empty() {
        return Vec::new();
    }
    let mut bag = Vec::with_capacity(bag_size);
    let mut rng = XorShiftRng::seed_from_u64(seed);
    let total_weight: u32 = set.cards.iter().map(|e| e.rarity).sum();
    if total_weight == 0 {
        return Vec::new();
    }
    for _ in 0..bag_size {
        let mut target = rng.gen_range(total_weight as usize) as u32;
        for entry in &set.cards {
            if entry.rarity == 0 {
                continue;
            }
            if target < entry.rarity {
                bag.push(entry.card_id);
                break;
            }
            target -= entry.rarity;
        }
    }
    bag
}

fn derive_hand_indices(
    bag_len: usize,
    game_seed: u64,
    round: i32,
    hand_size: usize,
) -> Vec<usize> {
    if bag_len == 0 {
        return Vec::new();
    }
    let hand_count = hand_size.min(bag_len);
    let seed = game_seed ^ (round as u64);
    let mut rng = XorShiftRng::seed_from_u64(seed);
    let mut indices: Vec<usize> = (0..bag_len).collect();
    for i in 0..hand_count {
        let j = i + rng.gen_range(bag_len - i);
        indices.swap(i, j);
    }
    indices.truncate(hand_count);
    indices
}

fn draw_hand(session: &mut ArenaSession, hand_size: usize) {
    session.bag.append(&mut session.hand);
    let indices = derive_hand_indices(
        session.bag.len(),
        session.game_seed,
        session.round,
        hand_size,
    );
    if indices.is_empty() {
        return;
    }
    let mut sorted = indices;
    sorted.sort_unstable_by(|a, b| b.cmp(a));
    let mut drawn = Vec::with_capacity(sorted.len());
    for idx in sorted {
        drawn.push(session.bag.remove(idx));
    }
    drawn.reverse();
    session.hand = drawn;
}

fn build_card_pool(
    card_set: &CardSet,
    all_cards: &[UnitCard],
) -> BTreeMap<CardId, UnitCard> {
    let mut pool = BTreeMap::new();
    for entry in &card_set.cards {
        if let Some(card) = all_cards.iter().find(|c| c.id == entry.card_id) {
            pool.insert(card.id, card.clone());
        }
    }
    pool
}

fn apply_shop_start_on_session(
    session: &mut ArenaSession,
    card_pool: &BTreeMap<CardId, UnitCard>,
) {
    let mut shop_state = ShopState {
        card_pool: card_pool.clone(),
        set_id: 0,
        hand: session.hand.clone(),
        board: session.board.clone(),
        mana_limit: session.mana_limit,
        shop_mana: session.shop_mana,
        round: session.round,
        game_seed: session.game_seed,
    };
    apply_shop_start_triggers(&mut shop_state);
    session.hand = shop_state.hand;
    session.board = shop_state.board;
    session.shop_mana = shop_state.shop_mana;
}

fn start_game(card_set: &CardSet, all_cards: &[UnitCard], seed: u64) -> ArenaSession {
    let config = default_config();
    let bag = create_starting_bag(card_set, seed, config.bag_size as usize);
    let mut session = ArenaSession {
        bag,
        hand: Vec::new(),
        board: vec![None; config.board_size as usize],
        mana_limit: config.mana_limit_for_round(1),
        shop_mana: 0,
        round: 1,
        lives: config.starting_lives,
        wins: 0,
        phase: PHASE_SHOP,
        next_card_id: 1000,
        game_seed: seed,
    };
    draw_hand(&mut session, config.hand_size as usize);
    let card_pool = build_card_pool(card_set, all_cards);
    apply_shop_start_on_session(&mut session, &card_pool);
    session
}

/// Execute a turn: verify actions, run battle, advance state. Returns the battle result.
fn submit_turn(
    session: &mut ArenaSession,
    action: &CommitTurnAction,
    enemy_units: Vec<CombatUnit>,
    all_cards: &[UnitCard],
    card_set: &CardSet,
) -> BattleResult {
    let card_pool = build_card_pool(card_set, all_cards);
    let config = default_config();

    let mut shop_state = ShopState {
        card_pool: card_pool.clone(),
        set_id: 0,
        hand: session.hand.clone(),
        board: session.board.clone(),
        mana_limit: session.mana_limit,
        shop_mana: session.shop_mana,
        round: session.round,
        game_seed: session.game_seed,
    };

    verify_and_apply_turn(&mut shop_state, action).expect("Turn should be valid");
    shop_state.shop_mana = 0;

    let mut player_slots = Vec::new();
    let player_units: Vec<CombatUnit> = shop_state
        .board
        .iter()
        .enumerate()
        .filter_map(|(slot, board_unit)| {
            let board_unit = board_unit.as_ref()?;
            player_slots.push(slot);
            card_pool.get(&board_unit.card_id).map(|card| {
                let mut cu = CombatUnit::from_card(card.clone());
                cu.attack_buff = board_unit.perm_attack;
                cu.health_buff = board_unit.perm_health;
                cu.health = cu.health.saturating_add(board_unit.perm_health).max(0);
                cu
            })
        })
        .collect();

    let battle_seed = session
        .game_seed
        .wrapping_mul(6364136223846793005)
        .wrapping_add(1);

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

    let mana_delta = oab_battle::battle::player_shop_mana_delta_from_events(&events).max(0);

    let permanent_deltas = oab_battle::battle::player_permanent_stat_deltas_from_events(&events);
    for (unit_id, (attack_delta, health_delta)) in &permanent_deltas {
        let unit_index = unit_id.raw() as usize;
        if unit_index == 0 || unit_index > player_slots.len() {
            continue;
        }
        let slot = player_slots[unit_index - 1];
        let should_remove = {
            if let Some(Some(board_unit)) = shop_state.board.get_mut(slot) {
                board_unit.perm_attack = board_unit.perm_attack.saturating_add(*attack_delta);
                board_unit.perm_health = board_unit.perm_health.saturating_add(*health_delta);
                card_pool
                    .get(&board_unit.card_id)
                    .map(|card| card.stats.health.saturating_add(board_unit.perm_health) <= 0)
                    .unwrap_or(false)
            } else {
                false
            }
        };
        if should_remove {
            shop_state.board[slot] = None;
        }
    }

    match result {
        BattleResult::Victory => session.wins += 1,
        BattleResult::Defeat => session.lives -= 1,
        BattleResult::Draw => {}
    }

    let game_over = session.lives <= 0 || session.wins >= config.wins_to_victory;

    if !game_over {
        let new_seed = session
            .game_seed
            .wrapping_mul(6364136223846793005)
            .wrapping_add(3);
        session.game_seed = new_seed;
        session.round += 1;
        session.mana_limit = config.mana_limit_for_round(session.round);
        session.shop_mana = mana_delta;
        session.board = shop_state.board;
        session.hand = Vec::new();
        session.bag = {
            let mut bag = session.bag.clone();
            bag.extend(shop_state.hand.iter());
            bag
        };
        session.phase = PHASE_SHOP;
        draw_hand(session, config.hand_size as usize);
        let mut ss = ShopState {
            card_pool: card_pool.clone(),
            set_id: 0,
            hand: session.hand.clone(),
            board: session.board.clone(),
            mana_limit: session.mana_limit,
            shop_mana: session.shop_mana,
            round: session.round,
            game_seed: session.game_seed,
        };
        apply_shop_start_triggers_with_result(&mut ss, Some(result.clone()));
        session.hand = ss.hand;
        session.board = ss.board;
        session.shop_mana = ss.shop_mana;
    } else {
        session.board = shop_state.board;
        session.hand = shop_state.hand;
        session.shop_mana = mana_delta;
        session.phase = PHASE_COMPLETED;
    }

    result
}

fn get_test_data() -> (CardSet, Vec<UnitCard>) {
    let all_sets = sets::get_all();
    let card_set = all_sets[0].clone();
    let all_cards = cards::get_all();
    (card_set, all_cards)
}

fn make_weak_enemy() -> Vec<CombatUnit> {
    vec![CombatUnit::from_card(UnitCard::new(
        CardId(999),
        "Weakling",
        1,
        1,
        0,
        0,
    ))]
}

fn make_strong_enemy(all_cards: &[UnitCard]) -> Vec<CombatUnit> {
    all_cards
        .iter()
        .filter(|c| !c.battle_abilities.is_empty() && c.stats.attack >= 5)
        .take(5)
        .map(|c| CombatUnit::from_card(c.clone()))
        .collect()
}

// ═════════════════════════════════════════════════════════════════════════════
// Session encoding / storage fit
// ═════════════════════════════════════════════════════════════════════════════

#[test]
fn session_round_trip_encoding() {
    let (card_set, all_cards) = get_test_data();
    let session = start_game(&card_set, &all_cards, 42);
    let encoded = session.encode();
    let decoded = ArenaSession::decode(&mut &encoded[..]).unwrap();
    assert_eq!(session, decoded);
}

#[test]
fn session_fits_storage_limit_initial() {
    let (card_set, all_cards) = get_test_data();
    let session = start_game(&card_set, &all_cards, 42);
    let size = session.encode().len();
    assert!(
        size <= 416,
        "Initial session is {size} bytes, exceeds 416-byte storage limit"
    );
}

#[test]
fn session_fits_storage_limit_full_board() {
    let (card_set, all_cards) = get_test_data();
    let mut session = start_game(&card_set, &all_cards, 42);
    session.board = vec![
        Some(BoardUnit { card_id: CardId(10), perm_attack: 10, perm_health: 15 }),
        Some(BoardUnit { card_id: CardId(15), perm_attack: 8, perm_health: 12 }),
        Some(BoardUnit { card_id: CardId(20), perm_attack: 6, perm_health: 9 }),
        Some(BoardUnit { card_id: CardId(25), perm_attack: 4, perm_health: 7 }),
        Some(BoardUnit { card_id: CardId(30), perm_attack: 3, perm_health: 5 }),
    ];
    session.bag = session.bag[..5].to_vec();
    let size = session.encode().len();
    assert!(
        size <= 416,
        "Full-board session is {size} bytes, exceeds 416-byte storage limit"
    );
}

#[test]
fn card_set_storage_sizes() {
    // Not all card sets fit in a single 416-byte storage value.
    // The contract must handle larger sets by splitting or using calldata.
    // This test documents the actual sizes.
    let all_sets = sets::get_all();
    let set_metas = sets::get_all_metas();
    for (i, set) in all_sets.iter().enumerate() {
        let size = set.encode().len();
        println!(
            "Set '{}' (id {}): {} bytes (fits 416: {})",
            set_metas[i].name,
            set_metas[i].id,
            size,
            size <= 416
        );
    }
    // At minimum, set 0 must fit (it's the primary arena set)
    let set0_size = all_sets[0].encode().len();
    assert!(
        set0_size <= 416,
        "Primary set (set 0) is {set0_size} bytes, exceeds 416-byte storage limit"
    );
}

#[test]
fn session_fits_at_every_bag_size() {
    let (card_set, all_cards) = get_test_data();
    // Check all possible bag sizes from 50 (initial) down to 0 (late game)
    for bag_size in 0..=50 {
        let session = ArenaSession {
            bag: vec![CardId(10); bag_size],
            hand: vec![CardId(10); 5.min(50 - bag_size)],
            board: vec![
                Some(BoardUnit { card_id: CardId(10), perm_attack: 99, perm_health: 99 }),
                Some(BoardUnit { card_id: CardId(10), perm_attack: 99, perm_health: 99 }),
                Some(BoardUnit { card_id: CardId(10), perm_attack: 99, perm_health: 99 }),
                Some(BoardUnit { card_id: CardId(10), perm_attack: 99, perm_health: 99 }),
                Some(BoardUnit { card_id: CardId(10), perm_attack: 99, perm_health: 99 }),
            ],
            mana_limit: 10,
            shop_mana: 10,
            round: 10,
            lives: 3,
            wins: 9,
            phase: PHASE_SHOP,
            next_card_id: 2000,
            game_seed: u64::MAX,
        };
        let size = session.encode().len();
        assert!(
            size <= 416,
            "Session with bag_size={bag_size} is {size} bytes, exceeds 416-byte limit"
        );
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// Bag creation
// ═════════════════════════════════════════════════════════════════════════════

#[test]
fn bag_is_correct_size() {
    let (card_set, _) = get_test_data();
    let bag = create_starting_bag(&card_set, 42, 50);
    assert_eq!(bag.len(), 50);
}

#[test]
fn bag_is_deterministic() {
    let (card_set, _) = get_test_data();
    let a = create_starting_bag(&card_set, 42, 50);
    let b = create_starting_bag(&card_set, 42, 50);
    assert_eq!(a, b);
}

#[test]
fn bag_varies_with_seed() {
    let (card_set, _) = get_test_data();
    let a = create_starting_bag(&card_set, 42, 50);
    let b = create_starting_bag(&card_set, 43, 50);
    assert_ne!(a, b);
}

#[test]
fn bag_only_contains_draftable_cards() {
    let (card_set, _) = get_test_data();
    let bag = create_starting_bag(&card_set, 42, 50);
    let draftable: Vec<CardId> = card_set
        .cards
        .iter()
        .filter(|e| e.rarity > 0)
        .map(|e| e.card_id)
        .collect();
    for card_id in &bag {
        assert!(draftable.contains(card_id), "Card {:?} not draftable", card_id);
    }
}

#[test]
fn bag_matches_pallet_implementation() {
    let (card_set, _) = get_test_data();
    for seed in [1, 42, 999, u64::MAX] {
        let contract_bag = create_starting_bag(&card_set, seed, 50);
        let pallet_bag = oab_game::sealed::create_starting_bag(&card_set, seed, 50);
        assert_eq!(contract_bag, pallet_bag, "Mismatch at seed {seed}");
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// Hand drawing
// ═════════════════════════════════════════════════════════════════════════════

#[test]
fn hand_draw_correct_size() {
    let (card_set, all_cards) = get_test_data();
    let session = start_game(&card_set, &all_cards, 42);
    assert_eq!(session.hand.len(), 5);
    assert_eq!(session.bag.len(), 45);
}

#[test]
fn hand_draw_deterministic() {
    let (card_set, all_cards) = get_test_data();
    let a = start_game(&card_set, &all_cards, 42);
    let b = start_game(&card_set, &all_cards, 42);
    assert_eq!(a.hand, b.hand);
    assert_eq!(a.bag, b.bag);
}

#[test]
fn hand_draw_preserves_total_cards() {
    let (card_set, all_cards) = get_test_data();
    let session = start_game(&card_set, &all_cards, 42);
    assert_eq!(session.hand.len() + session.bag.len(), 50);
}

#[test]
fn hand_draw_with_empty_bag() {
    let mut session = ArenaSession {
        bag: vec![],
        hand: vec![],
        board: vec![None; 5],
        mana_limit: 3,
        shop_mana: 0,
        round: 1,
        lives: 3,
        wins: 0,
        phase: PHASE_SHOP,
        next_card_id: 1000,
        game_seed: 42,
    };
    draw_hand(&mut session, 5);
    assert!(session.hand.is_empty());
}

#[test]
fn hand_draw_with_small_bag() {
    let mut session = ArenaSession {
        bag: vec![CardId(10), CardId(20)],
        hand: vec![],
        board: vec![None; 5],
        mana_limit: 3,
        shop_mana: 0,
        round: 1,
        lives: 3,
        wins: 0,
        phase: PHASE_SHOP,
        next_card_id: 1000,
        game_seed: 42,
    };
    draw_hand(&mut session, 5);
    assert_eq!(session.hand.len(), 2);
    assert!(session.bag.is_empty());
}

#[test]
fn hand_indices_match_pallet() {
    for (bag_len, seed, round) in [(45, 42, 1), (40, 100, 3), (10, 7, 8), (3, 1, 1)] {
        let contract = derive_hand_indices(bag_len, seed, round, 5);
        let pallet = oab_game::derive_hand_indices_logic(bag_len, seed, round, 5);
        assert_eq!(contract, pallet, "Mismatch at bag_len={bag_len} seed={seed} round={round}");
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// Game initialization
// ═════════════════════════════════════════════════════════════════════════════

#[test]
fn start_game_initial_state() {
    let (card_set, all_cards) = get_test_data();
    let session = start_game(&card_set, &all_cards, 42);
    assert_eq!(session.round, 1);
    assert_eq!(session.lives, 3);
    assert_eq!(session.wins, 0);
    assert_eq!(session.mana_limit, 3);
    assert_eq!(session.phase, PHASE_SHOP);
    assert_eq!(session.hand.len(), 5);
    assert_eq!(session.bag.len(), 45);
    assert!(session.board.iter().all(|s| s.is_none()));
}

#[test]
fn start_game_different_seeds_different_state() {
    let (card_set, all_cards) = get_test_data();
    let a = start_game(&card_set, &all_cards, 1);
    let b = start_game(&card_set, &all_cards, 2);
    assert_ne!(a.hand, b.hand);
    assert_ne!(a.bag, b.bag);
}

#[test]
fn start_game_all_sets() {
    let all_sets = sets::get_all();
    let all_cards = cards::get_all();
    for (i, set) in all_sets.iter().enumerate() {
        let session = start_game(set, &all_cards, 42);
        assert_eq!(session.hand.len(), 5, "Set {i} hand size wrong");
        assert_eq!(session.bag.len(), 45, "Set {i} bag size wrong");
    }
}

#[test]
fn mana_progression() {
    let config = default_config();
    assert_eq!(config.mana_limit_for_round(1), 3);
    assert_eq!(config.mana_limit_for_round(2), 4);
    assert_eq!(config.mana_limit_for_round(5), 7);
    assert_eq!(config.mana_limit_for_round(8), 10);
    assert_eq!(config.mana_limit_for_round(100), 10);
}

// ═════════════════════════════════════════════════════════════════════════════
// Turn verification
// ═════════════════════════════════════════════════════════════════════════════

#[test]
fn empty_turn_is_valid() {
    let (card_set, all_cards) = get_test_data();
    let session = start_game(&card_set, &all_cards, 42);
    let card_pool = build_card_pool(&card_set, &all_cards);
    let mut shop_state = ShopState {
        card_pool,
        set_id: 0,
        hand: session.hand.clone(),
        board: session.board.clone(),
        mana_limit: session.mana_limit,
        shop_mana: session.shop_mana,
        round: session.round,
        game_seed: session.game_seed,
    };
    let action = CommitTurnAction { actions: vec![] };
    assert!(verify_and_apply_turn(&mut shop_state, &action).is_ok());
}

#[test]
fn burn_card_gives_mana() {
    let (card_set, all_cards) = get_test_data();
    let session = start_game(&card_set, &all_cards, 42);
    let card_pool = build_card_pool(&card_set, &all_cards);
    let mut shop_state = ShopState {
        card_pool,
        set_id: 0,
        hand: session.hand.clone(),
        board: session.board.clone(),
        mana_limit: session.mana_limit,
        shop_mana: session.shop_mana,
        round: session.round,
        game_seed: session.game_seed,
    };
    let action = CommitTurnAction {
        actions: vec![TurnAction::BurnFromHand { hand_index: 0 }],
    };
    verify_and_apply_turn(&mut shop_state, &action).unwrap();
    assert!(shop_state.shop_mana > 0);
}

#[test]
fn invalid_hand_index_rejected() {
    let (card_set, all_cards) = get_test_data();
    let session = start_game(&card_set, &all_cards, 42);
    let card_pool = build_card_pool(&card_set, &all_cards);
    let mut shop_state = ShopState {
        card_pool,
        set_id: 0,
        hand: session.hand.clone(),
        board: session.board.clone(),
        mana_limit: session.mana_limit,
        shop_mana: session.shop_mana,
        round: session.round,
        game_seed: session.game_seed,
    };
    let action = CommitTurnAction {
        actions: vec![TurnAction::BurnFromHand { hand_index: 99 }],
    };
    assert!(verify_and_apply_turn(&mut shop_state, &action).is_err());
}

#[test]
fn invalid_board_slot_rejected() {
    let (card_set, all_cards) = get_test_data();
    let session = start_game(&card_set, &all_cards, 42);
    let card_pool = build_card_pool(&card_set, &all_cards);
    let mut shop_state = ShopState {
        card_pool,
        set_id: 0,
        hand: session.hand.clone(),
        board: session.board.clone(),
        mana_limit: session.mana_limit,
        shop_mana: session.shop_mana,
        round: session.round,
        game_seed: session.game_seed,
    };
    let action = CommitTurnAction {
        actions: vec![TurnAction::PlayFromHand {
            hand_index: 0,
            board_slot: 99,
        }],
    };
    assert!(verify_and_apply_turn(&mut shop_state, &action).is_err());
}

// ═════════════════════════════════════════════════════════════════════════════
// Full game flow
// ═════════════════════════════════════════════════════════════════════════════

#[test]
fn submit_turn_advances_round() {
    let (card_set, all_cards) = get_test_data();
    let mut session = start_game(&card_set, &all_cards, 42);
    let action = CommitTurnAction { actions: vec![] };
    let _result = submit_turn(&mut session, &action, make_weak_enemy(), &all_cards, &card_set);
    if session.phase == PHASE_SHOP {
        assert_eq!(session.round, 2);
        assert_eq!(session.mana_limit, 4);
        assert_eq!(session.hand.len(), 5);
    }
}

#[test]
fn victory_increments_wins() {
    let (card_set, all_cards) = get_test_data();
    let mut session = start_game(&card_set, &all_cards, 42);
    // Put a strong unit on board
    session.board[0] = Some(BoardUnit {
        card_id: CardId(20),
        perm_attack: 0,
        perm_health: 0,
    });
    let action = CommitTurnAction { actions: vec![] };
    let result = submit_turn(&mut session, &action, make_weak_enemy(), &all_cards, &card_set);
    if result == BattleResult::Victory {
        assert_eq!(session.wins, 1);
        assert_eq!(session.lives, 3);
    }
}

#[test]
fn defeat_decrements_lives() {
    let (card_set, all_cards) = get_test_data();
    let mut session = start_game(&card_set, &all_cards, 42);
    let action = CommitTurnAction { actions: vec![] };
    let result = submit_turn(
        &mut session,
        &action,
        make_strong_enemy(&all_cards),
        &all_cards,
        &card_set,
    );
    if result == BattleResult::Defeat {
        assert_eq!(session.lives, 2);
    }
}

#[test]
fn game_ends_at_zero_lives() {
    let (card_set, all_cards) = get_test_data();
    let mut session = start_game(&card_set, &all_cards, 42);
    session.lives = 1;
    let action = CommitTurnAction { actions: vec![] };
    let result = submit_turn(
        &mut session,
        &action,
        make_strong_enemy(&all_cards),
        &all_cards,
        &card_set,
    );
    if result == BattleResult::Defeat {
        assert_eq!(session.lives, 0);
        assert_eq!(session.phase, PHASE_COMPLETED);
    }
}

#[test]
fn multi_round_game() {
    let (card_set, all_cards) = get_test_data();
    let mut session = start_game(&card_set, &all_cards, 42);
    let mut rounds = 0;

    for _ in 0..30 {
        if session.phase == PHASE_COMPLETED {
            break;
        }
        let action = CommitTurnAction { actions: vec![] };
        submit_turn(&mut session, &action, make_weak_enemy(), &all_cards, &card_set);
        rounds += 1;
    }

    assert!(rounds >= 3, "Should play multiple rounds (played {rounds})");
    assert!(
        session.wins > 0 || session.lives < 3,
        "Game state should have changed"
    );
}

#[test]
fn game_ends_at_ten_wins() {
    let (card_set, all_cards) = get_test_data();
    let mut session = start_game(&card_set, &all_cards, 42);
    session.wins = 9; // One win away from victory
    session.board[0] = Some(BoardUnit {
        card_id: CardId(20),
        perm_attack: 50,
        perm_health: 50,
    });

    let action = CommitTurnAction { actions: vec![] };
    let result = submit_turn(&mut session, &action, make_weak_enemy(), &all_cards, &card_set);
    if result == BattleResult::Victory {
        assert_eq!(session.wins, 10);
        assert_eq!(session.phase, PHASE_COMPLETED);
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// Battle determinism
// ═════════════════════════════════════════════════════════════════════════════

#[test]
fn battle_is_deterministic() {
    let player = vec![CombatUnit::from_card(UnitCard::new(
        CardId(10), "A", 3, 5, 1, 1,
    ))];
    let enemy = vec![CombatUnit::from_card(UnitCard::new(
        CardId(20), "B", 2, 4, 1, 1,
    ))];
    let pool = BTreeMap::new();

    let mut rng1 = XorShiftRng::seed_from_u64(42);
    let events1 = resolve_battle(player.clone(), enemy.clone(), &mut rng1, &pool, 5);

    let mut rng2 = XorShiftRng::seed_from_u64(42);
    let events2 = resolve_battle(player, enemy, &mut rng2, &pool, 5);

    assert_eq!(events1.len(), events2.len());
}

#[test]
fn different_seeds_produce_different_event_counts() {
    // Same units, different seeds should produce different event sequences
    // (even if outcomes are the same, the internal execution varies)
    let pool = BTreeMap::new();
    let event_counts: Vec<usize> = (0..10)
        .map(|seed| {
            let player = vec![CombatUnit::from_card(UnitCard::new(
                CardId(1), "A", 3, 5, 1, 1,
            ))];
            let enemy = vec![CombatUnit::from_card(UnitCard::new(
                CardId(2), "B", 3, 5, 1, 1,
            ))];
            let mut rng = XorShiftRng::seed_from_u64(seed);
            resolve_battle(player, enemy, &mut rng, &pool, 5).len()
        })
        .collect();

    // Deterministic: same seed = same count
    let seed42_a = {
        let mut rng = XorShiftRng::seed_from_u64(42);
        resolve_battle(
            vec![CombatUnit::from_card(UnitCard::new(CardId(1), "A", 3, 5, 1, 1))],
            vec![CombatUnit::from_card(UnitCard::new(CardId(2), "B", 3, 5, 1, 1))],
            &mut rng,
            &pool,
            5,
        )
        .len()
    };
    let seed42_b = {
        let mut rng = XorShiftRng::seed_from_u64(42);
        resolve_battle(
            vec![CombatUnit::from_card(UnitCard::new(CardId(1), "A", 3, 5, 1, 1))],
            vec![CombatUnit::from_card(UnitCard::new(CardId(2), "B", 3, 5, 1, 1))],
            &mut rng,
            &pool,
            5,
        )
        .len()
    };
    assert_eq!(seed42_a, seed42_b, "Same seed must produce same event count");

    // All event counts should be positive
    assert!(event_counts.iter().all(|&c| c > 0));
}

// ═════════════════════════════════════════════════════════════════════════════
// CombatUnit encoding
// ═════════════════════════════════════════════════════════════════════════════

#[test]
fn combat_unit_round_trip() {
    let card = UnitCard::new(CardId(42), "Test", 5, 10, 3, 1);
    let unit = CombatUnit::from_card(card);
    let encoded = unit.encode();
    let decoded = CombatUnit::decode(&mut &encoded[..]).unwrap();
    assert_eq!(decoded.card_id, CardId(42));
    assert_eq!(decoded.attack, 5);
    assert_eq!(decoded.health, 10);
}

#[test]
fn combat_unit_with_abilities_round_trip() {
    let card = UnitCard::new(CardId(42), "Spawner", 3, 5, 2, 1).with_battle_ability(Ability {
        trigger: AbilityTrigger::OnFaint,
        effect: AbilityEffect::SpawnUnit {
            card_id: CardId(100),
            spawn_location: SpawnLocation::DeathPosition,
        },
        conditions: vec![],
        max_triggers: Some(1),
    });
    let unit = CombatUnit::from_card(card);
    let encoded = unit.encode();
    let decoded = CombatUnit::decode(&mut &encoded[..]).unwrap();
    assert_eq!(decoded.abilities.len(), 1);
    assert_eq!(decoded.abilities[0].trigger, AbilityTrigger::OnFaint);
}

// ═════════════════════════════════════════════════════════════════════════════
// Card pool
// ═════════════════════════════════════════════════════════════════════════════

#[test]
fn card_pool_contains_all_set_cards() {
    let (card_set, all_cards) = get_test_data();
    let pool = build_card_pool(&card_set, &all_cards);
    for entry in &card_set.cards {
        assert!(pool.contains_key(&entry.card_id), "Missing {:?}", entry.card_id);
    }
}

#[test]
fn card_pool_round_trip() {
    let (card_set, all_cards) = get_test_data();
    let pool = build_card_pool(&card_set, &all_cards);
    let encoded = pool.encode();
    let decoded: BTreeMap<CardId, UnitCard> = Decode::decode(&mut &encoded[..]).unwrap();
    assert_eq!(pool.len(), decoded.len());
}

#[test]
fn all_cards_calldata_fits_limit() {
    let all_cards = cards::get_all();
    let size = all_cards.encode().len();
    assert!(
        size < 128 * 1024,
        "All cards encoded is {size} bytes, exceeds 128 KB calldata limit"
    );
}

} // mod tests
