# Card Design Guide

This document defines the archetypes, stat budgets, and rarity system used to design and
balance all cards in the game.

## Stat Budget

Every card has a **stat budget** determined by its mana cost. Abilities cost stat points —
the stronger the ability, the fewer raw stats the card should have.

| Mana Cost | Stat Budget | Vanilla Example | With Ability Example |
|-----------|-------------|-----------------|----------------------|
| 1         | 4           | 2/2 or 1/3      | 1/2 + weak ability   |
| 2         | 6           | 3/3 or 2/4      | 2/2 + weak ability   |
| 3         | 8           | 4/4 or 3/5      | 2/3 + medium ability |
| 4         | 10          | 5/5 or 4/6      | 3/4 + medium ability |
| 5         | 12          | 6/6 or 5/7      | 4/5 + strong ability |
| 6         | 14          | 7/7 or 6/8      | 5/6 + strong ability |
| 7         | 16          | 8/8 or 7/9      | 5/7 + extreme ability|
| 8         | 18          | 9/9 or 8/10     | 6/8 + extreme ability|
| 10        | 22          | 11/11 or 10/12  | 8/10 + extreme ability|

**Stat budget formula:** `budget = (mana_cost * 2) + 2`

**Burn value formula:** `burn = floor(mana_cost / 2)`, capped at 3.

| Mana Cost | Burn Value |
|-----------|------------|
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

| Ability Tier | Stat Cost | Examples |
|--------------|-----------|----------|
| Weak         | 1-2 pts   | +1 stat to one ally, deal 1 damage |
| Medium       | 3-4 pts   | +2 stats to multiple allies, deal 3 damage, spawn a 1/1 |
| Strong       | 5-7 pts   | AoE buffs, deal 5+ damage, spawn a 3/3+ |
| Extreme      | 8+ pts    | Board-wide scaling, repeated AoE triggers, game-warping effects |

### Keyword Abilities

Keywords are passive abilities that don't use the trigger system. They are always active
on the unit.

| Keyword | Effect | Stat Cost | Implementation |
|---------|--------|-----------|----------------|
| Deathtouch | Kills any unit this unit deals damage to, regardless of remaining HP | ~10 pts | Destroy target after damage is applied if damage > 0 |

> **Future keywords to consider:**
> - **Taunt** — enemies must attack this unit first
> - **Shield** — absorb the first instance of damage, then break
> - **Stealth** — cannot be targeted by OnStart damage abilities
> - **Poison** — deal 1 damage to this unit at the start of each attack phase

## Rarity System

The `rarity` field in `sets.json` is used directly as a **weight** in the bag-building
weighted random selection. Higher value = appears more often. A rarity of 0 means the card
is a token and cannot be drafted.

| Rarity Value | Label     | Frequency  | Design Intent |
|--------------|-----------|------------|---------------|
| 10           | Common    | Very often | Bread-and-butter cards, vanilla units, simple abilities |
| 8            | Uncommon  | Often      | Solid role-players with clear archetype fit |
| 6            | Rare      | Sometimes  | Strong abilities, archetype payoffs |
| 4            | Epic      | Seldom     | Build-around cards, powerful finishers |
| 2            | Legendary | Rarely     | Game-warping effects, high stat budgets |
| 1            | Mythic    | Very rare  | Showstopper cards, highest cost/impact |

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

Each archetype defines a **strategy** the player can build toward. A healthy set should
have 8-12 cards per archetype spread across the mana curve (cheap enablers, mid-game
core, expensive finishers).

### Counter Wheel

```
Aggro ──beats──> Economy ──beats──> Scaling ──beats──> Tank ──beats──> Aggro
                                       │
                                       v
            Sniper ──beats──> Swarm ──beats──> Sniper (triangle)
                       │
                       v
                   Thorns ──beats──> Aggro (punishes repeated attacks)
                       │
                       v
              Faint Chain ──beats──> Tank (value from dying, outlasts sustain)
```

Archetypes should have **favorable and unfavorable matchups**. No archetype should beat
everything. Hybrid builds exist to shore up weak matchups at the cost of peak power.

---

### 1. Spawn / Swarm

**Win condition:** Overwhelm the opponent with bodies. Spawn tokens on faint, buff spawned
units, fill the board faster than the enemy can clear it.

**Key mechanics:** OnFaint spawn, OnAllySpawn triggers, token generation

**Strengths:** Board presence, resilience to single-target removal
**Weaknesses:** Individually weak units, vulnerable to AoE damage

