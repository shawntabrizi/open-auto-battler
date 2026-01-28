//! Sandbox mode for custom battles
//!
//! This module provides sandbox battle functionality for browser builds.

use std::string::String;
use std::vec::Vec;

use crate::engine::BattleOutput;
use manalimit_core::battle::{resolve_battle, UnitId, UnitView, CombatUnit};
use manalimit_core::log;
use manalimit_core::rng::XorShiftRng;
use manalimit_core::types::{UnitCard, CardId};
use manalimit_core::units::get_starter_templates;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

/// Unit template view for sandbox mode
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnitTemplateView {
    pub template_id: String,
    pub name: String,
    pub attack: i32,
    pub health: i32,
    pub play_cost: i32,
    pub pitch_value: i32,
    pub abilities: Vec<manalimit_core::types::Ability>,
    pub is_token: bool,
}

/// Sandbox unit for custom battles
#[derive(Debug, Clone, Deserialize)]
pub struct SandboxUnit {
    pub template_id: String,
}

/// Get all available unit templates for sandbox mode
#[wasm_bindgen]
pub fn get_unit_templates() -> JsValue {
    log::debug("get_unit_templates", "Fetching all unit templates");
    let templates: Vec<UnitTemplateView> = get_starter_templates()
        .into_iter()
        .map(|t| UnitTemplateView {
            template_id: String::from(t.template_id),
            name: String::from(t.name),
            attack: t.attack,
            health: t.health,
            play_cost: t.play_cost,
            pitch_value: t.pitch_value,
            abilities: t.abilities,
            is_token: t.is_token,
        })
        .collect();
    serde_wasm_bindgen::to_value(&templates).unwrap_or(JsValue::NULL)
}

/// Run a sandbox battle with custom player and enemy boards
#[wasm_bindgen]
pub fn run_sandbox_battle(player_units_js: JsValue, enemy_units_js: JsValue, seed: u64) -> JsValue {
    log::action("run_sandbox_battle", "Running custom battle");

    let player_sandbox: Vec<SandboxUnit> =
        serde_wasm_bindgen::from_value(player_units_js).unwrap_or_default();
    let enemy_sandbox: Vec<SandboxUnit> =
        serde_wasm_bindgen::from_value(enemy_units_js).unwrap_or_default();

    let templates = get_starter_templates();

    let mut card_id_counter = 1u32;
    let mut make_combat_unit = |sandbox: &SandboxUnit| -> Option<CombatUnit> {
        let template = templates
            .iter()
            .find(|t| t.template_id == sandbox.template_id)?;
        let id = card_id_counter;
        card_id_counter += 1;
        let card = UnitCard::new(
            CardId(id),
            template.template_id,
            template.name,
            template.attack,
            template.health,
            template.play_cost,
            template.pitch_value,
            template.is_token,
        )
        .with_abilities(template.abilities.clone());
        Some(CombatUnit::from_card(card))
    };

    let player_board: Vec<CombatUnit> = player_sandbox
        .iter()
        .filter_map(|s| make_combat_unit(s))
        .collect();
    let enemy_board: Vec<CombatUnit> = enemy_sandbox
        .iter()
        .filter_map(|s| make_combat_unit(s))
        .collect();

    let mut rng = XorShiftRng::seed_from_u64(seed);
    
    // We need to clone them because resolve_battle takes ownership
    let events = resolve_battle(player_board.clone(), enemy_board.clone(), &mut rng);

    let mut limits = manalimit_core::limits::BattleLimits::new();
    let initial_player_units: Vec<UnitView> = player_board
        .iter()
        .map(|u| {
            UnitView {
                instance_id: limits.generate_instance_id(manalimit_core::limits::Team::Player),
                template_id: u.template_id.clone(),
                name: u.name.clone(),
                attack: u.attack,
                health: u.health,
                abilities: u.abilities.clone(),
                is_token: u.is_token,
            }
        })
        .collect();

    limits.reset_phase_counters();
    let initial_enemy_units: Vec<UnitView> = enemy_board
        .iter()
        .map(|u| {
            UnitView {
                instance_id: limits.generate_instance_id(manalimit_core::limits::Team::Enemy),
                template_id: u.template_id.clone(),
                name: u.name.clone(),
                attack: u.attack,
                health: u.health,
                abilities: u.abilities.clone(),
                is_token: u.is_token,
            }
        })
        .collect();

    let output = BattleOutput {
        events,
        initial_player_units,
        initial_enemy_units,
    };

    serde_wasm_bindgen::to_value(&output).unwrap_or(JsValue::NULL)
}