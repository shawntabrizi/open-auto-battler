---
marp: true
theme: default
paginate: true
---

# Open Auto Battler

## A Blockchain-Native Auto-Battler

---

# Introduction to the Game

---

# What is Open Auto Battler?

A **deck-building auto-battler** that combines the best elements of:

- **Magic: The Gathering** - Resource management, deck building, card abilities.
- **Super Auto Pets** - Auto-battling, ghost opponents, board positioning.
- **Flesh and Blood** - Pitch system, deck control.

---

# Core Game Loop

```
  Shop Phase  ───►  Battle Phase
      ▲                  │
      └─── Repeat ───────┘
```

- **Shop**: Build your board, manage resources.
- **Battle**: Watch your units fight automatically.
- **Goal**: Win 10 battles ⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ before losing 3 lives ❤️❤️❤️.

---

# Shop Phase

<!-- component:shop-demo {} -->

- **Pitch** cards to the ash pile → gain mana (red value).
     - Your total mana is limited, but grows with each turn.
- **Play** cards to the board → spend mana (blue cost).
- Remaining cards are shuffled back into the deck.
     - Choose carefully what cards you pitch and what cards you keep!

---

# Battle Phase

<!-- component:battle-arena {"playerUnits": ["shield_bearer", "wolf_rider", "fire_elemental", "martyr_knight", "archer"], "enemyUnits": ["raging_orc", "spined_urchin", "zombie_captain", "necromancer", "sniper"], "seed": 42} -->

- Battles happen automatically against the opponent board.
     - All combat and abilities resolve automatically and deterministically.
- Strategy happens inside the shop phase where users chose:
     - What cards they want to pitch.
     - What cards they want to play.
     - What order they want their board.

---

# Anatomy of a Unit Card

<!-- component:two-column-start {} -->

<!-- component:unit-card {"name": "Wolf Rider", "attack": 3, "health": 2, "play_cost": 3, "pitch_value": 1, "template_id": "wolf_rider", "abilities": [{"trigger": "OnFaint", "effect": {"type": "Damage"}, "name": "Dying Bite", "description": "Deal 2 damage to front enemy on death", "conditions": []}]} -->

<!-- component:column-break {} -->

| Stat | Location | Meaning |
|------|----------|---------|
| **Mana Cost** | Top Left (Blue) | Mana required to play |
| **Pitch Value** | Top Right (Red) | Mana gained when pitched |
| **Attack** | Bottom Left (⚔) | Damage dealt when attacking |
| **Health** | Bottom Right (❤) | Damage before dying |
| **Abilities** | Middle Right (✶) | Special effects triggered during battle |

<!-- component:two-column-end {} -->

---

# Card Abilities

<!-- component:two-column-start {} -->

<!-- component:unit-card {"name": "Mana Reaper", "attack": 2, "health": 2, "play_cost": 8, "pitch_value": 2, "template_id": "mana_reaper", "abilities": [{"trigger": "OnStart", "effect": {"type": "Destroy"}, "name": "Harvest the Rich", "description": "Destroy the highest mana cost enemy", "conditions": []}, {"trigger": "OnStart", "effect": {"type": "Destroy"}, "name": "Cull the Weak", "description": "Destroy the lowest mana cost enemy", "conditions": []}]} -->

<!-- component:column-break {} -->

<!-- component:card-breakdown {"name": "Mana Reaper", "attack": 2, "health": 2, "play_cost": 8, "pitch_value": 2, "template_id": "mana_reaper", "abilities": [{"trigger": "OnStart", "effect": {"type": "Destroy"}, "name": "Harvest the Rich", "description": "Destroy the highest mana cost enemy", "conditions": []}, {"trigger": "OnStart", "effect": {"type": "Destroy"}, "name": "Cull the Weak", "description": "Destroy the lowest mana cost enemy", "conditions": []}]} -->

<!-- component:two-column-end {} -->

- **Trigger**: When does it activate? (e.g. OnStart, OnFaint, BeforeAttack)
- **Effect**: What does it do? (e.g. Damage, Buff, Spawn, Destroy)
- **Target**: Who does it affect? (e.g. Allies, Enemies, Self)

---

# Card Selection

Every card can be **played** and/or **pitched**:

<!-- component:two-column-start {} -->

<!-- component:unit-card {"name": "Dragon Tyrant", "attack": 6, "health": 5, "play_cost": 5, "pitch_value": 3, "template_id": "dragon_tyrant"} -->

