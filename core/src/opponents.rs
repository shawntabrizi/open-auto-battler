//! Opponent generation for battles
//!
//! This module handles generating enemy boards for battles with different "personalities" and scaling.

use alloc::collections::BTreeMap;
use alloc::vec;
use alloc::vec::Vec;

use crate::battle::CombatUnit;
use crate::error::{GameError, GameResult};
use crate::rng::{BattleRng, XorShiftRng};
use crate::types::{CardId, UnitCard};

/// Create a combat unit from the card pool by card ID
fn create_unit_from_pool(
    card_pool: &BTreeMap<CardId, UnitCard>,
    card_id: CardId,
) -> GameResult<CombatUnit> {
    let card = card_pool.get(&card_id).ok_or(GameError::TemplateNotFound)?;
    Ok(CombatUnit::from_card(card.clone()))
}

// Card ID constants for readability
const RAT_SWARM: u32 = 0;
const GOBLIN_SCOUT: u32 = 1;
const GOBLIN_GRUNT: u32 = 2;
const MILITIA: u32 = 5;
const SHIELD_BEARER: u32 = 6;
const ARCHER: u32 = 11;
const SNIPER: u32 = 12;
const BATTLE_HARDENED: u32 = 14;
const PACK_LEADER: u32 = 16;
const ZOMBIE_CAPTAIN: u32 = 20;
const NECROMANCER: u32 = 21;
const HEADHUNTER: u32 = 22;
const LICH: u32 = 29;
const ASSASSIN: u32 = 30;
const OGRE_MAULER: u32 = 32;
const SHIELD_MASTER: u32 = 34;
const MANA_REAPER: u32 = 36;
const GIANT_CRUSHER: u32 = 37;
const BEHEMOTH: u32 = 38;
const DRAGON_TYRANT: u32 = 39;

/// The Swarm Strategy: Focuses on many small units and undead spawning.
fn get_swarm_strategy(round: i32) -> Vec<u32> {
    match round {
        1 => vec![RAT_SWARM, GOBLIN_SCOUT],
        2 => vec![RAT_SWARM, GOBLIN_SCOUT, GOBLIN_GRUNT],
        3 => vec![ZOMBIE_CAPTAIN, GOBLIN_SCOUT, RAT_SWARM],
        4 => vec![ZOMBIE_CAPTAIN, ZOMBIE_CAPTAIN, RAT_SWARM],
        5 => vec![NECROMANCER, ZOMBIE_CAPTAIN, ZOMBIE_CAPTAIN, RAT_SWARM],
        6 => vec![
            NECROMANCER,
            PACK_LEADER,
            ZOMBIE_CAPTAIN,
            ZOMBIE_CAPTAIN,
            RAT_SWARM,
        ],
        7 => vec![LICH, NECROMANCER, ZOMBIE_CAPTAIN, ZOMBIE_CAPTAIN, RAT_SWARM],
        8 => vec![LICH, LICH, ZOMBIE_CAPTAIN, ZOMBIE_CAPTAIN, RAT_SWARM],
        9 => vec![LICH, LICH, NECROMANCER, ZOMBIE_CAPTAIN, ZOMBIE_CAPTAIN],
        _ => vec![DRAGON_TYRANT, LICH, LICH, ZOMBIE_CAPTAIN, ZOMBIE_CAPTAIN],
    }
}

/// The Tank Strategy: Focuses on high health units and front-line buffs.
fn get_tank_strategy(round: i32) -> Vec<u32> {
    match round {
        1 => vec![SHIELD_BEARER, MILITIA],
        2 => vec![SHIELD_BEARER, SHIELD_BEARER],
        3 => vec![SHIELD_BEARER, BATTLE_HARDENED, MILITIA],
        4 => vec![SHIELD_MASTER, SHIELD_BEARER, BATTLE_HARDENED],
        5 => vec![SHIELD_MASTER, SHIELD_BEARER, SHIELD_BEARER, BATTLE_HARDENED],
        6 => vec![SHIELD_MASTER, OGRE_MAULER, SHIELD_BEARER, BATTLE_HARDENED],
        7 => vec![BEHEMOTH, SHIELD_MASTER, OGRE_MAULER, BATTLE_HARDENED],
        8 => vec![BEHEMOTH, BEHEMOTH, SHIELD_MASTER, BATTLE_HARDENED],
        9 => vec![
            BEHEMOTH,
            BEHEMOTH,
            SHIELD_MASTER,
            SHIELD_MASTER,
            SHIELD_MASTER,
        ],
        _ => vec![BEHEMOTH, BEHEMOTH, BEHEMOTH, BEHEMOTH, BEHEMOTH],
    }
}

