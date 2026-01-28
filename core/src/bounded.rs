//! Bounded types for on-chain usage
//!
//! This module provides bounded versions of core game types, suitable for use
//! in runtime storage where unbounded vectors are unsafe.
//!
//! Requires the `bounded` feature.

use alloc::string::String;
use alloc::vec::Vec;
use bounded_collections::{BoundedVec, BoundedBTreeMap, Get};
use core::fmt::Debug;
use parity_scale_codec::{Decode, DecodeWithMemTracking, Encode};
use scale_info::TypeInfo;

use crate::battle::{BattlePhase, BattleResult, UnitId};
use crate::limits::{LimitReason, Team};
use crate::state::{calculate_mana_limit, derive_hand_indices_logic};
use crate::types::{
    Ability, AbilityCondition, AbilityEffect, AbilityTarget, AbilityTrigger, BoardUnit, CardId,
    CommitTurnAction, EconomyStats, UnitCard, UnitStats,
};
use crate::{GamePhase, GameState};

// --- Bounded Game State Implementation ---

impl<MaxBagSize, MaxBoardSize, MaxAbilities, MaxStringLen, MaxHandActions>
    BoundedGameState<MaxBagSize, MaxBoardSize, MaxAbilities, MaxStringLen, MaxHandActions>
where
    MaxBagSize: Get<u32>,
    MaxBoardSize: Get<u32>,
    MaxAbilities: Get<u32>,
    MaxStringLen: Get<u32>,
    MaxHandActions: Get<u32>,
{
    /// Populate the hand by drawing from the bag.
    pub fn draw_hand(&mut self) {
        let indices = derive_hand_indices_logic(self.bag.len(), self.game_seed, self.round);
        if indices.is_empty() {
            return;
        }

        // Sort indices descending to remove from bag without shifting issues
        let mut sorted_indices = indices;
        sorted_indices.sort_unstable_by(|a, b| b.cmp(a));

        self.hand.clear();
        let mut drawn_card_ids = Vec::with_capacity(sorted_indices.len());
        for idx in sorted_indices {
            // Safety: indices are derived from bag.len()
            drawn_card_ids.push(self.bag.remove(idx));
        }

        // reverse to maintain original derived order
        drawn_card_ids.reverse();
        
        for id in drawn_card_ids {
            let _ = self.hand.try_push(id);
        }
    }

    /// Calculate mana limit for the current round
    pub fn calculate_mana_limit(&self) -> i32 {
        calculate_mana_limit(self.round)
    }
}

// --- Conversion Helpers ---

fn string_to_bounded<S: Get<u32>>(s: String) -> BoundedVec<u8, S> {
    BoundedVec::truncate_from(s.into_bytes())
}

fn bounded_to_string<S: Get<u32>>(b: BoundedVec<u8, S>) -> String {
    String::from_utf8_lossy(&b).into_owned()
}

// --- Bounded Ability Effect ---

#[derive(Encode, Decode, DecodeWithMemTracking, TypeInfo)]
#[scale_info(skip_type_params(MaxStringLen))]
pub enum BoundedAbilityEffect<MaxStringLen>
where
    MaxStringLen: Get<u32>,
{
    Damage {
        amount: i32,
        target: AbilityTarget,
    },
    ModifyStats {
        health: i32,
        attack: i32,
        target: AbilityTarget,
    },
    SpawnUnit {
        template_id: BoundedVec<u8, MaxStringLen>,
    },
    Destroy {
        target: AbilityTarget,
    },
}

impl<MaxStringLen: Get<u32>> Clone for BoundedAbilityEffect<MaxStringLen> {
    fn clone(&self) -> Self {
        match self {
            Self::Damage { amount, target } => Self::Damage {
                amount: *amount,
                target: target.clone(),
            },
            Self::ModifyStats {
                health,
                attack,
                target,
            } => Self::ModifyStats {
                health: *health,
                attack: *attack,
                target: target.clone(),
            },
            Self::SpawnUnit { template_id } => Self::SpawnUnit {
                template_id: template_id.clone(),
            },
            Self::Destroy { target } => Self::Destroy {
                target: target.clone(),
            },
        }
    }
}

impl<MaxStringLen: Get<u32>> PartialEq for BoundedAbilityEffect<MaxStringLen> {
    fn eq(&self, other: &Self) -> bool {
        match (self, other) {
            (
                Self::Damage {
                    amount: a1,
                    target: t1,
                },
                Self::Damage {
                    amount: a2,
                    target: t2,
                },
            ) => a1 == a2 && t1 == t2,
            (
                Self::ModifyStats {
                    health: h1,
                    attack: at1,
                    target: t1,
                },
                Self::ModifyStats {
                    health: h2,
                    attack: at2,
                    target: t2,
                },
            ) => h1 == h2 && at1 == at2 && t1 == t2,
            (Self::SpawnUnit { template_id: id1 }, Self::SpawnUnit { template_id: id2 }) => {
                id1 == id2
            }
            (Self::Destroy { target: t1 }, Self::Destroy { target: t2 }) => t1 == t2,
            _ => false,
        }
    }
}

impl<MaxStringLen: Get<u32>> Eq for BoundedAbilityEffect<MaxStringLen> {}

