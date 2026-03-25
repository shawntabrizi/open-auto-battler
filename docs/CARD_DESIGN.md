# Card Design Guide

This document defines the archetypes, stat budgets, and rarity system used to design and
balance all cards in the game.

## Stat Budget

Every card has a **stat budget** determined by its mana cost. Abilities cost stat points —
the stronger the ability, the fewer raw stats the card should have.

| Mana Cost | Stat Budget | Vanilla Example | With Ability Example   |
| --------- | ----------- | --------------- | ---------------------- |
| 1         | 4           | 2/2 or 1/3      | 1/2 + weak ability     |
| 2         | 6           | 3/3 or 2/4      | 2/2 + weak ability     |
| 3         | 8           | 4/4 or 3/5      | 2/3 + medium ability   |
| 4         | 10          | 5/5 or 4/6      | 3/4 + medium ability   |
| 5         | 12          | 6/6 or 5/7      | 4/5 + strong ability   |
| 6         | 14          | 7/7 or 6/8      | 5/6 + strong ability   |
| 7         | 16          | 8/8 or 7/9      | 5/7 + extreme ability  |
| 8         | 18          | 9/9 or 8/10     | 6/8 + extreme ability  |
| 10        | 22          | 11/11 or 10/12  | 8/10 + extreme ability |

**Stat budget formula:** `budget = (mana_cost * 2) + 2`

**Burn value formula:** `burn = floor(mana_cost / 2)`, capped at 3.

| Mana Cost | Burn Value |
| --------- | ---------- |
| 1         | 0          |
| 2         | 1          |
| 3         | 1          |
| 4         | 2          |
| 5         | 2          |
| 6         | 3          |
| 7+        | 3          |

### Ability Power Cost

Abilities consume stat points from the budget. A card with a strong ability should have
fewer raw stats than a vanilla card at the same mana cost.

| Ability Tier | Stat Cost | Examples                                                        |
| ------------ | --------- | --------------------------------------------------------------- |
| Weak         | 1-2 pts   | +1 stat to one ally, deal 1 damage                              |
| Medium       | 3-4 pts   | +2 stats to multiple allies, deal 3 damage, spawn a 1/1         |
| Strong       | 5-7 pts   | AoE buffs, deal 5+ damage, spawn a 3/3+                         |
| Extreme      | 8+ pts    | Board-wide scaling, repeated AoE triggers, game-warping effects |

### Notable Ability Patterns

Some cards use ability combinations to create emergent effects:

| Pattern    | Implementation                       | Stat Cost | Example               |
| ---------- | ------------------------------------ | --------- | --------------------- |
| Deathtouch | AfterUnitAttack: Destroy front enemy | ~10 pts   | Deathstalker, Stinger |

## Rarity System

The `rarity` field in `sets.json` is used directly as a **weight** in the bag-building
weighted random selection. Higher value = appears more often. A rarity of 0 means the card
is a token and cannot be drafted.

| Rarity Value | Label     | Frequency  | Design Intent                                           |
| ------------ | --------- | ---------- | ------------------------------------------------------- |
| 10           | Common    | Very often | Bread-and-butter cards, vanilla units, simple abilities |
| 8            | Uncommon  | Often      | Solid role-players with clear archetype fit             |
| 6            | Rare      | Sometimes  | Strong abilities, archetype payoffs                     |
| 4            | Epic      | Seldom     | Build-around cards, powerful finishers                  |
| 2            | Legendary | Rarely     | Game-warping effects, high stat budgets                 |
| 1            | Mythic    | Very rare  | Showstopper cards, highest cost/impact                  |

Token cards are not included in the set's card list at all — they are referenced by
`card_id` in spawn abilities but never appear in the bag.

**Rarity as a balance lever:** If a card is slightly above the stat budget curve or has an
unusually strong ability, it can be balanced by lowering its rarity — the player sees it
less often, so its average impact across games is kept in check.

**Guidelines:**

- Vanilla cards should generally be Common (10) or Uncommon (8)
- Archetype enablers should be Uncommon (8) or Rare (6) — common enough to find
- Archetype payoffs / finishers should be Rare (6) or Epic (4)
- Cards that warp the game around them should be Legendary (2) or Mythic (1)

