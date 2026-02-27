use crate::state::{CardSet, CardSetEntry, STARTING_BAG_SIZE};
use crate::types::CardId;
use crate::units::create_starting_bag;

#[test]
fn test_create_starting_bag_empty_set_returns_empty() {
    let set = CardSet { cards: vec![] };
    let bag = create_starting_bag(&set, 123);
    assert!(bag.is_empty());
}

#[test]
fn test_create_starting_bag_zero_total_weight_returns_empty() {
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
fn test_create_starting_bag_deterministic_for_seed() {
    let set = CardSet {
        cards: vec![
            CardSetEntry {
                card_id: CardId(1),
                rarity: 1,
            },
            CardSetEntry {
                card_id: CardId(2),
                rarity: 2,
            },
            CardSetEntry {
                card_id: CardId(3),
                rarity: 3,
            },
        ],
    };

    let a = create_starting_bag(&set, 77);
    let b = create_starting_bag(&set, 77);
    let c = create_starting_bag(&set, 78);

    assert_eq!(a, b, "same seed should produce the same bag");
    assert_eq!(a.len(), STARTING_BAG_SIZE);
    assert_ne!(a, c, "different seeds should vary bag composition/order");
}

#[test]
fn test_create_starting_bag_single_weighted_card_fills_bag() {
    let set = CardSet {
        cards: vec![
            CardSetEntry {
                card_id: CardId(10),
                rarity: 0,
            },
            CardSetEntry {
                card_id: CardId(11),
                rarity: 5,
            },
        ],
    };

    let bag = create_starting_bag(&set, 321);
    assert_eq!(bag.len(), STARTING_BAG_SIZE);
    assert!(bag.iter().all(|id| *id == CardId(11)));
}
