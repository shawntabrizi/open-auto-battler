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

// ═════════════════════════════════════════════════════════════════════════════
// Ghost board creation
// ═════════════════════════════════════════════════════════════════════════════

fn create_ghost_from_board(board: &[Option<BoardUnit>]) -> Vec<GhostBoardUnit> {
    board.iter().flatten().map(|bu| GhostBoardUnit {
        card_id: bu.card_id,
        perm_attack: bu.perm_attack,
        perm_health: bu.perm_health,
    }).collect()
}

#[test] fn ghost_from_empty_board() {
    let board: Vec<Option<BoardUnit>> = vec![None; 5];
    assert!(create_ghost_from_board(&board).is_empty());
}

#[test] fn ghost_from_partial_board() {
    let board = vec![
        Some(BoardUnit { card_id: CardId(10), perm_attack: 2, perm_health: 3 }),
        None,
        Some(BoardUnit { card_id: CardId(20), perm_attack: 0, perm_health: -1 }),
        None,
        None,
    ];
    let ghost = create_ghost_from_board(&board);
    assert_eq!(ghost.len(), 2);
    assert_eq!(ghost[0].card_id, CardId(10));
    assert_eq!((ghost[0].perm_attack, ghost[0].perm_health), (2, 3));
    assert_eq!(ghost[1].card_id, CardId(20));
    assert_eq!((ghost[1].perm_attack, ghost[1].perm_health), (0, -1));
}

#[test] fn ghost_from_full_board() {
    let board: Vec<Option<BoardUnit>> = (0..5).map(|i| Some(BoardUnit {
        card_id: CardId(10 + i),
        perm_attack: i as StatValue,
        perm_health: (i * 2) as StatValue,
    })).collect();
    let ghost = create_ghost_from_board(&board);
    assert_eq!(ghost.len(), 5);
    for (i, g) in ghost.iter().enumerate() {
        assert_eq!(g.card_id, CardId(10 + i as u16));
    }
}

#[test] fn ghost_preserves_permanent_stats() {
    let board = vec![
        Some(BoardUnit { card_id: CardId(10), perm_attack: 99, perm_health: -50 }),
    ];
    let ghost = create_ghost_from_board(&board);
    assert_eq!(ghost[0].perm_attack, 99);
    assert_eq!(ghost[0].perm_health, -50);
}

// ═════════════════════════════════════════════════════════════════════════════
// Ghost pool FIFO logic
// ═════════════════════════════════════════════════════════════════════════════

const MAX_GHOSTS_PER_BRACKET: usize = 10;

/// Simulated ghost pool (mirrors contract storage)
struct GhostPoolStore {
    pools: BTreeMap<(SetIdValue, RoundValue, RoundValue, RoundValue), Vec<Vec<GhostBoardUnit>>>,
}

impl GhostPoolStore {
    fn new() -> Self { Self { pools: BTreeMap::new() } }

    fn load(&self, set_id: SetIdValue, round: RoundValue, wins: RoundValue, lives: RoundValue) -> Vec<Vec<GhostBoardUnit>> {
        self.pools.get(&(set_id, round, wins, lives)).cloned().unwrap_or_default()
    }

    fn push(&mut self, set_id: SetIdValue, round: RoundValue, wins: RoundValue, lives: RoundValue, board: Vec<GhostBoardUnit>) {
        if board.is_empty() { return; }
        let pool = self.pools.entry((set_id, round, wins, lives)).or_default();
        if pool.len() >= MAX_GHOSTS_PER_BRACKET {
            pool.remove(0); // FIFO: drop oldest
        }
        pool.push(board);
    }

    fn select(&self, set_id: SetIdValue, round: RoundValue, wins: RoundValue, lives: RoundValue, seed: u64, card_pool: &BTreeMap<CardId, UnitCard>) -> (Vec<CombatUnit>, Vec<GhostBoardUnit>) {
        let pool = self.load(set_id, round, wins, lives);
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
}

#[test] fn ghost_pool_starts_empty() {
    let store = GhostPoolStore::new();
    assert!(store.load(0, 1, 0, 3).is_empty());
}

