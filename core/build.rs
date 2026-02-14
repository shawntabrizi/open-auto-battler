//! Build script: reads /cards/cards.json and /cards/sets.json and generates
//! Rust source code that statically constructs all card data.
//! This lets the core crate embed card data without any runtime JSON parsing,
//! keeping it fully no_std compatible.

use serde::Deserialize;
use std::env;
use std::fs;
use std::path::Path;

// ── JSON schema types (build-time only) ──────────────────────────────────────

#[derive(Deserialize)]
struct JsonCard {
    id: u32,
    name: String,
    emoji: String,
    stats: JsonStats,
    economy: JsonEconomy,
    #[serde(default)]
    abilities: Vec<JsonAbility>,
}

#[derive(Deserialize)]
struct JsonStats {
    attack: i32,
    health: i32,
}

#[derive(Deserialize)]
struct JsonEconomy {
    play_cost: i32,
    pitch_value: i32,
}

#[derive(Deserialize)]
struct JsonAbility {
    trigger: String,
    effect: JsonEffect,
    name: String,
    description: String,
    #[serde(default)]
    conditions: Vec<serde_json::Value>,
    max_triggers: Option<u32>,
}

#[derive(Deserialize)]
struct JsonEffect {
    #[serde(rename = "type")]
    effect_type: String,
    // SpawnUnit
    card_id: Option<u32>,
    // Damage
    amount: Option<i32>,
    // ModifyStats
    health: Option<i32>,
    attack: Option<i32>,
    // Damage, ModifyStats, Destroy
    target: Option<JsonTarget>,
}

#[derive(Deserialize)]
struct JsonTarget {
    #[serde(rename = "type")]
    target_type: String,
    #[serde(default)]
    data: serde_json::Value,
}

#[derive(Deserialize)]
struct JsonSetEntry {
    card_id: u32,
    rarity: u32,
}

#[derive(Deserialize)]
struct JsonSet {
    #[allow(dead_code)]
    id: u32,
    #[allow(dead_code)]
    name: String,
    cards: Vec<JsonSetEntry>,
}

// ── Code generation helpers ──────────────────────────────────────────────────

fn gen_trigger(trigger: &str) -> String {
    // Trigger names in JSON match Rust variant names exactly
    format!("AbilityTrigger::{trigger}")
}

fn gen_target(target: &JsonTarget) -> String {
    match target.target_type.as_str() {
        "All" => {
            let scope = target.data["scope"].as_str().unwrap();
            format!("AbilityTarget::All {{ scope: TargetScope::{scope} }}")
        }
        "Position" => {
            let scope = target.data["scope"].as_str().unwrap();
            let index = target.data["index"].as_i64().unwrap();
            format!("AbilityTarget::Position {{ scope: TargetScope::{scope}, index: {index} }}")
        }
        "Random" => {
            let scope = target.data["scope"].as_str().unwrap();
            let count = target.data["count"].as_u64().unwrap();
            format!("AbilityTarget::Random {{ scope: TargetScope::{scope}, count: {count} }}")
        }
        "Standard" => {
            let scope = target.data["scope"].as_str().unwrap();
            let stat = target.data["stat"].as_str().unwrap();
            let order = target.data["order"].as_str().unwrap();
            let count = target.data["count"].as_u64().unwrap();
            format!(
                "AbilityTarget::Standard {{ scope: TargetScope::{scope}, stat: StatType::{stat}, order: SortOrder::{order}, count: {count} }}"
            )
        }
        "Adjacent" => {
            let scope = target.data["scope"].as_str().unwrap();
            format!("AbilityTarget::Adjacent {{ scope: TargetScope::{scope} }}")
        }
        other => panic!("Unknown target type: {other}"),
    }
}

