//! Constructed format — deck validation for user-built decks.

use alloc::collections::BTreeMap;
use alloc::format;
use alloc::string::String;

use oab_core::state::{CardSet, STARTING_BAG_SIZE};
use oab_core::types::CardId;

/// Maximum copies of a single card allowed in a constructed deck.
pub const MAX_COPIES_PER_CARD: usize = 5;

/// Validate a user-provided constructed deck against a card set.
///
/// Checks:
/// - Deck has exactly `STARTING_BAG_SIZE` cards
/// - Every card exists in the set with rarity > 0 (no tokens)
/// - No card appears more than `max_copies_per_card` times
pub fn validate_deck(
    deck: &[u32],
    set: &CardSet,
    max_copies_per_card: usize,
) -> Result<(), String> {
    if deck.len() != STARTING_BAG_SIZE {
        return Err(format!(
            "Deck must have exactly {} cards, got {}",
            STARTING_BAG_SIZE,
            deck.len()
        ));
    }

    // Build lookup of valid (non-token) cards in the set
    let valid_cards: BTreeMap<CardId, u32> = set
        .cards
        .iter()
        .map(|e| (e.card_id, e.rarity))
        .collect();

    // Count copies of each card
    let mut counts: BTreeMap<u32, usize> = BTreeMap::new();
    for &card_id in deck {
        match valid_cards.get(&CardId(card_id)) {
            None => return Err(format!("Card {} is not in the selected set", card_id)),
            Some(0) => {
                return Err(format!("Card {} is a token and cannot be in a deck", card_id))
            }
            Some(_) => {}
        }
        *counts.entry(card_id).or_insert(0) += 1;
    }

    // Check per-card copy limit
    for (card_id, count) in &counts {
        if *count > max_copies_per_card {
            return Err(format!(
                "Card {} appears {} times (max {})",
                card_id, count, max_copies_per_card
            ));
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_set() -> CardSet {
        CardSet {
            cards: alloc::vec![
                oab_core::state::CardSetEntry { card_id: CardId(1), rarity: 100 },
                oab_core::state::CardSetEntry { card_id: CardId(2), rarity: 80 },
                oab_core::state::CardSetEntry { card_id: CardId(3), rarity: 60 },
                oab_core::state::CardSetEntry { card_id: CardId(4), rarity: 40 },
                oab_core::state::CardSetEntry { card_id: CardId(5), rarity: 20 },
                // Token card
                oab_core::state::CardSetEntry { card_id: CardId(99), rarity: 0 },
            ],
        }
    }

    fn valid_deck() -> alloc::vec::Vec<u32> {
        // 50 cards, 10 copies each of cards 1-5
        (0..50).map(|i| (i % 5) as u32 + 1).collect()
    }

    #[test]
    fn valid_deck_passes() {
        let set = test_set();
        // 5 copies each = within MAX_COPIES_PER_CARD limit
        let deck: alloc::vec::Vec<u32> = (0..50).map(|i| (i % 5) as u32 + 1).collect();
        assert!(validate_deck(&deck, &set, 10).is_ok());
    }

    #[test]
    fn wrong_size_rejected() {
        let set = test_set();
        let short: alloc::vec::Vec<u32> = alloc::vec![1; 49];
        let long: alloc::vec::Vec<u32> = alloc::vec![1; 51];
        assert!(validate_deck(&short, &set, 50).is_err());
        assert!(validate_deck(&long, &set, 50).is_err());
    }

    #[test]
    fn card_not_in_set_rejected() {
        let set = test_set();
        let mut deck = valid_deck();
        deck[0] = 999;
        assert!(validate_deck(&deck, &set, 50).is_err());
    }

    #[test]
    fn token_card_rejected() {
        let set = test_set();
        let mut deck = valid_deck();
        deck[0] = 99; // token
        assert!(validate_deck(&deck, &set, 50).is_err());
    }

    #[test]
    fn too_many_copies_rejected() {
        let set = test_set();
        let deck = valid_deck(); // 10 copies each
        assert!(validate_deck(&deck, &set, 5).is_err());
        assert!(validate_deck(&deck, &set, 10).is_ok());
    }
}