<!-- component:column-break {} -->

- **Play it**: Spend mana to put it on the board.
- **Pitch it**: Discard it to gain mana for other cards.
     - You can also pitch cards from your existing board as an additional access to mana.
- High-cost cards are powerful but require pitching other cards to afford them!
- Some cards may not provide a lot of mana to play other cards, but may be powerful on their own.
- Cards may synergize with one another using different strategies.

<!-- component:two-column-end {} -->

---

# Built for Blockchain

---

# A Game Truly Enhanced by Blockchain

Open Auto Battler is designed end-to-end for the blockchain:

- Technology of the Game
- Mechanics of the Game
- Ecosystem of the Game
- Adoption of the Game

---

# Technology of the Game

---

# Deterministic WASM Engine

The **same Rust code** runs everywhere:

```
┌────────────────────────────────────┐
│          oab-core (Rust)           │
└──────────┬───────────┬─────────────┘
           │           │
     ┌─────▼─────┐ ┌───▼───────────┐
     │  Browser  │ │  Blockchain   │
     │  (WASM)   │ │  (Substrate)  │
     └───────────┘ └───────────────┘
```

Byte-perfect execution in both environments.

---

# On-Chain Randomness

Randomness is an important part of making games fun.

- Seed-based RNG for "random" effects.
- Seed provided by the blockchain, and stored in the game state of the user.
     - Randomness cannot be controlled or manipulated by the player.
- Every battle is reproducible given the same inputs.

---

# Engine Safety Limits

The battle engine enforces **hard limits** to prevent abuse:

| Limit | Value [1] | Purpose |
|-------|-------|---------|
| Max Battle Rounds | 100 | Prevents infinite stalemates |
| Max Triggers per Phase | 200 | Stops trigger loops |
| Max Trigger Depth | 10 | Limits chain reactions |
| Max Spawns per Battle | 100 | Prevents spawn floods |
| Max Recursion Depth | 50 | Protects against stack overflow |

**If a user's board reaches an engine limit, they forfeit that round.**

- [1] Values here are just for example purposes, and should be adjusted based on benchmarks.

---

# Mechanics of the Game

---

# Ghost Opponents

- You don't play against live opponents.
- You play against snapshots of other players' boards.
     - You are paired with other players which have the same **Rounds**, **Lives** (❤️), and **Wins** (⭐) as you.
     - Blockchain acts as a public matchmaking engine.
- No waiting, no coordination needed.
- The game is always populated with opponents!
- Great for bootstrapping a community.

---

# Automatic Game Balancing

Every game you play will feel balanced because:

- Pairing users with the same **Rounds** means they have had equal access to resources.
- Pairing users with the same **Lives** (❤️) and **Wins** (⭐) means they are performing at an equal rate to you.

If you are playing badly, you will be paired against those playing badly, and vice versa.

The game is always challenging, but also always fun.

---

# Asynchronous Turns

As you know, battles are entirely automatic, so no actions are needed here.
The shop phase is designed to be fully asynchronous, and require only **one** transaction with the blockchain.

- A single randomness seed is generated by the blockchain and stored in a user's game state.
- This determines the user's hand, which cannot change (no card draw or reshuffling).
- All actions in the shop are recorded and executed by the browser Wasm engine.
     - With effects displayed to the user in real time.
- When the user is done, they press "submit"!
- The browser engine creates a compact summary of the user actions and sends it to the blockchain.
- This is used to replicate the final state of the user, and is immediately used for battle!

Users can literally put down and pick up the game at any time, without worry!

---

# Economy of the Game

---

# Self-Sustaining Economies

The game creates value loops which keep the game evolving.

```
Players ──► Tournaments ──► Rewards
   ▲                           │
   │                           │
   │                           ▼
   └─ Sets ◄── Cards ◄── Creators
```

---

# Build-to-Earn

- Failed blockchain games focus on "play-to-earn" mechanics, which are just ponzinomics.
- Real games should extract value from those who enjoy the game, and return value to those who make the game enjoyable.
- The most expensive part of strategy card games is **game design**.
- Open Auto Battler allows the community to take on the role of game design, and be rewarded for doing so!

---

# Card Creation

<!-- component:card-creator {} -->

- Users can design cards:
     - Stats (Attack, Health, Cost, Pitch)
     - Abilities (Fully customizable, see further)
- Cards are stored on-chain, available to everyone.
     - Cards are given permanent unique identifiers.
     - Card Hash is used to ensure no duplicates are created.

