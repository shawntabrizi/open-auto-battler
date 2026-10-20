//! The starter house ghosts of a set (decision Q1).
//!
//! A house ghost stands in for a player board in a new mode's empty ghost
//! pool. The starter list is built from the set's own cards by a fixed rule,
//! so it is reproducible and a designer can replace it later:
//!
//! - Rounds 1 to 10 (10 wins end a run), three boards per round: 30 per set.
//! - Units: `min(round, 5)`. A real player adds about one unit per round
//!   until the board (5 slots) is full.
//! - Cards: draftable cards (rarity > 0) whose play cost fits the round's
//!   mana limit `min(2 + round, 10)`, drawn by rarity weight like a bag.
//! - Buffs: none to round 5, +1/+1 for rounds 6 to 8, +2/+2 for rounds 9
//!   and 10, as a stand-in for the permanent buffs a real board collects.
//! - Order: highest health in front, then card id.
//! - Randomness: `XorShiftRng` seeded with
//!   `keccak("oab/house-ghost" ++ set_id ++ round ++ variant)`.

use oab_battle::rng::{BattleRng, XorShiftRng};
use oab_battle::types::{CardId, GhostBoardUnit, UnitCard};
use oab_engine::SetBundle;
use oab_protocol::{keccak256, HouseGhost};

pub const ROUNDS: u8 = 10;
pub const PER_ROUND: u8 = 3;

pub fn starter(bundle: &SetBundle) -> Vec<HouseGhost> {
    let mut out = Vec::new();
    for round in 1..=ROUNDS {
        for variant in 0..PER_ROUND {
            out.push(board(bundle, round, variant));
        }
    }
    out
}

fn card(bundle: &SetBundle, id: CardId) -> &UnitCard {
    bundle
        .cards
        .iter()
        .find(|c| c.id == id)
        .expect("bundle holds every set card")
}

fn board(bundle: &SetBundle, round: u8, variant: u8) -> HouseGhost {
    let mana = (2 + round).min(10);
    let pool: Vec<(CardId, u32)> = bundle
        .set
        .cards
        .iter()
        .filter(|e| e.rarity > 0 && card(bundle, e.card_id).economy.play_cost <= mana)
        .map(|e| (e.card_id, e.rarity as u32))
        .collect();
    let total: u32 = pool.iter().map(|(_, w)| w).sum();
    let mut seed = b"oab/house-ghost".to_vec();
    seed.extend_from_slice(&bundle.set_id.to_le_bytes());
    seed.push(round);
    seed.push(variant);
    let h = keccak256(&seed);
    let mut rng = XorShiftRng::seed_from_u64(u64::from_le_bytes(h[..8].try_into().unwrap()));

    let buff: i16 = match round {
        0..=5 => 0,
        6..=8 => 1,
        _ => 2,
    };
    let mut units: Vec<GhostBoardUnit> = (0..round.min(5))
        .map(|_| {
            let mut t = rng.gen_range(total as usize) as u32;
            let id = pool
                .iter()
                .find(|(_, w)| {
                    if t < *w {
                        true
                    } else {
                        t -= w;
                        false
                    }
                })
                .map(|(id, _)| *id)
                .expect("weights cover the draw");
            GhostBoardUnit {
                card_id: id,
                perm_attack: buff,
                perm_health: buff,
            }
        })
        .collect();
    units.sort_by_key(|u| {
        (
            -(card(bundle, u.card_id).stats.health + u.perm_health),
            u.card_id.0,
        )
    });
    HouseGhost {
        round,
        board: units,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use oab_engine::vectors::asset_bundles;

    // Content rejects a ghost list that breaks its rules, and a mode puts a
    // round-r ghost into round-r brackets. The starter list must pass Content
    // and look like a board a player could hold in that round.
    #[test]
    fn starter_ghosts_fit_content_rules_and_the_round() {
        for b in asset_bundles() {
            let g = starter(&b);
            assert_eq!(g.len(), (ROUNDS * PER_ROUND) as usize);
            assert!(g.len() <= oab_protocol::MAX_HOUSE_GHOSTS);
            for h in &g {
                assert_eq!(h.board.len(), h.round.min(5) as usize);
                assert!(h.board.len() <= oab_protocol::MAX_HOUSE_GHOST_UNITS);
                for u in &h.board {
                    let e = b.set.cards.iter().find(|e| e.card_id == u.card_id).unwrap();
                    assert!(e.rarity > 0, "tokens are not drafted");
                    assert!(card(&b, u.card_id).economy.play_cost <= (2 + h.round).min(10));
                }
            }
            assert_eq!(g, starter(&b), "reproducible");
        }
    }
}
