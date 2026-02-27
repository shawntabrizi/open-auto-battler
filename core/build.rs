//! Build script: reads /cards/cards.json and /cards/sets.json and generates
//! Rust source code that statically constructs all card data.
//! This lets the core crate embed card data without any runtime JSON parsing,
//! keeping it fully no_std compatible.

use serde::Deserialize;
use std::collections::BTreeSet;
use std::env;
use std::fs;
use std::path::Path;

// ── JSON schema types (build-time only) ──────────────────────────────────────

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct JsonCard {
    id: u32,
    name: String,
    emoji: String,
    stats: JsonStats,
    economy: JsonEconomy,
    #[serde(default)]
    base_statuses: Vec<String>,
    #[serde(default)]
    shop_abilities: Vec<JsonAbility>,
    #[serde(default)]
    battle_abilities: Vec<JsonAbility>,
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

#[derive(Deserialize, Clone)]
struct JsonAbility {
    trigger: String,
    effect: JsonEffect,
    name: String,
    description: String,
    #[serde(default)]
    conditions: Vec<serde_json::Value>,
    max_triggers: Option<u32>,
}

#[derive(Deserialize, Clone)]
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
    // Status-based effects
    status: Option<String>,
}

#[derive(Deserialize, Clone)]
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
    id: u32,
    #[allow(dead_code)]
    name: String,
    cards: Vec<JsonSetEntry>,
}

#[derive(Deserialize)]
struct JsonStyleItem {
    id: u32,
    #[serde(rename = "type")]
    item_type: String,
    name: String,
    cid: String,
}

#[derive(Deserialize)]
struct JsonStyleCollection {
    id: u32,
    name: String,
    items: Vec<JsonStyleItem>,
}

// ── Code generation helpers ──────────────────────────────────────────────────

#[derive(Clone, Copy, PartialEq, Eq)]
enum AbilityLane {
    Shop,
    Battle,
}

fn escape_rust_string(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

fn require_i32(value: Option<i32>, card_id: u32, ability_name: &str, field: &str) -> i32 {
    value.unwrap_or_else(|| {
        panic!("Card {card_id} ability '{ability_name}' missing required '{field}' field")
    })
}

fn require_target<'a>(
    value: &'a Option<JsonTarget>,
    card_id: u32,
    ability_name: &str,
    effect_type: &str,
) -> &'a JsonTarget {
    value.as_ref().unwrap_or_else(|| {
        panic!("Card {card_id} ability '{ability_name}' effect '{effect_type}' missing target")
    })
}

fn extract_scope(data: &serde_json::Value, card_id: u32, ability_name: &str) -> String {
    data["scope"]
        .as_str()
        .unwrap_or_else(|| {
            panic!("Card {card_id} ability '{ability_name}' target/matcher missing scope")
        })
        .to_string()
}

fn validate_status(status: &str, card_id: u32, ability_name: &str, context: &str) {
    match status {
        "Shield" | "Poison" | "Guard" => {}
        other => panic!(
            "Card {card_id} ability '{ability_name}' has unknown status '{other}' in {context}"
        ),
    }
}

fn require_status<'a>(
    value: &'a Option<String>,
    card_id: u32,
    ability_name: &str,
    effect_type: &str,
) -> &'a str {
    let status = value.as_deref().unwrap_or_else(|| {
        panic!("Card {card_id} ability '{ability_name}' effect '{effect_type}' missing status")
    });
    validate_status(status, card_id, ability_name, effect_type);
    status
}

fn validate_shop_scope(scope: &str, card_id: u32, ability_name: &str, context: &str) {
    match scope {
        "SelfUnit" | "Allies" | "All" | "AlliesOther" | "TriggerSource" => {}
        other => panic!(
            "Card {card_id} ability '{ability_name}' has shop-incompatible scope '{other}' in {context}"
        ),
    }
}

fn validate_target(
    target: &JsonTarget,
    lane: AbilityLane,
    card_id: u32,
    ability_name: &str,
    effect_type: &str,
) {
    match target.target_type.as_str() {
        "All" | "Position" | "Random" | "Standard" => {}
        "Adjacent" if lane == AbilityLane::Battle => {}
        "Adjacent" => panic!(
            "Card {card_id} ability '{ability_name}' effect '{effect_type}' uses shop-incompatible target Adjacent"
        ),
        other => panic!(
            "Card {card_id} ability '{ability_name}' effect '{effect_type}' has unknown target type '{other}'"
        ),
    }

    let scope = extract_scope(&target.data, card_id, ability_name);
    if lane == AbilityLane::Shop {
        validate_shop_scope(&scope, card_id, ability_name, "target");
    }
}

