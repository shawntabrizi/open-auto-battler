---
marp: true
theme: default
paginate: true
---

# ManaLimit

## A Blockchain-Native Auto-Battler

---

# Introduction to the Game

---

# What is ManaLimit?

<!-- component:battle-arena {"playerUnits": ["shield_bearer", "wolf_rider", "fire_elemental", "martyr_knight", "archer"], "enemyUnits": ["raging_orc", "spined_urchin", "zombie_captain", "necromancer", "sniper"], "seed": 42} -->

A **deck-building auto-battler** that combines the best elements of:

- **Magic: The Gathering** - Resource management, deck building, card abilities
- **Super Auto Pets** - Auto-battling, ghost opponents, board positioning
- **Flesh and Blood** - Pitch system, deck control

---

# Core Game Loop

```
  Shop Phase  ───►  Battle Phase
      ▲                  │
      └─── Repeat ───────┘
```

- **Shop**: Build your board, manage resources
- **Battle**: Watch your units fight automatically
- **Goal**: Win 10 battles ⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ before losing 3 lives ❤️❤️❤️

---

# Key Mechanics

<!-- component:shop-demo {} -->

- **Pitch** cards to the ash pile → gain mana (red value)
- **Play** cards to the board → spend mana (blue cost)
- Remaining cards are shuffled back into the deck.

---

# Anatomy of a Unit Card

<!-- component:two-column-start {} -->

<!-- component:unit-card {"name": "Fire Elemental", "attack": 4, "health": 3, "play_cost": 3, "pitch_value": 2, "template_id": "fire_elemental"} -->

<!-- component:column-break {} -->

| Stat | Location | Meaning |
|------|----------|---------|
| **Mana Cost** | Top Left (Blue) | Mana required to play |
| **Pitch Value** | Top Right (Red) | Mana gained when pitched |
| **Attack** | Bottom Left (⚔) | Damage dealt when attacking |
| **Health** | Bottom Right (❤) | Damage before dying |
| **Abilities** | Center | Special effects triggered during battle |

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

# The Mana Trade-Off

Every card can be **played** or **pitched**:

<!-- component:two-column-start {} -->

<!-- component:unit-card {"name": "Dragon Tyrant", "attack": 6, "health": 5, "play_cost": 5, "pitch_value": 3, "template_id": "dragon_tyrant"} -->

<!-- component:column-break {} -->

- **Play it**: Spend mana to put it on the board
- **Pitch it**: Discard it to gain mana for other cards
     - You can also pitch cards from your existing board as an additional access to mana

High-cost cards are powerful but require pitching other cards to afford them!

<!-- component:two-column-end {} -->

---

# What Makes It Different?

**Infinite Customizability**

The game is designed for the **community** to build it

- Create your own cards
- Curate your own sets
- Design your own metas

No fixed card pool - the possibilities are endless

---

# Built for Blockchain

---

# Deterministic WASM Engine

The **same Rust code** runs everywhere:

```
┌────────────────────────────────────┐
│        manalimit-core (Rust)       │
└──────────┬───────────┬─────────────┘
           │           │
     ┌─────▼─────┐ ┌───▼───────────┐
     │  Browser  │ │  Blockchain   │
     │  (WASM)   │ │  (Substrate)  │
     └───────────┘ └───────────────┘
```

Byte-perfect execution in both environments

---

# Full Determinism

**No hidden randomness**

- Every battle is reproducible given the same inputs
- Seed-based RNG for "random" effects
- Any dispute can be verified by re-running

**Deterministic Randomness**
- Player seeds + round number = predictable but unpredictable outcomes
- Fair for both players, verifiable by anyone

---

# Engine Safety Limits

The battle engine enforces **hard limits** to prevent abuse:

| Limit | Value | Purpose |
|-------|-------|---------|
| Max Battle Rounds | 100 | Prevents infinite stalemates |
| Max Triggers per Phase | 200 | Stops trigger loops |
| Max Trigger Depth | 10 | Limits chain reactions |
| Max Spawns per Battle | 100 | Prevents spawn floods |
| Max Recursion Depth | 50 | Protects against stack overflow |

---

# Why Limits Matter

**On-chain execution must be bounded**

- Every computation costs gas/fees
- Unbounded loops could halt the blockchain
- Malicious cards could exploit infinite combos

**Limits create fair play**

- No "infinite combo" victories
- Predictable battle duration
- Equal resource usage for all players

---

# Asynchronous Design

**Ghost Opponents**

- You don't play against live opponents
- You play against snapshots of other players' boards
- No waiting, no coordination needed

**Lightweight Messages**

- Only your actions go to the blockchain
- Battles computed locally, verified on-chain if disputed

---

# Verifiable Battles

Anyone can verify any battle result:

1. Take the two boards + seed
2. Run through deterministic engine
3. Get the exact same outcome

**Trust minimized** - the code is the arbiter

---