---

# Set Curation

<!-- component:set-creator {} -->

- **Sets** are curated collections of cards.
     - **Any** card can be fun... when put in the right set.
- Curators select cards that create interesting strategies and metas.
     - Likely many set curators will also be card creators for their set.
- Players themselves curate sets based on how much fun they have playing.

---

# Tournaments

Tournaments can be organized by the community!

- Select a set for players to play.
- Select an entry cost and prize pool.
- Select a time period for the tournament.

---

# Tournament Economics

Entry fees distributed to:

| Recipient | Reward For |
|-----------|------------|
| **Top Finishers** | Skill and performance |
| **Set Curators** | Creating fun metas |
| **Card Creators** | Designing used cards |

Players pay to play a game they enjoy.

Everyone who contributes value captures value.

---

# (Nearly) Infinite Design Space

---

<!-- component:two-column-start {} -->

<!-- component:unit-card {"name": "Mana Reaper", "attack": 2, "health": 2, "play_cost": 8, "pitch_value": 2, "template_id": "mana_reaper", "abilities": [{"trigger": "OnStart", "effect": {"type": "Destroy"}, "name": "Harvest the Rich", "description": "Destroy the highest mana cost enemy", "conditions": []}, {"trigger": "OnStart", "effect": {"type": "Destroy"}, "name": "Cull the Weak", "description": "Destroy the lowest mana cost enemy", "conditions": []}]} -->

<!-- component:column-break {} -->

# Card Set Speed

The basic stats of a card can already be manipulated to heavily affect the "speed" of gameplay of a card set:

- 🔵 Mana: The lower the mana, the sooner people can play a card.
- 🔴 Pitch: The higher the pitch cost, the more resources a user has per turn.
- ⚔ Attack: The higher the average attack of a card, the more aggressive a format is.
- ❤ Health: The higher the health of a card, the more defensive a format is.

Even tweaking one of these stats by one creates a new card with new dynamics.

<!-- component:two-column-end {} -->

---


<!-- component:two-column-start {} -->

<!-- component:card-breakdown {"name": "Mana Reaper", "attack": 2, "health": 2, "play_cost": 8, "pitch_value": 2, "template_id": "mana_reaper", "abilities": [{"trigger": "OnStart", "effect": {"type": "Destroy"}, "name": "Harvest the Rich", "description": "Destroy the highest mana cost enemy", "conditions": []}, {"trigger": "OnStart", "effect": {"type": "Destroy"}, "name": "Cull the Weak", "description": "Destroy the lowest mana cost enemy", "conditions": []}]} -->

<!-- component:column-break {} -->

# Card Abilities

But the real design space of cards and card sets come from card abilities.

Cards can have one or more abilities, all using composable primitives.

<!-- component:two-column-end {} -->

---

# The Ability System

Cards abilities are built from composable primitives:

<!-- component:small-start {} -->

| Triggers | Effects | Targets | Scopes |
|----------|---------|---------|--------|
| OnStart | Damage | Position | Self |
| OnFaint | ModifyStats | Adjacent | Allies |
| OnAllyFaint | SpawnUnit | Random | Enemies |
| OnHurt | Destroy | Standard | All |
| OnSpawn | &nbsp; | All | AlliesOther |
| OnAllySpawn | &nbsp; | &nbsp; | TriggerSource |
| OnEnemySpawn | &nbsp; | &nbsp; | Aggressor |
| BeforeUnitAttack | &nbsp; | &nbsp; | &nbsp; |
| AfterUnitAttack | &nbsp; | &nbsp; | &nbsp; |
| BeforeAnyAttack | &nbsp; | &nbsp; | &nbsp; |
| AfterAnyAttack | &nbsp; | &nbsp; | &nbsp; |

<!-- component:small-end {} -->

There is plenty of design space for more abilities!

---

# Combining Primitives

<!-- component:two-column-start {} -->

<!-- component:small-start {} -->

"Complex" Example:

```json
[{
  "trigger": "BeforeUnitAttack",
  "conditions": [{
    "Is": { "StatValueCompare": {
      "scope": "SelfUnit",
      "stat": "Health",
      "op": "LessThan",
      "value": 3
    }}
  }],
  "effect": {"ModifyStats": {
    "attack": 2, "health": 0,
    "target": { "All": "SelfUnit" }
  }}
}, {
  "trigger": "BeforeUnitAttack",
  "conditions": ["...same"],
  "effect": { "SpawnUnit": {
    "template_id": "1_1_token"
  }}
}]
```

