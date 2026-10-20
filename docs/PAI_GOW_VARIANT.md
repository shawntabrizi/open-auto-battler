# Pai Gow Variant (Design Note)

Status: idea / not implemented. Captured from a design discussion on async,
single-commitment game modes (2026-07-01).

## Concept

A game mode borrowing the structure of [Pai Gow Magic](https://mtg.fandom.com/wiki/Pai_Gow_Magic)
(a casual MTG format), but replacing its interactive mini-games with our
deterministic autobattler resolution. The result is a fully asynchronous,
single-sealed-decision PvP mode that fits on-chain play naturally.

### Reference: original Pai Gow Magic rules

1. Each player opens one sealed booster pack and looks at all cards.
2. Each player secretly splits the cards into 5 piles of 3.
3. Pile order is randomized (classically, the *opponent* shuffles your piles),
   so you cannot aim a strong pile at a specific slot.
4. Five mini-games of real Magic are played, one per pile pairing, with heavy
   simplifications: pile = entire hand, no library, 5 life, unlimited mana.
5. Best of 5 wins the match.

Key insight: the *split* is a perfect single-step sealed commitment, but the
*resolution* is interactive turn-by-turn Magic — the same synchronous-play
problem that rules out games like Schotten Totten for on-chain. The fix is to
keep the Pai Gow shell and swap resolution for our combat sim.

## On-chain adaptation

1. **Seeded pack**: player receives a verifiable random card pool (seed from
   chain randomness).
2. **Sealed commit**: player partitions the pool into N piles and submits a
   single commit (hash). Opponent does the same, possibly hours apart — fully
   async.
3. **Reveal + pairing**: after both commits, players reveal. Shared randomness
   from the combined reveals shuffles/pairs the piles (replaces the
   "opponent rearranges your piles" step, arguably more fair).
4. **Auto-resolution**: each pile pairing resolves via the deterministic
   autobattler engine. Best of N wins.

Cost: two transactions per player per match (commit, reveal). Zero synchrony.
Entire match is replayable/verifiable from the two commitments + seed.

### Design fork: shuffled vs. ordered lanes

- **Shuffled piles** (true Pai Gow): skill is making *every* pile
  independently decent — balance, don't concentrate. No matchup mind-games.
- **Ordered lanes** (Battle Line-style): you assign piles to lanes and they
  face the opponent's same-numbered lane. Re-introduces yomi ("they'll put
  their bomb in lane 1"), loses the balance-every-pile skill.

Both fit the same on-chain shell. Cheap to A/B prototype both.

## Making it multi-round (avoiding "one and done")

A single split-and-resolve can feel like a coin flip you watch once. Ways to
stretch it into a session or a ladder, roughly ordered by implementation cost:

1. **Best-of-N with carryover**: after each round's resolution, winners of
   individual lanes keep (some of) their surviving cards; losers get a small
   compensation draft. Re-split a modified pool next round. The split decision
   recurs with evolving inputs.
2. **Progressive pool**: each round adds a new mini-pack to your pool
   (Super Auto Pets-style economy). You re-partition your growing collection
   every round; matches are against opponents at the same round number
   (ghost matchmaking — no live opponent needed).
3. **Gauntlet/ladder mode**: your revealed split becomes a persistent
   "defender" that other players' splits are matched against while you're
   offline (Clash of Clans defense model). You earn ranking from both your
   attacks and your defense record.
4. **Tournament bracket**: many players commit splits against the same seeded
   pool; pairings resolve bracket-style over hours/days. Async by
   construction, and one commitment feeds many matches.
5. **Lane-count escalation**: round 1 is a 3-pile split, round 2 is 5 piles
   from a bigger pool, etc. Same core decision, rising complexity — a natural
   session arc.

## Loot-box / pack-opening framing

In paper MTG, "one and done" is fine because the pack opening *is* the
product — the game is garnish. Same idea here:

- The primary flow is opening a pack / loot box (NFT mint, reward drop,
  season chest). The Pai Gow match is an **optional add-on** played with the
  contents you just opened, before the cards go into your collection.
- Framing: "you were opening the box anyway — want to battle with it first?"
  Low stakes, no deck-building barrier, instant content for every drop.
- Possible hooks: winning the add-on match upgrades one card in the pack /
  adds a cosmetic finish / grants a bonus mini-pack. Losing costs nothing.
  Keeps it a garnish, not a gate.
- This also makes every pack opening a matchmaking event: pair opener with
  another player who opened a pack in the same window, or with a stored ghost
  split from a previous opener of the same pack type.
