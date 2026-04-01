//! Bounded session types for on-chain usage
//!
//! This module provides bounded versions of game session types, suitable for use
//! in runtime storage where unbounded vectors are unsafe.
//!
//! Requires the `bounded` feature.

use alloc::vec::Vec;
use bounded_collections::{BoundedBTreeMap, BoundedVec, Get};
use core::fmt::Debug;
use parity_scale_codec::{Decode, DecodeWithMemTracking, Encode, MaxEncodedLen};
use scale_info::TypeInfo;

use oab_battle::bounded::BoundedUnitCard;
use oab_battle::types::{BoardUnit, CardId, ManaValue, RoundValue, SetIdValue};

use crate::state::{derive_hand_indices_logic, GamePhase, GameSession, GameState, LocalGameState};

// --- Bounded Game State Implementation ---

impl<MaxBagSize, MaxBoardSize, MaxAbilities, MaxStringLen, MaxHandActions, MaxConditions>
    BoundedGameState<
        MaxBagSize,
        MaxBoardSize,
        MaxAbilities,
        MaxStringLen,
        MaxHandActions,
        MaxConditions,
    >
where
    MaxBagSize: Get<u32>,
    MaxBoardSize: Get<u32>,
    MaxAbilities: Get<u32>,
    MaxStringLen: Get<u32>,
    MaxHandActions: Get<u32>,
    MaxConditions: Get<u32>,
{
    /// Populate the hand by drawing from the bag.
    pub fn draw_hand(&mut self, hand_size: usize) {
        // Return unused hand cards to the bag
        let hand_cards: Vec<_> = self.hand.drain(..).collect();
        for card_id in hand_cards {
            let _ = self.bag.try_push(card_id);
        }

        let indices =
            derive_hand_indices_logic(self.bag.len(), self.game_seed, self.round, hand_size);
        if indices.is_empty() {
            return;
        }

        // Sort indices descending to remove from bag without shifting issues
        let mut sorted_indices = indices;
        sorted_indices.sort_unstable_by(|a, b| b.cmp(a));

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
}

// --- Bounded Local Game State ---

#[derive(Encode, Decode, DecodeWithMemTracking, TypeInfo, MaxEncodedLen)]
#[scale_info(skip_type_params(MaxBagSize, MaxBoardSize, MaxHandActions))]
pub struct BoundedLocalGameState<MaxBagSize, MaxBoardSize, MaxHandActions>
where
    MaxBagSize: Get<u32>,
    MaxBoardSize: Get<u32>,
    MaxHandActions: Get<u32>,
{
    pub bag: BoundedVec<CardId, MaxBagSize>,
    pub hand: BoundedVec<CardId, MaxHandActions>,
    pub board: BoundedVec<Option<BoardUnit>, MaxBoardSize>,
    pub mana_limit: ManaValue,
    pub shop_mana: ManaValue,
    pub round: RoundValue,
    pub lives: RoundValue,
    pub wins: RoundValue,
    pub phase: GamePhase,
    pub next_card_id: u16,
    pub game_seed: u64,
}

impl<MaxBagSize, MaxBoardSize, MaxHandActions> Clone
    for BoundedLocalGameState<MaxBagSize, MaxBoardSize, MaxHandActions>
where
    MaxBagSize: Get<u32>,
    MaxBoardSize: Get<u32>,
    MaxHandActions: Get<u32>,
{
    fn clone(&self) -> Self {
        Self {
            bag: self.bag.clone(),
            hand: self.hand.clone(),
            board: self.board.clone(),
            mana_limit: self.mana_limit,
            shop_mana: self.shop_mana,
            round: self.round,
            lives: self.lives,
            wins: self.wins,
            phase: self.phase.clone(),
            next_card_id: self.next_card_id,
            game_seed: self.game_seed,
        }
    }
}

impl<MaxBagSize, MaxBoardSize, MaxHandActions> PartialEq
    for BoundedLocalGameState<MaxBagSize, MaxBoardSize, MaxHandActions>
where
    MaxBagSize: Get<u32>,
    MaxBoardSize: Get<u32>,
    MaxHandActions: Get<u32>,
{
    fn eq(&self, other: &Self) -> bool {
        self.bag == other.bag
            && self.hand == other.hand
            && self.board == other.board
            && self.mana_limit == other.mana_limit
            && self.shop_mana == other.shop_mana
            && self.round == other.round
            && self.lives == other.lives
            && self.wins == other.wins
            && self.phase == other.phase
            && self.next_card_id == other.next_card_id
            && self.game_seed == other.game_seed
    }
}

impl<MaxBagSize, MaxBoardSize, MaxHandActions> Eq
    for BoundedLocalGameState<MaxBagSize, MaxBoardSize, MaxHandActions>
where
    MaxBagSize: Get<u32>,
    MaxBoardSize: Get<u32>,
    MaxHandActions: Get<u32>,
{
}

impl<MaxBagSize, MaxBoardSize, MaxHandActions> Debug
    for BoundedLocalGameState<MaxBagSize, MaxBoardSize, MaxHandActions>
where
    MaxBagSize: Get<u32>,
    MaxBoardSize: Get<u32>,
    MaxHandActions: Get<u32>,
{
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        f.debug_struct("BoundedLocalGameState")
            .field("bag", &self.bag)
            .field("hand", &self.hand)
            .field("board", &self.board)
            .field("mana_limit", &self.mana_limit)
            .field("shop_mana", &self.shop_mana)
            .field("round", &self.round)
            .field("lives", &self.lives)
            .field("wins", &self.wins)
            .field("phase", &self.phase)
            .field("next_card_id", &self.next_card_id)
            .field("game_seed", &self.game_seed)
            .finish()
    }
}

