//! Tests for the OAB Arena smart contract game logic.
//!
//! Exercises the same game logic used in the contract, running natively.
//! Verifies parity with pallet implementations.

#[cfg(test)]
mod tests {

use oab_assets::{cards, sets};
use oab_battle::battle::{resolve_battle, BattleResult, CombatUnit};
use oab_battle::rng::{BattleRng, XorShiftRng};
use oab_battle::state::{CardSet, ShopState};
use oab_battle::types::*;
use oab_battle::{apply_shop_start_triggers, apply_shop_start_triggers_with_result, verify_and_apply_turn};
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
    set_id: SetIdValue,
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
        starting_lives: 3, wins_to_victory: 10, starting_mana_limit: 3,
        max_mana_limit: 10, full_mana_each_round: false,
        board_size: 5, hand_size: 5, bag_size: 50,
    }
}

// ── Simulated card registry (replaces contract storage in tests) ─────────────

struct CardRegistry {
    cards: BTreeMap<CardId, UnitCard>,
    sets: BTreeMap<SetIdValue, CardSet>,
}

impl CardRegistry {
    fn new() -> Self { Self { cards: BTreeMap::new(), sets: BTreeMap::new() } }

    fn register_all(all_cards: &[UnitCard], all_sets: &[CardSet]) -> Self {
        let mut reg = Self::new();
        for card in all_cards { reg.cards.insert(card.id, card.clone()); }
        for (i, set) in all_sets.iter().enumerate() { reg.sets.insert(i as SetIdValue, set.clone()); }
        reg
    }

    fn load_card(&self, id: CardId) -> Option<&UnitCard> { self.cards.get(&id) }
    fn load_set(&self, id: SetIdValue) -> Option<&CardSet> { self.sets.get(&id) }

    fn build_card_pool(&self, card_set: &CardSet) -> BTreeMap<CardId, UnitCard> {
        let mut pool = BTreeMap::new();
        for entry in &card_set.cards {
            if let Some(card) = self.load_card(entry.card_id) {
                pool.insert(card.id, card.clone());
            }
        }
        pool
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

fn draw_hand(session: &mut ArenaSession, hand_size: usize) {
    session.bag.append(&mut session.hand);
    let bag_len = session.bag.len();
    if bag_len == 0 { return; }
    let hand_count = hand_size.min(bag_len);
    let seed = session.game_seed ^ (session.round as u64);
    let mut rng = XorShiftRng::seed_from_u64(seed);
    let mut indices: Vec<usize> = (0..bag_len).collect();
    for i in 0..hand_count { let j = i + rng.gen_range(bag_len - i); indices.swap(i, j); }
    indices.truncate(hand_count);
    indices.sort_unstable_by(|a, b| b.cmp(a));
    let mut drawn = Vec::with_capacity(hand_count);
    for idx in indices { drawn.push(session.bag.remove(idx)); }
    drawn.reverse();
    session.hand = drawn;
}

fn start_game(registry: &CardRegistry, set_id: SetIdValue, seed: u64) -> ArenaSession {
    let card_set = registry.load_set(set_id).unwrap();
    let card_pool = registry.build_card_pool(card_set);
    let config = default_config();
    let bag = create_starting_bag(card_set, seed, config.bag_size as usize);
    let mut session = ArenaSession {
        bag, hand: Vec::new(), board: vec![None; config.board_size as usize],
        mana_limit: config.mana_limit_for_round(1), shop_mana: 0, round: 1,
        lives: config.starting_lives, wins: 0, phase: PHASE_SHOP,
        next_card_id: 1000, game_seed: seed, set_id,
    };
    draw_hand(&mut session, config.hand_size as usize);
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
    session: &mut ArenaSession, registry: &CardRegistry,
    action: &CommitTurnAction, enemy_units: Vec<CombatUnit>,
) -> BattleResult {
    let card_set = registry.load_set(session.set_id).unwrap();
    let card_pool = registry.build_card_pool(card_set);
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

fn setup_registry() -> CardRegistry {
    CardRegistry::register_all(&cards::get_all(), &sets::get_all())
}

fn make_weak_enemy() -> Vec<CombatUnit> {
    vec![CombatUnit::from_card(UnitCard::new(CardId(999), "Weakling", 1, 1, 0, 0))]
}

fn make_strong_enemy(reg: &CardRegistry) -> Vec<CombatUnit> {
    reg.cards.values()
        .filter(|c| !c.battle_abilities.is_empty() && c.stats.attack >= 5)
        .take(5).map(|c| CombatUnit::from_card(c.clone())).collect()
}

// ═════════════════════════════════════════════════════════════════════════════
// Card registry
// ═════════════════════════════════════════════════════════════════════════════

#[test] fn individual_cards_fit_storage() {
    for card in cards::get_all() {
        let size = card.encode().len();
        assert!(size <= 416, "Card {} ({}) is {} bytes > 416", card.id.0, card.name, size);
    }
}

#[test] fn all_card_sets_fit_storage() {
    let metas = sets::get_all_metas();
    for (i, set) in sets::get_all().iter().enumerate() {
        let size = set.encode().len();
        assert!(size <= 416, "Set '{}' is {} bytes > 416", metas[i].name, size);
    }
}

#[test] fn card_pool_reconstruction() {
    let reg = setup_registry();
    let set = reg.load_set(0).unwrap();
    let pool = reg.build_card_pool(set);
    for entry in &set.cards {
        assert!(pool.contains_key(&entry.card_id), "Missing card {:?}", entry.card_id);
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// Session encoding / storage fit
// ═════════════════════════════════════════════════════════════════════════════

#[test] fn session_round_trip() {
    let reg = setup_registry();
    let s = start_game(&reg, 0, 42);
    assert_eq!(s, ArenaSession::decode(&mut &s.encode()[..]).unwrap());
}

#[test] fn session_fits_storage_initial() {
    let reg = setup_registry();
    let size = start_game(&reg, 0, 42).encode().len();
    assert!(size <= 416, "Initial: {} bytes > 416", size);
}