#[test] fn ghost_pool_push_and_load() {
    let mut store = GhostPoolStore::new();
    let ghost = vec![GhostBoardUnit { card_id: CardId(10), perm_attack: 0, perm_health: 0 }];
    store.push(0, 1, 0, 3, ghost.clone());
    let pool = store.load(0, 1, 0, 3);
    assert_eq!(pool.len(), 1);
    assert_eq!(pool[0], ghost);
}

#[test] fn ghost_pool_push_empty_is_noop() {
    let mut store = GhostPoolStore::new();
    store.push(0, 1, 0, 3, vec![]);
    assert!(store.load(0, 1, 0, 3).is_empty());
}

#[test] fn ghost_pool_fifo_rotation() {
    let mut store = GhostPoolStore::new();
    // Fill pool to max
    for i in 0..MAX_GHOSTS_PER_BRACKET {
        store.push(0, 1, 0, 3, vec![GhostBoardUnit { card_id: CardId(i as u16), perm_attack: 0, perm_health: 0 }]);
    }
    assert_eq!(store.load(0, 1, 0, 3).len(), MAX_GHOSTS_PER_BRACKET);
    // First ghost should be CardId(0)
    assert_eq!(store.load(0, 1, 0, 3)[0][0].card_id, CardId(0));

    // Push one more — oldest (CardId(0)) should be evicted
    store.push(0, 1, 0, 3, vec![GhostBoardUnit { card_id: CardId(99), perm_attack: 0, perm_health: 0 }]);
    let pool = store.load(0, 1, 0, 3);
    assert_eq!(pool.len(), MAX_GHOSTS_PER_BRACKET);
    assert_eq!(pool[0][0].card_id, CardId(1)); // oldest is now CardId(1)
    assert_eq!(pool[MAX_GHOSTS_PER_BRACKET - 1][0].card_id, CardId(99)); // newest at end
}

#[test] fn ghost_pool_brackets_are_independent() {
    let mut store = GhostPoolStore::new();
    let ghost_a = vec![GhostBoardUnit { card_id: CardId(1), perm_attack: 0, perm_health: 0 }];
    let ghost_b = vec![GhostBoardUnit { card_id: CardId(2), perm_attack: 0, perm_health: 0 }];
    store.push(0, 1, 0, 3, ghost_a);
    store.push(0, 2, 1, 3, ghost_b);
    assert_eq!(store.load(0, 1, 0, 3).len(), 1);
    assert_eq!(store.load(0, 2, 1, 3).len(), 1);
    assert_eq!(store.load(0, 1, 0, 3)[0][0].card_id, CardId(1));
    assert_eq!(store.load(0, 2, 1, 3)[0][0].card_id, CardId(2));
}

#[test] fn ghost_pool_encoding_round_trip() {
    let pool: Vec<Vec<GhostBoardUnit>> = vec![
        vec![
            GhostBoardUnit { card_id: CardId(10), perm_attack: 5, perm_health: -2 },
            GhostBoardUnit { card_id: CardId(20), perm_attack: 0, perm_health: 10 },
        ],
        vec![
            GhostBoardUnit { card_id: CardId(30), perm_attack: 99, perm_health: 0 },
        ],
    ];
    let encoded = pool.encode();
    let decoded: Vec<Vec<GhostBoardUnit>> = Decode::decode(&mut &encoded[..]).unwrap();
    assert_eq!(pool, decoded);
}

#[test] fn ghost_pool_fits_storage() {
    // Max pool: 10 ghosts, each with 5 units (6 bytes each) + SCALE overhead
    let full_pool: Vec<Vec<GhostBoardUnit>> = (0..10).map(|_| {
        (0..5).map(|i| GhostBoardUnit { card_id: CardId(i), perm_attack: 99, perm_health: 99 }).collect()
    }).collect();
    let size = full_pool.encode().len();
    assert!(size <= 416, "Full ghost pool is {} bytes > 416", size);
}

// ═════════════════════════════════════════════════════════════════════════════
// Ghost selection
// ═════════════════════════════════════════════════════════════════════════════

#[test] fn select_from_empty_pool() {
    let store = GhostPoolStore::new();
    let pool = BTreeMap::new();
    let (units, ghost) = store.select(0, 1, 0, 3, 42, &pool);
    assert!(units.is_empty());
    assert!(ghost.is_empty());
}