impl<MaxBagSize, MaxBoardSize, MaxHandActions> From<LocalGameState>
    for BoundedLocalGameState<MaxBagSize, MaxBoardSize, MaxHandActions>
where
    MaxBagSize: Get<u32>,
    MaxBoardSize: Get<u32>,
    MaxHandActions: Get<u32>,
{
    fn from(state: LocalGameState) -> Self {
        Self {
            bag: BoundedVec::truncate_from(state.bag),
            hand: BoundedVec::truncate_from(state.hand),
            board: BoundedVec::truncate_from(state.board),
            mana_limit: state.mana_limit,
            shop_mana: state.shop_mana,
            round: state.round,
            lives: state.lives,
            wins: state.wins,
            phase: state.phase,
            next_card_id: state.next_card_id,
            game_seed: state.game_seed,
        }
    }
}

impl<MaxBagSize, MaxBoardSize, MaxHandActions>
    From<BoundedLocalGameState<MaxBagSize, MaxBoardSize, MaxHandActions>> for LocalGameState
where
    MaxBagSize: Get<u32>,
    MaxBoardSize: Get<u32>,
    MaxHandActions: Get<u32>,
{
    fn from(bounded: BoundedLocalGameState<MaxBagSize, MaxBoardSize, MaxHandActions>) -> Self {
        Self {
            bag: bounded.bag.into_inner(),
            hand: bounded.hand.into_inner(),
            board: bounded.board.into_inner(),
            mana_limit: bounded.mana_limit,
            shop_mana: bounded.shop_mana,
            round: bounded.round,
            lives: bounded.lives,
            wins: bounded.wins,
            phase: bounded.phase,
            next_card_id: bounded.next_card_id,
            game_seed: bounded.game_seed,
        }
    }
}

#[derive(Encode, Decode, DecodeWithMemTracking, TypeInfo, MaxEncodedLen)]
#[scale_info(skip_type_params(MaxBagSize, MaxBoardSize, MaxHandActions))]
pub struct BoundedGameSession<MaxBagSize, MaxBoardSize, MaxHandActions>
where
    MaxBagSize: Get<u32>,
    MaxBoardSize: Get<u32>,
    MaxHandActions: Get<u32>,
{
    pub state: BoundedLocalGameState<MaxBagSize, MaxBoardSize, MaxHandActions>,
    pub set_id: SetIdValue,
    pub config: crate::GameConfig,
}

impl<MaxBagSize, MaxBoardSize, MaxHandActions> Clone
    for BoundedGameSession<MaxBagSize, MaxBoardSize, MaxHandActions>
where
    MaxBagSize: Get<u32>,
    MaxBoardSize: Get<u32>,
    MaxHandActions: Get<u32>,
{
    fn clone(&self) -> Self {
        Self {
            state: self.state.clone(),
            set_id: self.set_id,
            config: self.config.clone(),
        }
    }
}

impl<MaxBagSize, MaxBoardSize, MaxHandActions> PartialEq
    for BoundedGameSession<MaxBagSize, MaxBoardSize, MaxHandActions>
where
    MaxBagSize: Get<u32>,
    MaxBoardSize: Get<u32>,
    MaxHandActions: Get<u32>,
{
    fn eq(&self, other: &Self) -> bool {
        self.state == other.state && self.set_id == other.set_id && self.config == other.config
    }
}