fn validate_matcher(
    matcher: &serde_json::Value,
    lane: AbilityLane,
    card_id: u32,
    ability_name: &str,
) {
    let matcher_type = matcher["type"].as_str().unwrap_or_else(|| {
        panic!("Card {card_id} ability '{ability_name}' has matcher missing 'type'")
    });
    let data = &matcher["data"];

    match matcher_type {
        "StatValueCompare" | "UnitCount" | "IsPosition" => {
            let scope = extract_scope(data, card_id, ability_name);
            if lane == AbilityLane::Shop {
                validate_shop_scope(&scope, card_id, ability_name, "matcher");
            }
        }
        "StatStatCompare" => {
            if lane == AbilityLane::Shop {
                panic!(
                    "Card {card_id} ability '{ability_name}' uses shop-incompatible matcher StatStatCompare"
                );
            }
            let target_scope = data["target_scope"].as_str().unwrap_or_else(|| {
                panic!(
                    "Card {card_id} ability '{ability_name}' StatStatCompare missing target_scope"
                )
            });
            if lane == AbilityLane::Shop {
                validate_shop_scope(target_scope, card_id, ability_name, "matcher");
            }
        }
        other => panic!("Card {card_id} ability '{ability_name}' has unknown matcher '{other}'"),
    }
}

fn validate_condition(
    condition: &serde_json::Value,
    lane: AbilityLane,
    card_id: u32,
    ability_name: &str,
) {
    let condition_type = condition["type"].as_str().unwrap_or_else(|| {
        panic!("Card {card_id} ability '{ability_name}' has condition missing 'type'")
    });
    match condition_type {
        "Is" => validate_matcher(&condition["data"], lane, card_id, ability_name),
        "AnyOf" => {
            for matcher in condition["data"].as_array().unwrap_or_else(|| {
                panic!("Card {card_id} ability '{ability_name}' AnyOf must be an array")
            }) {
                validate_matcher(matcher, lane, card_id, ability_name);
            }
        }
        other => {
            panic!("Card {card_id} ability '{ability_name}' has unknown condition type '{other}'")
        }
    }
}

fn normalize_shop_ability(
    card_id: u32,
    ability: JsonAbility,
    all_card_ids: &BTreeSet<u32>,
) -> JsonAbility {
    match ability.trigger.as_str() {
        "OnBuy" | "OnSell" | "OnShopStart" => {}
        other => panic!(
            "Card {card_id} ability '{}' uses shop lane with invalid trigger '{other}'",
            ability.name
        ),
    }

    if ability.effect.effect_type == "ModifyStats" {
        panic!(
            "Card {card_id} ability '{}' uses shop-incompatible effect ModifyStats",
            ability.name
        );
    }

    match ability.effect.effect_type.as_str() {
        "ModifyStatsPermanent" => {
            let _ = require_i32(ability.effect.health, card_id, &ability.name, "health");
            let _ = require_i32(ability.effect.attack, card_id, &ability.name, "attack");
            let target = require_target(
                &ability.effect.target,
                card_id,
                &ability.name,
                &ability.effect.effect_type,
            );
            validate_target(
                target,
                AbilityLane::Shop,
                card_id,
                &ability.name,
                &ability.effect.effect_type,
            );
        }
        "SpawnUnit" => {
            let spawn_id = ability.effect.card_id.unwrap_or_else(|| {
                panic!(
                    "Card {card_id} ability '{}' SpawnUnit missing card_id",
                    ability.name
                )
            });
            assert!(
                all_card_ids.contains(&spawn_id),
                "Card {} ability '{}' SpawnUnit references missing card_id {}",
                card_id,
                ability.name,
                spawn_id
            );
        }
        "Destroy" => {
            let target = require_target(
                &ability.effect.target,
                card_id,
                &ability.name,
                &ability.effect.effect_type,
            );
            validate_target(
                target,
                AbilityLane::Shop,
                card_id,
                &ability.name,
                &ability.effect.effect_type,
            );
        }
        "GainMana" => {
            let _ = require_i32(ability.effect.amount, card_id, &ability.name, "amount");
        }
        "GrantStatusPermanent" | "RemoveStatusPermanent" => {
            let _ = require_status(
                &ability.effect.status,
                card_id,
                &ability.name,
                &ability.effect.effect_type,
            );
            let target = require_target(
                &ability.effect.target,
                card_id,
                &ability.name,
                &ability.effect.effect_type,
            );
            validate_target(
                target,
                AbilityLane::Shop,
                card_id,
                &ability.name,
                &ability.effect.effect_type,
            );
        }
        other => panic!(
            "Card {card_id} ability '{}' uses shop-incompatible effect '{other}'",
            ability.name
        ),
    }

    for condition in &ability.conditions {
        validate_condition(condition, AbilityLane::Shop, card_id, &ability.name);
    }

    ability
}

