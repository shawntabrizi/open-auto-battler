//! Sandbox mode for custom battles
//!
//! This module provides sandbox battle functionality for browser builds.

use alloc::string::String;
use alloc::vec::Vec;

use crate::battle::{resolve_battle, UnitId, UnitView};
use crate::engine::BattleOutput;
use crate::log;
use crate::rng::XorShiftRng;
use crate::types::{BoardUnit, UnitCard};
use crate::units::get_starter_templates;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

/// Unit template view for sandbox mode
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnitTemplateView {
    pub template_id: String,
    pub name: String,
    pub attack: i32,
    pub health: i32,
    pub play_cost: i32,
    pub pitch_value: i32,
    pub abilities: Vec<crate::types::Ability>,
}

/// Sandbox unit for custom battles
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
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

    let mut card_id = 1u32;
    let mut make_board_unit = |sandbox: &SandboxUnit| -> Option<BoardUnit> {
        let template = templates
            .iter()
            .find(|t| t.template_id == sandbox.template_id)?;
        let id = card_id;
        card_id += 1;
        let card = UnitCard::new(
            id,
            template.template_id,
            template.name,
            template.attack,
            template.health,
            template.play_cost,
            template.pitch_value,
        )
        .with_abilities(template.abilities.clone());
        Some(BoardUnit::from_card(card))
    };

    let player_board: Vec<BoardUnit> = player_sandbox
        .iter()
        .filter_map(|s| make_board_unit(s))
        .collect();
    let enemy_board: Vec<BoardUnit> = enemy_sandbox
        .iter()
        .filter_map(|s| make_board_unit(s))
        .collect();

    let mut rng = XorShiftRng::seed_from_u64(seed);
    let events = resolve_battle(&player_board, &enemy_board, &mut rng);

    let mut instance_counter = 0;
    let initial_player_units: Vec<UnitView> = player_board
        .iter()
        .map(|u| {
            instance_counter += 1;
            UnitView {
                instance_id: UnitId::player(instance_counter),
                template_id: u.card.template_id.clone(),
                name: u.card.name.clone(),
                attack: u.card.stats.attack,
                health: u.current_health,
                abilities: u.card.abilities.clone(),
            }
        })
        .collect();

    instance_counter = 0;
    let initial_enemy_units: Vec<UnitView> = enemy_board
        .iter()
        .map(|u| {
            instance_counter += 1;
            UnitView {
                instance_id: UnitId::enemy(instance_counter),
                template_id: u.card.template_id.clone(),
                name: u.card.name.clone(),
                attack: u.card.stats.attack,
                health: u.current_health,
                abilities: u.card.abilities.clone(),
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
