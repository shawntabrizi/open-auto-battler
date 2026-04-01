//! Comprehensive tests for the OAB Arena smart contract game logic.
//!
//! Tests exercise the same game logic used in the contract (bag creation,
//! hand drawing, turn verification, battle execution, state transitions)
//! running natively without the PolkaVM host functions.
//!
//! Also verifies parity with the pallet implementations.

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
    mana_limit: ManaValue,
    shop_mana: ManaValue,
    round: RoundValue,
    lives: RoundValue,
    wins: RoundValue,
    phase: u8,
    next_card_id: u16,
    game_seed: u64,
}

struct GameConfig {
    starting_lives: RoundValue,
    wins_to_victory: RoundValue,
    starting_mana_limit: ManaValue,
    max_mana_limit: ManaValue,
    #[allow(dead_code)]
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

// ── Game logic (mirroring contract) ──────────────────────────────────────────

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

fn derive_hand_indices(bag_len: usize, game_seed: u64, round: RoundValue, hand_size: usize) -> Vec<usize> {
    if bag_len == 0 { return Vec::new(); }
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
    let indices = derive_hand_indices(session.bag.len(), session.game_seed, session.round, hand_size);
    if indices.is_empty() { return; }
    let mut sorted = indices;
    sorted.sort_unstable_by(|a, b| b.cmp(a));
    let mut drawn = Vec::with_capacity(sorted.len());
    for idx in sorted { drawn.push(session.bag.remove(idx)); }
    drawn.reverse();
    session.hand = drawn;
}

fn build_card_pool(card_set: &CardSet, all_cards: &[UnitCard]) -> BTreeMap<CardId, UnitCard> {
    let mut pool = BTreeMap::new();
    for entry in &card_set.cards {
        if let Some(card) = all_cards.iter().find(|c| c.id == entry.card_id) {
            pool.insert(card.id, card.clone());
        }
    }
    pool
}

fn start_game(card_set: &CardSet, all_cards: &[UnitCard], seed: u64) -> ArenaSession {
    let config = default_config();
    let bag = create_starting_bag(card_set, seed, config.bag_size as usize);
    let mut session = ArenaSession {
        bag, hand: Vec::new(), board: vec![None; config.board_size as usize],
        mana_limit: config.mana_limit_for_round(1), shop_mana: 0, round: 1,
        lives: config.starting_lives, wins: 0, phase: PHASE_SHOP,
        next_card_id: 1000, game_seed: seed,
    };
    draw_hand(&mut session, config.hand_size as usize);
    let card_pool = build_card_pool(card_set, all_cards);
    let mut shop = ShopState {
        card_pool, set_id: 0, hand: session.hand.clone(), board: session.board.clone(),
        mana_limit: session.mana_limit, shop_mana: session.shop_mana,
        round: session.round, game_seed: session.game_seed,
    };
    apply_shop_start_triggers(&mut shop);
    session.hand = shop.hand; session.board = shop.board; session.shop_mana = shop.shop_mana;
    session
}

fn submit_turn(
    session: &mut ArenaSession, action: &CommitTurnAction,
    enemy_units: Vec<CombatUnit>, all_cards: &[UnitCard], card_set: &CardSet,
) -> BattleResult {
    let card_pool = build_card_pool(card_set, all_cards);
    let config = default_config();
    let mut shop_state = ShopState {
        card_pool: card_pool.clone(), set_id: 0, hand: session.hand.clone(),
        board: session.board.clone(), mana_limit: session.mana_limit,
        shop_mana: session.shop_mana, round: session.round, game_seed: session.game_seed,
    };
    verify_and_apply_turn(&mut shop_state, action).expect("Turn should be valid");
    shop_state.shop_mana = 0;

    let mut player_slots = Vec::new();
    let player_units: Vec<CombatUnit> = shop_state.board.iter().enumerate()
        .filter_map(|(slot, bu)| {
            let bu = bu.as_ref()?;
            player_slots.push(slot);
            card_pool.get(&bu.card_id).map(|card| {
                let mut cu = CombatUnit::from_card(card.clone());
                cu.attack_buff = bu.perm_attack; cu.health_buff = bu.perm_health;
                cu.health = cu.health.saturating_add(bu.perm_health).max(0); cu
            })
        }).collect();

    let battle_seed = session.game_seed.wrapping_mul(6364136223846793005).wrapping_add(1);
    let mut rng = XorShiftRng::seed_from_u64(battle_seed);
    let events = resolve_battle(player_units, enemy_units, &mut rng, &card_pool, config.board_size as usize);

    let result = events.iter().rev().find_map(|e| {
        if let oab_battle::battle::CombatEvent::BattleEnd { result } = e { Some(result.clone()) } else { None }
    }).unwrap_or(BattleResult::Draw);

    let mana_delta: ManaValue = oab_battle::battle::player_shop_mana_delta_from_events(&events).max(0) as ManaValue;
    let deltas = oab_battle::battle::player_permanent_stat_deltas_from_events(&events);
    for (uid, (ad, hd)) in &deltas {
        let idx = uid.raw() as usize;
        if idx == 0 || idx > player_slots.len() { continue; }
        let slot = player_slots[idx - 1];
        let remove = if let Some(Some(bu)) = shop_state.board.get_mut(slot) {
            bu.perm_attack = bu.perm_attack.saturating_add(*ad);
            bu.perm_health = bu.perm_health.saturating_add(*hd);
            card_pool.get(&bu.card_id).map(|c| c.stats.health.saturating_add(bu.perm_health) <= 0).unwrap_or(false)
        } else { false };
        if remove { shop_state.board[slot] = None; }
    }

    match result { BattleResult::Victory => session.wins += 1, BattleResult::Defeat => session.lives -= 1, BattleResult::Draw => {} }
    let game_over = session.lives == 0 || session.wins >= config.wins_to_victory;
    if !game_over {
        session.game_seed = session.game_seed.wrapping_mul(6364136223846793005).wrapping_add(3);
        session.round += 1;
        session.mana_limit = config.mana_limit_for_round(session.round);
        session.shop_mana = mana_delta;
        session.board = shop_state.board;
        let mut bag = session.bag.clone(); bag.extend(shop_state.hand.iter()); session.bag = bag;
        session.hand = Vec::new(); session.phase = PHASE_SHOP;
        draw_hand(session, config.hand_size as usize);
        let mut ss = ShopState {
            card_pool, set_id: 0, hand: session.hand.clone(), board: session.board.clone(),
            mana_limit: session.mana_limit, shop_mana: session.shop_mana,
            round: session.round, game_seed: session.game_seed,
        };
        apply_shop_start_triggers_with_result(&mut ss, Some(result.clone()));
        session.hand = ss.hand; session.board = ss.board; session.shop_mana = ss.shop_mana;
    } else {
        session.board = shop_state.board; session.hand = shop_state.hand;
        session.shop_mana = mana_delta; session.phase = PHASE_COMPLETED;
    }
    result
}

fn get_test_data() -> (CardSet, Vec<UnitCard>) { (sets::get_all()[0].clone(), cards::get_all()) }
fn make_weak_enemy() -> Vec<CombatUnit> { vec![CombatUnit::from_card(UnitCard::new(CardId(999), "Weakling", 1, 1, 0, 0))] }
fn make_strong_enemy(all_cards: &[UnitCard]) -> Vec<CombatUnit> {
    all_cards.iter().filter(|c| !c.battle_abilities.is_empty() && c.stats.attack >= 5).take(5).map(|c| CombatUnit::from_card(c.clone())).collect()
}

// ═════════════════════════════════════════════════════════════════════════════
// Session encoding / storage fit
// ═════════════════════════════════════════════════════════════════════════════

#[test] fn session_round_trip_encoding() {
    let (cs, cards) = get_test_data();
    let s = start_game(&cs, &cards, 42);
    assert_eq!(s, ArenaSession::decode(&mut &s.encode()[..]).unwrap());
}
#[test] fn session_fits_storage_initial() {
    let (cs, cards) = get_test_data();
    let size = start_game(&cs, &cards, 42).encode().len();
    assert!(size <= 416, "Initial: {size} bytes > 416");
}
#[test] fn session_fits_storage_full_board() {
    let (cs, cards) = get_test_data();
    let mut s = start_game(&cs, &cards, 42);
    s.board = (0..5).map(|i| Some(BoardUnit { card_id: CardId(10 + i), perm_attack: 10, perm_health: 15 })).collect();
    s.bag = s.bag[..5].to_vec();
    let size = s.encode().len();
    assert!(size <= 416, "Full board: {size} bytes > 416");
}
#[test] fn card_set_storage_sizes() {
    let sets = sets::get_all();
    let metas = sets::get_all_metas();
    for (i, set) in sets.iter().enumerate() { println!("Set '{}': {} bytes", metas[i].name, set.encode().len()); }
    assert!(sets[0].encode().len() <= 416, "Primary set must fit");
}
#[test] fn session_fits_at_every_bag_size() {
    for n in 0..=50u8 {
        let s = ArenaSession {
            bag: vec![CardId(10); n as usize], hand: vec![CardId(10); 5.min(50 - n as usize)],
            board: vec![Some(BoardUnit { card_id: CardId(10), perm_attack: 99, perm_health: 99 }); 5],
            mana_limit: 10, shop_mana: 10, round: 10, lives: 3, wins: 9,
            phase: PHASE_SHOP, next_card_id: 2000, game_seed: u64::MAX,
        };
        let size = s.encode().len();
        assert!(size <= 416, "bag={n}: {size} bytes > 416");
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// Bag creation
// ═════════════════════════════════════════════════════════════════════════════

#[test] fn bag_correct_size() { let (cs, _) = get_test_data(); assert_eq!(create_starting_bag(&cs, 42, 50).len(), 50); }
#[test] fn bag_deterministic() { let (cs, _) = get_test_data(); assert_eq!(create_starting_bag(&cs, 42, 50), create_starting_bag(&cs, 42, 50)); }
#[test] fn bag_varies_with_seed() { let (cs, _) = get_test_data(); assert_ne!(create_starting_bag(&cs, 42, 50), create_starting_bag(&cs, 43, 50)); }
#[test] fn bag_only_draftable_cards() {
    let (cs, _) = get_test_data();
    let ok: Vec<CardId> = cs.cards.iter().filter(|e| e.rarity > 0).map(|e| e.card_id).collect();
    for id in create_starting_bag(&cs, 42, 50) { assert!(ok.contains(&id)); }
}
#[test] fn bag_matches_pallet() {
    let (cs, _) = get_test_data();
    for seed in [1, 42, 999, u64::MAX] {
        assert_eq!(create_starting_bag(&cs, seed, 50), oab_game::sealed::create_starting_bag(&cs, seed, 50), "seed {seed}");
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// Hand drawing
// ═════════════════════════════════════════════════════════════════════════════

#[test] fn hand_correct_size() { let (cs, c) = get_test_data(); let s = start_game(&cs, &c, 42); assert_eq!(s.hand.len(), 5); assert_eq!(s.bag.len(), 45); }
#[test] fn hand_deterministic() { let (cs, c) = get_test_data(); assert_eq!(start_game(&cs, &c, 42).hand, start_game(&cs, &c, 42).hand); }
#[test] fn hand_preserves_total() { let (cs, c) = get_test_data(); let s = start_game(&cs, &c, 42); assert_eq!(s.hand.len() + s.bag.len(), 50); }
#[test] fn hand_empty_bag() {
    let mut s = ArenaSession { bag: vec![], hand: vec![], board: vec![None; 5], mana_limit: 3, shop_mana: 0, round: 1, lives: 3, wins: 0, phase: PHASE_SHOP, next_card_id: 1000, game_seed: 42 };
    draw_hand(&mut s, 5); assert!(s.hand.is_empty());
}
#[test] fn hand_small_bag() {
    let mut s = ArenaSession { bag: vec![CardId(10), CardId(20)], hand: vec![], board: vec![None; 5], mana_limit: 3, shop_mana: 0, round: 1, lives: 3, wins: 0, phase: PHASE_SHOP, next_card_id: 1000, game_seed: 42 };
    draw_hand(&mut s, 5); assert_eq!(s.hand.len(), 2); assert!(s.bag.is_empty());
}
#[test] fn hand_indices_match_pallet() {
    for (n, s, r) in [(45, 42u64, 1u8), (40, 100, 3), (10, 7, 8), (3, 1, 1)] {
        assert_eq!(derive_hand_indices(n, s, r, 5), oab_game::derive_hand_indices_logic(n, s, r, 5));
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// Game initialization
// ═════════════════════════════════════════════════════════════════════════════

#[test] fn start_game_initial_state() {
    let (cs, c) = get_test_data(); let s = start_game(&cs, &c, 42);
    assert_eq!((s.round, s.lives, s.wins, s.mana_limit, s.phase), (1, 3, 0, 3, PHASE_SHOP));
    assert_eq!(s.hand.len(), 5); assert_eq!(s.bag.len(), 45);
    assert!(s.board.iter().all(|slot| slot.is_none()));
}
#[test] fn start_game_different_seeds() { let (cs, c) = get_test_data(); assert_ne!(start_game(&cs, &c, 1).hand, start_game(&cs, &c, 2).hand); }
#[test] fn start_game_all_sets() {
    let (all_sets, all_cards) = (sets::get_all(), cards::get_all());
    for (i, set) in all_sets.iter().enumerate() { let s = start_game(set, &all_cards, 42); assert_eq!((s.hand.len(), s.bag.len()), (5, 45), "set {i}"); }
}
#[test] fn mana_progression() { let c = default_config(); assert_eq!([c.mana_limit_for_round(1), c.mana_limit_for_round(2), c.mana_limit_for_round(5), c.mana_limit_for_round(8), c.mana_limit_for_round(100)], [3, 4, 7, 10, 10]); }