---

## Archetypes

Each archetype defines a **strategy** the player can build toward, with its own thematic
faction. A healthy set has 8-12 cards per archetype spread across the mana curve.

| #   | Archetype    | Faction         | Visual Identity                 |
| --- | ------------ | --------------- | ------------------------------- |
| 1   | Spawn/Swarm  | **The Hive**    | Insects, beetles, ants, queens  |
| 2   | Scaling      | **The Grove**   | Trees, druids, forest creatures |
| 3   | Sniper/Burst | **The Academy** | Mages, spellcasters, elements   |
| 4   | Tank/Sustain | **The Order**   | Paladins, clerics, shields      |
| 5   | Faint Chain  | **The Undead**  | Skeletons, ghosts, death magic  |
| 6   | Thorns       | **The Wilds**   | Beasts, monsters, venom         |
| 7   | Economy      | **The Guild**   | Merchants, traders, gold        |
| 8   | Aggro/Rush   | **The Horde**   | Orcs, goblins, barbarians       |
| 9   | Comeback     | **The Fallen**  | Spirits, revenants, ghosts      |
| —   | Vanilla      | **Mercenaries** | Generic hired fighters          |

### Counter Wheel

```
Horde ──beats──> Guild ──beats──> Grove ──beats──> Order ──beats──> Horde
                                     │
                                     v
          Academy ──beats──> Hive ──beats──> Academy (triangle)
                      │
                      v
                  Wilds ──beats──> Horde (punishes repeated attacks)
                      │
                      v
              Undead ──beats──> Order (value from dying, outlasts sustain)
```

Archetypes should have **favorable and unfavorable matchups**. No archetype should beat
everything. Hybrid builds exist to shore up weak matchups at the cost of peak power.

---

### 1. Spawn / Swarm — _The Hive_

**Win condition:** Overwhelm the opponent with bodies. Spawn tokens on faint, buff spawned
units, fill the board faster than the enemy can clear it.

**Key mechanics:** OnFaint spawn, OnAllySpawn triggers, token generation

**Strengths:** Board presence, resilience to single-target removal
**Weaknesses:** Individually weak units, vulnerable to AoE damage

**Cards:**

| Name           | ATK | HP  | Cost | Burn | Rarity | Abilities                                     | Notes                            |
| -------------- | --- | --- | ---- | ---- | ------ | --------------------------------------------- | -------------------------------- |
| Larva          | 1   | 2   | 1    | 0    | 10     | OnFaint: Spawn 1/1 Grub in its place          | Cheapest spawner                 |
| Worker Bee     | 2   | 1   | 2    | 1    | 10     | OnAllySpawn: +1 ATK to spawned unit           | Makes tokens dangerous           |
| Scarab         | 2   | 2   | 3    | 1    | 10     | OnFaint: Spawn 2/2 Hatchling in its place     | Mid spawner                      |
| Ant Soldier    | 2   | 3   | 3    | 1    | 10     | OnAllySpawn: +2 ATK +1 HP to self             | Grows with every spawn           |
| Drone Keeper   | 3   | 4   | 4    | 2    | 8      | OnAllySpawn: +2 ATK to spawned unit (3x)      | Makes tokens hit harder          |
| Mantis         | 4   | 4   | 5    | 2    | 10     | OnFaint: Spawn 3/1 Nymph in its place         | Big body + strong token          |
| Swarm Queen    | 4   | 5   | 6    | 3    | 6      | OnAllySpawn: +2 ATK +2 HP to spawned unit     | THE spawn payoff                 |
| Moth Matriarch | 3   | 5   | 7    | 3    | 6      | OnAllyFaint: Spawn 3/3 Moth in its place (3x) | Board refill machine             |
| Hive Mother    | 5   | 7   | 9    | 3    | 6      | OnAllyFaint: Spawn 2/2 Drone at back (3x)     | Swarm engine                     |
| Brood Queen    | 5   | 7   | 10   | 3    | 2      | OnFaint: Spawn 3x 1/1 Stinger at back         | Kill the queen, face 3 assassins |