impl<MaxStringLen: Get<u32>> Debug for BoundedAbilityEffect<MaxStringLen> {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::Damage { amount, target } => f
                .debug_struct("Damage")
                .field("amount", amount)
                .field("target", target)
                .finish(),
            Self::ModifyStats {
                health,
                attack,
                target,
            } => f
                .debug_struct("ModifyStats")
                .field("health", health)
                .field("attack", attack)
                .field("target", target)
                .finish(),
            Self::SpawnUnit { template_id } => f
                .debug_struct("SpawnUnit")
                .field("template_id", template_id)
                .finish(),
            Self::Destroy { target } => f.debug_struct("Destroy").field("target", target).finish(),
        }
    }
}

impl<MaxStringLen: Get<u32>> From<AbilityEffect> for BoundedAbilityEffect<MaxStringLen> {
    fn from(effect: AbilityEffect) -> Self {
        match effect {
            AbilityEffect::Damage { amount, target } => Self::Damage { amount, target },
            AbilityEffect::ModifyStats {
                health,
                attack,
                target,
            } => Self::ModifyStats {
                health,
                attack,
                target,
            },
            AbilityEffect::SpawnUnit { template_id } => Self::SpawnUnit {
                template_id: string_to_bounded(template_id),
            },
            AbilityEffect::Destroy { target } => Self::Destroy { target },
        }
    }
}

impl<MaxStringLen: Get<u32>> From<BoundedAbilityEffect<MaxStringLen>> for AbilityEffect {
    fn from(bounded: BoundedAbilityEffect<MaxStringLen>) -> Self {
        match bounded {
            BoundedAbilityEffect::Damage { amount, target } => {
                AbilityEffect::Damage { amount, target }
            }
            BoundedAbilityEffect::ModifyStats {
                health,
                attack,
                target,
            } => AbilityEffect::ModifyStats {
                health,
                attack,
                target,
            },
            BoundedAbilityEffect::SpawnUnit { template_id } => AbilityEffect::SpawnUnit {
                template_id: bounded_to_string(template_id),
            },
            BoundedAbilityEffect::Destroy { target } => AbilityEffect::Destroy { target },
        }
    }
}

// --- Bounded Ability ---

#[derive(Encode, Decode, DecodeWithMemTracking, TypeInfo)]
#[scale_info(skip_type_params(MaxStringLen))]
pub struct BoundedAbility<MaxStringLen>
where
    MaxStringLen: Get<u32>,
{
    pub trigger: AbilityTrigger,
    pub effect: BoundedAbilityEffect<MaxStringLen>,
    pub name: BoundedVec<u8, MaxStringLen>,
    pub description: BoundedVec<u8, MaxStringLen>,
    pub condition: AbilityCondition,
    pub max_triggers: Option<u32>,
}

impl<MaxStringLen: Get<u32>> Clone for BoundedAbility<MaxStringLen> {
    fn clone(&self) -> Self {
        Self {
            trigger: self.trigger.clone(),
            effect: self.effect.clone(),
            name: self.name.clone(),
            description: self.description.clone(),
            condition: self.condition.clone(),
            max_triggers: self.max_triggers,
        }
    }
}

impl<MaxStringLen: Get<u32>> PartialEq for BoundedAbility<MaxStringLen> {
    fn eq(&self, other: &Self) -> bool {
        self.trigger == other.trigger
            && self.effect == other.effect
            && self.name == other.name
            && self.description == other.description
            && self.condition == other.condition
            && self.max_triggers == other.max_triggers
    }
}

impl<MaxStringLen: Get<u32>> Eq for BoundedAbility<MaxStringLen> {}

impl<MaxStringLen: Get<u32>> Debug for BoundedAbility<MaxStringLen> {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        f.debug_struct("BoundedAbility")
            .field("trigger", &self.trigger)
            .field("effect", &self.effect)
            .field("name", &self.name)
            .field("description", &self.description)
            .field("condition", &self.condition)
            .field("max_triggers", &self.max_triggers)
            .finish()
    }
}

impl<MaxStringLen: Get<u32>> From<Ability> for BoundedAbility<MaxStringLen> {
    fn from(a: Ability) -> Self {
        Self {
            trigger: a.trigger,
            effect: a.effect.into(),
            name: string_to_bounded(a.name),
            description: string_to_bounded(a.description),
            condition: a.condition,
            max_triggers: a.max_triggers,
        }
    }
}

impl<MaxStringLen: Get<u32>> From<BoundedAbility<MaxStringLen>> for Ability {
    fn from(bounded: BoundedAbility<MaxStringLen>) -> Self {
        Self {
            trigger: bounded.trigger,
            effect: bounded.effect.into(),
            name: bounded_to_string(bounded.name),
            description: bounded_to_string(bounded.description),
            condition: bounded.condition,
            max_triggers: bounded.max_triggers,
        }
    }
}

// --- Bounded Unit Card ---

#[derive(Encode, Decode, DecodeWithMemTracking, TypeInfo)]
#[scale_info(skip_type_params(MaxAbilities, MaxStringLen))]
pub struct BoundedUnitCard<MaxAbilities, MaxStringLen>
where
    MaxAbilities: Get<u32>,
    MaxStringLen: Get<u32>,
{
    pub id: CardId,
    pub template_id: BoundedVec<u8, MaxStringLen>,
    pub name: BoundedVec<u8, MaxStringLen>,
    pub stats: UnitStats,
    pub economy: EconomyStats,
    pub abilities: BoundedVec<BoundedAbility<MaxStringLen>, MaxAbilities>,
    pub is_token: bool,
}

