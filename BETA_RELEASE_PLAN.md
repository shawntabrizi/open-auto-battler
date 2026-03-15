# Open Auto Battler — Beta Release Plan

## What is the Beta?

The beta is the first version of Open Auto Battler that feels like a complete game you'd actually want to play and share with others. Here's what that means:

**A polished, playable game.** One well-balanced card set with ~40 cards that supports multiple strategies — rush aggro, defensive tanks, buff scaling, swarm spawning, and more. You pick a set, draft cards from a random bag, build a board in the shop phase, then watch your team auto-battle against ghost opponents. Win 10 rounds before you lose 3 lives to achieve victory. The whole loop — drafting, building, battling — works end-to-end on both mobile and desktop through a web browser.

**A reason to keep playing.** The holographic card achievement system gives every card a purpose. To unlock the holographic version of a card, you need to reach 10 wins in a run with that card on your board at some point during the run. Strong cards are easy to master. Weak cards become puzzle challenges — can you build a winning team around the worst card in the set? Completionists will want to master every card, which means experimenting with every possible strategy.

**A showcase for blockchain and NFTs.** Your game runs on-chain — your progress, achievements, and holographic unlocks are permanent and verifiable. NFTs are used for cosmetic customization: swap your board background, card borders, hand area, avatar, and card art. Three complete style sets (Cosmic, Medieval, Neon Cyber) ship as example NFT collections that players can acquire and equip. This demonstrates how NFTs add real value — personalized visual identity — without being pay-to-win.

**A platform for creators.** Anyone can design their own cards with custom stats and abilities, publish them on-chain, then bundle cards into new sets. You can build entirely new game experiences on top of the same engine — a horror-themed set, a meme set, a hyper-competitive tournament set. The creator hub in the UI walks you through the whole process. Card and set creators even earn a share of tournament prize pools when their content is played.

**Works everywhere.** The game runs as a web app via a WASM-compiled Rust engine. The UI is specifically designed and optimized for both mobile and desktop — not just a responsive layout, but tailored interactions, touch-friendly controls, and layouts that feel native on each platform. Wallet connection lets you play with your blockchain account, and funded accounts lower the onboarding barrier for new users.

---

## Technical Detail

## Current State Summary

| Layer | Status | Details |
|-------|--------|---------|
| **Core Engine** | ~90% | Battle system, ability system (11 battle triggers, 9 effects, 6 shop triggers, 6 effects), permanent stat modifiers, statuses (Shield/Poison/Guard), targeting, conditions, deterministic RNG |
| **Pallet** | ~80% | start_game, submit_turn, submit_card, create_card_set, ghost matchmaking, tournament system, ghost backfill |
| **Frontend** | ~75% | Shop/battle UI, card rendering, customization (5 NFT slots), WASM bridge, creator hub, multiplayer, sandbox |
| **Content** | ~40% | 110 cards, 2 sets (Starter Pack 40 cards, SAP Turtle Pack 60 cards), 1 style set (Cosmic) |

## What Needs to Be Built

### Phase 1: Achievement System + Holographic Rewards

**Core Engine Changes:**
- Add `AchievementTracker` type to `core/src/types.rs` — a per-card bitmap tracking which cards were on the player's board during a 10-win (perfect) run
- After battle resolution, when `wins == WINS_TO_VICTORY`, record all card IDs that were on the board at any point during that run
- A card is "mastered" when a player has achieved a perfect run with that card on their board

**Pallet Changes (`blockchain/pallets/auto-battle/src/lib.rs`):**
- New storage: `CardMastery<T>` — `StorageDoubleMap<(AccountId, CardId), bool>` — tracks which cards a player has mastered
- New storage: `HolographicUnlocks<T>` — `StorageDoubleMap<(AccountId, CardId), bool>` — tracks earned holographic variants
- New storage: `RunCardLog<T>` — `StorageMap<AccountId, BoundedVec<CardId>>` — accumulates every unique card ID placed on board during current run
- Modify `submit_turn`: when a card is placed on board, add its base card ID to `RunCardLog`
- Modify game-over logic: on a perfect 10-win run, iterate `RunCardLog` entries → set `CardMastery` and `HolographicUnlocks` to true for each
- New event: `AchievementUnlocked { owner, card_id }`
- New query-friendly storage: `SetMasteryProgress<T>` — `StorageDoubleMap<(AccountId, SetId), u32>` — count of mastered cards in a set (denormalized for fast UI reads)