<!-- component:small-end {} -->


<!-- component:column-break {} -->

- **Simple**: "OnFaint: Deal 2 damage to a random enemy"
- **Complex**: "BeforeAttack: If this unit has less than 3 health, gain +2 attack and spawn a 1/1 token"
- **Synergistic**: "OnAllyFaint: All allies gain +1/+1"

The system enables emergent complexity from simple rules.

<!-- component:two-column-end {} -->

---

# Example: Chain Reactions

```
Unit A: OnFaint → Spawn Unit B
Unit B: OnSpawn → Deal 1 damage to all enemies
Enemy: OnHurt → Gain +1 attack
```

One faint triggers a cascade of effects - all deterministic, all verifiable.

---

# Themes, Synergies, and Strategies

It is common to create "rock paper scissors" strategies to prevent a stale metagame.

For example:

- Spawners: Cards that spawn other cards, and cards that buff spawned cards.
- Brute Force: Cards that are big, angry, and efficiently costed.
- Snipers: Cards that deal damage through abilities, while having weak basic stats.

Spawners lose to brutes. Brutes lose to snipers. Snipers lose to spawners.

---

# All Cards are Valid

- The game intentionally does not limit the creativity of users designing cards.
     - Besides the encoded size and encoding depth of a card.
- Cards can be submitted to the game which lead to infinitely complexity, but the engine will limit it.
     - And players triggering those limits will forfeit the round.
- Cards which are super powerful or super weak can be fun in sets which are super powerful or super weak too.

---

# Engine Development

- At some point, we might see the community design and implement:
     - New abilities.
     - New game modes.
     - New game rules.
- This will now allow governance to take the game even beyond what we can imagine here.

---

# Adoption of the Game

---

# Gradual Onboarding

```
Free Player ──► Creates Wallet ──► Enters Tournament
     │                                    │
     │         Zero friction              │
     └────────────────────────────────────┘
```

Players can engage at their comfort level.

---

# Free to Play

The blockchain is truly a public database that can power the game.

<!-- component:two-column-start {} -->

- **Local Mode**
     - Full game experience.
     - No wallet needed.
     - No transactions required.

<!-- component:column-break {} -->

- **Versus Mode**
     - Play against friends.
     - Peer-to-peer connections.
     - Still completely free.

<!-- component:two-column-end {} -->

Even without transactions, users benefit from the blockchain:

- **Card and Sets**: Access community-created content.
- **Ghost Opponents**: Play against real player boards.

---

# Treasury Subsidies

The treasury (or other incentivized entity) can bootstrap the game.

## Tournaments

To bootstrap initial tournaments, treasury can provide minimum prize support, ensuring that players and creators are rewarded early in the lifetime of the game.

## Achievements

Players can be incentivized to early adopt the game via rewards (limited play-to-earn):

- Leaderboards.
- Card usage goals.
- Set usage goals.
- Win streaks.
- Etc.

---

# Future Growth

---

# Expanding the System

**More Abilities**
- New triggers, conditions, effects.
- More complex interactions.
- Deeper strategic possibilities.

For example:

- Shop effects.
- Long term battle effects.
- Long term modifications (stats, abilities, etc...)

---

# NFT Integration

NFTs can enhance the experience:

- **Card Art**: Custom images for cards.
- **Themes**: Player backgrounds and UI skins.
     - Could introduce modifiers to the battle board.
- **Trophies**: Tournament wins and achievements.
- **Cosmetics**: Board effects, animations.

---

# ZK-Powered Verification

**Current approach**: Re-execute battles on-chain when disputed

**Future approach**: Zero-knowledge proof verification

```
┌─────────────────┐     ┌─────────────┐     ┌────────────┐
│  Battle Engine  │ ──► │   ZK VM     │ ──► │   Proof    │
│     (Rust)      │     │   (SP1)     │     │            │
└─────────────────┘     └─────────────┘     └─────┬──────┘
                                                  │
                                            ┌─────▼──────┐
                                            │ On-chain   │
                                            │ Verifier   │
                                            └────────────┘
```

- Proof verification is O(1) regardless of battle complexity.

---

# The Vision

A game that is:

- **Built** by its community
- **Owned** by its players
- **Sustained** by its economy

Not just playing a game - **building** one together.

---

# Questions?