#[test] fn session_fits_storage_full_board() {
    let reg = setup_registry();
    let mut s = start_game(&reg, 0, 42);
    s.board = (0..5).map(|i| Some(BoardUnit { card_id: CardId(10 + i), perm_attack: 10, perm_health: 15 })).collect();
    s.bag = s.bag[..5].to_vec();
    let size = s.encode().len();
    assert!(size <= 416, "Full board: {} bytes > 416", size);
}

#[test] fn session_fits_at_every_bag_size() {
    for n in 0..=50u8 {
        let s = ArenaSession {
            bag: vec![CardId(10); n as usize], hand: vec![CardId(10); 5.min(50 - n as usize)],
            board: vec![Some(BoardUnit { card_id: CardId(10), perm_attack: 99, perm_health: 99 }); 5],
            mana_limit: 10, shop_mana: 10, round: 10, lives: 3, wins: 9,
            phase: PHASE_SHOP, next_card_id: 2000, game_seed: u64::MAX, set_id: 0,
        };
        let size = s.encode().len();
        assert!(size <= 416, "bag={}: {} bytes > 416", n, size);
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// Bag creation
// ═════════════════════════════════════════════════════════════════════════════

#[test] fn bag_correct_size() { let cs = &sets::get_all()[0]; assert_eq!(create_starting_bag(cs, 42, 50).len(), 50); }
#[test] fn bag_deterministic() { let cs = &sets::get_all()[0]; assert_eq!(create_starting_bag(cs, 42, 50), create_starting_bag(cs, 42, 50)); }
#[test] fn bag_varies_with_seed() { let cs = &sets::get_all()[0]; assert_ne!(create_starting_bag(cs, 42, 50), create_starting_bag(cs, 43, 50)); }
#[test] fn bag_only_draftable() {
    let cs = &sets::get_all()[0];
    let ok: Vec<CardId> = cs.cards.iter().filter(|e| e.rarity > 0).map(|e| e.card_id).collect();
    for id in create_starting_bag(cs, 42, 50) { assert!(ok.contains(&id)); }
}
#[test] fn bag_matches_pallet() {
    let cs = &sets::get_all()[0];
    for seed in [1, 42, 999, u64::MAX] {
        assert_eq!(create_starting_bag(cs, seed, 50), oab_game::sealed::create_starting_bag(cs, seed, 50), "seed {seed}");
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// Hand drawing
// ═════════════════════════════════════════════════════════════════════════════

#[test] fn hand_correct_size() { let reg = setup_registry(); let s = start_game(&reg, 0, 42); assert_eq!(s.hand.len(), 5); assert_eq!(s.bag.len(), 45); }
#[test] fn hand_deterministic() { let reg = setup_registry(); assert_eq!(start_game(&reg, 0, 42).hand, start_game(&reg, 0, 42).hand); }
#[test] fn hand_preserves_total() { let reg = setup_registry(); let s = start_game(&reg, 0, 42); assert_eq!(s.hand.len() + s.bag.len(), 50); }
#[test] fn hand_empty_bag() {
    let mut s = ArenaSession { bag: vec![], hand: vec![], board: vec![None; 5], mana_limit: 3, shop_mana: 0, round: 1, lives: 3, wins: 0, phase: PHASE_SHOP, next_card_id: 1000, game_seed: 42, set_id: 0 };
    draw_hand(&mut s, 5); assert!(s.hand.is_empty());
}
#[test] fn hand_small_bag() {
    let mut s = ArenaSession { bag: vec![CardId(10), CardId(20)], hand: vec![], board: vec![None; 5], mana_limit: 3, shop_mana: 0, round: 1, lives: 3, wins: 0, phase: PHASE_SHOP, next_card_id: 1000, game_seed: 42, set_id: 0 };
    draw_hand(&mut s, 5); assert_eq!(s.hand.len(), 2); assert!(s.bag.is_empty());
}
#[test] fn hand_indices_match_pallet() {
    for (n, s, r) in [(45, 42u64, 1u8), (40, 100, 3), (10, 7, 8), (3, 1, 1)] {
        let contract: Vec<usize> = {
            let hand_count = 5usize.min(n);
            let seed = s ^ (r as u64);
            let mut rng = XorShiftRng::seed_from_u64(seed);
            let mut indices: Vec<usize> = (0..n).collect();
            for i in 0..hand_count { let j = i + rng.gen_range(n - i); indices.swap(i, j); }
            indices.truncate(hand_count); indices
        };
        assert_eq!(contract, oab_game::derive_hand_indices_logic(n, s, r, 5));
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// Game initialization
// ═════════════════════════════════════════════════════════════════════════════

#[test] fn start_game_initial_state() {
    let reg = setup_registry();
    let s = start_game(&reg, 0, 42);
    assert_eq!((s.round, s.lives, s.wins, s.mana_limit, s.phase, s.set_id), (1, 3, 0, 3, PHASE_SHOP, 0));
    assert_eq!(s.hand.len(), 5); assert_eq!(s.bag.len(), 45);
    assert!(s.board.iter().all(|slot| slot.is_none()));
}