**Design Rationale:**
The achievement is: "win a full 10-round run with this card appearing on your board at least once." This encourages players to build around every card — even weak ones — since they need each card on their board during *some* winning run. This makes "bad" cards into puzzle challenges.

### Phase 2: Holographic Card Rendering

**Frontend Changes:**
- Add `isHolographic` flag to card view resolution — check `HolographicUnlocks` storage for the connected account
- New CSS treatment for holographic cards: animated rainbow gradient overlay, subtle shimmer animation, prismatic border effect
- Holographic toggle: in deck/collection views, holographic cards show a special badge + can be toggled to display the holo effect
- Achievement progress panel: per-set grid showing which cards are mastered (checkmark) vs remaining (grayed), with overall % completion

**No NFT minting required** — holographic is an on-chain unlock flag, not an NFT. It's a permanent cosmetic tied to the player's account and displayed automatically.

### Phase 3: Main Competitive Card Set (Balance Pass)

**Goal:** 1 flagship set of ~40 cards balanced for competitive play.

The existing "Starter Pack" (set 0, cards 0-39) is the base. Needs a balance pass:

- **Mana curve:** Ensure a healthy distribution across costs 1-7+ so early, mid, and late game are all viable
- **Archetype diversity:** At least 4-5 distinct archetypes (aggro rush, buff/scaling, spawn swarm, sniper/removal, tank/guard) that are competitively viable
- **Ability coverage:** Every battle trigger and shop trigger should appear on at least 1-2 cards in the set
- **Rarity tuning:** Replace the current flat rarity-10 with a tiered curve (common 10, uncommon 8, rare 6, epic 4, legendary 2) so drafts have meaningful variance
- **Token cards:** Review spawn-token cards (rarity 0) for balance — spawned units shouldn't be strictly better than draftable ones
- **Stat budget formula:** Each card should follow a rough budget of `attack + health ≈ play_cost * 1.5 + ability_tax` where ability_tax scales with effect power

Deliverable: Updated `cards/cards.json` and `cards/sets.json` with rebalanced Starter Pack.

### Phase 4: 3 Style Sets

Currently have 1 (Cosmic). Need 2 more for a total of 3.

Each style set contains 5 items:
1. **Avatar** (1:1, 256x256)
2. **Hand Background** (5:1, 1920x384)
3. **Card Border/Style** (3:4, 256x352, PNG with alpha)
4. **Board Background** (16:9, 1920x1080)
5. **Card Art Set** (IPFS directory with sm/ and md/ WebP per card)

**Proposed themes:**

| Set | Theme | Vibe |
|-----|-------|------|
| Cosmic (exists) | Space/nebula | Purple/blue cosmic energy |
| Medieval | Castle/kingdom | Stone, torches, heraldry, warm golds |
| Neon Cyber | Cyberpunk | Neon pink/cyan, circuit boards, dark city |

**Deliverable:** Update `cards/styles.json` with 2 new entries. Art assets uploaded to IPFS. Each set should be pre-minted as an NFT collection so players can acquire them.

### Phase 5: Pallet Polish for Beta

**Game Recording:**
- New storage: `GameHistory<T>` — `StorageMap<(AccountId, u64), GameRecord>` — stores completed game summaries (set_id, final_wins, final_round, rounds_played, timestamp, cards_used)
- New storage: `PlayerStats<T>` — `StorageMap<AccountId, AggregateStats>` — total games, total wins, perfect runs, favorite set, etc.
- Populate on game completion (both victory and defeat paths in `submit_turn`)

**Board Snapshots:**
- The ghost archive (`GhostArchive`) already stores every board ever submitted — this serves as the board recording system
- Add a new storage `GameBoards<T>` — `StorageNMap<(AccountId, game_id, round), BoundedGhostBoard>` — stores the player's board at each round of a specific game, enabling full game replay