fn normalize_battle_ability(
    card_id: u32,
    ability: JsonAbility,
    all_card_ids: &BTreeSet<u32>,
) -> JsonAbility {
    match ability.trigger.as_str() {
        "OnStart" | "OnFaint" | "OnAllyFaint" | "OnHurt" | "OnSpawn" | "OnAllySpawn"
        | "OnEnemySpawn" | "BeforeUnitAttack" | "AfterUnitAttack" | "BeforeAnyAttack"
        | "AfterAnyAttack" => {}
        "OnBuy" | "OnSell" | "OnShopStart" => panic!(
            "Card {card_id} ability '{}' uses battle lane with shop trigger '{}'",
            ability.name, ability.trigger
        ),
        _ => panic!(
            "Card {card_id} ability '{}' has unknown trigger '{}'",
            ability.name, ability.trigger
        ),
    }

    match ability.effect.effect_type.as_str() {
        "Damage" => {
            let _ = require_i32(ability.effect.amount, card_id, &ability.name, "amount");
            let target = require_target(
                &ability.effect.target,
                card_id,
                &ability.name,
                &ability.effect.effect_type,
            );
            validate_target(
                target,
                AbilityLane::Battle,
                card_id,
                &ability.name,
                &ability.effect.effect_type,
            );
        }
        "ModifyStats" | "ModifyStatsPermanent" => {
            let _ = require_i32(ability.effect.health, card_id, &ability.name, "health");
            let _ = require_i32(ability.effect.attack, card_id, &ability.name, "attack");
            let target = require_target(
                &ability.effect.target,
                card_id,
                &ability.name,
                &ability.effect.effect_type,
            );
            validate_target(
                target,
                AbilityLane::Battle,
                card_id,
                &ability.name,
                &ability.effect.effect_type,
            );
        }
        "Destroy" => {
            let target = require_target(
                &ability.effect.target,
                card_id,
                &ability.name,
                &ability.effect.effect_type,
            );
            validate_target(
                target,
                AbilityLane::Battle,
                card_id,
                &ability.name,
                &ability.effect.effect_type,
            );
        }
        "SpawnUnit" => {
            let spawn_id = ability.effect.card_id.unwrap_or_else(|| {
                panic!(
                    "Card {card_id} ability '{}' SpawnUnit missing card_id",
                    ability.name
                )
            });
            assert!(
                all_card_ids.contains(&spawn_id),
                "Card {} ability '{}' SpawnUnit references missing card_id {}",
                card_id,
                ability.name,
                spawn_id
            );
        }
        "GainMana" => {
            let _ = require_i32(ability.effect.amount, card_id, &ability.name, "amount");
        }
        "GrantStatusThisBattle" | "GrantStatusPermanent" | "RemoveStatusPermanent" => {
            let _ = require_status(
                &ability.effect.status,
                card_id,
                &ability.name,
                &ability.effect.effect_type,
            );
            let target = require_target(
                &ability.effect.target,
                card_id,
                &ability.name,
                &ability.effect.effect_type,
            );
            validate_target(
                target,
                AbilityLane::Battle,
                card_id,
                &ability.name,
                &ability.effect.effect_type,
            );
        }
        other => panic!(
            "Card {card_id} ability '{}' has unsupported battle effect '{other}'",
            ability.name
        ),
    }

    for condition in &ability.conditions {
        validate_condition(condition, AbilityLane::Battle, card_id, &ability.name);
    }

    ability
}

fn normalize_card_abilities(
    card: &JsonCard,
    all_card_ids: &BTreeSet<u32>,
) -> (Vec<JsonAbility>, Vec<JsonAbility>) {
    let shop = card
        .shop_abilities
        .iter()
        .cloned()
        .map(|ability| normalize_shop_ability(card.id, ability, all_card_ids))
        .collect();
    let battle = card
        .battle_abilities
        .iter()
        .cloned()
        .map(|ability| normalize_battle_ability(card.id, ability, all_card_ids))
        .collect();
    (shop, battle)
}