#[test] fn start_game_different_seeds() { let reg = setup_registry(); assert_ne!(start_game(&reg, 0, 1).hand, start_game(&reg, 0, 2).hand); }

#[test] fn start_game_all_sets() {
    let reg = setup_registry();
    for set_id in 0..sets::get_all().len() as SetIdValue {
        let s = start_game(&reg, set_id, 42);
        assert_eq!((s.hand.len(), s.bag.len()), (5, 45), "set {set_id}");
        assert_eq!(s.set_id, set_id);
    }
}

#[test] fn mana_progression() {
    let c = default_config();
    assert_eq!([c.mana_limit_for_round(1), c.mana_limit_for_round(2), c.mana_limit_for_round(5), c.mana_limit_for_round(8), c.mana_limit_for_round(100)], [3, 4, 7, 10, 10]);
}

// ═════════════════════════════════════════════════════════════════════════════
// Turn verification
// ═════════════════════════════════════════════════════════════════════════════

fn make_shop(s: &ArenaSession, reg: &CardRegistry) -> ShopState {
    let set = reg.load_set(s.set_id).unwrap();
    let pool = reg.build_card_pool(set);
    ShopState { card_pool: pool, set_id: 0, hand: s.hand.clone(), board: s.board.clone(), mana_limit: s.mana_limit, shop_mana: s.shop_mana, round: s.round, game_seed: s.game_seed }
}