// ═════════════════════════════════════════════════════════════════════════════
// Turn verification
// ═════════════════════════════════════════════════════════════════════════════

fn make_shop(s: &ArenaSession, cs: &CardSet, cards: &[UnitCard]) -> ShopState {
    ShopState { card_pool: build_card_pool(cs, cards), set_id: 0, hand: s.hand.clone(), board: s.board.clone(), mana_limit: s.mana_limit, shop_mana: s.shop_mana, round: s.round, game_seed: s.game_seed }
}

#[test] fn empty_turn_valid() { let (cs, c) = get_test_data(); let s = start_game(&cs, &c, 42); let mut shop = make_shop(&s, &cs, &c); assert!(verify_and_apply_turn(&mut shop, &CommitTurnAction { actions: vec![] }).is_ok()); }
#[test] fn burn_gives_mana() { let (cs, c) = get_test_data(); let s = start_game(&cs, &c, 42); let mut shop = make_shop(&s, &cs, &c); verify_and_apply_turn(&mut shop, &CommitTurnAction { actions: vec![TurnAction::BurnFromHand { hand_index: 0 }] }).unwrap(); assert!(shop.shop_mana > 0); }
#[test] fn invalid_hand_index() { let (cs, c) = get_test_data(); let s = start_game(&cs, &c, 42); let mut shop = make_shop(&s, &cs, &c); assert!(verify_and_apply_turn(&mut shop, &CommitTurnAction { actions: vec![TurnAction::BurnFromHand { hand_index: 99 }] }).is_err()); }
#[test] fn invalid_board_slot() { let (cs, c) = get_test_data(); let s = start_game(&cs, &c, 42); let mut shop = make_shop(&s, &cs, &c); assert!(verify_and_apply_turn(&mut shop, &CommitTurnAction { actions: vec![TurnAction::PlayFromHand { hand_index: 0, board_slot: 99 }] }).is_err()); }

