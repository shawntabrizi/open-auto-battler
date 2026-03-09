use oab_core::types::{BoardUnit, CardId, StatusMask};

/// A PvE encounter board.
#[allow(dead_code)]
pub struct Encounter {
    pub name: &'static str,
    pub tier: u8,
    pub board: [Option<BoardUnit>; 5],
    pub is_boss: bool,
}

/// Game-specific configuration. Implement this trait for each game built on oab-core.
pub trait GameConfig: Send + Sync {
    /// Human-readable game name.
    fn name(&self) -> &str;
    /// Index into `get_all_sets()`.
    fn set_index(&self) -> usize;
    /// Number of battle wins required for overall victory.
    fn wins_to_victory(&self) -> i32;
    /// Starting lives.
    fn starting_lives(&self) -> i32;
    /// Maximum number of rounds before the run ends.
    fn max_rounds(&self) -> i32;
    /// Select a PvE encounter for the given round and seed.
    fn pick_encounter(&self, round: i32, seed: u64) -> &Encounter;
}

/// Helper to build a `Some(BoardUnit)` with no perm stats.
pub const fn u(id: u32) -> Option<BoardUnit> {
    Some(BoardUnit {
        card_id: CardId(id),
        perm_attack: 0,
        perm_health: 0,
        perm_statuses: StatusMask::empty(),
    })
}

/// Helper to build a `Some(BoardUnit)` with permanent stat bonuses.
pub const fn ub(id: u32, pa: i32, ph: i32) -> Option<BoardUnit> {
    Some(BoardUnit {
        card_id: CardId(id),
        perm_attack: pa,
        perm_health: ph,
        perm_statuses: StatusMask::empty(),
    })
}
