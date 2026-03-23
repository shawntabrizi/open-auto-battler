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
| | | | | | | | |

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
| | | | | | | | |

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
| | | | | | | | |

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
| | | | | | | | |

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
| | | | | | | | |

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
| | | | | | | | |

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
| | | | | | | | |

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
| | | | | | | | |

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
| | | | | | | | |

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
| | | | | | | | |

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
| | | | | | | |

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
| | | | | | | | | |

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
| | | | | | |