impl<MaxAbilities: Get<u32>, MaxStringLen: Get<u32>> Clone
    for BoundedUnitCard<MaxAbilities, MaxStringLen>
{
    fn clone(&self) -> Self {
        Self {
            id: self.id,
            template_id: self.template_id.clone(),
            name: self.name.clone(),
            stats: self.stats.clone(),
            economy: self.economy.clone(),
            abilities: self.abilities.clone(),
            is_token: self.is_token,
        }
    }
}

impl<MaxAbilities: Get<u32>, MaxStringLen: Get<u32>> PartialEq
    for BoundedUnitCard<MaxAbilities, MaxStringLen>
{
    fn eq(&self, other: &Self) -> bool {
        self.id == other.id
            && self.template_id == other.template_id
            && self.name == other.name
            && self.stats == other.stats
            && self.economy == other.economy
            && self.abilities == other.abilities
            && self.is_token == other.is_token
    }
}

impl<MaxAbilities: Get<u32>, MaxStringLen: Get<u32>> Eq
    for BoundedUnitCard<MaxAbilities, MaxStringLen>
{
}

impl<MaxAbilities: Get<u32>, MaxStringLen: Get<u32>> Debug
    for BoundedUnitCard<MaxAbilities, MaxStringLen>
{
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        f.debug_struct("BoundedUnitCard")
            .field("id", &self.id)
            .field("template_id", &self.template_id)
            .field("name", &self.name)
            .field("stats", &self.stats)
            .field("economy", &self.economy)
            .field("abilities", &self.abilities)
            .field("is_token", &self.is_token)
            .finish()
    }
}

impl<MaxAbilities, MaxStringLen> From<UnitCard> for BoundedUnitCard<MaxAbilities, MaxStringLen>
where
    MaxAbilities: Get<u32>,
    MaxStringLen: Get<u32>,
{
    fn from(card: UnitCard) -> Self {
        Self {
            id: card.id,
            template_id: string_to_bounded(card.template_id),
            name: string_to_bounded(card.name),
            stats: card.stats,
            economy: card.economy,
            abilities: BoundedVec::truncate_from(
                card.abilities.into_iter().map(Into::into).collect(),
            ),
            is_token: card.is_token,
        }
    }
}

impl<MaxAbilities, MaxStringLen> From<BoundedUnitCard<MaxAbilities, MaxStringLen>> for UnitCard
where
    MaxAbilities: Get<u32>,
    MaxStringLen: Get<u32>,
{
    fn from(bounded: BoundedUnitCard<MaxAbilities, MaxStringLen>) -> Self {
        Self {
            id: bounded.id,
            template_id: bounded_to_string(bounded.template_id),
            name: bounded_to_string(bounded.name),
            stats: bounded.stats,
            economy: bounded.economy,
            abilities: bounded
                .abilities
                .into_inner()
                .into_iter()
                .map(Into::into)
                .collect(),
            is_token: bounded.is_token,
        }
    }
}

// --- Bounded Board Unit ---

#[derive(Encode, Decode, DecodeWithMemTracking, TypeInfo)]
pub struct BoundedBoardUnit {
    pub card_id: CardId,
    pub current_health: i32,
}

impl Clone for BoundedBoardUnit {
    fn clone(&self) -> Self {
        Self {
            card_id: self.card_id,
            current_health: self.current_health,
        }
    }
}

impl PartialEq for BoundedBoardUnit {
    fn eq(&self, other: &Self) -> bool {
        self.card_id == other.card_id && self.current_health == other.current_health
    }
}

impl Eq for BoundedBoardUnit {}

impl Debug for BoundedBoardUnit {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        f.debug_struct("BoundedBoardUnit")
            .field("card_id", &self.card_id)
            .field("current_health", &self.current_health)
            .finish()
    }
}

impl From<BoardUnit> for BoundedBoardUnit {
    fn from(bu: BoardUnit) -> Self {
        Self {
            card_id: bu.card_id,
            current_health: bu.current_health,
        }
    }
}

impl From<BoundedBoardUnit> for BoardUnit {
    fn from(bounded: BoundedBoardUnit) -> Self {
        Self {
            card_id: bounded.card_id,
            current_health: bounded.current_health,
        }
    }
}

// --- Bounded Game State ---

#[derive(Encode, Decode, DecodeWithMemTracking, TypeInfo)]
#[scale_info(skip_type_params(MaxBagSize, MaxBoardSize, MaxAbilities, MaxStringLen, MaxHandActions))]
pub struct BoundedGameState<MaxBagSize, MaxBoardSize, MaxAbilities, MaxStringLen, MaxHandActions>
where
    MaxBagSize: Get<u32>,
    MaxBoardSize: Get<u32>,
    MaxAbilities: Get<u32>,
    MaxStringLen: Get<u32>,
    MaxHandActions: Get<u32>,
{
    pub card_pool: BoundedBTreeMap<CardId, BoundedUnitCard<MaxAbilities, MaxStringLen>, MaxBagSize>,
    pub bag: BoundedVec<CardId, MaxBagSize>,
    pub hand: BoundedVec<CardId, MaxHandActions>,
    pub board: BoundedVec<Option<BoundedBoardUnit>, MaxBoardSize>,
    pub mana_limit: i32,
    pub round: i32,
    pub lives: i32,
    pub wins: i32,
    pub phase: GamePhase,
    pub next_card_id: u32,
    pub game_seed: u64,
}