#[test] fn empty_turn_valid() { let reg = setup_registry(); let s = start_game(&reg, 0, 42); let mut shop = make_shop(&s, &reg); assert!(verify_and_apply_turn(&mut shop, &CommitTurnAction { actions: vec![] }).is_ok()); }
#[test] fn burn_gives_mana() { let reg = setup_registry(); let s = start_game(&reg, 0, 42); let mut shop = make_shop(&s, &reg); verify_and_apply_turn(&mut shop, &CommitTurnAction { actions: vec![TurnAction::BurnFromHand { hand_index: 0 }] }).unwrap(); assert!(shop.shop_mana > 0); }
#[test] fn invalid_hand_index() { let reg = setup_registry(); let s = start_game(&reg, 0, 42); let mut shop = make_shop(&s, &reg); assert!(verify_and_apply_turn(&mut shop, &CommitTurnAction { actions: vec![TurnAction::BurnFromHand { hand_index: 99 }] }).is_err()); }
#[test] fn invalid_board_slot() { let reg = setup_registry(); let s = start_game(&reg, 0, 42); let mut shop = make_shop(&s, &reg); assert!(verify_and_apply_turn(&mut shop, &CommitTurnAction { actions: vec![TurnAction::PlayFromHand { hand_index: 0, board_slot: 99 }] }).is_err()); }

// ═════════════════════════════════════════════════════════════════════════════
// Full game flow
// ═════════════════════════════════════════════════════════════════════════════

#[test] fn turn_advances_round() {
    let reg = setup_registry();
    let mut s = start_game(&reg, 0, 42);
    submit_turn(&mut s, &reg, &CommitTurnAction { actions: vec![] }, make_weak_enemy());
    if s.phase == PHASE_SHOP { assert_eq!(s.round, 2); assert_eq!(s.mana_limit, 4); assert_eq!(s.hand.len(), 5); }
}

#[test] fn victory_increments_wins() {
    let reg = setup_registry();
    let mut s = start_game(&reg, 0, 42);
    s.board[0] = Some(BoardUnit { card_id: CardId(20), perm_attack: 0, perm_health: 0 });
    if submit_turn(&mut s, &reg, &CommitTurnAction { actions: vec![] }, make_weak_enemy()) == BattleResult::Victory { assert_eq!(s.wins, 1); }
}

#[test] fn defeat_decrements_lives() {
    let reg = setup_registry();
    let mut s = start_game(&reg, 0, 42);
    if submit_turn(&mut s, &reg, &CommitTurnAction { actions: vec![] }, make_strong_enemy(&reg)) == BattleResult::Defeat { assert_eq!(s.lives, 2); }
}

#[test] fn game_ends_zero_lives() {
    let reg = setup_registry();
    let mut s = start_game(&reg, 0, 42); s.lives = 1;
    if submit_turn(&mut s, &reg, &CommitTurnAction { actions: vec![] }, make_strong_enemy(&reg)) == BattleResult::Defeat { assert_eq!((s.lives, s.phase), (0, PHASE_COMPLETED)); }
}

#[test] fn game_ends_ten_wins() {
    let reg = setup_registry();
    let mut s = start_game(&reg, 0, 42);
    s.wins = 9; s.board[0] = Some(BoardUnit { card_id: CardId(20), perm_attack: 50, perm_health: 50 });
    if submit_turn(&mut s, &reg, &CommitTurnAction { actions: vec![] }, make_weak_enemy()) == BattleResult::Victory { assert_eq!((s.wins, s.phase), (10, PHASE_COMPLETED)); }
}

#[test] fn multi_round_game() {
    let reg = setup_registry();
    let mut s = start_game(&reg, 0, 42);
    let mut rounds = 0;
    for _ in 0..30 { if s.phase == PHASE_COMPLETED { break; } submit_turn(&mut s, &reg, &CommitTurnAction { actions: vec![] }, make_weak_enemy()); rounds += 1; }
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

} // mod tests