fn gen_effect(effect: &JsonEffect) -> String {
    match effect.effect_type.as_str() {
        "GainMana" => {
            let amount = effect.amount.unwrap();
            format!("AbilityEffect::GainMana {{ amount: {amount} }}")
        }
        "SpawnUnit" => {
            let card_id = effect.card_id.unwrap();
            format!("AbilityEffect::SpawnUnit {{ card_id: CardId({card_id}) }}")
        }
        "Damage" => {
            let amount = effect.amount.unwrap();
            let target = gen_target(effect.target.as_ref().unwrap());
            format!("AbilityEffect::Damage {{ amount: {amount}, target: {target} }}")
        }
        "ModifyStats" => {
            let health = effect.health.unwrap();
            let attack = effect.attack.unwrap();
            let target = gen_target(effect.target.as_ref().unwrap());
            format!(
                "AbilityEffect::ModifyStats {{ health: {health}, attack: {attack}, target: {target} }}"
            )
        }
        "Destroy" => {
            let target = gen_target(effect.target.as_ref().unwrap());
            format!("AbilityEffect::Destroy {{ target: {target} }}")
        }
        other => panic!("Unknown effect type: {other}"),
    }
}

fn gen_matcher(val: &serde_json::Value) -> String {
    let mtype = val["type"].as_str().unwrap();
    let data = &val["data"];
    match mtype {
        "StatValueCompare" => {
            let scope = data["scope"].as_str().unwrap();
            let stat = data["stat"].as_str().unwrap();
            let op = data["op"].as_str().unwrap();
            let value = data["value"].as_i64().unwrap();
            format!(
                "Matcher::StatValueCompare {{ scope: TargetScope::{scope}, stat: StatType::{stat}, op: CompareOp::{op}, value: {value} }}"
            )
        }
        "UnitCount" => {
            let scope = data["scope"].as_str().unwrap();
            let op = data["op"].as_str().unwrap();
            let value = data["value"].as_i64().unwrap();
            format!(
                "Matcher::UnitCount {{ scope: TargetScope::{scope}, op: CompareOp::{op}, value: {value} }}"
            )
        }
        "StatStatCompare" => {
            let source_stat = data["source_stat"].as_str().unwrap();
            let op = data["op"].as_str().unwrap();
            let target_scope = data["target_scope"].as_str().unwrap();
            let target_stat = data["target_stat"].as_str().unwrap();
            format!(
                "Matcher::StatStatCompare {{ source_stat: StatType::{source_stat}, op: CompareOp::{op}, target_scope: TargetScope::{target_scope}, target_stat: StatType::{target_stat} }}"
            )
        }
        other => panic!("Unknown matcher type: {other}"),
    }
}

fn gen_condition(val: &serde_json::Value) -> String {
    let ctype = val["type"].as_str().unwrap();
    match ctype {
        "Is" => {
            let matcher = gen_matcher(&val["data"]);
            format!("Condition::Is({matcher})")
        }
        "AnyOf" => {
            let matchers: Vec<String> = val["data"]
                .as_array()
                .unwrap()
                .iter()
                .map(gen_matcher)
                .collect();
            format!("Condition::AnyOf(vec![{}])", matchers.join(", "))
        }
        other => panic!("Unknown condition type: {other}"),
    }
}

fn gen_ability(ability: &JsonAbility) -> String {
    let trigger = gen_trigger(&ability.trigger);
    let effect = gen_effect(&ability.effect);
    let name = &ability.name;
    let desc = &ability.description;
    let conditions: Vec<String> = ability.conditions.iter().map(gen_condition).collect();
    let conditions_str = if conditions.is_empty() {
        "vec![]".to_string()
    } else {
        format!("vec![{}]", conditions.join(", "))
    };
    let max_triggers = match ability.max_triggers {
        Some(n) => format!("Some({n})"),
        None => "None".to_string(),
    };

    format!(
        r#"Ability {{
                    trigger: {trigger},
                    effect: {effect},
                    name: String::from("{name}"),
                    description: String::from("{desc}"),
                    conditions: {conditions_str},
                    max_triggers: {max_triggers},
                }}"#
    )
}

fn gen_card(card: &JsonCard) -> String {
    let id = card.id;
    let name = &card.name;
    let atk = card.stats.attack;
    let hp = card.stats.health;
    let cost = card.economy.play_cost;
    let pitch = card.economy.pitch_value;

    let abilities: Vec<String> = card.abilities.iter().map(gen_ability).collect();
    let abilities_str = if abilities.is_empty() {
        "vec![]".to_string()
    } else {
        format!(
            "vec![\n                {}\n            ]",
            abilities.join(",\n                ")
        )
    };

    format!(
        r#"        UnitCard {{
            id: CardId({id}),
            name: String::from("{name}"),
            stats: UnitStats {{ attack: {atk}, health: {hp} }},
            economy: EconomyStats {{ play_cost: {cost}, pitch_value: {pitch} }},
            abilities: {abilities_str},
        }}"#
    )
}