---

### 2. Scaling — _The Grove_

**Win condition:** Build one or two massive units over multiple shop phases. Invest early,
dominate late with stats that outclass anything the opponent can field.

**Key mechanics:** OnBuy/OnShopStart permanent buffs, self-scaling in combat, stat stacking

**Strengths:** Highest raw stats in late game, individual units are threats
**Weaknesses:** Slow to come online, vulnerable to Sniper targeting the carry

**Cards:**

| Name              | ATK | HP  | Cost | Burn | Rarity | Abilities                                                   | Notes                          |
| ----------------- | --- | --- | ---- | ---- | ------ | ----------------------------------------------------------- | ------------------------------ |
| Seedling          | 1   | 2   | 1    | 0    | 10     | OnBuy: +1/+1 to self (perm)                                 | Self-investment on purchase    |
| Sapling           | 2   | 2   | 2    | 1    | 10     | OnBuy: +1/+1 to random ally (perm)                          | Core scaling enabler           |
| Grove Tender      | 1   | 3   | 3    | 1    | 10     | OnShopStart: +1/+1 to back unit (perm)                      | Recurring shop engine          |
| Forest Sage       | 2   | 4   | 4    | 2    | 10     | OnShopStart: +1/+1 to 2 random allies (perm)                | Premium shop engine            |
| Earth Shaman      | 3   | 5   | 5    | 2    | 10     | OnBuy: +1/+1 to all allies (perm)                           | Mass buy buff                  |
| Treant            | 4   | 6   | 7    | 3    | 8      | AfterUnitAttack: +2/+2 to self                              | Durable combat scaler          |
| Elder Druid       | 3   | 5   | 7    | 3    | 6      | OnShopStart: +2/+2 to random ally (perm)                    | Premium shop scaler            |
| Ancient Oak       | 4   | 5   | 7    | 3    | 6      | AfterUnitAttack: +3/+3 to self                              | Combat snowball, must survive  |
| Ironwood Guardian | 5   | 7   | 8    | 3    | 6      | OnShopStart: +1/+1 self (perm); AfterUnitAttack: +2/+2 self | Scales in shop AND combat      |
| World Tree        | 4   | 6   | 9    | 3    | 6      | OnBuy: +1/+1 to ALL allies (perm)                           | Mass scaling, best buy trigger |
| Gaia              | 5   | 8   | 10   | 3    | 2      | OnShopStart: +2/+2 to ALL allies (perm)                     | Team-wide scaling every round  |

---

### 3. Sniper / Burst — _The Academy_

**Win condition:** Kill key enemy units before combat with OnStart targeted damage. Remove
the opponent's carry or disrupt their board before attacks begin.

**Key mechanics:** OnStart damage abilities, targeted damage (lowest HP, highest ATK,
specific position)

**Strengths:** Disrupts enemy game plan, kills key targets, bypasses front-line
**Weaknesses:** Low stats for cost (paying for damage), weak into wide boards

**Cards:**

| Name           | ATK | HP  | Cost | Burn | Rarity | Abilities                                   | Notes                      |
| -------------- | --- | --- | ---- | ---- | ------ | ------------------------------------------- | -------------------------- |
| Spark Mage     | 1   | 2   | 1    | 0    | 10     | OnStart: Deal 1 damage to random enemy      | Chip damage                |
| Frost Archer   | 1   | 3   | 2    | 1    | 10     | OnStart: Deal 2 damage to last enemy        | Back-line sniper           |
| Pyromancer     | 2   | 3   | 3    | 1    | 10     | OnStart: Deal 3 damage to lowest HP enemy   | Targeted removal           |
| Hex Caster     | 3   | 4   | 4    | 2    | 10     | OnStart: Deal 3 damage to highest HP enemy  | Tank buster                |
| Thunder Mage   | 4   | 4   | 5    | 2    | 10     | OnStart: Deal 6 damage to last enemy        | Heavy back-line hit        |
| Storm Caller   | 3   | 5   | 6    | 3    | 8      | OnStart: Deal 4 damage to 2 random enemies  | Multi-target burst         |
| Flame Lord     | 4   | 5   | 7    | 3    | 6      | OnStart: Deal 5 damage to random enemy      | Heavy single-target burst  |
| Lightning Mage | 4   | 4   | 7    | 3    | 6      | OnStart: Deal 3 damage to ALL enemies       | AoE nuke                   |
| Executioner    | 5   | 6   | 8    | 3    | 6      | OnStart: Deal 8 damage to highest ATK enemy | Carry killer               |
| Inferno Mage   | 5   | 7   | 9    | 3    | 6      | OnStart: Deal 4 damage to ALL enemies       | Premium AoE nuke           |
| Archmage       | 6   | 8   | 10   | 3    | 2      | OnStart: Deal 6 damage to ALL enemies       | Wipes weak boards outright |