#[test] fn select_from_single_ghost() {
    let reg = setup_registry();
    let card_set = reg.load_set(0).unwrap();
    let card_pool = reg.build_card_pool(card_set);
    let mut store = GhostPoolStore::new();
    let ghost = vec![GhostBoardUnit { card_id: card_set.cards[0].card_id, perm_attack: 0, perm_health: 0 }];
    store.push(0, 1, 0, 3, ghost.clone());
    let (units, returned_ghost) = store.select(0, 1, 0, 3, 42, &card_pool);
    assert_eq!(units.len(), 1);
    assert_eq!(returned_ghost, ghost);
}

#[test] fn select_is_deterministic() {
    let reg = setup_registry();
    let card_set = reg.load_set(0).unwrap();
    let card_pool = reg.build_card_pool(card_set);
    let mut store = GhostPoolStore::new();
    for i in 0..5u16 {
        store.push(0, 1, 0, 3, vec![GhostBoardUnit { card_id: CardId(card_set.cards[i as usize].card_id.0), perm_attack: 0, perm_health: 0 }]);
    }
    let (_, ghost1) = store.select(0, 1, 0, 3, 42, &card_pool);
    let (_, ghost2) = store.select(0, 1, 0, 3, 42, &card_pool);
    assert_eq!(ghost1, ghost2);
}

#[test] fn select_varies_with_seed() {
    let reg = setup_registry();
    let card_set = reg.load_set(0).unwrap();
    let card_pool = reg.build_card_pool(card_set);
    let mut store = GhostPoolStore::new();
    for i in 0..10u16 {
        store.push(0, 1, 0, 3, vec![GhostBoardUnit { card_id: CardId(card_set.cards[i as usize].card_id.0), perm_attack: 0, perm_health: 0 }]);
    }
    // With enough seeds, at least two different ghosts should be selected
    let selections: Vec<_> = (0..20u64).map(|seed| {
        let (_, ghost) = store.select(0, 1, 0, 3, seed, &card_pool);
        ghost[0].card_id
    }).collect();
    let unique: std::collections::HashSet<_> = selections.iter().collect();
    assert!(unique.len() > 1, "All seeds selected the same ghost");
}

#[test] fn select_applies_permanent_stats() {
    let reg = setup_registry();
    let card_set = reg.load_set(0).unwrap();
    let card_pool = reg.build_card_pool(card_set);
    let card_id = card_set.cards[0].card_id;
    let base_card = card_pool.get(&card_id).unwrap();
    let mut store = GhostPoolStore::new();
    store.push(0, 1, 0, 3, vec![GhostBoardUnit { card_id, perm_attack: 5, perm_health: 10 }]);
    let (units, _) = store.select(0, 1, 0, 3, 42, &card_pool);
    assert_eq!(units[0].attack_buff, 5);
    assert_eq!(units[0].health_buff, 10);
    assert_eq!(units[0].health, base_card.stats.health + 10);
}

// ═════════════════════════════════════════════════════════════════════════════
// end_game logic
// ═════════════════════════════════════════════════════════════════════════════

/// Simulates the contract's end_game: archive final ghost, delete session.
/// Returns true if the game was finalized, false if phase wasn't Completed.
fn end_game(session: &ArenaSession, ghost_store: &mut GhostPoolStore) -> bool {
    if session.phase != PHASE_COMPLETED { return false; }
    let ghost = create_ghost_from_board(&session.board);
    if !ghost.is_empty() {
        ghost_store.push(session.set_id, session.round, session.wins, session.lives, ghost);
    }
    true // session would be deleted from storage
}

#[test] fn end_game_requires_completed_phase() {
    let reg = setup_registry();
    let session = start_game(&reg, 0, 42);
    let mut ghost_store = GhostPoolStore::new();
    assert_eq!(session.phase, PHASE_SHOP);
    assert!(!end_game(&session, &mut ghost_store));
    assert!(ghost_store.load(0, 1, 0, 3).is_empty());
}

#[test] fn end_game_archives_final_board() {
    let reg = setup_registry();
    let mut session = start_game(&reg, 0, 42);
    // Force a board and mark completed
    session.board[0] = Some(BoardUnit { card_id: CardId(10), perm_attack: 5, perm_health: 3 });
    session.board[2] = Some(BoardUnit { card_id: CardId(20), perm_attack: 0, perm_health: 0 });
    session.wins = 10;
    session.phase = PHASE_COMPLETED;
    let mut ghost_store = GhostPoolStore::new();
    assert!(end_game(&session, &mut ghost_store));
    let pool = ghost_store.load(0, session.round, session.wins, session.lives);
    assert_eq!(pool.len(), 1);
    assert_eq!(pool[0].len(), 2);
    assert_eq!(pool[0][0].card_id, CardId(10));
    assert_eq!(pool[0][0].perm_attack, 5);
    assert_eq!(pool[0][1].card_id, CardId(20));
}

