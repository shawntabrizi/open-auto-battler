//! Open Auto Battler engine (`@oab/engine`) — PolkaVM contract.
//!
//! The `oab-engine` crate over ABI, for third parties, tools, and auditors
//! who want to check a game result on chain. Modes link the crate and never
//! call this contract (`docs/CONTRACT_ARCHITECTURE.md` section 4.1).
//!
//! Rules this contract keeps on purpose:
//!
//! - **Pure.** No storage, no admin, no fallback, no calls out. The caller
//!   passes the content (a SCALE `SetBundle`), so it never calls Content.
//! - **One deployment per engine version.** `engineVersion()` and
//!   `vectorsHash()` name the behaviour; a new engine version is a new
//!   deployment (a new CDM version of `@oab/engine`).
//! - **SCALE in, SCALE out.** Every game value travels as SCALE inside ABI
//!   `bytes`, as in the arena.

#![cfg_attr(not(any(test, feature = "std", feature = "abi-gen")), no_main, no_std)]

// The contract macro declares `extern crate alloc` at the crate root (except on
// the abi-gen build) but injects no `use` imports, so import them here.
#[cfg(all(feature = "abi-gen", not(test)))]
extern crate alloc;
#[allow(unused_imports)]
use alloc::vec::Vec;

use parity_scale_codec::{DecodeAll, Encode};

use oab_battle::types::{CommitTurnAction, GhostBoardUnit};
use oab_engine::{SetBundle, TurnInput};
use oab_game::{GameConfig, LocalGameState};

/// `newGame` input.
pub type NewGameInput = (GameConfig, SetBundle, u64);
/// `resolveTurn` input: config, content, state, action, opponent,
/// battle seed, next shop seed.
pub type ResolveTurnInput = (
    GameConfig,
    SetBundle,
    LocalGameState,
    CommitTurnAction,
    Vec<GhostBoardUnit>,
    u64,
    u64,
);
/// `replayBattle` input: player board, opponent board, battle seed,
/// content, board size.
pub type ReplayBattleInput = (Vec<GhostBoardUnit>, Vec<GhostBoardUnit>, u64, SetBundle, u8);

#[pvm_contract_sdk::contract(allocator = "pico", allocator_size = 262144)]
mod oab_engine_contract {
    use super::*;
    use pvm_contract_sdk::Bytes;

    /// The input bytes are not the SCALE value the method expects.
    #[derive(Debug, pvm_contract_sdk::SolError)]
    pub struct BadInput;

    /// The turn breaks a game rule. `error` is SCALE `oab_battle::GameError`.
    #[derive(Debug, pvm_contract_sdk::SolError)]
    pub struct InvalidTurn {
        pub error: Bytes,
    }

    #[derive(Debug, pvm_contract_sdk::SolError)]
    pub enum EngineError {
        BadInput(BadInput),
        InvalidTurn(InvalidTurn),
    }

    pub struct OabEngineContract;

    impl OabEngineContract {
        #[pvm_contract_sdk::constructor]
        pub fn new(&mut self) {}

        /// The engine version this deployment runs (`oab_engine::ENGINE_VERSION`).
        #[pvm_contract_sdk::method]
        pub fn engine_version() -> u32 {
            oab_engine::ENGINE_VERSION
        }

        /// The golden-vector hash of that version (`ENGINE_VECTORS_HASH`).
        #[pvm_contract_sdk::method]
        pub fn vectors_hash() -> [u8; 32] {
            oab_engine::ENGINE_VECTORS_HASH
        }

        /// SCALE `(GameConfig, SetBundle, u64 seed)` -> SCALE `LocalGameState`.
        #[pvm_contract_sdk::method]
        pub fn new_game(input: Bytes) -> Result<Bytes, EngineError> {
            let (config, bundle, seed) =
                NewGameInput::decode_all(&mut &input.0[..]).map_err(|_| BadInput)?;
            Ok(Bytes::from(
                oab_engine::new_game(&config, &bundle, seed).encode(),
            ))
        }

        /// SCALE `ResolveTurnInput` -> SCALE `TurnOutput`. Reverts with
        /// `InvalidTurn` if the turn breaks a rule.
        #[pvm_contract_sdk::method]
        pub fn resolve_turn(input: Bytes) -> Result<Bytes, EngineError> {
            let (config, bundle, state, action, opponent, battle_seed, next_shop_seed) =
                ResolveTurnInput::decode_all(&mut &input.0[..]).map_err(|_| BadInput)?;
            let pool = bundle.card_pool();
            oab_engine::resolve_turn(TurnInput {
                config: &config,
                pool: &pool,
                state,
                action,
                opponent,
                battle_seed,
                next_shop_seed,
            })
            .map(|out| Bytes::from(out.encode()))
            .map_err(|e| {
                InvalidTurn {
                    error: Bytes::from(e.encode()),
                }
                .into()
            })
        }

        /// SCALE `ReplayBattleInput` -> SCALE `Vec<CombatEvent>`.
        #[pvm_contract_sdk::method]
        pub fn replay_battle(input: Bytes) -> Result<Bytes, EngineError> {
            let (player, opponent, seed, bundle, board_size) =
                ReplayBattleInput::decode_all(&mut &input.0[..]).map_err(|_| BadInput)?;
            let events = oab_engine::replay_battle(
                &player,
                &opponent,
                seed,
                &bundle.card_pool(),
                board_size as usize,
            );
            Ok(Bytes::from(events.encode()))
        }
    }
}

#[cfg(test)]
mod tests;
