//! Sandbox mode for custom battles
//!
//! This module provides sandbox battle functionality for browser builds.

use std::vec::Vec;

use crate::engine::BattleOutput;
use oab_core::battle::{resolve_battle, CombatUnit, UnitView};
use oab_core::cards::build_card_pool;
use oab_core::log;
use oab_core::rng::XorShiftRng;
use oab_core::types::CardId;
use oab_core::view::CardView;
use serde::Deserialize;
use wasm_bindgen::prelude::*;

/// Sandbox unit for custom battles
#[derive(Debug, Clone, Deserialize)]
pub struct SandboxUnit {
    pub card_id: u32,
}

/// Get all available unit templates for sandbox mode
#[wasm_bindgen]
pub fn get_unit_templates() -> JsValue {
    log::debug("get_unit_templates", "Fetching all unit templates");
    let card_pool = build_card_pool();
    let views: Vec<CardView> = card_pool.values().map(CardView::from).collect();
    serde_wasm_bindgen::to_value(&views).unwrap_or(JsValue::NULL)
}

/// Run a sandbox battle with custom player and enemy boards
#[wasm_bindgen]
pub fn run_sandbox_battle(player_units_js: JsValue, enemy_units_js: JsValue, seed: u64) -> JsValue {
    log::action("run_sandbox_battle", "Running custom battle");

    let player_sandbox: Vec<SandboxUnit> =
        serde_wasm_bindgen::from_value(player_units_js).unwrap_or_default();
    let enemy_sandbox: Vec<SandboxUnit> =
        serde_wasm_bindgen::from_value(enemy_units_js).unwrap_or_default();

    let card_pool = build_card_pool();

    let make_combat_unit = |sandbox: &SandboxUnit| -> Option<CombatUnit> {
        let card = card_pool.get(&CardId(sandbox.card_id))?;
        Some(CombatUnit::from_card(card.clone()))
    };

    let player_board: Vec<CombatUnit> =
        player_sandbox.iter().filter_map(make_combat_unit).collect();
    let enemy_board: Vec<CombatUnit> = enemy_sandbox.iter().filter_map(make_combat_unit).collect();

    let mut rng = XorShiftRng::seed_from_u64(seed);

    let events = resolve_battle(
        player_board.clone(),
        enemy_board.clone(),
        &mut rng,
        &card_pool,
    );

    let mut limits = oab_core::limits::BattleLimits::new();
    let initial_player_units: Vec<UnitView> = player_board
        .iter()
        .map(|u| UnitView {
            instance_id: limits.generate_instance_id(oab_core::limits::Team::Player),
            card_id: u.card_id,
            name: u.name.clone(),
            attack: u.attack,
            health: u.health,
            statuses: u.active_statuses(),
            battle_abilities: u.abilities.clone(),
        })
        .collect();

    limits.reset_phase_counters();
    let initial_enemy_units: Vec<UnitView> = enemy_board
        .iter()
        .map(|u| UnitView {
            instance_id: limits.generate_instance_id(oab_core::limits::Team::Enemy),
            card_id: u.card_id,
            name: u.name.clone(),
            attack: u.attack,
            health: u.health,
            statuses: u.active_statuses(),
            battle_abilities: u.abilities.clone(),
        })
        .collect();

    let output = BattleOutput {
        events,
        initial_player_units,
        initial_enemy_units,
        round: 0, // Sandbox doesn't have rounds
    };

    serde_wasm_bindgen::to_value(&output).unwrap_or(JsValue::NULL)
}