impl<MaxBagSize, MaxBoardSize, MaxHandActions> Eq
    for BoundedGameSession<MaxBagSize, MaxBoardSize, MaxHandActions>
where
    MaxBagSize: Get<u32>,
    MaxBoardSize: Get<u32>,
    MaxHandActions: Get<u32>,
{
}

impl<MaxBagSize, MaxBoardSize, MaxHandActions> Debug
    for BoundedGameSession<MaxBagSize, MaxBoardSize, MaxHandActions>
where
    MaxBagSize: Get<u32>,
    MaxBoardSize: Get<u32>,
    MaxHandActions: Get<u32>,
{
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        f.debug_struct("BoundedGameSession")
            .field("state", &self.state)
            .field("set_id", &self.set_id)
            .field("config", &self.config)
            .finish()
    }
}

impl<MaxBagSize, MaxBoardSize, MaxHandActions> From<GameSession>
    for BoundedGameSession<MaxBagSize, MaxBoardSize, MaxHandActions>
where
    MaxBagSize: Get<u32>,
    MaxBoardSize: Get<u32>,
    MaxHandActions: Get<u32>,
{
    fn from(session: GameSession) -> Self {
        Self {
            state: session.state.into(),
            set_id: session.set_id,
            config: session.config,
        }
    }
}

impl<MaxBagSize, MaxBoardSize, MaxHandActions>
    From<BoundedGameSession<MaxBagSize, MaxBoardSize, MaxHandActions>> for GameSession
where
    MaxBagSize: Get<u32>,
    MaxBoardSize: Get<u32>,
    MaxHandActions: Get<u32>,
{
    fn from(session: BoundedGameSession<MaxBagSize, MaxBoardSize, MaxHandActions>) -> Self {
        Self {
            state: session.state.into(),
            set_id: session.set_id,
            config: session.config,
        }
    }
}

// --- Bounded Game State ---

#[derive(Encode, Decode, DecodeWithMemTracking, TypeInfo, MaxEncodedLen)]
#[scale_info(skip_type_params(
    MaxBagSize,
    MaxBoardSize,
    MaxAbilities,
    MaxStringLen,
    MaxHandActions,
    MaxConditions
))]
pub struct BoundedGameState<
    MaxBagSize,
    MaxBoardSize,
    MaxAbilities,
    MaxStringLen,
    MaxHandActions,
    MaxConditions,
> where
    MaxBagSize: Get<u32>,
    MaxBoardSize: Get<u32>,
    MaxAbilities: Get<u32>,
    MaxStringLen: Get<u32>,
    MaxHandActions: Get<u32>,
    MaxConditions: Get<u32>,
{
    pub card_pool: BoundedBTreeMap<
        CardId,
        BoundedUnitCard<MaxAbilities, MaxStringLen, MaxConditions>,
        MaxBagSize,
    >,
    pub set_id: SetIdValue,
    pub local_state: BoundedLocalGameState<MaxBagSize, MaxBoardSize, MaxHandActions>,
}

impl<
        MaxBagSize: Get<u32>,
        MaxBoardSize: Get<u32>,
        MaxAbilities: Get<u32>,
        MaxStringLen: Get<u32>,
        MaxHandActions: Get<u32>,
        MaxConditions: Get<u32>,
    > Clone
    for BoundedGameState<
        MaxBagSize,
        MaxBoardSize,
        MaxAbilities,
        MaxStringLen,
        MaxHandActions,
        MaxConditions,
    >
{
    fn clone(&self) -> Self {
        Self {
            card_pool: self.card_pool.clone(),
            set_id: self.set_id,
            local_state: self.local_state.clone(),
        }
    }
}

impl<
        MaxBagSize: Get<u32>,
        MaxBoardSize: Get<u32>,
        MaxAbilities: Get<u32>,
        MaxStringLen: Get<u32>,
        MaxHandActions: Get<u32>,
        MaxConditions: Get<u32>,
    > PartialEq
    for BoundedGameState<
        MaxBagSize,
        MaxBoardSize,
        MaxAbilities,
        MaxStringLen,
        MaxHandActions,
        MaxConditions,
    >
{
    fn eq(&self, other: &Self) -> bool {
        self.card_pool == other.card_pool
            && self.set_id == other.set_id
            && self.local_state == other.local_state
    }
}