**Mana curve targets:**
- Cheap (1-2): Spawners, spawn-trigger enablers
- Mid (3-4): Better spawners, spawn payoffs (buff spawned units)
- Finisher (5-6): Mass spawn, powerful tokens, spawn scaling

**Cards:**

| Name | ATK | HP | Cost | Burn | Rarity | Abilities | Notes |
|------|-----|----|------|------|--------|-----------|-------|
| Cricket | 1 | 2 | 1 | 0 | 10 | OnFaint: Spawn 1/1 Zombie Cricket | Cheapest spawner |
| Spider | 2 | 2 | 3 | 1 | 10 | OnFaint: Spawn 2/2 Spiderling | Mid spawner, token matches parent |
| Horse | 2 | 1 | 2 | 1 | 10 | OnAllySpawn: +1 ATK to spawned unit | Makes tokens dangerous |
| Dog | 2 | 3 | 3 | 1 | 10 | OnAllySpawn: +2 ATK +1 HP to self | Grows with every spawn |
| Rooster | 4 | 4 | 5 | 2 | 10 | OnFaint: Spawn 3/1 Chick | Big body + strong token |
| Necromancer | 3 | 4 | 4 | 2 | 8 | OnAllySpawn: +2 ATK to spawned unit (3x) | Makes tokens hit harder |
| Rat King | 4 | 6 | 6 | 3 | 8 | OnAllyFaint: Spawn 1/1 Rat Token at back (3x) | Steady reinforcements |
| Turkey | 4 | 5 | 6 | 3 | 6 | OnAllySpawn: +2 ATK +2 HP to spawned unit | THE spawn payoff, build-around |
| Fly | 3 | 5 | 7 | 3 | 6 | OnAllyFaint: Spawn 3/3 Zombie Fly (3x) | Board refill machine |
| Hive Mother | 5 | 7 | 9 | 3 | 6 | OnAllyFaint: Spawn 2/2 Drone at back (3x) | Swarm engine, spawns behind the line |
| Brood Queen | 5 | 7 | 10 | 3 | 2 | OnFaint: Spawn 3x 1/1 Wasp at back (deathtouch) | Kill the queen, face 3 assassins |

---

### 2. Scaling

**Win condition:** Build one or two massive units over multiple shop phases. Invest early,
dominate late with stats that outclass anything the opponent can field.

**Key mechanics:** OnBuy/OnShopStart permanent buffs, self-scaling in combat (Hippo,
Kangaroo), stat stacking

**Strengths:** Highest raw stats in late game, individual units are threats
**Weaknesses:** Slow to come online, vulnerable to Sniper targeting the carry

**Mana curve targets:**
- Cheap (1-2): Stat generators (OnBuy/OnSell buffs to allies)
- Mid (3-4): Self-scalers, shop-phase engines
- Finisher (5-6): Big scaling payoffs, combat snowballers

**Cards:**

| Name | ATK | HP | Cost | Burn | Rarity | Abilities | Notes |
|------|-----|----|------|------|--------|-----------|-------|
| Worm | 1 | 2 | 1 | 0 | 10 | OnBuy: +1 ATK +1 HP to self (perm) | Self-investment on purchase |
| Fish | 2 | 2 | 2 | 1 | 10 | OnBuy: +1 ATK +1 HP to random ally (perm) | Core scaling enabler |
| Giraffe | 1 | 3 | 3 | 1 | 10 | OnShopStart: +1 ATK +1 HP to back unit (perm) | Recurring shop engine |
| Penguin | 2 | 4 | 4 | 2 | 10 | OnShopStart: +1 ATK +1 HP to 2 random allies (perm) | Premium shop engine |
| Cow | 3 | 5 | 5 | 2 | 10 | OnBuy: +1 ATK +1 HP to all allies (perm) | Mass buy buff |
| Bison | 4 | 4 | 5 | 2 | 8 | OnBuy: +2 ATK +1 HP to 2 random allies (perm) | Focused buy buff |
| Ox | 4 | 6 | 7 | 3 | 8 | AfterUnitAttack: +2 ATK +2 HP to self | Durable combat scaler |
| Monkey | 3 | 5 | 7 | 3 | 6 | OnShopStart: +2 ATK +2 HP to random ally (perm) | Premium shop scaler |
| Hippo | 4 | 5 | 7 | 3 | 6 | AfterUnitAttack: +3 ATK +3 HP to self | Combat snowball, must survive |
| Titan | 5 | 7 | 8 | 3 | 6 | OnShopStart: +1 ATK +1 HP to self (perm); AfterUnitAttack: +2 ATK +2 HP to self | Scales in shop AND combat |
| Dragon | 4 | 6 | 9 | 3 | 6 | OnBuy: +1 ATK +1 HP to ALL allies (perm) | Mass scaling, best buy trigger |
| Ancient Wyrm | 5 | 8 | 10 | 3 | 2 | OnShopStart: +2 ATK +2 HP to ALL allies (perm) | Team-wide scaling every round |

