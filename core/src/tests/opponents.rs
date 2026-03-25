use alloc::collections::BTreeMap;

use crate::opponents::generate_genesis_ghosts;
use crate::types::{CardId, UnitCard};

fn full_opponent_pool() -> BTreeMap<CardId, UnitCard> {
    let mut pool = BTreeMap::new();
    for id in 0..=39_u32 {
        let cid = CardId(id);
        pool.insert(
            cid,
            UnitCard::new(cid, "Enemy", 1 + (id as i32 % 4), 2, 1, 1),
        );
    }
    pool
}

#[test]
fn test_generate_genesis_ghosts_structure_and_counts() {
    let pool = full_opponent_pool();
    let ghosts = generate_genesis_ghosts(7, 2, 3, 99, &pool);

    // lives (3) * rounds (1=>1 win bucket, 2=>2 win buckets) = 3 * 3 = 9 brackets
    assert_eq!(ghosts.len(), 9);

    for (bracket, boards) in ghosts {
        assert_eq!(bracket.set_id, 7);
        assert!(bracket.round >= 1 && bracket.round <= 2);
        assert!(bracket.lives >= 1 && bracket.lives <= 3);
        assert_eq!(boards.len(), 3);

        for board in boards {
            assert!(!board.units.is_empty());
            assert!(board.units.len() <= 5);
        }
    }
}

#[test]
fn test_generate_genesis_ghosts_with_missing_pool_produces_empty_boards() {
    let pool = BTreeMap::new();
    let ghosts = generate_genesis_ghosts(1, 1, 2, 5, &pool);

    assert!(!ghosts.is_empty());
    for (_, boards) in ghosts {
        for board in boards {
            assert!(
                board.units.is_empty(),
                "missing templates should produce empty ghost boards"
            );
        }
    }
}