impl<
        MaxBagSize: Get<u32>,
        MaxBoardSize: Get<u32>,
        MaxAbilities: Get<u32>,
        MaxStringLen: Get<u32>,
        MaxHandActions: Get<u32>,
    > Clone for BoundedGameState<MaxBagSize, MaxBoardSize, MaxAbilities, MaxStringLen, MaxHandActions>
{
    fn clone(&self) -> Self {
        Self {
            card_pool: self.card_pool.clone(),
            bag: self.bag.clone(),
            hand: self.hand.clone(),
            board: self.board.clone(),
            mana_limit: self.mana_limit,
            round: self.round,
            lives: self.lives,
            wins: self.wins,
            phase: self.phase.clone(),
            next_card_id: self.next_card_id,
            game_seed: self.game_seed,
        }
    }
}

impl<
        MaxBagSize: Get<u32>,
        MaxBoardSize: Get<u32>,
        MaxAbilities: Get<u32>,
        MaxStringLen: Get<u32>,
        MaxHandActions: Get<u32>,
    > PartialEq
    for BoundedGameState<MaxBagSize, MaxBoardSize, MaxAbilities, MaxStringLen, MaxHandActions>
{
    fn eq(&self, other: &Self) -> bool {
        self.card_pool == other.card_pool
            && self.bag == other.bag
            && self.hand == other.hand
            && self.board == other.board
            && self.mana_limit == other.mana_limit
            && self.round == other.round
            && self.lives == other.lives
            && self.wins == other.wins
            && self.phase == other.phase
            && self.next_card_id == other.next_card_id
            && self.game_seed == other.game_seed
    }
}

impl<
        MaxBagSize: Get<u32>,
        MaxBoardSize: Get<u32>,
        MaxAbilities: Get<u32>,
        MaxStringLen: Get<u32>,
        MaxHandActions: Get<u32>,
    > Eq for BoundedGameState<MaxBagSize, MaxBoardSize, MaxAbilities, MaxStringLen, MaxHandActions>
{
}

impl<
        MaxBagSize: Get<u32>,
        MaxBoardSize: Get<u32>,
        MaxAbilities: Get<u32>,
        MaxStringLen: Get<u32>,
        MaxHandActions: Get<u32>,
    > Debug for BoundedGameState<MaxBagSize, MaxBoardSize, MaxAbilities, MaxStringLen, MaxHandActions>
{
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        f.debug_struct("BoundedGameState")
            .field("card_pool", &self.card_pool)
            .field("bag", &self.bag)
            .field("hand", &self.hand)
            .field("board", &self.board)
            .field("mana_limit", &self.mana_limit)
            .field("round", &self.round)
            .field("lives", &self.lives)
            .field("wins", &self.wins)
            .field("phase", &self.phase)
            .field("next_card_id", &self.next_card_id)
            .field("game_seed", &self.game_seed)
            .finish()
    }
}

impl<MaxBagSize, MaxBoardSize, MaxAbilities, MaxStringLen, MaxHandActions> From<GameState>
    for BoundedGameState<MaxBagSize, MaxBoardSize, MaxAbilities, MaxStringLen, MaxHandActions>
where
    MaxBagSize: Get<u32>,
    MaxBoardSize: Get<u32>,
    MaxAbilities: Get<u32>,
    MaxStringLen: Get<u32>,
    MaxHandActions: Get<u32>,
{
    fn from(state: GameState) -> Self {
        let mut card_pool = BoundedBTreeMap::new();
        for (id, card) in state.card_pool {
            let _ = card_pool.try_insert(id, card.into());
        }

        Self {
            card_pool,
            bag: BoundedVec::truncate_from(state.bag),
            hand: BoundedVec::truncate_from(state.hand),
            board: BoundedVec::truncate_from(
                state
                    .board
                    .into_iter()
                    .map(|opt| opt.map(Into::into))
                    .collect(),
            ),
            mana_limit: state.mana_limit,
            round: state.round,
            lives: state.lives,
            wins: state.wins,
            phase: state.phase,
            next_card_id: state.next_card_id,
            game_seed: state.game_seed,
        }
    }
}

impl<MaxBagSize, MaxBoardSize, MaxAbilities, MaxStringLen, MaxHandActions>
    From<BoundedGameState<MaxBagSize, MaxBoardSize, MaxAbilities, MaxStringLen, MaxHandActions>>
    for GameState
where
    MaxBagSize: Get<u32>,
    MaxBoardSize: Get<u32>,
    MaxAbilities: Get<u32>,
    MaxStringLen: Get<u32>,
    MaxHandActions: Get<u32>,
{
    fn from(
        bounded: BoundedGameState<MaxBagSize, MaxBoardSize, MaxAbilities, MaxStringLen, MaxHandActions>,
    ) -> Self {
        Self {
            card_pool: bounded
                .card_pool
                .into_iter()
                .map(|(id, card)| (id, card.into()))
                .collect(),
            bag: bounded.bag.into_inner(),
            hand: bounded.hand.into_inner(),
            board: bounded
                .board
                .into_inner()
                .into_iter()
                .map(|opt| opt.map(Into::into))
                .collect(),
            mana_limit: bounded.mana_limit,
            round: bounded.round,
            lives: bounded.lives,
            wins: bounded.wins,
            phase: bounded.phase,
            next_card_id: bounded.next_card_id,
            game_seed: bounded.game_seed,
        }
    }
}

