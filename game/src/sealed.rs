//! Sealed format — random bag generation from a card set.

use alloc::vec::Vec;

use oab_battle::rng::{BattleRng, XorShiftRng};
use oab_battle::state::CardSet;

use oab_battle::types::CardId;

use crate::GameConfig;

/// Default game configuration for sealed format.
pub fn default_config() -> GameConfig {
    GameConfig {
        starting_lives: 3,
        wins_to_victory: 10,
        starting_mana_limit: 3,
        max_mana_limit: 10,
        full_mana_each_round: false,
        board_size: 5,
        hand_size: 5,
        bag_size: 50,
    }
}

/// Create a starting bag of random CardIds from a card set, weighted by rarity.
pub fn create_starting_bag(set: &CardSet, seed: u64, bag_size: usize) -> Vec<CardId> {
    if set.cards.is_empty() {
        return Vec::new();
    }

    let mut bag = Vec::with_capacity(bag_size);
    let mut rng = XorShiftRng::seed_from_u64(seed);

    // Calculate total weight for weighted selection
    let total_weight: u32 = set.cards.iter().map(|entry| entry.rarity).sum();
    if total_weight == 0 {
        return Vec::new();
    }

    for _ in 0..bag_size {
        let mut target = rng.gen_range(total_weight as usize) as u32;
        for entry in &set.cards {
            if entry.rarity == 0 {
                continue;
            }
            if target < entry.rarity {
                bag.push(entry.card_id);
                break;
            }
            target -= entry.rarity;
        }
    }

    bag
}

#[cfg(test)]
mod tests {
    use super::*;
    use alloc::vec;
    use oab_battle::state::CardSetEntry;

    #[test]
    fn empty_set_returns_empty() {
        let set = CardSet { cards: vec![] };
        let bag = create_starting_bag(&set, 123, 50);
        assert!(bag.is_empty());
    }

    #[test]
    fn zero_total_weight_returns_empty() {
        let set = CardSet {
            cards: vec![
                CardSetEntry {
                    card_id: CardId(1),
                    rarity: 0,
                },
                CardSetEntry {
                    card_id: CardId(2),
                    rarity: 0,
                },
            ],
        };
        let bag = create_starting_bag(&set, 999, 50);
        assert!(bag.is_empty());
    }

    #[test]
    fn deterministic_for_seed() {
        let set = CardSet {
            cards: vec![
                CardSetEntry {
                    card_id: CardId(10),
                    rarity: 50,
                },
                CardSetEntry {
                    card_id: CardId(20),
                    rarity: 30,
                },
                CardSetEntry {
                    card_id: CardId(30),
                    rarity: 20,
                },
            ],
        };
        let a = create_starting_bag(&set, 77, 50);
        let b = create_starting_bag(&set, 77, 50);
        let c = create_starting_bag(&set, 78, 50);
        assert_eq!(a, b, "same seed must produce same bag");
        assert_ne!(a, c, "different seed should produce different bag");
    }

    #[test]
    fn single_weighted_card_fills_bag() {
        let set = CardSet {
            cards: vec![
                CardSetEntry {
                    card_id: CardId(1),
                    rarity: 0,
                },
                CardSetEntry {
                    card_id: CardId(42),
                    rarity: 100,
                },
            ],
        };
        let config = default_config();
        let bag = create_starting_bag(&set, 321, config.bag_size);
        assert_eq!(bag.len(), config.bag_size);
        assert!(bag.iter().all(|id| *id == CardId(42)));
    }
}