---

### 4. Tank / Sustain — _The Order_

**Win condition:** Outlast the opponent through healing and high HP. Win long fights by
keeping your front-line alive while the opponent's units slowly fall.

**Key mechanics:** BeforeAnyAttack healing, HP buffs, high base HP units

**Strengths:** Survives burst damage, wins long attrition fights
**Weaknesses:** Low damage output, vulnerable to Scaling (eventually out-damages healing),
loses to Faint Chain (opponent gains value from dying)

**Cards:**

| Name             | ATK | HP  | Cost | Burn | Rarity | Abilities                                         | Notes                     |
| ---------------- | --- | --- | ---- | ---- | ------ | ------------------------------------------------- | ------------------------- |
| Squire           | 1   | 3   | 2    | 1    | 10     | OnStart: +2 HP to unit behind                     | Positional HP buff        |
| Shield Guard     | 1   | 3   | 2    | 1    | 10     | OnStart: +2 HP to front ally                      | Front-line support        |
| Field Medic      | 1   | 3   | 2    | 1    | 10     | AfterUnitAttack (front ally): +1 HP to front (3x) | Heals survivors           |
| Sentinel         | 1   | 4   | 3    | 1    | 8      | OnStart: +2 HP to adjacent allies                 | Positional HP buff        |
| Knight Protector | 2   | 4   | 4    | 2    | 10     | BeforeAnyAttack: +2 HP to back unit (3x)          | Back-line protector       |
| Cleric           | 2   | 6   | 5    | 2    | 8      | BeforeAnyAttack: +2 HP to front ally (3x)         | Focused front-line healer |
| Paladin          | 2   | 6   | 6    | 3    | 10     | OnStart: +4 HP to all allies                      | Mass HP buff              |
| Holy Guard       | 3   | 6   | 6    | 3    | 6      | BeforeUnitAttack: +3 HP to self                   | Unkillable front-liner    |
| Fortress Golem   | 2   | 8   | 7    | 3    | 6      | OnStart: +3 HP to all allies                      | Massive HP wall           |
| Grand Paladin    | 3   | 8   | 8    | 3    | 6      | BeforeAnyAttack: +2 HP to all allies (3x)         | Premium AoE healer        |
| Divine Champion  | 3   | 12  | 10   | 3    | 2      | BeforeAnyAttack: +2 HP to all allies              | Endless team healing      |

---

### 5. Faint Chain — _The Undead_

**Win condition:** Dying units cascade value — buffs to survivors, damage to enemies, or
board refills. The team gets stronger as units fall.