// ═════════════════════════════════════════════════════════════════════════════
// Full game flow
// ═════════════════════════════════════════════════════════════════════════════

#[test] fn turn_advances_round() {
    let (cs, c) = get_test_data(); let mut s = start_game(&cs, &c, 42);
    submit_turn(&mut s, &CommitTurnAction { actions: vec![] }, make_weak_enemy(), &c, &cs);
    if s.phase == PHASE_SHOP { assert_eq!(s.round, 2); assert_eq!(s.mana_limit, 4); assert_eq!(s.hand.len(), 5); }
}
#[test] fn victory_increments_wins() {
    let (cs, c) = get_test_data(); let mut s = start_game(&cs, &c, 42);
    s.board[0] = Some(BoardUnit { card_id: CardId(20), perm_attack: 0, perm_health: 0 });
    if submit_turn(&mut s, &CommitTurnAction { actions: vec![] }, make_weak_enemy(), &c, &cs) == BattleResult::Victory { assert_eq!(s.wins, 1); }
}
#[test] fn defeat_decrements_lives() {
    let (cs, c) = get_test_data(); let mut s = start_game(&cs, &c, 42);
    if submit_turn(&mut s, &CommitTurnAction { actions: vec![] }, make_strong_enemy(&c), &c, &cs) == BattleResult::Defeat { assert_eq!(s.lives, 2); }
}
#[test] fn game_ends_zero_lives() {
    let (cs, c) = get_test_data(); let mut s = start_game(&cs, &c, 42); s.lives = 1;
    if submit_turn(&mut s, &CommitTurnAction { actions: vec![] }, make_strong_enemy(&c), &c, &cs) == BattleResult::Defeat { assert_eq!((s.lives, s.phase), (0, PHASE_COMPLETED)); }
}
#[test] fn game_ends_ten_wins() {
    let (cs, c) = get_test_data(); let mut s = start_game(&cs, &c, 42);
    s.wins = 9; s.board[0] = Some(BoardUnit { card_id: CardId(20), perm_attack: 50, perm_health: 50 });
    if submit_turn(&mut s, &CommitTurnAction { actions: vec![] }, make_weak_enemy(), &c, &cs) == BattleResult::Victory { assert_eq!((s.wins, s.phase), (10, PHASE_COMPLETED)); }
}
#[test] fn multi_round_game() {
    let (cs, c) = get_test_data(); let mut s = start_game(&cs, &c, 42); let mut rounds = 0;
    for _ in 0..30 { if s.phase == PHASE_COMPLETED { break; } submit_turn(&mut s, &CommitTurnAction { actions: vec![] }, make_weak_enemy(), &c, &cs); rounds += 1; }
    assert!(rounds >= 3, "played {rounds}");
}