/// The Sniper Strategy: Focuses on back-line damage and specialized execution.
fn get_sniper_strategy(round: i32) -> Vec<u32> {
    match round {
        1 => vec![MILITIA, ARCHER],
        2 => vec![SHIELD_BEARER, SNIPER],
        3 => vec![MILITIA, ARCHER, SNIPER],
        4 => vec![SHIELD_BEARER, HEADHUNTER, SNIPER],
        5 => vec![SHIELD_BEARER, ASSASSIN, HEADHUNTER, SNIPER],
        6 => vec![OGRE_MAULER, ASSASSIN, HEADHUNTER, SNIPER, ARCHER],
        7 => vec![OGRE_MAULER, ASSASSIN, ASSASSIN, HEADHUNTER, SNIPER],
        8 => vec![GIANT_CRUSHER, ASSASSIN, ASSASSIN, HEADHUNTER, SNIPER],
        9 => vec![MANA_REAPER, GIANT_CRUSHER, ASSASSIN, HEADHUNTER, SNIPER],
        _ => vec![
            MANA_REAPER,
            MANA_REAPER,
            DRAGON_TYRANT,
            GIANT_CRUSHER,
            HEADHUNTER,
        ],
    }
}

/// Get the opponent board for a given round (1-10)
pub fn get_opponent_for_round(
    round: i32,
    seed: u64,
    card_pool: &BTreeMap<CardId, UnitCard>,
) -> GameResult<Vec<CombatUnit>> {
    let mut rng = XorShiftRng::seed_from_u64(seed);
    let strategy_roll = rng.gen_range(3); // 0, 1, or 2

    let card_ids = match strategy_roll {
        0 => get_swarm_strategy(round),
        1 => get_tank_strategy(round),
        _ => get_sniper_strategy(round),
    };

    let mut units = Vec::new();
    for id in card_ids {
        units.push(create_unit_from_pool(card_pool, CardId(id))?);
    }

    Ok(units)
}

/// A simple ghost board unit for genesis generation (non-bounded version).
#[derive(Clone, Debug)]
pub struct GhostBoard {
    pub units: Vec<GhostBoardUnitSimple>,
}

/// A unit on a ghost board (simple version for genesis).
#[derive(Clone, Debug)]
pub struct GhostBoardUnitSimple {
    pub card_id: CardId,
    pub perm_attack: i32,
    pub perm_health: i32,
}

/// Matchmaking bracket for ghost generation (simple version).
#[derive(Clone, Debug)]
pub struct GenesisMatchmakingBracket {
    pub set_id: u32,
    pub round: i32,
    pub wins: i32,
    pub lives: i32,
}

/// Generate genesis ghost boards for initial population.
/// Returns a list of (bracket, ghost_boards) pairs covering typical game scenarios.
///
/// # Arguments
/// * `set_id` - The card set ID to generate ghosts for
/// * `max_round` - Maximum round to generate ghosts for (typically 10)
/// * `ghosts_per_bracket` - Number of ghosts to generate per bracket
/// * `base_seed` - Base seed for deterministic generation
/// * `card_pool` - The card pool to look up card data from
pub fn generate_genesis_ghosts(
    set_id: u32,
    max_round: i32,
    ghosts_per_bracket: usize,
    base_seed: u64,
    card_pool: &BTreeMap<CardId, UnitCard>,
) -> Vec<(GenesisMatchmakingBracket, Vec<GhostBoard>)> {
    let mut result = Vec::new();

    // Generate ghosts for reasonable bracket combinations
    // Lives: 1, 2, 3
    // Wins: 0 to 9 (10 wins = victory)
    // Round: 1 to max_round
    for lives in 1..=3 {
        for round in 1..=max_round {
            // Wins can range from 0 to round-1 (you can't have more wins than rounds played minus one,
            // accounting for possible losses). Also cap at 9 since 10 = victory.
            let max_wins = (round - 1).min(9);
            for wins in 0..=max_wins {
                let bracket = GenesisMatchmakingBracket {
                    set_id,
                    round,
                    wins,
                    lives,
                };

                let mut ghosts = Vec::with_capacity(ghosts_per_bracket);

                // Generate ghosts using different strategies
                for i in 0..ghosts_per_bracket {
                    let seed = base_seed
                        .wrapping_add(lives as u64 * 1000000)
                        .wrapping_add(round as u64 * 10000)
                        .wrapping_add(wins as u64 * 100)
                        .wrapping_add(i as u64);

                    let strategy = i % 3; // Cycle through strategies

                    let card_ids = match strategy {
                        0 => get_swarm_strategy(round),
                        1 => get_tank_strategy(round),
                        _ => get_sniper_strategy(round),
                    };

                    let units: Vec<GhostBoardUnitSimple> = card_ids
                        .iter()
                        .enumerate()
                        .filter_map(|(idx, &id)| {
                            let cid = CardId(id);
                            card_pool.get(&cid).map(|_card| {
                                // Use a deterministic card ID based on the seed and index
                                let ghost_card_id =
                                    CardId(((seed.wrapping_add(idx as u64)) % 1000 + 1) as u32);
                                GhostBoardUnitSimple {
                                    card_id: ghost_card_id,
                                    perm_attack: 0,
                                    perm_health: 0,
                                }
                            })
                        })
                        .collect();

                    ghosts.push(GhostBoard { units });
                }

                if !ghosts.is_empty() {
                    result.push((bracket, ghosts));
                }
            }
        }
    }

    result
}