// --- Bounded Commit Turn Action ---

#[derive(Encode, Decode, DecodeWithMemTracking, TypeInfo)]
#[scale_info(skip_type_params(MaxBoardSize, MaxHandActions))]
pub struct BoundedCommitTurnAction<MaxBoardSize, MaxHandActions>
where
    MaxBoardSize: Get<u32>,
    MaxHandActions: Get<u32>,
{
    pub new_board: BoundedVec<Option<BoundedBoardUnit>, MaxBoardSize>,
    pub pitched_from_hand: BoundedVec<u32, MaxHandActions>,
    pub played_from_hand: BoundedVec<u32, MaxHandActions>,
    pub pitched_from_board: BoundedVec<u32, MaxBoardSize>,
}

impl<
        MaxBoardSize: Get<u32>,
        MaxHandActions: Get<u32>,
    > Clone for BoundedCommitTurnAction<MaxBoardSize, MaxHandActions>
{
    fn clone(&self) -> Self {
        Self {
            new_board: self.new_board.clone(),
            pitched_from_hand: self.pitched_from_hand.clone(),
            played_from_hand: self.played_from_hand.clone(),
            pitched_from_board: self.pitched_from_board.clone(),
        }
    }
}

impl<
        MaxBoardSize: Get<u32>,
        MaxHandActions: Get<u32>,
    > PartialEq
    for BoundedCommitTurnAction<MaxBoardSize, MaxHandActions>
{
    fn eq(&self, other: &Self) -> bool {
        self.new_board == other.new_board
            && self.pitched_from_hand == other.pitched_from_hand
            && self.played_from_hand == other.played_from_hand
            && self.pitched_from_board == other.pitched_from_board
    }
}

impl<
        MaxBoardSize: Get<u32>,
        MaxHandActions: Get<u32>,
    > Eq for BoundedCommitTurnAction<MaxBoardSize, MaxHandActions>
{
}

impl<
        MaxBoardSize: Get<u32>,
        MaxHandActions: Get<u32>,
    > Debug for BoundedCommitTurnAction<MaxBoardSize, MaxHandActions>
{
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        f.debug_struct("BoundedCommitTurnAction")
            .field("new_board", &self.new_board)
            .field("pitched_from_hand", &self.pitched_from_hand)
            .field("played_from_hand", &self.played_from_hand)
            .field("pitched_from_board", &self.pitched_from_board)
            .finish()
    }
}

impl<MaxBoardSize, MaxHandActions> From<CommitTurnAction>
    for BoundedCommitTurnAction<MaxBoardSize, MaxHandActions>
where
    MaxBoardSize: Get<u32>,
    MaxHandActions: Get<u32>,
{
    fn from(action: CommitTurnAction) -> Self {
        Self {
            new_board: BoundedVec::truncate_from(
                action
                    .new_board
                    .into_iter()
                    .map(|opt| opt.map(Into::into))
                    .collect(),
            ),
            pitched_from_hand: BoundedVec::truncate_from(action.pitched_from_hand),
            played_from_hand: BoundedVec::truncate_from(action.played_from_hand),
            pitched_from_board: BoundedVec::truncate_from(action.pitched_from_board),
        }
    }
}

impl<MaxBoardSize, MaxHandActions>
    From<BoundedCommitTurnAction<MaxBoardSize, MaxHandActions>>
    for CommitTurnAction
where
    MaxBoardSize: Get<u32>,
    MaxHandActions: Get<u32>,
{
    fn from(
        bounded: BoundedCommitTurnAction<MaxBoardSize, MaxHandActions>,
    ) -> Self {
        Self {
            new_board: bounded
                .new_board
                .into_inner()
                .into_iter()
                .map(|opt| opt.map(Into::into))
                .collect(),
            pitched_from_hand: bounded.pitched_from_hand.into_inner(),
            played_from_hand: bounded.played_from_hand.into_inner(),
            pitched_from_board: bounded.pitched_from_board.into_inner(),
        }
    }
}

// --- Bounded Unit View ---

#[derive(Encode, Decode, DecodeWithMemTracking, TypeInfo)]
#[scale_info(skip_type_params(MaxAbilities, MaxStringLen))]
pub struct BoundedUnitView<MaxAbilities, MaxStringLen>
where
    MaxAbilities: Get<u32>,
    MaxStringLen: Get<u32>,
{
    pub instance_id: UnitId,
    pub template_id: BoundedVec<u8, MaxStringLen>,
    pub name: BoundedVec<u8, MaxStringLen>,
    pub attack: i32,
    pub health: i32,
    pub abilities: BoundedVec<BoundedAbility<MaxStringLen>, MaxAbilities>,
    pub is_token: bool,
}

impl<MaxAbilities: Get<u32>, MaxStringLen: Get<u32>> Clone
    for BoundedUnitView<MaxAbilities, MaxStringLen>
{
    fn clone(&self) -> Self {
        Self {
            instance_id: self.instance_id,
            template_id: self.template_id.clone(),
            name: self.name.clone(),
            attack: self.attack,
            health: self.health,
            abilities: self.abilities.clone(),
            is_token: self.is_token,
        }
    }
}