# Infinite Customizability

---

# The Ability System

Cards are built from composable primitives:

| Component | Examples |
|-----------|----------|
| **Triggers** | OnStart, OnFaint, OnHurt, BeforeAttack |
| **Targets** | Self, Allies, Enemies, Adjacent, Random |
| **Conditions** | IfHealth>, IfAttack<, IfAlone |
| **Effects** | Damage, Heal, Buff, Spawn, Destroy |

---

# Combining Primitives

**Simple**: "OnFaint: Deal 2 damage to a random enemy"

**Complex**: "BeforeAttack: If this unit has less than 3 health, gain +2 attack and spawn a 1/1 token"

**Synergistic**: "OnAllyFaint: All allies gain +1/+1"

The system enables emergent complexity from simple rules

---

# Example: Chain Reactions

```
Unit A: OnFaint → Spawn Unit B
Unit B: OnSpawn → Deal 1 damage to all enemies
Enemy: OnHurt → Gain +1 attack
```

One faint triggers a cascade of effects - all deterministic, all verifiable

---

# Card Creation

Anyone can create cards by defining:

- Stats (Attack, Health, Cost, Pitch)
- Abilities (using the primitive system)
- Rarity (affects draft frequency)

Cards are stored on-chain, available to everyone

---

# Set Curation

**Sets** are curated collections of cards

- Curators select cards that create interesting metas
- Sets can be themed, balanced, or experimental
- Different sets = different game experiences

The meta is what **you** make it

---

# Community & Economy

---

# Self-Sustaining Economies

The game creates value loops:

```
Players ──► Tournaments ──► Rewards
   ▲                           │
   │    ┌──────────────────────┘
   │    ▼
   └─ Cards ◄── Creators
```

---

# Tournament Economics

Entry fees distributed to:

| Recipient | Reward For |
|-----------|------------|
| **Top Finishers** | Skill and performance |
| **Set Curators** | Creating fun metas |
| **Card Creators** | Designing used cards |

Everyone who contributes value captures value

---

# Creator Incentives

**Card Creators**
- Earn when their cards see play
- Incentive to design fun, balanced cards

**Set Curators**
- Earn when their sets are used
- Incentive to create engaging metas

**A game that rewards its builders**

---

# Deeper Blockchain Integration

---

# NFT Integration

NFTs can enhance the experience:

- **Card Art**: Custom images for cards
- **Themes**: Player backgrounds and UI skins
- **Trophies**: Tournament wins and achievements
- **Cosmetics**: Board effects, animations

Your collection, your identity

---

# Governance Systems

Community-driven curation:

- **Card Approval**: Vote on new cards entering sets
- **Set Standards**: Define rules for competitive play
- **Tournament Rules**: Community-decided formats

Decentralized game design

---

# Cross-Chain Possibilities

- Cards as cross-chain assets
- Tournaments across multiple chains
- Shared card pools, separate economies

The game goes where the players are

---

# Zero-Cost Onboarding

---

# Play Without Blockchain

**Local Mode**
- Full game experience
- No wallet needed
- No transactions required

**Versus Mode**
- Play against friends
- Peer-to-peer connections
- Still completely free

---

# Blockchain as Free Database

Even without transactions, users benefit from:

- **Card Sets**: Access community-created content
- **Ghost Opponents**: Play against real player boards
- **Leaderboards**: See how you compare

**Read is free** - only writing costs

---

# Gradual Onboarding

```
Free Player ──► Creates Wallet ──► Enters Tournament
     │                                    │
     │         Zero friction              │
     └────────────────────────────────────┘
```

Players can engage at their comfort level

---

# Future Growth

---

# Expanding the System

**More Abilities**
- New triggers, conditions, effects
- More complex interactions
- Deeper strategic possibilities

**Enhanced NFT Integration**
- Animated cards
- Interactive boards
- Achievement systems

---

# Platform Evolution

- **Mobile Apps**: Native iOS/Android
- **Spectator Mode**: Watch live tournaments
- **Replay System**: Study and share great games
- **AI Training**: Create smarter ghost opponents

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

---

# Why ZK Proofs?

**Constant verification cost**

- Proof verification is O(1) regardless of battle complexity
- No need to re-execute entire battles on-chain
- Dramatically reduced gas costs for disputes

**Privacy options**

- Prove battle outcome without revealing strategy
- Hidden information mechanics become possible
- Fog of war, hidden hands, secret abilities

---

# The Path to ZK

1. **Today**: Deterministic WASM engine
2. **Next**: Compile to ZK VM (SP1, RISC Zero)
3. **Future**: On-chain proof verification only

The same Rust code, compiled to a new target - minimal changes required

---

# The Vision

A game that is:

- **Owned** by its community
- **Built** by its players
- **Sustained** by its economy

Not just playing a game - **building** one together

---

# Questions?

---

# Thank You

**ManaLimit** - Where every card tells a story you wrote
