use oab_core::battle::{
    player_permanent_stat_deltas_from_events, player_shop_mana_delta_from_events, resolve_battle,
    BattleResult, CombatEvent, CombatUnit,
};
use oab_core::cards::{build_card_pool, get_all_sets};
use oab_core::commit::{apply_shop_start_triggers, verify_and_apply_turn};
use oab_core::rng::XorShiftRng;
use oab_core::state::{GamePhase, GameState};

use crate::analytics::{extract_survivors, RoundSnapshot, RunResult};
use crate::config::GameConfig;
use crate::strategy::{self, StrategyKind};

fn board_to_combat_units(state: &GameState) -> (Vec<CombatUnit>, Vec<usize>) {
    let mut slots = Vec::new();
    let units: Vec<CombatUnit> = state
        .board
        .iter()
        .enumerate()
        .filter_map(|(slot, unit)| {
            let u = unit.as_ref()?;
            slots.push(slot);
            let card = state.card_pool.get(&u.card_id)?;
            let mut cu = CombatUnit::from_card(card.clone());
            cu.attack_buff = u.perm_attack;
            cu.health_buff = u.perm_health;
            cu.health = cu.health.saturating_add(u.perm_health).max(0);
            Some(cu)
        })
        .collect();
    (units, slots)
}

fn encounter_to_combat_units(
    encounter: &crate::config::Encounter,
    state: &GameState,
) -> Vec<CombatUnit> {
    encounter
        .board
        .iter()
        .filter_map(|slot| {
            let u = slot.as_ref()?;
            let card = state.card_pool.get(&u.card_id)?;
            let mut cu = CombatUnit::from_card(card.clone());
            cu.attack_buff = u.perm_attack;
            cu.health_buff = u.perm_health;
            cu.health = cu.health.saturating_add(u.perm_health).max(0);
            Some(cu)
        })
        .collect()
}

fn apply_permanent_deltas(
    state: &mut GameState,
    player_slots: &[usize],
    deltas: &std::collections::BTreeMap<oab_core::battle::UnitId, (i32, i32)>,
) {
    for (unit_id, (attack_delta, health_delta)) in deltas {
        let unit_index = unit_id.raw() as usize;
        if unit_index == 0 || unit_index > player_slots.len() {
            continue;
        }
        let slot = player_slots[unit_index - 1];

        // Apply deltas first
        if let Some(board_unit) = state.board.get_mut(slot).and_then(|s| s.as_mut()) {
            board_unit.perm_attack = board_unit.perm_attack.saturating_add(*attack_delta);
            board_unit.perm_health = board_unit.perm_health.saturating_add(*health_delta);
        }

        // Check if unit should be removed (separate borrow scope)
        let should_remove = state.board.get(slot).and_then(|s| s.as_ref()).map(|board_unit| {
            state
                .card_pool
                .get(&board_unit.card_id)
                .map(|card| card.stats.health.saturating_add(board_unit.perm_health) <= 0)
                .unwrap_or(false)
        }).unwrap_or(false);

        if should_remove {
            state.board[slot] = None;
        }
    }
}

pub fn simulate_run(
    run_seed: u64,
    strategy: StrategyKind,
    config: &dyn GameConfig,
) -> RunResult {
    let card_pool = build_card_pool();
    let sets = get_all_sets();
    let card_set = &sets[config.set_index()];

    let mut state = GameState::new(run_seed);
    state.card_pool = card_pool;
    state.set_id = config.set_index() as u32;
    state.local_state.bag = oab_core::units::create_starting_bag(card_set, run_seed);
    state.local_state.lives = config.starting_lives();
    // Set initial mana (matching WASM engine new_run behavior)
    state.local_state.shop_mana = state.mana_limit;
    state.draw_hand();
    apply_shop_start_triggers(&mut state);

    let mut rounds = Vec::new();

    loop {
        if state.lives <= 0
            || state.wins >= config.wins_to_victory()
            || state.round > config.max_rounds()
        {
            break;
        }

        // Record hand before playing
        let hand_card_ids: Vec<u32> = state.hand.iter().map(|c| c.0).collect();
        let mana_available = state.shop_mana;

        // Strategy plans the turn
        let turn = strategy::plan_turn(
            &state,
            strategy,
            run_seed.wrapping_add(state.round as u64 * 31),
        );
        let cards_played = turn
            .actions
            .iter()
            .filter(|a| matches!(a, oab_core::types::TurnAction::PlayFromHand { .. }))
            .count();

        // Apply turn
        let _ = verify_and_apply_turn(&mut state, &turn);

        let mana_spent = mana_available - state.shop_mana.max(0);

        // Build combat units from board
        let (player_units, player_slots) = board_to_combat_units(&state);
        let player_board_ids: Vec<u32> = state
            .board
            .iter()
            .filter_map(|s| s.as_ref().map(|u| u.card_id.0))
            .collect();

        if player_units.is_empty() {
            // No units — auto-loss
            rounds.push(RoundSnapshot {
                round: state.round,
                hand_card_ids,
                cards_played: 0,
                mana_spent: 0,
                mana_available,
                player_board: vec![],
                enemy_encounter_name: "none",
                battle_result: BattleResult::Defeat,
                surviving_player_cards: vec![],
            });
            state.lives -= 1;
            advance_round(&mut state, config);
            continue;
        }

        // Pick encounter + build enemy units
        let encounter = config.pick_encounter(state.round, run_seed);
        let enemy_units = encounter_to_combat_units(encounter, &state);

        // Resolve battle
        let battle_seed = run_seed.wrapping_add(state.round as u64 * 997);
        let mut rng = XorShiftRng::seed_from_u64(battle_seed);
        state.shop_mana = 0;
        state.phase = GamePhase::Battle;
        let events = resolve_battle(player_units, enemy_units, &mut rng, &state.card_pool);

        // Extract result
        let result = events
            .iter()
            .rev()
            .find_map(|e| {
                if let CombatEvent::BattleEnd { result } = e {
                    Some(result.clone())
                } else {
                    None
                }
            })
            .unwrap_or(BattleResult::Draw);

        match &result {
            BattleResult::Victory => state.wins += 1,
            BattleResult::Defeat => state.lives -= 1,
            BattleResult::Draw => {}
        }

        // Apply permanent stat deltas and mana carry
        let carried_mana = player_shop_mana_delta_from_events(&events).max(0);
        state.shop_mana = carried_mana;
        let deltas = player_permanent_stat_deltas_from_events(&events);
        apply_permanent_deltas(&mut state, &player_slots, &deltas);

        // Extract survivors
        let surviving = extract_survivors(&events, &state);

        rounds.push(RoundSnapshot {
            round: state.round,
            hand_card_ids,
            cards_played,
            mana_spent,
            mana_available,
            player_board: player_board_ids,
            enemy_encounter_name: encounter.name,
            battle_result: result,
            surviving_player_cards: surviving,
        });

        advance_round(&mut state, config);
    }

    RunResult {
        seed: run_seed,
        won: state.wins >= config.wins_to_victory(),
        rounds_survived: rounds.len(),
        final_wins: state.wins,
        final_lives: state.lives,
        rounds,
    }
}

fn advance_round(state: &mut GameState, _config: &dyn GameConfig) {
    state.round += 1;
    state.mana_limit = state.calculate_mana_limit();
    // Set mana to at least mana_limit (carried mana can exceed if battle granted extra)
    state.shop_mana = state.shop_mana.max(state.mana_limit);
    state.phase = GamePhase::Shop;
    state.draw_hand();
    apply_shop_start_triggers(state);
}