impl<MaxAbilities: Get<u32>, MaxStringLen: Get<u32>> PartialEq
    for BoundedUnitView<MaxAbilities, MaxStringLen>
{
    fn eq(&self, other: &Self) -> bool {
        self.instance_id == other.instance_id
            && self.template_id == other.template_id
            && self.name == other.name
            && self.attack == other.attack
            && self.health == other.health
            && self.abilities == other.abilities
            && self.is_token == other.is_token
    }
}

impl<MaxAbilities: Get<u32>, MaxStringLen: Get<u32>> Eq
    for BoundedUnitView<MaxAbilities, MaxStringLen>
{
}

impl<MaxAbilities: Get<u32>, MaxStringLen: Get<u32>> Debug
    for BoundedUnitView<MaxAbilities, MaxStringLen>
{
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        f.debug_struct("BoundedUnitView")
            .field("instance_id", &self.instance_id)
            .field("template_id", &self.template_id)
            .field("name", &self.name)
            .field("attack", &self.attack)
            .field("health", &self.health)
            .field("abilities", &self.abilities)
            .field("is_token", &self.is_token)
            .finish()
    }
}

impl<MaxAbilities, MaxStringLen> From<crate::battle::UnitView>
    for BoundedUnitView<MaxAbilities, MaxStringLen>
where
    MaxAbilities: Get<u32>,
    MaxStringLen: Get<u32>,
{
    fn from(uv: crate::battle::UnitView) -> Self {
        Self {
            instance_id: uv.instance_id,
            template_id: string_to_bounded(uv.template_id),
            name: string_to_bounded(uv.name),
            attack: uv.attack,
            health: uv.health,
            abilities: BoundedVec::truncate_from(
                uv.abilities.into_iter().map(Into::into).collect(),
            ),
            is_token: uv.is_token,
        }
    }
}

impl<MaxAbilities, MaxStringLen> From<BoundedUnitView<MaxAbilities, MaxStringLen>>
    for crate::battle::UnitView
where
    MaxAbilities: Get<u32>,
    MaxStringLen: Get<u32>,
{
    fn from(bounded: BoundedUnitView<MaxAbilities, MaxStringLen>) -> Self {
        Self {
            instance_id: bounded.instance_id,
            template_id: bounded_to_string(bounded.template_id),
            name: bounded_to_string(bounded.name),
            attack: bounded.attack,
            health: bounded.health,
            abilities: bounded
                .abilities
                .into_inner()
                .into_iter()
                .map(Into::into)
                .collect(),
            is_token: bounded.is_token,
        }
    }
}

// --- Bounded Combat Event ---

#[derive(Encode, Decode, DecodeWithMemTracking, TypeInfo)]
#[scale_info(skip_type_params(MaxAbilities, MaxStringLen, MaxBoardSize))]
pub enum BoundedCombatEvent<MaxAbilities, MaxStringLen, MaxBoardSize>
where
    MaxAbilities: Get<u32>,
    MaxStringLen: Get<u32>,
    MaxBoardSize: Get<u32>,
{
    PhaseStart {
        phase: BattlePhase,
    },
    PhaseEnd {
        phase: BattlePhase,
    },
    AbilityTrigger {
        source_instance_id: UnitId,
        ability_name: BoundedVec<u8, MaxStringLen>,
    },
    Clash {
        p_dmg: i32,
        e_dmg: i32,
    },
    DamageTaken {
        target_instance_id: UnitId,
        team: Team,
        remaining_hp: i32,
    },
    UnitDeath {
        team: Team,
        new_board_state: BoundedVec<BoundedUnitView<MaxAbilities, MaxStringLen>, MaxBoardSize>,
    },
    BattleEnd {
        result: BattleResult,
    },
    AbilityDamage {
        source_instance_id: UnitId,
        target_instance_id: UnitId,
        damage: i32,
        remaining_hp: i32,
    },
    AbilityModifyStats {
        source_instance_id: UnitId,
        target_instance_id: UnitId,
        health_change: i32,
        attack_change: i32,
        new_attack: i32,
        new_health: i32,
    },
    UnitSpawn {
        team: Team,
        spawned_unit: BoundedUnitView<MaxAbilities, MaxStringLen>,
        new_board_state: BoundedVec<BoundedUnitView<MaxAbilities, MaxStringLen>, MaxBoardSize>,
    },
    LimitExceeded {
        losing_team: Option<Team>,
        reason: LimitReason,
    },
}