fn gen_battle_trigger(trigger: &str) -> String {
    format!("AbilityTrigger::{trigger}")
}

fn gen_shop_trigger(trigger: &str) -> String {
    format!("ShopTrigger::{trigger}")
}

fn gen_status(status: &str) -> String {
    format!("Status::{status}")
}

fn gen_battle_target(target: &JsonTarget) -> String {
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
        other => panic!("Unknown battle target type: {other}"),
    }
}

fn gen_shop_target(target: &JsonTarget) -> String {
    match target.target_type.as_str() {
        "All" => {
            let scope = target.data["scope"].as_str().unwrap();
            format!("ShopTarget::All {{ scope: ShopScope::{scope} }}")
        }
        "Position" => {
            let scope = target.data["scope"].as_str().unwrap();
            let index = target.data["index"].as_i64().unwrap();
            format!("ShopTarget::Position {{ scope: ShopScope::{scope}, index: {index} }}")
        }
        "Random" => {
            let scope = target.data["scope"].as_str().unwrap();
            let count = target.data["count"].as_u64().unwrap();
            format!("ShopTarget::Random {{ scope: ShopScope::{scope}, count: {count} }}")
        }
        "Standard" => {
            let scope = target.data["scope"].as_str().unwrap();
            let stat = target.data["stat"].as_str().unwrap();
            let order = target.data["order"].as_str().unwrap();
            let count = target.data["count"].as_u64().unwrap();
            format!(
                "ShopTarget::Standard {{ scope: ShopScope::{scope}, stat: StatType::{stat}, order: SortOrder::{order}, count: {count} }}"
            )
        }
        other => panic!("Unknown shop target type: {other}"),
    }
}

fn gen_battle_effect(effect: &JsonEffect) -> String {
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
            let target = gen_battle_target(effect.target.as_ref().unwrap());
            format!("AbilityEffect::Damage {{ amount: {amount}, target: {target} }}")
        }
        "ModifyStats" => {
            let health = effect.health.unwrap();
            let attack = effect.attack.unwrap();
            let target = gen_battle_target(effect.target.as_ref().unwrap());
            format!(
                "AbilityEffect::ModifyStats {{ health: {health}, attack: {attack}, target: {target} }}"
            )
        }
        "ModifyStatsPermanent" => {
            let health = effect.health.unwrap();
            let attack = effect.attack.unwrap();
            let target = gen_battle_target(effect.target.as_ref().unwrap());
            format!(
                "AbilityEffect::ModifyStatsPermanent {{ health: {health}, attack: {attack}, target: {target} }}"
            )
        }
        "Destroy" => {
            let target = gen_battle_target(effect.target.as_ref().unwrap());
            format!("AbilityEffect::Destroy {{ target: {target} }}")
        }
        "GrantStatusThisBattle" => {
            let status = gen_status(effect.status.as_deref().unwrap());
            let target = gen_battle_target(effect.target.as_ref().unwrap());
            format!("AbilityEffect::GrantStatusThisBattle {{ status: {status}, target: {target} }}")
        }
        "GrantStatusPermanent" => {
            let status = gen_status(effect.status.as_deref().unwrap());
            let target = gen_battle_target(effect.target.as_ref().unwrap());
            format!("AbilityEffect::GrantStatusPermanent {{ status: {status}, target: {target} }}")
        }
        "RemoveStatusPermanent" => {
            let status = gen_status(effect.status.as_deref().unwrap());
            let target = gen_battle_target(effect.target.as_ref().unwrap());
            format!("AbilityEffect::RemoveStatusPermanent {{ status: {status}, target: {target} }}")
        }
        other => panic!("Unknown battle effect type: {other}"),
    }
}