**Quality of Life:**
- Add `get_mastery_progress` runtime API or storage query so the frontend can efficiently show achievement progress
- Ensure `abandon_game` cleans up `RunCardLog`

### Phase 6: Frontend Beta Features

**Achievement UI:**
- New `AchievementsPage` component: grid view of all cards in a set, each showing mastered/unmastered state
- Progress bar per set: "23/40 cards mastered"
- Card detail modal shows mastery status + holographic preview
- Toast notification on achievement unlock after a perfect run

**Game History:**
- New `ProfilePage` component: lifetime stats, recent game history, mastery progress across all sets
- Game replay viewer: step through recorded boards round-by-round

**Styling System (already mostly built):**
- Verify all 5 customization slots work end-to-end with NFTs: board_bg, hand_bg, card_style, avatar, card_art
- Add a "Style Set" bundle view in the Customize page — show complete themed sets as purchasable bundles
- Ensure holographic effect composes correctly with card_style overlays

**Blockchain Account Flow:**
- Wallet connection already exists via polkadot-api
- Ensure smooth onboarding: connect → pick set → play → achievement progress persists
- Funded account support (already implemented per git history)

## Beta Milestone Checklist

```
ENGINE
  [x] Basic card stats (mana/burn/health/attack)
  [x] Ability system (battle + shop triggers/effects)
  [x] Permanent stat modifiers (perm_attack, perm_health, perm_statuses)
  [x] Status system (Shield, Poison, Guard)
  [ ] Achievement tracking logic (run card log → mastery on perfect run)

PALLET
  [x] Create cards on-chain
  [x] Create card sets on-chain
  [x] Ghost opponent storage + matchmaking
  [x] Game progression (start → shop → battle → repeat)
  [x] Tournament system
  [ ] CardMastery + HolographicUnlocks storage
  [ ] RunCardLog tracking during games
  [ ] Perfect-run achievement trigger
  [ ] GameHistory + PlayerStats recording
  [ ] GameBoards round-by-round snapshots

CONTENT
  [ ] 1 balanced competitive card set (~40 cards, tiered rarity)
  [x] 1 style set (Cosmic)
  [ ] 1 style set (Medieval)
  [ ] 1 style set (Neon Cyber)

FRONTEND
  [x] Card, board, hand, shop UI
  [x] Blockchain account connection
  [x] NFT customization (5 slots: card, board, hand, avatar, border)
  [x] IPFS upload + minting
  [x] Creator hub (cards + sets)
  [x] Sandbox mode (free testing of card builds and strategies)
  [ ] Holographic card CSS effect
  [ ] Achievement progress page
  [ ] Game history / profile page
  [ ] Style set bundle view
```

## Extras (Not Required for Beta)

These features already exist in the codebase but are not part of the beta scope. They can be polished and promoted in future releases:

- **Tournament system** — On-chain tournaments with entry fees, prize pools split between players/set creators/card creators. Pallet and frontend support already built.
- **Multiplayer/P2P** — Live player-vs-player battles. Frontend components and engine support exist.
- **Local/offline game mode** — Play without a blockchain connection using the pure WASM engine. No wallet needed.
- **Ghost browser** — Browse and inspect stored ghost opponent boards from other players.
- **Presentations system** — Interactive slide deck engine with embedded live battles, shop demos, and card breakdowns. Useful for demos and onboarding.
- **Drag and drop board management** — Rearrange board positions by dragging cards between slots.
- **Card tilt effect** — 3D hover/tilt animation on cards.

## Suggested Build Order

1. **Achievement system** (pallet storage + submit_turn modifications) — this is the core new feature
2. **Holographic rendering** (frontend CSS) — immediate visual payoff once achievements work
3. **Balance pass** on Starter Pack — makes the game actually fun to play competitively
4. **Game recording** (pallet storage) — adds depth to the experience
5. **2 new style sets** (art production + IPFS upload + styles.json) — can be parallelized with above
6. **Frontend pages** (achievements, profile, history) — ties everything together
7. **Integration testing** + ghost backfill for the rebalanced set