impl<MaxAbilities: Get<u32>, MaxStringLen: Get<u32>, MaxBoardSize: Get<u32>> Clone
    for BoundedCombatEvent<MaxAbilities, MaxStringLen, MaxBoardSize>
{
    fn clone(&self) -> Self {
        match self {
            Self::PhaseStart { phase } => Self::PhaseStart { phase: *phase },
            Self::PhaseEnd { phase } => Self::PhaseEnd { phase: *phase },
            Self::AbilityTrigger {
                source_instance_id,
                ability_name,
            } => Self::AbilityTrigger {
                source_instance_id: *source_instance_id,
                ability_name: ability_name.clone(),
            },
            Self::Clash { p_dmg, e_dmg } => Self::Clash {
                p_dmg: *p_dmg,
                e_dmg: *e_dmg,
            },
            Self::DamageTaken {
                target_instance_id,
                team,
                remaining_hp,
            } => Self::DamageTaken {
                target_instance_id: *target_instance_id,
                team: *team,
                remaining_hp: *remaining_hp,
            },
            Self::UnitDeath {
                team,
                new_board_state,
            } => Self::UnitDeath {
                team: *team,
                new_board_state: new_board_state.clone(),
            },
            Self::BattleEnd { result } => Self::BattleEnd {
                result: result.clone(),
            },
            Self::AbilityDamage {
                source_instance_id,
                target_instance_id,
                damage,
                remaining_hp,
            } => Self::AbilityDamage {
                source_instance_id: *source_instance_id,
                target_instance_id: *target_instance_id,
                damage: *damage,
                remaining_hp: *remaining_hp,
            },
            Self::AbilityModifyStats {
                source_instance_id,
                target_instance_id,
                health_change,
                attack_change,
                new_attack,
                new_health,
            } => Self::AbilityModifyStats {
                source_instance_id: *source_instance_id,
                target_instance_id: *target_instance_id,
                health_change: *health_change,
                attack_change: *attack_change,
                new_attack: *new_attack,
                new_health: *new_health,
            },
            Self::UnitSpawn {
                team,
                spawned_unit,
                new_board_state,
            } => Self::UnitSpawn {
                team: *team,
                spawned_unit: spawned_unit.clone(),
                new_board_state: new_board_state.clone(),
            },
            Self::LimitExceeded {
                losing_team,
                reason,
            } => Self::LimitExceeded {
                losing_team: *losing_team,
                reason: reason.clone(),
            },
        }
    }
}

impl<MaxAbilities: Get<u32>, MaxStringLen: Get<u32>, MaxBoardSize: Get<u32>> PartialEq
    for BoundedCombatEvent<MaxAbilities, MaxStringLen, MaxBoardSize>
{
    fn eq(&self, other: &Self) -> bool {
        match (self, other) {
            (Self::PhaseStart { phase: p1 }, Self::PhaseStart { phase: p2 }) => p1 == p2,
            (Self::PhaseEnd { phase: p1 }, Self::PhaseEnd { phase: p2 }) => p1 == p2,
            (
                Self::AbilityTrigger {
                    source_instance_id: s1,
                    ability_name: n1,
                },
                Self::AbilityTrigger {
                    source_instance_id: s2,
                    ability_name: n2,
                },
            ) => s1 == s2 && n1 == n2,
            (
                Self::Clash {
                    p_dmg: p1,
                    e_dmg: e1,
                },
                Self::Clash {
                    p_dmg: p2,
                    e_dmg: e2,
                },
            ) => p1 == p2 && e1 == e2,
            (
                Self::DamageTaken {
                    target_instance_id: t1,
                    team: tm1,
                    remaining_hp: r1,
                },
                Self::DamageTaken {
                    target_instance_id: t2,
                    team: tm2,
                    remaining_hp: r2,
                },
            ) => t1 == t2 && tm1 == tm2 && r1 == r2,
            (
                Self::UnitDeath {
                    team: tm1,
                    new_board_state: b1,
                },
                Self::UnitDeath {
                    team: tm2,
                    new_board_state: b2,
                },
            ) => tm1 == tm2 && b1 == b2,
            (Self::BattleEnd { result: r1 }, Self::BattleEnd { result: r2 }) => r1 == r2,
            (
                Self::AbilityDamage {
                    source_instance_id: s1,
                    target_instance_id: t1,
                    damage: d1,
                    remaining_hp: r1,
                },
                Self::AbilityDamage {
                    source_instance_id: s2,
                    target_instance_id: t2,
                    damage: d2,
                    remaining_hp: r2,
                },
            ) => s1 == s2 && t1 == t2 && d1 == d2 && r1 == r2,
            (
                Self::AbilityModifyStats {
                    source_instance_id: s1,
                    target_instance_id: t1,
                    health_change: h1,
                    attack_change: a1,
                    new_attack: na1,
                    new_health: nh1,
                },
                Self::AbilityModifyStats {
                    source_instance_id: s2,
                    target_instance_id: t2,
                    health_change: h2,
                    attack_change: a2,
                    new_attack: na2,
                    new_health: nh2,
                },
            ) => s1 == s2 && t1 == t2 && h1 == h2 && a1 == a2 && na1 == na2 && nh1 == nh2,
            (
                Self::UnitSpawn {
                    team: tm1,
                    spawned_unit: s1,
                    new_board_state: b1,
                },
                Self::UnitSpawn {
                    team: tm2,
                    spawned_unit: s2,
                    new_board_state: b2,
                },
            ) => tm1 == tm2 && s1 == s2 && b1 == b2,
            (
                Self::LimitExceeded {
                    losing_team: l1,
                    reason: r1,
                },
                Self::LimitExceeded {
                    losing_team: l2,
                    reason: r2,
                },
            ) => l1 == l2 && r1 == r2,
            _ => false,
        }
    }
}

impl<MaxAbilities: Get<u32>, MaxStringLen: Get<u32>, MaxBoardSize: Get<u32>> Eq
    for BoundedCombatEvent<MaxAbilities, MaxStringLen, MaxBoardSize>
{
}