// ═════════════════════════════════════════════════════════════════════════════
// Battle determinism & CombatUnit encoding
// ═════════════════════════════════════════════════════════════════════════════

#[test] fn battle_deterministic() {
    let p = vec![CombatUnit::from_card(UnitCard::new(CardId(10), "A", 3, 5, 1, 1))];
    let e = vec![CombatUnit::from_card(UnitCard::new(CardId(20), "B", 2, 4, 1, 1))];
    let pool = BTreeMap::new();
    assert_eq!(resolve_battle(p.clone(), e.clone(), &mut XorShiftRng::seed_from_u64(42), &pool, 5).len(),
               resolve_battle(p, e, &mut XorShiftRng::seed_from_u64(42), &pool, 5).len());
}
#[test] fn combat_unit_round_trip() {
    let u = CombatUnit::from_card(UnitCard::new(CardId(42), "T", 5, 10, 3, 1));
    let d = CombatUnit::decode(&mut &u.encode()[..]).unwrap();
    assert_eq!((d.card_id, d.attack, d.health), (CardId(42), 5, 10));
}
#[test] fn combat_unit_abilities_round_trip() {
    let card = UnitCard::new(CardId(42), "S", 3, 5, 2, 1).with_battle_ability(Ability {
        trigger: AbilityTrigger::OnFaint, effect: AbilityEffect::SpawnUnit { card_id: CardId(100), spawn_location: SpawnLocation::DeathPosition },
        conditions: vec![], max_triggers: Some(1),
    });
    assert_eq!(CombatUnit::decode(&mut &CombatUnit::from_card(card).encode()[..]).unwrap().abilities.len(), 1);
}

// ═════════════════════════════════════════════════════════════════════════════
// Card pool
// ═════════════════════════════════════════════════════════════════════════════

#[test] fn pool_contains_all_set_cards() { let (cs, c) = get_test_data(); let p = build_card_pool(&cs, &c); for e in &cs.cards { assert!(p.contains_key(&e.card_id)); } }
#[test] fn pool_round_trip() { let (cs, c) = get_test_data(); let p = build_card_pool(&cs, &c); assert_eq!(p.len(), BTreeMap::<CardId, UnitCard>::decode(&mut &p.encode()[..]).unwrap().len()); }
#[test] fn all_cards_fit_calldata() { assert!(cards::get_all().encode().len() < 128 * 1024); }

} // mod tests
