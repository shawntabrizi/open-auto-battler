use crate::config::{u, Encounter, GameConfig};

const N: Option<oab_core::types::BoardUnit> = None;

// Card IDs from core/src/opponents.rs (Set 0)
const RAT_SWARM: u32 = 0;
const GOBLIN_SCOUT: u32 = 1;
const GOBLIN_GRUNT: u32 = 2;
const MILITIA: u32 = 5;
const SHIELD_BEARER: u32 = 6;
const ARCHER: u32 = 11;
const SNIPER: u32 = 12;
const BATTLE_HARDENED: u32 = 14;
const PACK_LEADER: u32 = 16;
const ZOMBIE_CAPTAIN: u32 = 20;
const NECROMANCER: u32 = 21;
const HEADHUNTER: u32 = 22;
const LICH: u32 = 29;
const ASSASSIN: u32 = 30;
const OGRE_MAULER: u32 = 32;
const SHIELD_MASTER: u32 = 34;
const MANA_REAPER: u32 = 36;
const GIANT_CRUSHER: u32 = 37;
const BEHEMOTH: u32 = 38;
const DRAGON_TYRANT: u32 = 39;

/// Swarm strategy encounters per round.
fn swarm_encounters() -> &'static [Encounter] {
    static SWARM: &[Encounter] = &[
        Encounter { name: "Swarm R1", tier: 1, board: [u(RAT_SWARM), u(GOBLIN_SCOUT), N, N, N], is_boss: false },
        Encounter { name: "Swarm R2", tier: 1, board: [u(RAT_SWARM), u(GOBLIN_SCOUT), u(GOBLIN_GRUNT), N, N], is_boss: false },
        Encounter { name: "Swarm R3", tier: 1, board: [u(ZOMBIE_CAPTAIN), u(GOBLIN_SCOUT), u(RAT_SWARM), N, N], is_boss: false },
        Encounter { name: "Swarm R4", tier: 2, board: [u(ZOMBIE_CAPTAIN), u(ZOMBIE_CAPTAIN), u(RAT_SWARM), N, N], is_boss: false },
        Encounter { name: "Swarm R5", tier: 2, board: [u(NECROMANCER), u(ZOMBIE_CAPTAIN), u(ZOMBIE_CAPTAIN), u(RAT_SWARM), N], is_boss: false },
        Encounter { name: "Swarm R6", tier: 2, board: [u(NECROMANCER), u(PACK_LEADER), u(ZOMBIE_CAPTAIN), u(ZOMBIE_CAPTAIN), u(RAT_SWARM)], is_boss: false },
        Encounter { name: "Swarm R7", tier: 3, board: [u(LICH), u(NECROMANCER), u(ZOMBIE_CAPTAIN), u(ZOMBIE_CAPTAIN), u(RAT_SWARM)], is_boss: false },
        Encounter { name: "Swarm R8", tier: 3, board: [u(LICH), u(LICH), u(ZOMBIE_CAPTAIN), u(ZOMBIE_CAPTAIN), u(RAT_SWARM)], is_boss: false },
        Encounter { name: "Swarm R9", tier: 3, board: [u(LICH), u(LICH), u(NECROMANCER), u(ZOMBIE_CAPTAIN), u(ZOMBIE_CAPTAIN)], is_boss: false },
        Encounter { name: "Swarm R10+", tier: 3, board: [u(DRAGON_TYRANT), u(LICH), u(LICH), u(ZOMBIE_CAPTAIN), u(ZOMBIE_CAPTAIN)], is_boss: false },
    ];
    SWARM
}

