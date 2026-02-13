//! Bag generation utilities.

use alloc::vec::Vec;

use crate::rng::BattleRng;
use crate::state::CardSet;
use crate::types::CardId;

/// Create a bag of 100 random CardIds from a specific set
pub fn create_genesis_bag(set: &CardSet, seed: u64) -> Vec<CardId> {
    if set.cards.is_empty() {
        return Vec::new();
    }

    let mut bag = Vec::with_capacity(100);
    let mut rng = crate::rng::XorShiftRng::seed_from_u64(seed);

    // Calculate total weight for weighted selection
    let total_weight: u32 = set.cards.iter().map(|entry| entry.rarity).sum();
    if total_weight == 0 {
        return Vec::new();
    }

    for _ in 0..100 {
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