fn gen_shop_effect(effect: &JsonEffect) -> String {
    match effect.effect_type.as_str() {
        "GainMana" => {
            let amount = effect.amount.unwrap();
            format!("ShopEffect::GainMana {{ amount: {amount} }}")
        }
        "SpawnUnit" => {
            let card_id = effect.card_id.unwrap();
            format!("ShopEffect::SpawnUnit {{ card_id: CardId({card_id}) }}")
        }
        "ModifyStatsPermanent" => {
            let health = effect.health.unwrap();
            let attack = effect.attack.unwrap();
            let target = gen_shop_target(effect.target.as_ref().unwrap());
            format!(
                "ShopEffect::ModifyStatsPermanent {{ health: {health}, attack: {attack}, target: {target} }}"
            )
        }
        "Destroy" => {
            let target = gen_shop_target(effect.target.as_ref().unwrap());
            format!("ShopEffect::Destroy {{ target: {target} }}")
        }
        "GrantStatusPermanent" => {
            let status = gen_status(effect.status.as_deref().unwrap());
            let target = gen_shop_target(effect.target.as_ref().unwrap());
            format!("ShopEffect::GrantStatusPermanent {{ status: {status}, target: {target} }}")
        }
        "RemoveStatusPermanent" => {
            let status = gen_status(effect.status.as_deref().unwrap());
            let target = gen_shop_target(effect.target.as_ref().unwrap());
            format!("ShopEffect::RemoveStatusPermanent {{ status: {status}, target: {target} }}")
        }
        other => panic!("Unknown shop effect type: {other}"),
    }
}

fn gen_battle_matcher(val: &serde_json::Value) -> String {
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
        "IsPosition" => {
            let scope = data["scope"].as_str().unwrap();
            let index = data["index"].as_i64().unwrap();
            format!("Matcher::IsPosition {{ scope: TargetScope::{scope}, index: {index} }}")
        }
        other => panic!("Unknown battle matcher type: {other}"),
    }
}

fn gen_shop_matcher(val: &serde_json::Value) -> String {
    let mtype = val["type"].as_str().unwrap();
    let data = &val["data"];
    match mtype {
        "StatValueCompare" => {
            let scope = data["scope"].as_str().unwrap();
            let stat = data["stat"].as_str().unwrap();
            let op = data["op"].as_str().unwrap();
            let value = data["value"].as_i64().unwrap();
            format!(
                "ShopMatcher::StatValueCompare {{ scope: ShopScope::{scope}, stat: StatType::{stat}, op: CompareOp::{op}, value: {value} }}"
            )
        }
        "UnitCount" => {
            let scope = data["scope"].as_str().unwrap();
            let op = data["op"].as_str().unwrap();
            let value = data["value"].as_i64().unwrap();
            format!(
                "ShopMatcher::UnitCount {{ scope: ShopScope::{scope}, op: CompareOp::{op}, value: {value} }}"
            )
        }
        "IsPosition" => {
            let scope = data["scope"].as_str().unwrap();
            let index = data["index"].as_i64().unwrap();
            format!("ShopMatcher::IsPosition {{ scope: ShopScope::{scope}, index: {index} }}")
        }
        other => panic!("Unknown shop matcher type: {other}"),
    }
}

fn gen_battle_condition(val: &serde_json::Value) -> String {
    let ctype = val["type"].as_str().unwrap();
    match ctype {
        "Is" => {
            let matcher = gen_battle_matcher(&val["data"]);
            format!("Condition::Is({matcher})")
        }
        "AnyOf" => {
            let matchers: Vec<String> = val["data"]
                .as_array()
                .unwrap()
                .iter()
                .map(gen_battle_matcher)
                .collect();
            format!("Condition::AnyOf(vec![{}])", matchers.join(", "))
        }
        other => panic!("Unknown battle condition type: {other}"),
    }
}

fn gen_shop_condition(val: &serde_json::Value) -> String {
    let ctype = val["type"].as_str().unwrap();
    match ctype {
        "Is" => {
            let matcher = gen_shop_matcher(&val["data"]);
            format!("ShopCondition::Is({matcher})")
        }
        "AnyOf" => {
            let matchers: Vec<String> = val["data"]
                .as_array()
                .unwrap()
                .iter()
                .map(gen_shop_matcher)
                .collect();
            format!("ShopCondition::AnyOf(vec![{}])", matchers.join(", "))
        }
        other => panic!("Unknown shop condition type: {other}"),
    }
}