---

### 3. Sniper / Burst

**Win condition:** Kill key enemy units before combat with OnStart targeted damage. Remove
the opponent's carry or disrupt their board before attacks begin.

**Key mechanics:** OnStart damage abilities, targeted damage (lowest HP, highest ATK,
specific position)

**Strengths:** Disrupts enemy game plan, kills key targets, bypasses front-line
**Weaknesses:** Low stats for cost (paying for damage), weak into wide boards with no
single critical unit

**Mana curve targets:**
- Cheap (1-2): Chip damage (1-2 damage pings)
- Mid (3-4): Targeted removal (3-5 damage to specific targets)
- Finisher (5-6): Heavy burst (8+ damage, AoE damage)

**Cards:**

| Name | ATK | HP | Cost | Burn | Rarity | Abilities | Notes |
|------|-----|----|------|------|--------|-----------|-------|
| Mosquito | 1 | 2 | 1 | 0 | 10 | OnStart: Deal 1 damage to random enemy | Chip damage |
| Archer | 1 | 3 | 2 | 1 | 10 | OnStart: Deal 2 damage to last enemy | Back-line sniper |
| Dolphin | 2 | 3 | 3 | 1 | 10 | OnStart: Deal 3 damage to lowest HP enemy | Targeted removal |
| Skunk | 3 | 4 | 4 | 2 | 10 | OnStart: Deal 3 damage to highest HP enemy | Tank buster |
| Headhunter | 3 | 3 | 4 | 2 | 10 | OnStart: Deal 4 damage to lowest HP enemy | Assassin |
| Crocodile | 4 | 4 | 5 | 2 | 10 | OnStart: Deal 6 damage to last enemy | Heavy back-line hit |
| Sniper | 3 | 5 | 5 | 2 | 8 | OnStart: Deal 4 damage to last enemy | Stronger back-line hit |
| Fire Mage | 3 | 5 | 6 | 3 | 8 | OnStart: Deal 4 damage to 2 random enemies | Multi-target burst |
| Leopard | 4 | 5 | 7 | 3 | 6 | OnStart: Deal 5 damage to random enemy | Heavy single-target burst |
| Artillery Mage | 4 | 4 | 7 | 3 | 6 | OnStart: Deal 3 damage to ALL enemies | AoE nuke |
| Executioner | 5 | 6 | 8 | 3 | 6 | OnStart: Deal 8 damage to highest ATK enemy | Carry killer |
| Dragon Tyrant | 5 | 7 | 9 | 3 | 6 | OnStart: Deal 4 damage to ALL enemies | Premium AoE nuke |
| Apocalypse Dragon | 6 | 8 | 10 | 3 | 2 | OnStart: Deal 6 damage to ALL enemies | Wipes weak boards outright |

---

### 4. Tank / Sustain

**Win condition:** Outlast the opponent through healing and high HP. Win long fights by
keeping your front-line alive while the opponent's units slowly fall.

**Key mechanics:** BeforeAnyAttack healing, HP buffs, high base HP units

**Strengths:** Survives burst damage, wins long attrition fights
**Weaknesses:** Low damage output, vulnerable to Scaling (eventually out-damages healing),
loses to Faint Chain (opponent gains value from dying)

**Mana curve targets:**
- Cheap (1-2): HP buffers, small heals
- Mid (3-4): Sustain engines (repeated healing triggers)
- Finisher (5-6): Mass healing, massive HP walls

**Cards:**

