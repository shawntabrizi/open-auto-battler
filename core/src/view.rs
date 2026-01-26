//! View types for UI serialization
//!
//! This module provides view structs for sending game state to frontends.

use alloc::string::String;
use alloc::vec::Vec;
use parity_scale_codec::{Decode, Encode};
use scale_info::TypeInfo;

use crate::state::*;
use crate::types::*;

#[cfg(feature = "std")]
use serde::{Deserialize, Serialize};

/// View of a unit card for the UI
#[derive(Debug, Clone, Encode, Decode, TypeInfo)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "std", serde(rename_all = "camelCase"))]
pub struct CardView {
    pub id: CardId,
    pub template_id: String,
    pub name: String,
    pub attack: i32,
    pub health: i32,
    pub play_cost: i32,
    pub pitch_value: i32,
    pub abilities: Vec<crate::types::Ability>,
    pub is_token: bool,
}

impl From<&UnitCard> for CardView {
    fn from(card: &UnitCard) -> Self {
        Self {
            id: card.id,
            template_id: card.template_id.clone(),
            name: card.name.clone(),
            attack: card.stats.attack,
            health: card.stats.health,
            play_cost: card.economy.play_cost,
            pitch_value: card.economy.pitch_value,
            abilities: card.abilities.clone(),
            is_token: card.is_token,
        }
    }
}

/// View of a unit on the board
#[derive(Debug, Clone, Encode, Decode, TypeInfo)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "std", serde(rename_all = "camelCase"))]
pub struct BoardUnitView {
    pub id: CardId,
    pub template_id: String,
    pub name: String,
    pub attack: i32,
    pub health: i32,
    pub play_cost: i32,
    pub pitch_value: i32,
    pub abilities: Vec<crate::types::Ability>,
    pub is_token: bool,
}

impl From<&BoardUnit> for BoardUnitView {
    fn from(unit: &BoardUnit) -> Self {
        Self {
            id: unit.card.id,
            template_id: unit.card.template_id.clone(),
            name: unit.card.name.clone(),
            attack: unit.card.stats.attack,
            health: unit.effective_health(),
            play_cost: unit.card.economy.play_cost,
            pitch_value: unit.card.economy.pitch_value,
            abilities: unit.card.abilities.clone(),
            is_token: unit.card.is_token,
        }
    }
}

/// The complete game view sent to React
#[derive(Debug, Clone, Encode, Decode, TypeInfo)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "std", serde(rename_all = "camelCase"))]
pub struct GameView {
    /// Hand cards (derived from bag each round)
    pub hand: Vec<Option<CardView>>,
    /// Board slots (None = empty)
    pub board: Vec<Option<BoardUnitView>>,
    /// Current mana (transient, per-turn)
    pub mana: i32,
    /// Maximum mana capacity
    pub mana_limit: i32,
    /// Current round
    pub round: i32,
    /// Lives remaining
    pub lives: i32,
    /// Wins accumulated
    pub wins: i32,
    /// Current game phase
    pub phase: String,
    /// Cards remaining in bag
    pub bag_count: u32,
    /// Whether we can afford each hand card
    pub can_afford: Vec<bool>,
}

impl GameView {
    /// Construct a GameView from state plus transient per-turn data
    pub fn from_state(
        state: &GameState,
        current_mana: i32,
        hand_indices: &[usize],
        hand_used: &[bool],
    ) -> Self {
        let hand: Vec<Option<CardView>> = hand_indices
            .iter()
            .enumerate()
            .map(|(i, &bag_idx)| {
                if hand_used.get(i).copied().unwrap_or(false) {
                    None // Card already used (pitched or played)
                } else {
                    Some(CardView::from(&state.bag[bag_idx]))
                }
            })
            .collect();

        let can_afford: Vec<bool> = hand
            .iter()
            .map(|card_opt| {
                card_opt
                    .as_ref()
                    .map(|c| current_mana >= c.play_cost)
                    .unwrap_or(false)
            })
            .collect();

        Self {
            hand,
            board: state
                .board
                .iter()
                .map(|slot| slot.as_ref().map(BoardUnitView::from))
                .collect(),
            mana: current_mana,
            mana_limit: state.mana_limit,
            round: state.round,
            lives: state.lives,
            wins: state.wins,
            phase: match state.phase {
                GamePhase::Shop => String::from("shop"),
                GamePhase::Battle => String::from("battle"),
                GamePhase::Victory => String::from("victory"),
                GamePhase::Defeat => String::from("defeat"),
            },
            bag_count: state.bag.len() as u32,
            can_afford,
        }
    }
}