fn gen_battle_ability(ability: &JsonAbility) -> String {
    let trigger = gen_battle_trigger(&ability.trigger);
    let effect = gen_battle_effect(&ability.effect);
    let name = escape_rust_string(&ability.name);
    let desc = escape_rust_string(&ability.description);
    let conditions: Vec<String> = ability
        .conditions
        .iter()
        .map(gen_battle_condition)
        .collect();
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

fn gen_shop_ability(ability: &JsonAbility) -> String {
    let trigger = gen_shop_trigger(&ability.trigger);
    let effect = gen_shop_effect(&ability.effect);
    let name = escape_rust_string(&ability.name);
    let desc = escape_rust_string(&ability.description);
    let conditions: Vec<String> = ability.conditions.iter().map(gen_shop_condition).collect();
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
        r#"ShopAbility {{
                    trigger: {trigger},
                    effect: {effect},
                    name: String::from("{name}"),
                    description: String::from("{desc}"),
                    conditions: {conditions_str},
                    max_triggers: {max_triggers},
                }}"#
    )
}

fn gen_card(
    card: &JsonCard,
    shop_abilities: &[JsonAbility],
    battle_abilities: &[JsonAbility],
) -> String {
    let id = card.id;
    let name = escape_rust_string(&card.name);
    let atk = card.stats.attack;
    let hp = card.stats.health;
    let cost = card.economy.play_cost;
    let pitch = card.economy.pitch_value;
    let base_statuses_str = if card.base_statuses.is_empty() {
        "StatusMask::empty()".to_string()
    } else {
        let statuses = card
            .base_statuses
            .iter()
            .map(|k| gen_status(k))
            .collect::<Vec<_>>()
            .join(", ");
        format!("StatusMask::from_statuses(&[{statuses}])")
    };

    let shop_entries: Vec<String> = shop_abilities.iter().map(gen_shop_ability).collect();
    let shop_abilities_str = if shop_entries.is_empty() {
        "vec![]".to_string()
    } else {
        format!(
            "vec![\n                {}\n            ]",
            shop_entries.join(",\n                ")
        )
    };

    let battle_entries: Vec<String> = battle_abilities.iter().map(gen_battle_ability).collect();
    let battle_abilities_str = if battle_entries.is_empty() {
        "vec![]".to_string()
    } else {
        format!(
            "vec![\n                {}\n            ]",
            battle_entries.join(",\n                ")
        )
    };

    format!(
        r#"        UnitCard {{
            id: CardId({id}),
            name: String::from("{name}"),
            stats: UnitStats {{ attack: {atk}, health: {hp} }},
            economy: EconomyStats {{ play_cost: {cost}, pitch_value: {pitch} }},
            base_statuses: {base_statuses_str},
            shop_abilities: {shop_abilities_str},
            battle_abilities: {battle_abilities_str},
        }}"#
    )
}

// ── Main ─────────────────────────────────────────────────────────────────────