| Name | ATK | HP | Cost | Burn | Rarity | Abilities | Notes |
|------|-----|----|------|------|--------|-----------|-------|
| Scaredy Cat | 1 | 3 | 2 | 1 | 10 | OnStart: +2 HP to unit behind | Positional HP buff |
| Shield Bearer | 1 | 3 | 2 | 1 | 10 | OnStart: +2 HP to front ally | Front-line support |
| Nurse Goblin | 1 | 3 | 2 | 1 | 10 | AfterUnitAttack (front ally): +1 HP to front ally (3x) | Heals survivors |
| Tortoise | 1 | 4 | 3 | 1 | 8 | OnStart: +2 HP to adjacent allies | Positional HP buff |
| Medic | 1 | 4 | 4 | 2 | 10 | BeforeAnyAttack: +1 HP to all allies (3x) | AoE sustain |
| Shield Squire | 2 | 4 | 4 | 2 | 10 | BeforeAnyAttack: +2 HP to back unit (3x) | Back-line protector |
| Cleric | 2 | 6 | 5 | 2 | 8 | BeforeAnyAttack: +2 HP to front ally (3x) | Focused front-line healer |
| Armadillo | 2 | 6 | 6 | 3 | 10 | OnStart: +4 HP to all allies | Mass HP buff |
| Guardian | 3 | 6 | 6 | 3 | 6 | BeforeUnitAttack: +3 HP to self | Unkillable front-liner |
| Stone Golem | 2 | 8 | 7 | 3 | 6 | OnStart: +3 HP to all allies | Massive HP wall |
| Shield Master | 3 | 8 | 8 | 3 | 6 | BeforeAnyAttack: +2 HP to all allies (3x) | Premium AoE healer |
| World Turtle | 3 | 12 | 10 | 3 | 2 | BeforeAnyAttack: +2 HP to all allies | Endless team healing, unkillable wall |

---

### 5. Faint Chain

**Win condition:** Dying units cascade value — buffs to survivors, damage to enemies, or
board refills. The team gets stronger as units fall.

