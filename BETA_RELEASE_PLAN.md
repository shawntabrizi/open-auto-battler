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
| **Core Engine** | ~90% | Battle system, ability system (11 battle triggers, 6 effects, 6 shop triggers, 4 effects), permanent stat modifiers, targeting, conditions, deterministic RNG |
| **Pallet** | ~85% | start_game, submit_turn, submit_card, create_card_set, ghost matchmaking, tournament system, ghost backfill, victory achievements |
| **Frontend** | ~75% | Shop/battle UI, card rendering, customization (5 NFT slots), WASM bridge, creator hub, multiplayer, sandbox |
| **Content** | ~40% | 110 cards, 2 sets (Starter Pack 40 cards, SAP Turtle Pack 60 cards), 1 style set (Cosmic) |

## What Needs to Be Built

### Phase 1: Achievement System + Holographic Rewards ✅ DONE

**What was built:**

The achievement system uses a simpler, gas-efficient design based on the existing ghost archive infrastructure rather than tracking cards throughout a run.

**How it works:** Achievements use a bitmap per (player, card_id) stored in `VictoryAchievements`. Bronze is granted automatically when a card enters battle. Silver and gold are granted when the player calls `end_game` / `end_tournament_game` after completing a run with 10+ wins (gold requires no losses).

**Implementation (already merged):**
- Storage: `VictoryAchievements<T>` — `StorageDoubleMap<(AccountId, CardId), u8>` — bitmap per card (bit 0 = bronze/played, bit 1 = silver/10 wins, bit 2 = gold/perfect run)
- `submit_turn` / `submit_tournament_turn` grant bronze for all cards on board entering battle, then set `phase = Completed` when game ends
- `end_game` / `end_tournament_game` extrinsics finalize: archive ghost board, grant silver/gold achievements, update tournament stats, remove session
- `GamePhase` enum: `{Shop, Battle, Completed}` — consistent across pallet and client engine
- Status system (Shield/Poison/Guard) was removed to simplify the engine for beta — 5 cards became stat-sticks (balance pass in Phase 3 will address)

**Design Rationale:**
The achievement is: "reach 10 wins with this card on your final board." This is simpler than tracking every card across all rounds, costs zero extra gas during gameplay (no `RunCardLog` writes per turn), and leverages the ghost archive that already exists. The tradeoff is that only the final board cards count, not cards used mid-run — but this still creates the intended puzzle challenge of building winning boards around specific cards.

### Phase 2: Holographic Card Rendering ✅ DONE

**What was built:**
- `achievementStore.ts` — Zustand store that queries `VictoryAchievements` on-chain storage for the connected account and exposes `hasBronze`, `hasSilver`, `hasGold`, and `isHolographic` (silver or gold)
- Achievements are fetched automatically on account selection
- `UnitCard` internally checks the achievement store — every card in the app (hand, board, battle, sandbox, bag, ghost browser, set preview, etc.) automatically renders holographic if unlocked
- CSS holographic effect: animated rotating `conic-gradient` rainbow border (via `.holo-border` wrapper), rainbow shimmer overlay (`.holo-shimmer` div), and pulsing prismatic outer glow
- Works alongside existing card effects (rarity glow, tilt, wobble) without conflicts
- Genesis style NFTs (Cosmic set) are now minted to new accounts on "New User" / "Add Funds" via a batched `Utility.batch_all` transaction

**Remaining:**
- [ ] Achievement progress panel: per-set grid showing which cards are mastered vs remaining, with overall % completion
- [x] `end_game` / `end_tournament_game` called automatically after game completion (grants achievements)
- [ ] Holographic badge/indicator in collection views

**No NFT minting required** — holographic is an on-chain unlock flag, not an NFT. It's a permanent cosmetic tied to the player's account and displayed automatically.

### Phase 3: Main Competitive Card Set (Balance Pass)

**Goal:** 1 flagship set of ~40 cards balanced for competitive play.

The existing "Starter Pack" (set 0, cards 0-39) is the base. Needs a balance pass:

- **Mana curve:** Ensure a healthy distribution across costs 1-7+ so early, mid, and late game are all viable
- **Archetype diversity:** At least 4-5 distinct archetypes (aggro rush, buff/scaling, spawn swarm, sniper/removal, tank wall) that are competitively viable
- **Ability coverage:** Every battle trigger and shop trigger should appear on at least 1-2 cards in the set
- **Rarity tuning:** Replace the current flat rarity-10 with a tiered curve (common 10, uncommon 8, rare 6, epic 4, legendary 2) so drafts have meaningful variance
- **Token cards:** Review spawn-token cards (rarity 0) for balance — spawned units shouldn't be strictly better than draftable ones
- **Stat budget formula:** Each card should follow a rough budget of `attack + health ≈ play_cost * 1.5 + ability_tax` where ability_tax scales with effect power
- **Status removal cleanup:** 5 cards lost their abilities when the status system was removed (Elephant, Ox, Turtle, Scorpion, Gorilla) — these need new non-status abilities or rebalanced stats

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

### Phase 5: Frontend Beta Features

**Achievement UI:**
- New `AchievementsPage` component: grid view of all cards in a set, each showing mastered/unmastered state
- Progress bar per set: "23/40 cards mastered"
- Card detail modal shows mastery status + holographic preview
- Toast notification on achievement unlock after a perfect run

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
  [x] Permanent stat modifiers (perm_attack, perm_health)
  [x] Status system removed (Shield/Poison/Guard stripped for beta simplicity)

PALLET
  [x] Create cards on-chain
  [x] Create card sets on-chain
  [x] Ghost opponent storage + matchmaking
  [x] Game progression (start → shop → battle → repeat)
  [x] Tournament system
  [x] VictoryAchievements (AccountId × CardId → u8 bitmap)
  [x] end_game / end_tournament_game extrinsics (finalize game, grant achievements)
  [x] Victory boards archived with wins=10 on game completion

CONTENT
  [ ] 1 balanced competitive card set (~40 cards, tiered rarity)
  [ ] Rebalance 5 cards that lost status abilities (Elephant, Ox, Turtle, Scorpion, Gorilla)
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
  [x] Holographic card CSS effect (rainbow border + shimmer, driven by on-chain achievements)
  [x] Achievement store (fetches VictoryAchievements on account select)
  [x] Genesis style NFT minting on new user / add funds
  [ ] Achievement progress page (per-set mastery grid)
  [ ] Call end_game after victory runs
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

1. ~~**Achievement system** (pallet storage + submit_turn modifications)~~ ✅ DONE
2. ~~**Holographic rendering** (frontend CSS + achievement store)~~ ✅ DONE
3. **Balance pass** on Starter Pack — makes the game actually fun to play competitively; also fix the 5 cards that lost status abilities
4. **2 new style sets** (art production + IPFS upload + styles.json) — can be parallelized with above
5. **Frontend pages** (achievement progress grid, style bundles) + wire `end_game` call after victory runs
6. **Integration testing** + ghost backfill for the rebalanced set
