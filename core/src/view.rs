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
            health: unit.current_health,
            play_cost: unit.card.economy.play_cost,
            pitch_value: unit.card.economy.pitch_value,
            abilities: unit.card.abilities.clone(),
            is_token: unit.card.is_token,
        }
    }
}

/// View of a shop slot
#[derive(Debug, Clone, Encode, Decode, TypeInfo)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "std", serde(rename_all = "camelCase"))]
pub struct ShopSlotView {
    pub card: Option<CardView>,
    pub frozen: bool,
}

impl From<&ShopSlot> for ShopSlotView {
    fn from(slot: &ShopSlot) -> Self {
        Self {
            card: slot.card.as_ref().map(CardView::from),
            frozen: slot.frozen,
        }
    }
}

/// The complete game view sent to React
#[derive(Debug, Clone, Encode, Decode, TypeInfo)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "std", serde(rename_all = "camelCase"))]
pub struct GameView {
    /// Shop slots
    pub shop: Vec<ShopSlotView>,
    /// Board slots (None = empty)
    pub board: Vec<Option<BoardUnitView>>,
    /// Current mana
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
    /// Cards remaining in deck
    pub deck_count: u32,
    /// Whether we can afford each shop item
    pub can_afford: Vec<bool>,
}

impl From<&GameState> for GameView {
    fn from(state: &GameState) -> Self {
        let can_afford: Vec<bool> = state
            .shop
            .iter()
            .map(|slot| {
                slot.card
                    .as_ref()
                    .map(|c| state.can_afford(c.economy.play_cost))
                    .unwrap_or(false)
            })
            .collect();

        Self {
            shop: state.shop.iter().map(ShopSlotView::from).collect(),
            board: state
                .board
                .iter()
                .map(|slot| slot.as_ref().map(BoardUnitView::from))
                .collect(),
            mana: state.mana,
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
            deck_count: state.deck.len() as u32,
            can_afford,
        }
    }
}