**Key mechanics:** OnFaint buffs/damage (not spawning — that's Swarm), OnAllyFaint
triggers, Shark-style snowballing

**Strengths:** Resilient to removal (dying is the plan), strong mid-combat momentum
**Weaknesses:** Relies on ordering (Sniper kills units out of sequence), weak if units
don't die in the right order

**Mana curve targets:**
- Cheap (1-2): Faint triggers (buff ally, deal damage on death)
- Mid (3-4): Faint payoffs (bigger buffs, AoE on death), faint consumers (Shark)
- Finisher (5-6): Massive faint effects, board-wide death triggers

**Cards:**

| Name | ATK | HP | Cost | Burn | Rarity | Abilities | Notes |
|------|-----|----|------|------|--------|-----------|-------|
| Ant | 1 | 2 | 1 | 0 | 10 | OnFaint: +1 ATK +1 HP to random ally (perm) | Basic faint buff |
| Flamingo | 2 | 2 | 2 | 1 | 10 | OnFaint: +1 ATK +1 HP to 2 units behind (perm) | Positional faint buff |
| Hedgehog | 2 | 2 | 2 | 1 | 10 | OnFaint: Deal 2 damage to all | AoE on death |
| Martyr Knight | 2 | 3 | 3 | 1 | 10 | OnFaint: +2 ATK +2 HP to unit behind (perm) | Big single-target buff |
| Badger | 3 | 3 | 3 | 1 | 10 | OnFaint: Deal 3 damage to adjacent | Risky directional AoE (hits own allies) |
| Shark | 3 | 3 | 4 | 2 | 10 | OnAllyFaint: +2 ATK +1 HP to self | Faint consumer, snowballs |
| Wolf Rider | 3 | 4 | 5 | 2 | 8 | OnFaint: Deal 5 damage to front enemy | Big damage on death |
| Grave Knight | 4 | 5 | 6 | 3 | 8 | OnAllyFaint: +2 ATK +2 HP to self (perm) | Premium faint consumer |
| Mammoth | 3 | 6 | 7 | 3 | 6 | OnFaint: +2 ATK +2 HP to ALL allies (perm) | Board-wide death buff |
| Vulture | 4 | 5 | 6 | 3 | 6 | OnAllyFaint: Deal 3 damage to random enemy | Death triggers damage |
| Phoenix | 3 | 4 | 8 | 3 | 6 | OnFaint: Spawn Phoenix Egg (OnStart: Spawn 3/4 Phoenix) | Comes back from death |
| Lich King | 5 | 8 | 10 | 3 | 2 | OnAllyFaint: +3 ATK +3 HP to ALL other allies (perm) | Every death supercharges the team |

---

### 6. Thorns / Retaliation

**Win condition:** Punish the opponent for attacking. The more they hit you, the worse it
gets for them. OnHurt and AfterAnyAttack effects turn enemy aggression against them.

**Key mechanics:** OnHurt triggers, AfterAnyAttack damage, damage reflection

**Strengths:** Punishes Aggro and multi-attack strategies, scales with combat length
**Weaknesses:** Useless if units die before being hit, weak to Sniper (killed without
being attacked)

**Mana curve targets:**
- Cheap (1-2): Small retaliation (deal 1 damage on hurt)
- Mid (3-4): Scaling retaliation (Peacock), targeted damage on hurt
- Finisher (5-6): AoE retaliation, heavy damage per hit taken

**Cards:**

| Name | ATK | HP | Cost | Burn | Rarity | Abilities | Notes |
|------|-----|----|------|------|--------|-----------|-------|
| Spined Urchin | 1 | 3 | 2 | 1 | 10 | OnHurt: Deal 1 damage to attacker (3x) | Basic thorns |
| Peacock | 1 | 4 | 3 | 1 | 10 | OnHurt: +2 ATK to self | Gets dangerous when hit |
| Blowfish | 2 | 4 | 3 | 1 | 10 | OnHurt: Deal 3 damage to random enemy | Damage on hurt |
| Porcupine | 3 | 5 | 4 | 2 | 10 | OnHurt: Deal 2 damage to attacker | Better thorns |
| Snake | 3 | 5 | 5 | 2 | 10 | AfterUnitAttack (front ally): Deal 3 damage to random enemy | Punishes from behind |
| Cactus | 2 | 5 | 4 | 2 | 8 | OnHurt: Deal 1 damage to ALL enemies (3x) | AoE thorns lite |
| Iron Maiden | 3 | 6 | 6 | 3 | 8 | OnHurt: Deal 3 damage to attacker | Heavy direct thorns |
| Camel | 2 | 6 | 6 | 3 | 6 | OnHurt: +2 ATK +2 HP to unit behind (unlimited) | Cascading buffs on hit |
| Fire Elemental | 3 | 7 | 7 | 3 | 6 | OnHurt: Deal 2 damage to ALL enemies | AoE retaliation |
| Hydra | 3 | 10 | 8 | 3 | 6 | OnHurt: Deal 2 damage to ALL enemies; +1 ATK to self | Grows and retaliates every hit |
| Venom Drake | 4 | 8 | 9 | 3 | 6 | OnHurt: Deal 3 damage to attacker AND random enemy | Double retaliation |
| Wasp | 1 | 1 | 5 | 2 | 10 | **Deathtouch** | Kills anything it damages, glass cannon |
| Magma Titan | 4 | 12 | 9 | 3 | 2 | OnHurt: Deal 4 damage to ALL enemies | AoE nuke on every hit taken |

---

### 7. Economy / Greed

**Win condition:** Generate extra mana to play more or bigger units than the opponent can
afford. Sacrifice early tempo for late-game resource advantage.

**Key mechanics:** GainMana effects, OnSell mana generation, high burn values, OnShopStart
mana

**Strengths:** More resources = more options, enables expensive finishers from any archetype
**Weaknesses:** Weak early board, loses to Aggro before greed pays off

**Mana curve targets:**
- Cheap (1-2): Mana generators (sell for mana, shop start mana)
- Mid (3-4): Efficient mana engines, cards that refund their cost
- Finisher: Economy doesn't have its own finishers — it enables OTHER archetypes' finishers

**Cards:**

| Name | ATK | HP | Cost | Burn | Rarity | Abilities | Notes |
|------|-----|----|------|------|--------|-----------|-------|
| Piggy Bank | 1 | 2 | 1 | 3 | 10 | None | High burn value, buy for 1 sell for 3 |
| Swan | 1 | 3 | 3 | 1 | 10 | OnShopStart: +1 mana | Recurring mana engine |
| Duck | 1 | 3 | 2 | 1 | 10 | OnSell: +1 HP to all allies (perm) | Sell for team HP |
| Squirrel | 2 | 4 | 4 | 2 | 10 | OnShopStart: +1 mana | Premium recurring mana |
| Gold Miner | 3 | 4 | 5 | 3 | 8 | None | High burn, buy for 5 sell for 3, decent body |
| Tax Collector | 2 | 5 | 6 | 3 | 8 | OnShopStart: +1 mana | Bigger mana engine |
| Alchemist | 2 | 4 | 5 | 3 | 6 | OnShopStart: +1 mana | Mana engine + high burn value |
| Cat | 3 | 5 | 7 | 3 | 6 | OnShopStart: +2 mana | Premium double mana engine |
| Merchant Prince | 4 | 6 | 9 | 3 | 6 | OnShopStart: +1 mana per ally on board | Up to +4 mana with full board |
| Midas | 5 | 8 | 10 | 3 | 2 | OnShopStart: +3 mana | Absurd mana generation, enables anything |

---

### 8. Aggro / Rush

**Win condition:** Front-load massive damage in the first few attacks. Win before the
opponent's engine comes online. Kill fast or lose trying.

**Key mechanics:** High ATK, BeforeUnitAttack self-buffs, front-loaded OnStart buffs,
glass cannon stats (high ATK, low HP)

**Strengths:** Fastest win condition, punishes greedy/slow builds
**Weaknesses:** Runs out of steam, loses to Tank (survives the burst), loses to Faint
Chain (dying fuels their engine)

**Mana curve targets:**
- Cheap (1-2): High ATK/low HP units, attack buffers
- Mid (3-4): Self-buffing attackers, adjacent ATK buffs
- Finisher (5-6): Massive first-strike damage, combat openers

**Cards:**

| Name | ATK | HP | Cost | Burn | Rarity | Abilities | Notes |
|------|-----|----|------|------|--------|-----------|-------|
| Goblin Raider | 2 | 1 | 1 | 0 | 10 | BeforeUnitAttack: +1 ATK to self (3x) | Glass cannon, pumps ATK |
| Kangaroo | 2 | 2 | 2 | 1 | 10 | BeforeUnitAttack: +1 ATK +1 HP to self | Combat snowball |
| Dodo | 3 | 3 | 3 | 1 | 10 | OnStart: +2 ATK to unit behind | Aggro buffer |
| Wolverine | 3 | 2 | 3 | 1 | 10 | OnStart: +2 ATK to adjacent allies | Spread ATK boost |
| Lone Wolf | 2 | 3 | 3 | 1 | 10 | BeforeUnitAttack: +5 ATK if alone (3x) | Solo aggro, huge payoff |
| Battle Hardened | 3 | 3 | 5 | 2 | 10 | BeforeUnitAttack: +2 ATK; AfterUnitAttack: +2 HP (3x ea) | Combat snowball |
| Boar | 4 | 4 | 5 | 2 | 10 | BeforeUnitAttack: +3 ATK +1 HP | Premium aggro finisher |
| Gladiator | 5 | 3 | 4 | 2 | 8 | OnStart: +2 ATK to self | Glass cannon, opens at 7 ATK |
| War Hound | 5 | 4 | 6 | 3 | 8 | BeforeUnitAttack: +2 ATK +1 HP to self (3x) | Aggressive self-buffer |
| Tiger | 5 | 4 | 6 | 3 | 6 | OnStart: +3 ATK +2 HP to unit behind | Big aggro opener |
| Rhino | 5 | 6 | 7 | 3 | 6 | AfterUnitAttack: Deal 4 damage to front enemy | Double tap |
| Berserker | 6 | 5 | 8 | 3 | 6 | BeforeUnitAttack: +4 ATK to self (3x) | Massive damage escalation |
| Warlord | 8 | 6 | 9 | 3 | 2 | OnStart: +4 ATK to ALL allies | Entire team hits like a truck |

---

### 9. Sell Cycling

**Win condition:** Churn through units in the shop for incremental permanent value. Buy
and sell repeatedly, generating small advantages each cycle that compound over time.

**Key mechanics:** OnSell triggers, OnBuy triggers, cards that reward frequent transactions

**Strengths:** Flexible (works with any board), consistent incremental value
**Weaknesses:** Needs many shop phases to compound, each individual trigger is small

**Mana curve targets:**
- Cheap (1-2): Sell payoffs (mana, buffs on sell), buy triggers
- Mid (3-4): Cycle engines (cards that reward buying/selling others)
- Finisher: Like Economy, enables other archetypes rather than having its own finisher

**Cards:**

| Name | ATK | HP | Cost | Burn | Rarity | Abilities | Notes |
|------|-----|----|------|------|--------|-----------|-------|
| Beaver | 2 | 2 | 2 | 1 | 10 | OnSell: +1 ATK to 2 random allies (perm) | Sell for spread ATK |
| Worm | 1 | 2 | 1 | 0 | 10 | OnBuy: +1 ATK +1 HP to self (perm) | Buy-sell fodder (also Scaling) |
| Duck | 1 | 3 | 2 | 1 | 10 | OnSell: +1 HP to all allies (perm) | Sell for team HP (also Economy) |
| Fish | 2 | 2 | 2 | 1 | 10 | OnBuy: +1 ATK +1 HP to random ally (perm) | Buy trigger (also Scaling) |
| Peddler | 2 | 3 | 3 | 1 | 8 | OnBuy: +1 ATK +1 HP to 2 random allies (perm) | Better Fish, hits 2 targets |
| Haggler | 2 | 4 | 4 | 2 | 8 | OnSell: +1 ATK +1 HP to all allies (perm) | Premium sell payoff |
| Seal | 3 | 5 | 5 | 2 | 10 | OnBuy: +1 ATK to 3 random allies (perm) | Mass buy buff |
| Broker | 3 | 5 | 7 | 3 | 6 | OnBuy: +2 ATK +2 HP to 2 random allies (perm) | Premium buy payoff |
| Auctioneer | 3 | 5 | 7 | 3 | 6 | OnSell: +2 ATK +2 HP to all allies (perm) | Premium sell payoff |
| Collector | 3 | 5 | 5 | 3 | 6 | OnBuy: +2 ATK +1 HP to self (perm) | Self-scaling + high burn |
| Grand Bazaar | 4 | 6 | 9 | 3 | 2 | OnBuy: +2 ATK +2 HP to all allies (perm); OnSell: +2 ATK +2 HP to all allies (perm) | Buy it, buff team; sell it, buff again |

> **Note:** Sell Cycling overlaps heavily with Economy (sell for mana) and Scaling (buy for
> buffs). Its identity comes from running BOTH buy and sell triggers together, churning
> through the shop for high transaction volume.

---

### 10. Comeback / Underdog

**Win condition:** Get stronger after losing rounds. Punish opponents who damage you early
by snowballing from behind. The more you lose, the scarier you become.

**Key mechanics:** AfterLoss triggers, conditional buffs when behind (lower life total,
fewer units), loss-streak payoffs

**Strengths:** Natural catch-up mechanic, gets strongest when most desperate
**Weaknesses:** Requires actually losing rounds (costs lives), inconsistent if you
accidentally win early

**Mana curve targets:**
- Cheap (1-2): Small AfterLoss buffs, underdog conditionals
- Mid (3-4): Loss-streak scaling, comeback engines
- Finisher (5-6): Massive swing cards that pay off a string of losses

**Cards:**

| Name | ATK | HP | Cost | Burn | Rarity | Abilities | Notes |
|------|-----|----|------|------|--------|-----------|-------|
| Snail | 1 | 2 | 1 | 0 | 10 | AfterLoss: +1 HP to all allies (perm) | Basic comeback, team HP |
| Stray Dog | 2 | 2 | 2 | 1 | 10 | AfterLoss: +1 ATK +1 HP to self (perm) | Self-scaling on loss |
| Rally Captain | 2 | 3 | 3 | 1 | 10 | AfterLoss: +1 ATK to all allies (perm) | Team ATK on loss |
| Battle Scarred | 2 | 5 | 4 | 2 | 10 | AfterLoss: +2 ATK +1 HP to self (perm) | Premium self-scaler |
| War Drummer | 3 | 5 | 5 | 2 | 10 | AfterLoss: +1 ATK +1 HP to all allies (perm) | Mass comeback buff |
| Survivor | 3 | 5 | 5 | 2 | 8 | AfterLoss: +2 ATK +1 HP to self AND +1 HP to all (perm) | Dual comeback |
| Resilient Knight | 3 | 7 | 7 | 3 | 8 | AfterLoss: +1 ATK +2 HP to all allies (perm) | Tank-style comeback |
| Vengeful Spirit | 3 | 6 | 7 | 3 | 6 | AfterLoss: +2 ATK +2 HP to all allies (perm) | Massive comeback swing |
| Ironclad | 4 | 8 | 8 | 3 | 6 | AfterLoss: +2 ATK +2 HP to self AND +1 ATK to all allies (perm) | Heavy loss payoff |
| Phoenix Warrior | 4 | 7 | 9 | 3 | 6 | AfterLoss: +3 ATK +2 HP to self (perm) | Self-scaling monster |
| Last Stand | 3 | 5 | 6 | 3 | 6 | AfterLoss: +1 ATK +1 HP to all AND +2 ATK to self (perm) | Dual buff on loss |
| Avatar of Vengeance | 5 | 10 | 9 | 3 | 2 | AfterLoss: +3 ATK +3 HP to ALL allies (perm) | Lose once, team becomes unstoppable |

---

## Vanilla Cards

Vanilla cards have **no abilities** and exist as stat-efficient bodies. They fill gaps in
the mana curve and give players reliable, simple options when they can't find archetype
pieces.

**Design rules:**
- Vanilla cards should be AT or slightly ABOVE the stat budget (they pay no ability tax)
- Vanilla cards should be Common (rarity 10) — always available as a fallback
- Every 1-2 mana cost tiers should have at least one vanilla option

| Name | ATK | HP | Cost | Burn | Rarity | Notes |
|------|-----|----|------|------|--------|-------|
| Goblin Scout | 1 | 3 | 1 | 0 | 10 | Cheap defensive body |
| Goblin Grunt | 3 | 3 | 2 | 1 | 10 | Balanced early fighter |
| Militia | 4 | 4 | 3 | 1 | 10 | Solid mid-game body |
| Turtle | 5 | 5 | 4 | 2 | 10 | Reliable all-rounder |
| Scorpion | 6 | 6 | 5 | 2 | 10 | Strong stat stick |
| Gorilla | 7 | 7 | 6 | 3 | 10 | Premium vanilla, top-end stats |

---

## Hybrid Cards

Hybrid cards serve **two archetypes** simultaneously. They are slightly less efficient than
a dedicated archetype card but provide flexibility and enable cross-archetype builds.

**Design rules:**
- Hybrid cards should cost 1-2 stat points more than a pure archetype card for equivalent
  effect (flexibility tax)
- They should be Uncommon-Rare (rarity 6-8) — available but not flooding the pool
- Each hybrid should clearly bridge exactly two archetypes

| Name | ATK | HP | Cost | Burn | Rarity | Archetypes | Abilities | Notes |
|------|-----|----|------|------|--------|------------|-----------|-------|
| *To be designed after commons are finalized* | | | | | | | | |

---

## Token Cards

Tokens are spawned by other cards and cannot be bought in the shop. They have cost 0 and
burn 0.

**Design rules:**
- Token stats should reflect the power of the card that spawns them
- Tokens from cheap spawners: ~1/1 to 2/2
- Tokens from expensive spawners: ~3/3 to 5/5
- Tokens can have simple abilities but should not spawn further tokens (no infinite loops)

| Name | ATK | HP | Spawned By | Abilities | Notes |
|------|-----|----|------------|-----------|-------|
| Zombie Cricket | 1 | 1 | Cricket | None | Basic token |
| Rat Token | 1 | 1 | Rat King | None | Basic token |
| Spiderling | 2 | 2 | Spider | None | Mid-tier token |
| Chick | 3 | 1 | Rooster | None | Glass cannon token |
| Zombie Fly | 3 | 3 | Fly | None | Mid-tier token |
| Drone | 2 | 2 | Hive Mother | None | Swarm token |
| Phoenix Egg | 0 | 5 | Phoenix | OnStart: Spawn 3/4 Phoenix | Delayed rebirth |
| Wasp Token | 1 | 1 | Brood Queen | Deathtouch | Assassin token |

---

## Card Distribution

**122 unique cards** + 8 tokens across the full mana curve.

### Mana Cost Histogram

```
Cost  Count  Distribution                           Rarity Breakdown
----  -----  -----------                            -----------------
  1      8   ████████                                8 Common
  2     14   ██████████████                          14 Common
  3     16   ████████████████                        14 Common, 2 Uncommon
  4     14   ██████████████                          10 Common, 4 Uncommon
  5     18   ██████████████████                      10 Common, 6 Uncommon, 2 Rare
  6     14   ██████████████                          2 Common, 6 Uncommon, 6 Rare
  7     15   ███████████████                         2 Uncommon, 13 Rare
  8      7   ███████                                 7 Rare
  9     10   ██████████                              6 Rare, 4 Legendary
 10      6   ██████                                  6 Legendary
```

### By Rarity

| Rarity | Count | Percentage |
|--------|-------|------------|
| Common (10) | 58 | 48% |
| Uncommon (8) | 20 | 16% |
| Rare (6) | 34 | 28% |
| Legendary (2) | 10 | 8% |

### Notes

- **Cost 4-6 is the core** — 46 cards (38% of the pool) live in the mid-game pivot
  where players build their archetype identity.
- **Cost 1-2 are all common** — intentional, since early game should be accessible
  and consistent regardless of luck.
- **Cost 7+ has no commons** — late-game cards are all uncommon+ rarity, creating
  natural scarcity for powerful finishers.
- **Cost 8-10 are rare+ only** — these are aspirational cards players work toward,
  enabled by economy cards or late-game mana limits.