// ── Main ─────────────────────────────────────────────────────────────────────

fn main() {
    let manifest_dir = env::var("CARGO_MANIFEST_DIR").unwrap();
    let cards_path = Path::new(&manifest_dir).join("../cards/cards.json");
    let sets_path = Path::new(&manifest_dir).join("../cards/sets.json");

    // Tell Cargo to re-run if JSON files change
    println!("cargo:rerun-if-changed={}", cards_path.display());
    println!("cargo:rerun-if-changed={}", sets_path.display());

    let cards_json = fs::read_to_string(&cards_path)
        .unwrap_or_else(|e| panic!("Failed to read {}: {e}", cards_path.display()));
    let sets_json = fs::read_to_string(&sets_path)
        .unwrap_or_else(|e| panic!("Failed to read {}: {e}", sets_path.display()));

    let cards: Vec<JsonCard> =
        serde_json::from_str(&cards_json).expect("Failed to parse cards.json");
    let sets: Vec<JsonSet> = serde_json::from_str(&sets_json).expect("Failed to parse sets.json");

    // ── Generate cards ───────────────────────────────────────────────────────
    let card_entries: Vec<String> = cards.iter().map(gen_card).collect();

    // ── Generate card metas ──────────────────────────────────────────────────
    let meta_entries: Vec<String> = cards
        .iter()
        .map(|c| {
            let id = c.id;
            let name = &c.name;
            let emoji = &c.emoji;
            format!(r#"        CardMeta {{ id: {id}, name: "{name}", emoji: "{emoji}" }}"#)
        })
        .collect();

    // ── Generate sets ────────────────────────────────────────────────────────
    let set_entries: Vec<String> = sets
        .iter()
        .map(|s| {
            let entries: Vec<String> = s
                .cards
                .iter()
                .map(|e| {
                    let cid = e.card_id;
                    let r = e.rarity;
                    format!("CardSetEntry {{ card_id: CardId({cid}), rarity: {r} }}")
                })
                .collect();
            format!(
                "        CardSet {{\n            cards: vec![\n                {}\n            ],\n        }}",
                entries.join(",\n                ")
            )
        })
        .collect();

    // ── Write output ─────────────────────────────────────────────────────────
    let out_dir = env::var("OUT_DIR").unwrap();
    let dest = Path::new(&out_dir).join("cards_generated.rs");

    let generated = format!(
        r#"// Auto-generated from cards.json and sets.json — DO NOT EDIT
use alloc::string::String;
use alloc::vec;
use alloc::vec::Vec;
use alloc::collections::BTreeMap;
use crate::types::*;
use crate::state::{{CardSet, CardSetEntry}};

/// Card metadata (name, emoji) — not used in game logic.
#[derive(serde::Serialize)]
pub struct CardMeta {{
    pub id: u32,
    pub name: &'static str,
    pub emoji: &'static str,
}}

/// Returns all cards defined in cards.json.
pub fn get_all_cards() -> Vec<UnitCard> {{
    vec![
{}
    ]
}}

/// Returns metadata (id, name, emoji) for every card.
pub fn get_all_card_metas() -> Vec<CardMeta> {{
    vec![
{}
    ]
}}

/// Returns all card sets defined in sets.json.
pub fn get_all_sets() -> Vec<CardSet> {{
    vec![
{}
    ]
}}

/// Build a CardId → UnitCard lookup map from the static card data.
pub fn build_card_pool() -> BTreeMap<CardId, UnitCard> {{
    get_all_cards().into_iter().map(|c| (c.id, c)).collect()
}}
"#,
        card_entries.join(",\n"),
        meta_entries.join(",\n"),
        set_entries.join(",\n"),
    );

    fs::write(&dest, generated).expect("Failed to write generated cards file");
}
