//! Sealed format — random bag generation from a card set.

use alloc::vec::Vec;

use oab_core::rng::{BattleRng, XorShiftRng};
use oab_core::state::{CardSet, STARTING_BAG_SIZE};
use oab_core::types::CardId;

/// Create a starting bag of random CardIds from a card set, weighted by rarity.
pub fn create_starting_bag(set: &CardSet, seed: u64) -> Vec<CardId> {
    if set.cards.is_empty() {
        return Vec::new();
    }

    let mut bag = Vec::with_capacity(STARTING_BAG_SIZE);
    let mut rng = XorShiftRng::seed_from_u64(seed);

    // Calculate total weight for weighted selection
    let total_weight: u32 = set.cards.iter().map(|entry| entry.rarity).sum();
    if total_weight == 0 {
        return Vec::new();
    }

    for _ in 0..STARTING_BAG_SIZE {
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
    use oab_core::state::CardSetEntry;

    #[test]
    fn empty_set_returns_empty() {
        let set = CardSet { cards: vec![] };
        let bag = create_starting_bag(&set, 123);
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
        let bag = create_starting_bag(&set, 999);
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
        let a = create_starting_bag(&set, 77);
        let b = create_starting_bag(&set, 77);
        let c = create_starting_bag(&set, 78);
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
        let bag = create_starting_bag(&set, 321);
        assert_eq!(bag.len(), STARTING_BAG_SIZE);
        assert!(bag.iter().all(|id| *id == CardId(42)));
    }
}