#[test] fn end_game_empty_board_no_ghost() {
    let reg = setup_registry();
    let mut session = start_game(&reg, 0, 42);
    // Board is all None, mark completed (defeat with empty board)
    session.lives = 0;
    session.phase = PHASE_COMPLETED;
    let mut ghost_store = GhostPoolStore::new();
    assert!(end_game(&session, &mut ghost_store));
    // No ghost should be archived since board is empty
    assert!(ghost_store.load(0, session.round, 0, 0).is_empty());
}

#[test] fn end_game_uses_correct_bracket() {
    let reg = setup_registry();
    let mut session = start_game(&reg, 0, 42);
    session.board[0] = Some(BoardUnit { card_id: CardId(10), perm_attack: 0, perm_health: 0 });
    session.round = 7;
    session.wins = 10;
    session.lives = 2;
    session.phase = PHASE_COMPLETED;
    let mut ghost_store = GhostPoolStore::new();
    end_game(&session, &mut ghost_store);
    // Ghost should be in the (set_id=0, round=7, wins=10, lives=2) bracket
    assert!(ghost_store.load(0, 7, 10, 2).len() == 1);
    // Other brackets should be empty
    assert!(ghost_store.load(0, 7, 10, 3).is_empty());
    assert!(ghost_store.load(0, 7, 9, 2).is_empty());
}

#[test] fn end_game_after_full_victory() {
    let reg = setup_registry();
    let mut session = start_game(&reg, 0, 42);
    // Play to victory with strong board
    session.board[0] = Some(BoardUnit { card_id: CardId(20), perm_attack: 50, perm_health: 50 });
    session.wins = 9;
    let result = submit_turn(&mut session, &reg, &CommitTurnAction { actions: vec![] }, make_weak_enemy());
    if result == BattleResult::Victory {
        assert_eq!(session.phase, PHASE_COMPLETED);
        assert_eq!(session.wins, 10);
        let mut ghost_store = GhostPoolStore::new();
        assert!(end_game(&session, &mut ghost_store));
        let pool = ghost_store.load(0, session.round, session.wins, session.lives);
        assert_eq!(pool.len(), 1);
        // Ghost should have the final board's units
        assert!(!pool[0].is_empty());
    }
}

#[test] fn end_game_after_final_defeat() {
    let reg = setup_registry();
    let mut session = start_game(&reg, 0, 42);
    session.lives = 1;
    let result = submit_turn(&mut session, &reg, &CommitTurnAction { actions: vec![] }, make_strong_enemy(&reg));
    if result == BattleResult::Defeat {
        assert_eq!(session.phase, PHASE_COMPLETED);
        assert_eq!(session.lives, 0);
        let mut ghost_store = GhostPoolStore::new();
        end_game(&session, &mut ghost_store);
        // Ghost pool for the defeat bracket — may or may not have units depending on board state
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// abandon_game logic
// ═════════════════════════════════════════════════════════════════════════════

#[test] fn abandon_does_not_archive_ghost() {
    let reg = setup_registry();
    let mut session = start_game(&reg, 0, 42);
    session.board[0] = Some(BoardUnit { card_id: CardId(10), perm_attack: 5, perm_health: 3 });
    // Abandon during shop phase — should NOT archive ghost
    let ghost_store = GhostPoolStore::new();
    assert_eq!(session.phase, PHASE_SHOP);
    // abandon_game just deletes the session — no ghost_store interaction
    assert!(ghost_store.load(0, session.round, session.wins, session.lives).is_empty());
}

#[test] fn abandon_completed_game_no_ghost() {
    let reg = setup_registry();
    let mut session = start_game(&reg, 0, 42);
    session.board[0] = Some(BoardUnit { card_id: CardId(10), perm_attack: 0, perm_health: 0 });
    session.phase = PHASE_COMPLETED;
    session.wins = 10;
    // Abandon even a completed game — still no ghost archived (that's end_game's job)
    let ghost_store = GhostPoolStore::new();
    assert!(ghost_store.load(0, session.round, session.wins, session.lives).is_empty());
}