impl<
        MaxBagSize: Get<u32>,
        MaxBoardSize: Get<u32>,
        MaxAbilities: Get<u32>,
        MaxStringLen: Get<u32>,
        MaxHandActions: Get<u32>,
        MaxConditions: Get<u32>,
    > Eq
    for BoundedGameState<
        MaxBagSize,
        MaxBoardSize,
        MaxAbilities,
        MaxStringLen,
        MaxHandActions,
        MaxConditions,
    >
{
}

impl<
        MaxBagSize: Get<u32>,
        MaxBoardSize: Get<u32>,
        MaxAbilities: Get<u32>,
        MaxStringLen: Get<u32>,
        MaxHandActions: Get<u32>,
        MaxConditions: Get<u32>,
    > Debug
    for BoundedGameState<
        MaxBagSize,
        MaxBoardSize,
        MaxAbilities,
        MaxStringLen,
        MaxHandActions,
        MaxConditions,
    >
{
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        f.debug_struct("BoundedGameState")
            .field("card_pool", &self.card_pool)
            .field("set_id", &self.set_id)
            .field("local_state", &self.local_state)
            .finish()
    }
}

impl<MaxBagSize, MaxBoardSize, MaxAbilities, MaxStringLen, MaxHandActions, MaxConditions>
    From<GameState>
    for BoundedGameState<
        MaxBagSize,
        MaxBoardSize,
        MaxAbilities,
        MaxStringLen,
        MaxHandActions,
        MaxConditions,
    >
where
    MaxBagSize: Get<u32>,
    MaxBoardSize: Get<u32>,
    MaxAbilities: Get<u32>,
    MaxStringLen: Get<u32>,
    MaxHandActions: Get<u32>,
    MaxConditions: Get<u32>,
{
    fn from(state: GameState) -> Self {
        let (card_pool_raw, set_id, _config, local_state_raw) = state.decompose();

        let mut card_pool = BoundedBTreeMap::new();
        for (id, card) in card_pool_raw {
            let _ = card_pool.try_insert(id, card.into());
        }

        Self {
            card_pool,
            set_id,
            local_state: local_state_raw.into(),
        }
    }
}

impl<MaxBagSize, MaxBoardSize, MaxAbilities, MaxStringLen, MaxHandActions, MaxConditions>
    From<
        BoundedGameState<
            MaxBagSize,
            MaxBoardSize,
            MaxAbilities,
            MaxStringLen,
            MaxHandActions,
            MaxConditions,
        >,
    > for GameState
where
    MaxBagSize: Get<u32>,
    MaxBoardSize: Get<u32>,
    MaxAbilities: Get<u32>,
    MaxStringLen: Get<u32>,
    MaxHandActions: Get<u32>,
    MaxConditions: Get<u32>,
{
    fn from(
        bounded: BoundedGameState<
            MaxBagSize,
            MaxBoardSize,
            MaxAbilities,
            MaxStringLen,
            MaxHandActions,
            MaxConditions,
        >,
    ) -> Self {
        let card_pool = bounded
            .card_pool
            .into_iter()
            .map(|(id, card)| (id, card.into()))
            .collect();
        let local_state = bounded.local_state.into();

        Self::reconstruct(
            card_pool,
            bounded.set_id,
            crate::sealed::default_config(),
            local_state,
        )
    }
}

impl<MaxBagSize, MaxBoardSize, MaxAbilities, MaxStringLen, MaxHandActions, MaxConditions>
    core::ops::Deref
    for BoundedGameState<
        MaxBagSize,
        MaxBoardSize,
        MaxAbilities,
        MaxStringLen,
        MaxHandActions,
        MaxConditions,
    >
where
    MaxBagSize: Get<u32>,
    MaxBoardSize: Get<u32>,
    MaxAbilities: Get<u32>,
    MaxStringLen: Get<u32>,
    MaxHandActions: Get<u32>,
    MaxConditions: Get<u32>,
{
    type Target = BoundedLocalGameState<MaxBagSize, MaxBoardSize, MaxHandActions>;
    fn deref(&self) -> &Self::Target {
        &self.local_state
    }
}

impl<MaxBagSize, MaxBoardSize, MaxAbilities, MaxStringLen, MaxHandActions, MaxConditions>
    core::ops::DerefMut
    for BoundedGameState<
        MaxBagSize,
        MaxBoardSize,
        MaxAbilities,
        MaxStringLen,
        MaxHandActions,
        MaxConditions,
    >
where
    MaxBagSize: Get<u32>,
    MaxBoardSize: Get<u32>,
    MaxAbilities: Get<u32>,
    MaxStringLen: Get<u32>,
    MaxHandActions: Get<u32>,
    MaxConditions: Get<u32>,
{
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.local_state
    }
}