/// Tank strategy encounters per round.
fn tank_encounters() -> &'static [Encounter] {
    static TANK: &[Encounter] = &[
        Encounter { name: "Tank R1", tier: 1, board: [u(SHIELD_BEARER), u(MILITIA), N, N, N], is_boss: false },
        Encounter { name: "Tank R2", tier: 1, board: [u(SHIELD_BEARER), u(SHIELD_BEARER), N, N, N], is_boss: false },
        Encounter { name: "Tank R3", tier: 1, board: [u(SHIELD_BEARER), u(BATTLE_HARDENED), u(MILITIA), N, N], is_boss: false },
        Encounter { name: "Tank R4", tier: 2, board: [u(SHIELD_MASTER), u(SHIELD_BEARER), u(BATTLE_HARDENED), N, N], is_boss: false },
        Encounter { name: "Tank R5", tier: 2, board: [u(SHIELD_MASTER), u(SHIELD_BEARER), u(SHIELD_BEARER), u(BATTLE_HARDENED), N], is_boss: false },
        Encounter { name: "Tank R6", tier: 2, board: [u(SHIELD_MASTER), u(OGRE_MAULER), u(SHIELD_BEARER), u(BATTLE_HARDENED), N], is_boss: false },
        Encounter { name: "Tank R7", tier: 3, board: [u(BEHEMOTH), u(SHIELD_MASTER), u(OGRE_MAULER), u(BATTLE_HARDENED), N], is_boss: false },
        Encounter { name: "Tank R8", tier: 3, board: [u(BEHEMOTH), u(BEHEMOTH), u(SHIELD_MASTER), u(BATTLE_HARDENED), N], is_boss: false },
        Encounter { name: "Tank R9", tier: 3, board: [u(BEHEMOTH), u(BEHEMOTH), u(SHIELD_MASTER), u(SHIELD_MASTER), u(SHIELD_MASTER)], is_boss: false },
        Encounter { name: "Tank R10+", tier: 3, board: [u(BEHEMOTH), u(BEHEMOTH), u(BEHEMOTH), u(BEHEMOTH), u(BEHEMOTH)], is_boss: false },
    ];
    TANK
}

/// Sniper strategy encounters per round.
fn sniper_encounters() -> &'static [Encounter] {
    static SNIPER_ENC: &[Encounter] = &[
        Encounter { name: "Sniper R1", tier: 1, board: [u(MILITIA), u(ARCHER), N, N, N], is_boss: false },
        Encounter { name: "Sniper R2", tier: 1, board: [u(SHIELD_BEARER), u(SNIPER), N, N, N], is_boss: false },
        Encounter { name: "Sniper R3", tier: 1, board: [u(MILITIA), u(ARCHER), u(SNIPER), N, N], is_boss: false },
        Encounter { name: "Sniper R4", tier: 2, board: [u(SHIELD_BEARER), u(HEADHUNTER), u(SNIPER), N, N], is_boss: false },
        Encounter { name: "Sniper R5", tier: 2, board: [u(SHIELD_BEARER), u(ASSASSIN), u(HEADHUNTER), u(SNIPER), N], is_boss: false },
        Encounter { name: "Sniper R6", tier: 2, board: [u(OGRE_MAULER), u(ASSASSIN), u(HEADHUNTER), u(SNIPER), u(ARCHER)], is_boss: false },
        Encounter { name: "Sniper R7", tier: 3, board: [u(OGRE_MAULER), u(ASSASSIN), u(ASSASSIN), u(HEADHUNTER), u(SNIPER)], is_boss: false },
        Encounter { name: "Sniper R8", tier: 3, board: [u(GIANT_CRUSHER), u(ASSASSIN), u(ASSASSIN), u(HEADHUNTER), u(SNIPER)], is_boss: false },
        Encounter { name: "Sniper R9", tier: 3, board: [u(MANA_REAPER), u(GIANT_CRUSHER), u(ASSASSIN), u(HEADHUNTER), u(SNIPER)], is_boss: false },
        Encounter { name: "Sniper R10+", tier: 3, board: [u(MANA_REAPER), u(MANA_REAPER), u(DRAGON_TYRANT), u(GIANT_CRUSHER), u(HEADHUNTER)], is_boss: false },
    ];
    SNIPER_ENC
}

pub struct StarterPackConfig;

impl GameConfig for StarterPackConfig {
    fn name(&self) -> &str {
        "starter_pack"
    }

    fn set_index(&self) -> usize {
        0
    }

    fn wins_to_victory(&self) -> i32 {
        10
    }

    fn starting_lives(&self) -> i32 {
        3
    }

    fn max_rounds(&self) -> i32 {
        15
    }

    fn pick_encounter(&self, round: i32, seed: u64) -> &Encounter {
        // Pick one of 3 strategies (same logic as opponents.rs)
        let strategy_roll = (seed.wrapping_add(round as u64 * 13)) % 3;

        let pool = match strategy_roll {
            0 => swarm_encounters(),
            1 => tank_encounters(),
            _ => sniper_encounters(),
        };

        // Clamp round to encounter table range (1-indexed, up to 10)
        let idx = ((round as usize).clamp(1, 10)) - 1;
        &pool[idx]
    }
}