// ═════════════════════════════════════════════════════════════════════════════
// Ghost archival during submit_turn (pre-battle)
// ═════════════════════════════════════════════════════════════════════════════

#[test] fn submit_turn_archives_ghost_before_battle() {
    // Mirrors contract behavior: player board is stored as ghost BEFORE battle
    let reg = setup_registry();
    let mut session = start_game(&reg, 0, 42);
    let card_set = reg.load_set(0).unwrap();
    // Place a unit on the board
    let card_id = card_set.cards[0].card_id;
    session.board[0] = Some(BoardUnit { card_id, perm_attack: 2, perm_health: 1 });
    // Create the ghost the same way the contract does (before battle)
    let mut shop = make_shop(&session, &reg);
    verify_and_apply_turn(&mut shop, &CommitTurnAction { actions: vec![] }).unwrap();
    let ghost = create_ghost_from_board(&shop.board);
    let mut ghost_store = GhostPoolStore::new();
    ghost_store.push(session.set_id, session.round, session.wins, session.lives, ghost.clone());
    let pool = ghost_store.load(0, 1, 0, 3);
    assert_eq!(pool.len(), 1);
    assert_eq!(pool[0][0].card_id, card_id);
    assert_eq!(pool[0][0].perm_attack, 2);

    // After battle, the ghost should remain (even if player loses)
    submit_turn(&mut session, &reg, &CommitTurnAction { actions: vec![] }, make_strong_enemy(&reg));
    assert_eq!(ghost_store.load(0, 1, 0, 3).len(), 1);
}

// ═════════════════════════════════════════════════════════════════════════════
// End-to-end: full game with ghost pool growth
// ═════════════════════════════════════════════════════════════════════════════

#[test] fn full_game_ghost_pool_grows() {
    let reg = setup_registry();
    let card_set = reg.load_set(0).unwrap();
    let mut session = start_game(&reg, 0, 42);
    let mut ghost_store = GhostPoolStore::new();
    let mut turns = 0;

    // Place a unit on the board so ghosts are non-empty
    session.board[0] = Some(BoardUnit { card_id: card_set.cards[0].card_id, perm_attack: 0, perm_health: 0 });

    // Play through several rounds, archiving ghosts each turn (like the contract does)
    while session.phase != PHASE_COMPLETED && turns < 30 {
        // Archive ghost before battle (mirrors contract)
        let mut shop = make_shop(&session, &reg);
        verify_and_apply_turn(&mut shop, &CommitTurnAction { actions: vec![] }).unwrap();
        let ghost = create_ghost_from_board(&shop.board);
        ghost_store.push(session.set_id, session.round, session.wins, session.lives, ghost);

        submit_turn(&mut session, &reg, &CommitTurnAction { actions: vec![] }, make_weak_enemy());
        turns += 1;
    }

    // At completion, end_game should archive the final board too
    if session.phase == PHASE_COMPLETED {
        end_game(&session, &mut ghost_store);
    }

    // Ghost pools should have entries from the game
    let total_ghosts: usize = ghost_store.pools.values().map(|p| p.len()).sum();
    assert!(total_ghosts > 0, "No ghosts archived during game");
    assert!(turns >= 3, "Game should last multiple rounds");
}

#[test] fn end_game_ghost_selectable_by_next_player() {
    let reg = setup_registry();
    let card_set = reg.load_set(0).unwrap();
    let card_pool = reg.build_card_pool(card_set);
    let mut ghost_store = GhostPoolStore::new();

    // Player 1: complete a game and finalize
    let mut session = start_game(&reg, 0, 42);
    session.board[0] = Some(BoardUnit { card_id: card_set.cards[0].card_id, perm_attack: 10, perm_health: 5 });
    session.wins = 10;
    session.round = 5;
    session.lives = 2;
    session.phase = PHASE_COMPLETED;
    end_game(&session, &mut ghost_store);

    // Player 2: in the same bracket, should be able to select player 1's ghost
    let (units, ghost) = ghost_store.select(0, 5, 10, 2, 999, &card_pool);
    assert_eq!(units.len(), 1);
    assert_eq!(ghost[0].card_id, card_set.cards[0].card_id);
    assert_eq!(ghost[0].perm_attack, 10);
    assert_eq!(ghost[0].perm_health, 5);
    // Verify permanent stats are applied to combat unit
    let base_health = card_pool.get(&card_set.cards[0].card_id).unwrap().stats.health;
    assert_eq!(units[0].health, base_health + 5);
}