impl<MaxAbilities: Get<u32>, MaxStringLen: Get<u32>, MaxBoardSize: Get<u32>> Debug
    for BoundedCombatEvent<MaxAbilities, MaxStringLen, MaxBoardSize>
{
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::PhaseStart { phase } => {
                f.debug_struct("PhaseStart").field("phase", phase).finish()
            }
            Self::PhaseEnd { phase } => f.debug_struct("PhaseEnd").field("phase", phase).finish(),
            Self::AbilityTrigger {
                source_instance_id,
                ability_name,
            } => f
                .debug_struct("AbilityTrigger")
                .field("source_instance_id", source_instance_id)
                .field("ability_name", ability_name)
                .finish(),
            Self::Clash { p_dmg, e_dmg } => f
                .debug_struct("Clash")
                .field("p_dmg", p_dmg)
                .field("e_dmg", e_dmg)
                .finish(),
            Self::DamageTaken {
                target_instance_id,
                team,
                remaining_hp,
            } => f
                .debug_struct("DamageTaken")
                .field("target_instance_id", target_instance_id)
                .field("team", team)
                .field("remaining_hp", remaining_hp)
                .finish(),
            Self::UnitDeath {
                team,
                new_board_state,
            } => f
                .debug_struct("UnitDeath")
                .field("team", team)
                .field("new_board_state", new_board_state)
                .finish(),
            Self::BattleEnd { result } => {
                f.debug_struct("BattleEnd").field("result", result).finish()
            }
            Self::AbilityDamage {
                source_instance_id,
                target_instance_id,
                damage,
                remaining_hp,
            } => f
                .debug_struct("AbilityDamage")
                .field("source_instance_id", source_instance_id)
                .field("target_instance_id", target_instance_id)
                .field("damage", damage)
                .field("remaining_hp", remaining_hp)
                .finish(),
            Self::AbilityModifyStats {
                source_instance_id,
                target_instance_id,
                health_change,
                attack_change,
                new_attack,
                new_health,
            } => f
                .debug_struct("AbilityModifyStats")
                .field("source_instance_id", source_instance_id)
                .field("target_instance_id", target_instance_id)
                .field("health_change", health_change)
                .field("attack_change", attack_change)
                .field("new_attack", new_attack)
                .field("new_health", new_health)
                .finish(),
            Self::UnitSpawn {
                team,
                spawned_unit,
                new_board_state,
            } => f
                .debug_struct("UnitSpawn")
                .field("team", team)
                .field("spawned_unit", spawned_unit)
                .field("new_board_state", new_board_state)
                .finish(),
            Self::LimitExceeded {
                losing_team,
                reason,
            } => f
                .debug_struct("LimitExceeded")
                .field("losing_team", losing_team)
                .field("reason", reason)
                .finish(),
        }
    }
}

impl<MaxAbilities, MaxStringLen, MaxBoardSize> From<crate::battle::CombatEvent>
    for BoundedCombatEvent<MaxAbilities, MaxStringLen, MaxBoardSize>
where
    MaxAbilities: Get<u32>,
    MaxStringLen: Get<u32>,
    MaxBoardSize: Get<u32>,
{
    fn from(event: crate::battle::CombatEvent) -> Self {
        match event {
            crate::battle::CombatEvent::PhaseStart { phase } => Self::PhaseStart { phase },
            crate::battle::CombatEvent::PhaseEnd { phase } => Self::PhaseEnd { phase },
            crate::battle::CombatEvent::AbilityTrigger {
                source_instance_id,
                ability_name,
            } => Self::AbilityTrigger {
                source_instance_id,
                ability_name: string_to_bounded(ability_name),
            },
            crate::battle::CombatEvent::Clash { p_dmg, e_dmg } => Self::Clash { p_dmg, e_dmg },
            crate::battle::CombatEvent::DamageTaken {
                target_instance_id,
                team,
                remaining_hp,
            } => Self::DamageTaken {
                target_instance_id,
                team,
                remaining_hp,
            },
            crate::battle::CombatEvent::UnitDeath {
                team,
                new_board_state,
            } => Self::UnitDeath {
                team,
                new_board_state: BoundedVec::truncate_from(
                    new_board_state.into_iter().map(Into::into).collect(),
                ),
            },
            crate::battle::CombatEvent::BattleEnd { result } => Self::BattleEnd { result },
            crate::battle::CombatEvent::AbilityDamage {
                source_instance_id,
                target_instance_id,
                damage,
                remaining_hp,
            } => Self::AbilityDamage {
                source_instance_id,
                target_instance_id,
                damage,
                remaining_hp,
            },
            crate::battle::CombatEvent::AbilityModifyStats {
                source_instance_id,
                target_instance_id,
                health_change,
                attack_change,
                new_attack,
                new_health,
            } => Self::AbilityModifyStats {
                source_instance_id,
                target_instance_id,
                health_change,
                attack_change,
                new_attack,
                new_health,
            },
            crate::battle::CombatEvent::UnitSpawn {
                team,
                spawned_unit,
                new_board_state,
            } => Self::UnitSpawn {
                team,
                spawned_unit: spawned_unit.into(),
                new_board_state: BoundedVec::truncate_from(
                    new_board_state.into_iter().map(Into::into).collect(),
                ),
            },
            crate::battle::CombatEvent::LimitExceeded {
                losing_team,
                reason,
            } => Self::LimitExceeded {
                losing_team,
                reason,
            },
        }
    }
}
