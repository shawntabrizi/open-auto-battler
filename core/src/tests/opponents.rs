use alloc::collections::BTreeMap;

use crate::error::GameError;
use crate::opponents::{generate_genesis_ghosts, get_opponent_for_round};
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
fn test_get_opponent_for_round_deterministic() {
    let pool = full_opponent_pool();

    let a = get_opponent_for_round(4, 42, &pool).expect("pool contains all strategy cards");
    let b = get_opponent_for_round(4, 42, &pool).expect("pool contains all strategy cards");

    let a_ids: Vec<CardId> = a.iter().map(|u| u.card_id).collect();
    let b_ids: Vec<CardId> = b.iter().map(|u| u.card_id).collect();
    assert_eq!(a_ids, b_ids);
    assert!(!a_ids.is_empty());
    assert!(a_ids.len() <= 5);
}

#[test]
fn test_get_opponent_for_round_missing_template_errors() {
    let pool = BTreeMap::new();
    let result = get_opponent_for_round(1, 0, &pool);
    assert!(matches!(result, Err(GameError::TemplateNotFound)));
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