**Key mechanics:** OnFaint buffs/damage (not spawning — that's Swarm), OnAllyFaint
triggers, snowballing from ally deaths

**Strengths:** Resilient to removal (dying is the plan), strong mid-combat momentum
**Weaknesses:** Relies on ordering (Sniper kills units out of sequence), weak if units
don't die in the right order

**Cards:**

| Name         | ATK | HP  | Cost | Burn | Rarity | Abilities                                                                                   | Notes                             |
| ------------ | --- | --- | ---- | ---- | ------ | ------------------------------------------------------------------------------------------- | --------------------------------- |
| Skeleton     | 1   | 2   | 1    | 0    | 10     | OnFaint: +1/+1 to random ally (perm)                                                        | Basic faint buff                  |
| Spirit       | 2   | 2   | 2    | 1    | 10     | OnFaint: +1/+1 to adjacent allies (perm)                                                    | Adjacent faint buff               |
| Ghoul        | 2   | 2   | 2    | 1    | 10     | OnFaint: Deal 2 damage to all                                                               | AoE on death                      |
| Death Knight | 2   | 3   | 3    | 1    | 10     | OnFaint: +2/+2 to unit behind (perm)                                                        | Big single-target buff            |
| Bone Golem   | 3   | 3   | 3    | 1    | 10     | OnFaint: Deal 3 damage to adjacent                                                          | Risky AoE (hits own allies)       |
| Soul Eater   | 3   | 3   | 4    | 2    | 10     | OnAllyFaint: +2/+1 to self                                                                  | Faint consumer, snowballs         |
| Banshee      | 3   | 4   | 5    | 2    | 8      | OnFaint: Deal 5 damage to front enemy                                                       | Big damage on death               |
| Revenant     | 4   | 5   | 6    | 3    | 8      | OnAllyFaint: +2/+2 to self (perm)                                                           | Premium faint consumer            |
| Lich         | 3   | 6   | 7    | 3    | 6      | OnFaint: +2/+2 to ALL allies (perm)                                                         | Board-wide death buff             |
| Necromancer  | 3   | 4   | 8    | 3    | 6      | OnFaint: Spawn Phylactery in its place (OnFaint: Spawn 3/4 Reborn Necromancer in its place) | Comes back from death             |
| Undead King  | 5   | 8   | 10   | 3    | 2      | OnAllyFaint: +3/+3 to ALL other allies (perm)                                               | Every death supercharges the team |

---

### 6. Thorns / Retaliation — _The Wilds_

**Win condition:** Punish the opponent for attacking. The more they hit you, the worse it
gets for them. OnHurt effects turn enemy aggression against them.

**Key mechanics:** OnHurt triggers, damage reflection, scaling retaliation

**Strengths:** Punishes Aggro and multi-attack strategies, scales with combat length
**Weaknesses:** Useless if units die before being hit, weak to Sniper (killed without
being attacked)

**Cards:**

| Name         | ATK | HP  | Cost | Burn | Rarity | Abilities                                                   | Notes                     |
| ------------ | --- | --- | ---- | ---- | ------ | ----------------------------------------------------------- | ------------------------- |
| Porcupine    | 1   | 3   | 2    | 1    | 10     | OnHurt: Deal 1 damage to attacker (3x)                      | Basic thorns              |
| Cobra        | 1   | 4   | 3    | 1    | 10     | OnHurt: +2 ATK to self                                      | Gets dangerous when hit   |
| Blowfish     | 2   | 4   | 3    | 1    | 10     | OnHurt: Deal 3 damage to random enemy                       | Damage on hurt            |
| Thornbeast   | 2   | 5   | 4    | 2    | 8      | OnHurt: Deal 1 damage to ALL enemies (3x)                   | AoE thorns lite           |
| Viper        | 3   | 5   | 5    | 2    | 10     | AfterUnitAttack (front ally): Deal 3 damage to random enemy | Punishes from behind      |
| Deathstalker | 1   | 1   | 5    | 2    | 10     | AfterUnitAttack: Destroy front enemy                        | Kills anything it damages |
| Ironhide     | 3   | 6   | 6    | 3    | 8      | OnHurt: Deal 3 damage to attacker                           | Heavy direct thorns       |
| War Beast    | 2   | 6   | 6    | 3    | 6      | OnHurt: +2/+2 to unit behind (unlimited)                    | Cascading buffs on hit    |
| Fire Drake   | 3   | 7   | 7    | 3    | 6      | OnHurt: Deal 2 damage to ALL enemies                        | AoE retaliation           |
| Hydra        | 3   | 10  | 8    | 3    | 6      | OnHurt: Deal 2 damage to ALL enemies; +1 ATK to self        | Grows and retaliates      |
| Manticore    | 4   | 8   | 9    | 3    | 6      | OnHurt: Deal 3 damage to attacker AND random enemy          | Double retaliation        |
| Titan Beast  | 4   | 12  | 9    | 3    | 2      | OnHurt: Deal 4 damage to ALL enemies                        | AoE nuke on every hit     |

---

### 7. Economy / Greed — _The Guild_

**Win condition:** Generate extra mana to play more or bigger units than the opponent can
afford. Sacrifice early tempo for late-game resource advantage.

**Key mechanics:** GainMana effects, OnSell value, high burn values, OnShopStart mana

**Strengths:** More resources = more options, enables expensive finishers from any archetype
**Weaknesses:** Weak early board, loses to Aggro before greed pays off

**Cards:**

| Name          | ATK | HP  | Cost | Burn | Rarity | Abilities                                | Notes                           |
| ------------- | --- | --- | ---- | ---- | ------ | ---------------------------------------- | ------------------------------- |
| Coin Purse    | 1   | 2   | 1    | 3    | 10     | None                                     | High burn, buy for 1 sell for 3 |
| Peddler       | 2   | 2   | 2    | 1    | 10     | OnSell: +1 ATK to 2 random allies (perm) | Sell for spread ATK             |
| Merchant      | 1   | 3   | 2    | 1    | 10     | OnSell: +1 HP to all allies (perm)       | Sell for team HP                |
| Broker        | 1   | 3   | 3    | 1    | 10     | OnShopStart: +1 mana                     | Recurring mana engine           |
| Treasurer     | 2   | 4   | 4    | 2    | 10     | OnShopStart: +1 mana                     | Premium recurring mana          |
| Gold Hoarder  | 3   | 4   | 5    | 3    | 8      | None                                     | High burn, buy for 5 sell for 3 |
| Tax Collector | 2   | 5   | 6    | 3    | 8      | OnShopStart: +1 mana                     | Bigger mana engine              |
| Alchemist     | 2   | 4   | 5    | 3    | 6      | OnShopStart: +1 mana                     | Mana engine + high burn value   |
| Guild Master  | 3   | 5   | 7    | 3    | 6      | OnShopStart: +2 mana                     | Premium double mana engine      |
| Trade Baron   | 4   | 6   | 9    | 3    | 6      | OnShopStart: +3 mana                     | Premium flat mana engine        |
| Midas         | 5   | 8   | 10   | 3    | 2      | OnShopStart: +3 mana                     | Absurd mana generation          |

---

### 8. Aggro / Rush — _The Horde_

**Win condition:** Front-load massive damage in the first few attacks. Win before the
opponent's engine comes online. Kill fast or lose trying.

**Key mechanics:** High ATK, BeforeUnitAttack self-buffs, front-loaded OnStart buffs,
glass cannon stats (high ATK, low HP)

**Strengths:** Fastest win condition, punishes greedy/slow builds
**Weaknesses:** Runs out of steam, loses to Tank (survives the burst), loses to Faint
Chain (dying fuels their engine)

**Cards:**

| Name            | ATK | HP  | Cost | Burn | Rarity | Abilities                                                | Notes                         |
| --------------- | --- | --- | ---- | ---- | ------ | -------------------------------------------------------- | ----------------------------- |
| Goblin Raider   | 2   | 1   | 1    | 0    | 10     | BeforeUnitAttack: +1 ATK to self (3x)                    | Glass cannon, pumps ATK       |
| Orc Grunt       | 2   | 2   | 2    | 1    | 10     | BeforeUnitAttack: +1/+1 to self                          | Combat snowball               |
| War Chief       | 3   | 3   | 3    | 1    | 10     | OnStart: +2 ATK to unit behind                           | Aggro buffer                  |
| Lone Berserker  | 2   | 3   | 3    | 1    | 10     | BeforeUnitAttack: +5 ATK if alone (3x)                   | Solo aggro, huge payoff       |
| Raging Orc      | 5   | 3   | 4    | 2    | 8      | OnStart: +2 ATK to self                                  | Glass cannon, opens at 7 ATK  |
| Battle Veteran  | 3   | 3   | 5    | 2    | 10     | BeforeUnitAttack: +2 ATK; AfterUnitAttack: +2 HP (3x ea) | Combat snowball               |
| Blood Wolf      | 5   | 4   | 6    | 3    | 8      | BeforeUnitAttack: +2/+1 to self (3x)                     | Aggressive self-buffer        |
| Warbringer      | 5   | 4   | 6    | 3    | 6      | OnStart: +3/+2 to unit behind                            | Big aggro opener              |
| Siege Breaker   | 5   | 6   | 7    | 3    | 6      | AfterUnitAttack: Deal 4 damage to front enemy            | Double tap                    |
| Berserker Chief | 6   | 5   | 8    | 3    | 6      | BeforeUnitAttack: +4 ATK to self (3x)                    | Massive damage escalation     |
| Warlord         | 8   | 6   | 9    | 3    | 2      | OnStart: +4 ATK to ALL allies                            | Entire team hits like a truck |

---

### 9. Comeback / Underdog — _The Fallen_

**Win condition:** Get stronger after losing rounds. Punish opponents who damage you early
by snowballing from behind. The more you lose, the scarier you become.

**Key mechanics:** AfterLoss triggers, conditional buffs when behind, loss-streak payoffs

**Strengths:** Natural catch-up mechanic, gets strongest when most desperate
**Weaknesses:** Requires actually losing rounds (costs lives), inconsistent if you
accidentally win early

**Cards:**

| Name                | ATK | HP  | Cost | Burn | Rarity | Abilities                                      | Notes                               |
| ------------------- | --- | --- | ---- | ---- | ------ | ---------------------------------------------- | ----------------------------------- |
| Lost Soul           | 1   | 2   | 1    | 0    | 10     | AfterLoss: +1 HP to all allies (perm)          | Basic comeback, team HP             |
| Stray Spirit        | 2   | 2   | 2    | 1    | 10     | AfterLoss: +1/+1 to self (perm)                | Self-scaling on loss                |
| Fallen Captain      | 2   | 3   | 3    | 1    | 10     | AfterLoss: +1 ATK to all allies (perm)         | Rallies troops after defeat         |
| Scarred Warrior     | 2   | 5   | 4    | 2    | 10     | AfterLoss: +2/+1 to self (perm)                | Stubborn, keeps fighting            |
| Doom Herald         | 3   | 5   | 5    | 2    | 10     | AfterLoss: +1/+1 to all allies (perm)          | Mass comeback buff                  |
| Resilient Guard     | 3   | 7   | 7    | 3    | 8      | AfterLoss: +1/+2 to all allies (perm)          | Tank-style comeback                 |
| Vengeful Shade      | 3   | 6   | 7    | 3    | 6      | AfterLoss: +2/+2 to all allies (perm)          | Massive comeback swing              |
| Ironclad Specter    | 4   | 8   | 8    | 3    | 6      | AfterLoss: +2/+2 self AND +1 ATK to all (perm) | Heavy loss payoff                   |
| Phoenix Knight      | 4   | 7   | 9    | 3    | 6      | AfterLoss: +3/+2 to self (perm)                | Self-scaling monster                |
| Avatar of Vengeance | 5   | 10  | 9    | 3    | 2      | AfterLoss: +3/+3 to ALL allies (perm)          | Lose once, team becomes unstoppable |

---

## Vanilla Cards — _Mercenaries_

Vanilla cards have **no abilities** and exist as stat-efficient bodies. They fill gaps in
the mana curve and give players reliable, simple options when they can't find archetype
pieces.

**Design rules:**

- Vanilla cards should be AT or slightly ABOVE the stat budget (they pay no ability tax)
- Vanilla cards should be Common (rarity 10) — always available as a fallback
- Every 1-2 mana cost tiers should have at least one vanilla option

| Name         | ATK | HP  | Cost | Burn | Rarity | Notes                          |
| ------------ | --- | --- | ---- | ---- | ------ | ------------------------------ |
| Recruit      | 1   | 3   | 1    | 0    | 10     | Cheap defensive body           |
| Foot Soldier | 3   | 3   | 2    | 1    | 10     | Balanced early fighter         |
| Militia      | 4   | 4   | 3    | 1    | 10     | Solid mid-game body            |
| Mercenary    | 5   | 5   | 4    | 2    | 10     | Reliable all-rounder           |
| Champion     | 7   | 7   | 6    | 3    | 10     | Premium vanilla, top-end stats |

---

## Hybrid Cards

Hybrid cards serve **two archetypes** simultaneously. They are slightly less efficient than
a dedicated archetype card but provide flexibility and enable cross-archetype builds.

**Design rules:**

- Hybrid cards should cost 1-2 stat points more than a pure archetype card for equivalent
  effect (flexibility tax)
- They should be Uncommon-Rare (rarity 6-8) — available but not flooding the pool
- Each hybrid should clearly bridge exactly two archetypes

| Name             | ATK | HP  | Cost | Burn | Rarity | Archetypes | Abilities | Notes |
| ---------------- | --- | --- | ---- | ---- | ------ | ---------- | --------- | ----- |
| _To be designed_ |     |     |      |      |        |            |           |       |

---

## Token Cards

Tokens are spawned by other cards and cannot be bought in the shop. They have cost 0 and
burn 0.

**Design rules:**

- Token stats should reflect the power of the card that spawns them
- Tokens from cheap spawners: ~1/1 to 2/2
- Tokens from expensive spawners: ~3/3 to 5/5
- Tokens can have simple abilities but should not spawn further tokens (no infinite loops)

| Name               | ATK | HP  | Spawned By     | Abilities                                          | Notes                |
| ------------------ | --- | --- | -------------- | -------------------------------------------------- | -------------------- |
| Grub               | 1   | 1   | Larva          | None                                               | Basic token          |
| Hatchling          | 2   | 2   | Scarab         | None                                               | Mid-tier token       |
| Nymph              | 3   | 1   | Mantis         | None                                               | Glass cannon token   |
| Moth               | 3   | 3   | Moth Matriarch | None                                               | Mid-tier token       |
| Drone              | 2   | 2   | Hive Mother    | None                                               | Swarm token          |
| Phylactery         | 0   | 5   | Necromancer    | OnFaint: Spawn 3/4 Reborn Necromancer in its place | Delayed rebirth      |
| Reborn Necromancer | 3   | 4   | Phylactery     | None                                               | One-time reborn body |
| Stinger            | 1   | 1   | Brood Queen    | AfterUnitAttack: Destroy front enemy               | Assassin token       |

---

## Card Distribution

**103 unique cards** + 7 tokens = **110 total card definitions**.

### Mana Cost Histogram

```
Cost  Count  Distribution                           Rarity Breakdown
----  -----  -----------                            -----------------
  1      8   ████████                                8 Common
  2     13   █████████████                           13 Common
  3     12   ████████████                            11 Common, 1 Uncommon
  4     10   ██████████                              7 Common, 3 Uncommon
  5     13   █████████████                           6 Common, 5 Uncommon, 2 Rare
  6     12   ████████████                            2 Common, 5 Uncommon, 5 Rare
  7     13   █████████████                           1 Uncommon, 12 Rare
  8      7   ███████                                 7 Rare
  9      9   █████████                               5 Rare, 4 Legendary
 10      6   ██████                                  6 Legendary
```

### By Rarity

| Rarity        | Count | Percentage |
| ------------- | ----- | ---------- |
| Common (10)   | 47    | 46%        |
| Uncommon (8)  | 15    | 15%        |
| Rare (6)      | 31    | 30%        |
| Legendary (2) | 10    | 10%        |

### Notes

- **Cost 4-6 is the core** — 35 cards (34%) live in the mid-game pivot where players
  build their archetype identity.
- **Cost 1-2 are all common** — intentional, since early game should be accessible
  and consistent regardless of luck.
- **Cost 7+ has no commons** — late-game cards are all uncommon+ rarity, creating
  natural scarcity for powerful finishers.
- **Cost 8-10 are rare+ only** — these are aspirational cards players work toward,
  enabled by economy cards or late-game mana limits.
- **9 archetypes** with distinct faction themes: The Hive, The Grove, The Academy,
  The Order, The Undead, The Wilds, The Guild, The Horde, The Fallen.
