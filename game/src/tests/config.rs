use crate::{sealed, GameConfig};

#[test]
fn sealed_mana_limit_progression() {
    let config = sealed::default_config();
    assert_eq!(config.mana_limit_for_round(1), 3);
    assert_eq!(config.mana_limit_for_round(5), 7);
    assert_eq!(config.mana_limit_for_round(8), 10);
    assert_eq!(config.mana_limit_for_round(20), 10, "caps at max");
}

#[test]
fn custom_config_mana_limit() {
    let config = GameConfig {
        starting_lives: 3,
        wins_to_victory: 10,
        starting_mana_limit: 5,
        max_mana_limit: 15,
        full_mana_each_round: true,
        board_size: 5,
        hand_size: 5,
        bag_size: 50,
    };
    assert_eq!(config.mana_limit_for_round(1), 5);
    assert_eq!(config.mana_limit_for_round(6), 10);
    assert_eq!(config.mana_limit_for_round(11), 15);
    assert_eq!(config.mana_limit_for_round(20), 15);
}