fn main() {
    let manifest_dir = env::var("CARGO_MANIFEST_DIR").unwrap();
    let cards_path = Path::new(&manifest_dir).join("../cards/cards.json");
    let sets_path = Path::new(&manifest_dir).join("../cards/sets.json");
    let styles_path = Path::new(&manifest_dir).join("../cards/styles.json");

    // Tell Cargo to re-run if JSON files change
    println!("cargo:rerun-if-changed={}", cards_path.display());
    println!("cargo:rerun-if-changed={}", sets_path.display());
    println!("cargo:rerun-if-changed={}", styles_path.display());

    let cards_json = fs::read_to_string(&cards_path)
        .unwrap_or_else(|e| panic!("Failed to read {}: {e}", cards_path.display()));
    let sets_json = fs::read_to_string(&sets_path)
        .unwrap_or_else(|e| panic!("Failed to read {}: {e}", sets_path.display()));

    let cards: Vec<JsonCard> =
        serde_json::from_str(&cards_json).expect("Failed to parse cards.json");
    let mut sets: Vec<JsonSet> =
        serde_json::from_str(&sets_json).expect("Failed to parse sets.json");
    let styles_json = fs::read_to_string(&styles_path)
        .unwrap_or_else(|e| panic!("Failed to read {}: {e}", styles_path.display()));
    let styles: Vec<JsonStyleCollection> =
        serde_json::from_str(&styles_json).expect("Failed to parse styles.json");

    // Respect explicit set IDs from JSON and enforce contiguous IDs starting at 0.
    sets.sort_by_key(|s| s.id);
    for (expected_id, set) in sets.iter().enumerate() {
        let actual_id = set.id as usize;
        assert!(
            actual_id == expected_id,
            "sets.json IDs must be contiguous and start at 0: expected {}, found {} (set name: {})",
            expected_id,
            set.id,
            set.name
        );
    }

    let card_id_set: BTreeSet<u32> = cards.iter().map(|c| c.id).collect();
    for card in &cards {
        for status in &card.base_statuses {
            validate_status(status, card.id, &card.name, "base_statuses");
        }
    }
    // Validate all set references up front.
    for set in &sets {
        for entry in &set.cards {
            assert!(
                card_id_set.contains(&entry.card_id),
                "sets.json set {} references missing card_id {}",
                set.id,
                entry.card_id
            );
        }
    }

    let split_abilities: Vec<(Vec<JsonAbility>, Vec<JsonAbility>)> = cards
        .iter()
        .map(|card| normalize_card_abilities(card, &card_id_set))
        .collect();

    // ── Generate cards ───────────────────────────────────────────────────────
    let card_entries: Vec<String> = cards
        .iter()
        .zip(split_abilities.iter())
        .map(|(card, (shop, battle))| gen_card(card, shop, battle))
        .collect();

    // ── Generate card metas ──────────────────────────────────────────────────
    let meta_entries: Vec<String> = cards
        .iter()
        .map(|c| {
            let id = c.id;
            let name = escape_rust_string(&c.name);
            let emoji = escape_rust_string(&c.emoji);
            format!(r#"        CardMeta {{ id: {id}, name: "{name}", emoji: "{emoji}" }}"#)
        })
        .collect();

    // ── Generate set metas ─────────────────────────────────────────────────
    let set_meta_entries: Vec<String> = sets
        .iter()
        .map(|s| {
            let id = s.id;
            let name = escape_rust_string(&s.name);
            format!(r#"        SetMeta {{ id: {id}, name: "{name}" }}"#)
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

    // ── Generate NFT style collections ────────────────────────────────────────
    let style_collection_entries: Vec<String> = styles
        .iter()
        .map(|col| {
            let id = col.id;
            let name = &col.name;
            let item_entries: Vec<String> = col
                .items
                .iter()
                .map(|item| {
                    let item_id = item.id;
                    // Build metadata JSON per NFT_SPEC.md format
                    let metadata = serde_json::json!({
                        "type": item.item_type,
                        "name": item.name,
                        "image": format!("ipfs://{}", item.cid),
                    });
                    let metadata_str = serde_json::to_string(&metadata).unwrap();
                    // Escape for Rust string literal
                    let escaped = metadata_str.replace('\\', "\\\\").replace('"', "\\\"");
                    format!(
                        "NftStyleItem {{ id: {item_id}, metadata_json: \"{escaped}\" }}"
                    )
                })
                .collect();
            format!(
                "        NftStyleCollection {{\n            id: {id},\n            name: \"{name}\",\n            items: &[\n                {}\n            ],\n        }}",
                item_entries.join(",\n                ")
            )
        })
        .collect();

    // ── Write output ─────────────────────────────────────────────────────────
    let out_dir = env::var("OUT_DIR").unwrap();
    let dest = Path::new(&out_dir).join("cards_generated.rs");

    let generated = format!(
        r#"// Auto-generated from cards.json, sets.json, and styles.json — DO NOT EDIT
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

/// Set metadata (id, name) — not used in game logic.
#[derive(serde::Serialize)]
pub struct SetMeta {{
    pub id: u32,
    pub name: &'static str,
}}

/// A single NFT style item with pre-built metadata JSON.
pub struct NftStyleItem {{
    pub id: u32,
    pub metadata_json: &'static str,
}}

/// A collection of NFT style items.
pub struct NftStyleCollection {{
    pub id: u32,
    pub name: &'static str,
    pub items: &'static [NftStyleItem],
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

/// Returns metadata (id, name) for every card set.
pub fn get_all_set_metas() -> Vec<SetMeta> {{
    vec![
{}
    ]
}}

/// Build a CardId → UnitCard lookup map from the static card data.
pub fn build_card_pool() -> BTreeMap<CardId, UnitCard> {{
    get_all_cards().into_iter().map(|c| (c.id, c)).collect()
}}

/// Returns all NFT style collections defined in styles.json.
pub fn get_all_nft_styles() -> Vec<NftStyleCollection> {{
    vec![
{}
    ]
}}
"#,
        card_entries.join(",\n"),
        meta_entries.join(",\n"),
        set_entries.join(",\n"),
        set_meta_entries.join(",\n"),
        style_collection_entries.join(",\n"),
    );

    fs::write(&dest, generated).expect("Failed to write generated cards file");
}