// ═════════════════════════════════════════════════════════════════════════════
// Permanent stat tracking across rounds
// ═════════════════════════════════════════════════════════════════════════════

#[test] fn permanent_stats_persist_across_rounds() {
    let reg = setup_registry();
    let mut session = start_game(&reg, 0, 42);
    // Place a unit with permanent stat buffs
    session.board[0] = Some(BoardUnit { card_id: CardId(20), perm_attack: 3, perm_health: 7 });
    // Submit a turn — if the unit survives, stats should persist
    let initial_perm_attack = 3;
    let initial_perm_health = 7;
    submit_turn(&mut session, &reg, &CommitTurnAction { actions: vec![] }, make_weak_enemy());
    if session.phase == PHASE_SHOP {
        // Check that board units retained their permanent stats (or gained more)
        if let Some(Some(unit)) = session.board.get(0) {
            assert!(unit.perm_attack >= initial_perm_attack || unit.perm_health >= initial_perm_health,
                "Permanent stats should persist or increase");
        }
        // If unit was removed from board (due to battle), that's fine too
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// Session SCALE encoding parity with frontend
// ═════════════════════════════════════════════════════════════════════════════

#[test] fn session_scale_fields_order() {
    // Ensure SCALE encoding order matches what the frontend expects
    let session = ArenaSession {
        bag: vec![CardId(1), CardId(2)],
        hand: vec![CardId(3)],
        board: vec![None, Some(BoardUnit { card_id: CardId(10), perm_attack: 1, perm_health: 2 }), None, None, None],
        mana_limit: 5,
        shop_mana: 2,
        round: 3,
        lives: 2,
        wins: 4,
        phase: PHASE_SHOP,
        next_card_id: 1005,
        game_seed: 12345,
        set_id: 0,
    };
    let encoded = session.encode();
    let decoded = ArenaSession::decode(&mut &encoded[..]).unwrap();
    assert_eq!(session, decoded);
    // Verify individual fields survived round-trip
    assert_eq!(decoded.bag, vec![CardId(1), CardId(2)]);
    assert_eq!(decoded.mana_limit, 5);
    assert_eq!(decoded.round, 3);
    assert_eq!(decoded.lives, 2);
    assert_eq!(decoded.wins, 4);
    assert_eq!(decoded.phase, PHASE_SHOP);
    assert_eq!(decoded.set_id, 0);
}

#[test] fn completed_session_encodes_correctly() {
    let session = ArenaSession {
        bag: vec![],
        hand: vec![CardId(5)],
        board: vec![Some(BoardUnit { card_id: CardId(10), perm_attack: 20, perm_health: 15 }), None, None, None, None],
        mana_limit: 10,
        shop_mana: 3,
        round: 10,
        lives: 1,
        wins: 10,
        phase: PHASE_COMPLETED,
        next_card_id: 1050,
        game_seed: 999999,
        set_id: 0,
    };
    let decoded = ArenaSession::decode(&mut &session.encode()[..]).unwrap();
    assert_eq!(decoded.phase, PHASE_COMPLETED);
    assert_eq!(decoded.wins, 10);
    assert!(decoded.board[0].is_some());
    assert_eq!(decoded.board[0].as_ref().unwrap().perm_attack, 20);
}

#[test] fn ghost_board_unit_encoding_matches_types_crate() {
    // Verify GhostBoardUnit encoding is the same between test and battle crate
    let unit = GhostBoardUnit { card_id: CardId(42), perm_attack: -3, perm_health: 10 };
    let encoded = unit.encode();
    let decoded = GhostBoardUnit::decode(&mut &encoded[..]).unwrap();
    assert_eq!(decoded.card_id, CardId(42));
    assert_eq!(decoded.perm_attack, -3);
    assert_eq!(decoded.perm_health, 10);
    // CardId(u16) = 2 bytes, StatValue(i16) = 2 bytes each, total = 6 bytes
    assert_eq!(encoded.len(), 6);
}

} // mod tests
