# UX Report Remediation Plan

## Context

A UX analysis tool tested 10 personas against the game. 7/10 failed to complete the basic task of playing a card. The root cause is **discoverability, not broken mechanics**: click-to-play (tap card in hand, tap empty board slot) already works, as does drag-and-drop. But zero onboarding or visual cues guide users through these flows. Secondary issues include a blocking mobile portrait overlay, missing keyboard/accessibility support, and dead clicks.

---

## Task 1: Add contextual onboarding hint for card playing (CRITICAL)

**Problem:** 7/10 personas couldn't figure out how to play cards. The click-to-select-then-click-to-place flow exists but is completely undiscoverable. No text, tooltip, or animation guides new players through the core mechanic.

**Solution:** Add a contextual hint in the Arena component that appears when:
- The board is empty AND no card is selected: "Tap a card in your hand to begin"
- A hand card IS selected: "Now tap a board slot to place your unit" (with animated arrow or pulsing slots)

Display this as a small overlay/banner in the Arena area (not a modal). It should auto-dismiss once the player successfully places their first card in the session.

**Files to modify:**
- `web/src/components/Arena.tsx` — add hint overlay with conditional logic
- `web/src/index.css` — hint styling

**How to test:** Start a new practice game. With an empty board and cards in hand, a clear instruction should be visible. After selecting a card, the hint should update to guide placement. After placing one card, the hint disappears permanently for the session.

---

## Task 2: Improve visual affordances for board drop zones (CRITICAL)

**Problem:** When a hand card is selected, empty board slots show only a subtle border change (`slot-available` class). Users don't notice this. When dragging, the `slot-drop-target` golden glow only appears on the hovered slot — other slots remain invisible.

**Solution:**
- When a hand card is selected (click): make ALL empty slots pulse with a visible "place here" animation (brighter glow, scale pulse)
- Add a subtle label inside empty slots when a hand card is selected: "+" or a down-arrow icon
- Ensure the `slot-available` style is more prominent: stronger border, slight background glow animation

**Files to modify:**
- `web/src/index.css` — enhance `.slot-available` with a pulse animation, brighter colors
- `web/src/components/UnitCard.tsx` (`EmptySlot`) — show a "+" icon when `isTarget` is true

**How to test:** Select a card from hand. All 5 empty board slots should visibly pulse/glow and show a placement indicator. The visual change should be obvious even on mobile.

---

## Task 3: Make RotatePrompt non-blocking (HIGH)

**Problem:** On mobile portrait, the RotatePrompt covers the entire screen at `z-index: 100` with `rgba(14,12,9,0.95)` background. The dismiss button exists but the overlay itself is so aggressive that users think the game is broken. One persona reported it "prevented all interactions."

**Solution:** Change the RotatePrompt from a full-screen blocking overlay to a dismissible banner/toast at the top or bottom of the screen. The game should remain visible and interactable behind it.

**Files to modify:**
- `web/src/components/RotatePrompt.tsx` — restructure as a non-blocking banner
- `web/src/index.css` — update `.rotate-prompt` styles: remove `inset: 0`, make it a positioned banner instead of full-screen overlay

**How to test:** Open the game on a mobile device in portrait mode. The banner should suggest rotating but the game should be visible and playable behind it. Dismissing the banner should remove it. The game should be fully interactive even before dismissing.

---

## Task 4: Add focus indicators for keyboard navigation (HIGH)

**Problem:** No visible focus indicators exist for any game element. Keyboard-only users cannot see which element has focus when tabbing.

**Solution:** Add a global `:focus-visible` style for all interactive elements (buttons, cards, links). Use a gold/amber outline that matches the game's visual theme.

**Files to modify:**
- `web/src/index.css` — add global `:focus-visible` rule with a visible gold outline, plus specific rules for cards and game buttons

**How to test:** Tab through the game using keyboard only. Every interactive element (buttons, cards, menu items) should show a clear gold focus ring when focused via keyboard. Mouse clicks should NOT show the focus ring (that's what `:focus-visible` ensures).

---

## Task 5: Add skip-to-content link (HIGH)

**Problem:** Over 12 tab presses needed to reach main game content. No skip navigation link available.

**Solution:** Add a "Skip to main content" link as the first focusable element in the app. It should be visually hidden until focused (standard a11y pattern). When activated, it jumps focus to the main game area.

**Files to modify:**
- `web/src/components/GameShell.tsx` — add skip link at the top and `id="main-content"` on the game area
- `web/src/index.css` — add `.skip-link` styles (visually hidden, visible on focus)

**How to test:** Press Tab once on any game page. A "Skip to main content" link should appear. Pressing Enter should move focus to the main game area, skipping all navigation.

---

## Task 6: Add ARIA landmarks and semantic structure (MEDIUM)

**Problem:** No `<main>`, `<nav>`, or ARIA landmark roles exist. Screen readers cannot identify game regions.

**Solution:** Add semantic HTML elements and ARIA labels to key game regions:
- Wrap the game area in `<main>`
- Add `role="region"` and `aria-label` to Arena ("Staging Area"), Shop ("Your Hand"), burn zone
- Add `<nav>` to GameTopBar

**Files to modify:**
- `web/src/components/GameShell.tsx` — wrap content in `<main>`, add landmark roles
- `web/src/components/GameTopBar.tsx` — wrap in `<nav>`
- `web/src/components/Arena.tsx` — add `role="region" aria-label="Staging Area"`
- `web/src/components/Shop.tsx` — add `role="region" aria-label="Your Hand"`

**How to test:** Use a screen reader or browser accessibility inspector. The game should expose landmarks: navigation, main content, staging area, hand area.

---

## Task 7: Fix dead clicks on non-interactive elements (MEDIUM)

**Problem:** 11 dead clicks detected — elements that look clickable (hover states, pointer cursor) but don't respond to interaction.

**Solution:** Audit game elements for misleading affordances. Likely culprits:
- Mana bar segments (styled but non-interactive)
- Board label text "Staging Area"
- Hand label text "Hand"
- Card stat badges

Remove `cursor-pointer` and hover effects from non-interactive elements, or make them do something useful (e.g., clicking mana bar could show a tooltip explaining mana).

**Files to modify:**
- `web/src/index.css` — remove hover effects from non-interactive elements
- Various components — audit and fix cursor/hover styling

**How to test:** Click every visible element in the game UI. Non-interactive elements should not have pointer cursor or hover effects that suggest interactivity.

---

## Verification

After all tasks are complete:
1. Run `./start.sh --blockchain` to start dev server
2. Open game in browser, start a practice game
3. Verify Task 1: Onboarding hint visible, guides through first card placement
4. Verify Task 2: Selecting a hand card makes board slots clearly glow/pulse
5. Verify Task 3: Open on mobile portrait — game visible behind non-blocking banner
6. Verify Task 4: Tab through game, gold focus ring visible on all interactive elements
7. Verify Task 5: First Tab press shows skip link, Enter jumps to game content
8. Verify Task 6: Browser accessibility inspector shows proper landmarks
9. Verify Task 7: No dead clicks — non-interactive elements don't look clickable

---

## Changes Summary

### Task 1: Contextual onboarding hints (CRITICAL)
- **`Arena.tsx`**: Changed the hint text from desktop-only (`hidden lg:block`) to always-visible. Added contextual messages: "Tap a card in your hand to begin" (with amber pulse animation) when board is empty, "Now tap a board slot to place your unit" when a card is selected.

### Task 2: Enhanced board drop zone affordances (CRITICAL)
- **`UnitCard.tsx`** (`EmptySlot`): Added a pulsing "+" icon inside empty slots when `isTarget` is true (hand card selected).
- **`index.css`**: Upgraded `.slot-available` from subtle dashed border to solid border with golden glow + pulse animation (`slot-available-pulse`). Added `.slot-place-icon` fade animation and `.onboarding-hint` pulse animation.

### Task 3: Non-blocking RotatePrompt (HIGH)
- **`RotatePrompt.tsx`**: Restructured from full-screen blocking overlay to a slim bottom banner with inline icon, text, and close button.
- **`index.css`**: Changed `.rotate-prompt` CSS from `inset: 0` full-screen to `bottom: 0` banner. Game remains visible and interactive behind it.

### Task 4: Focus indicators for keyboard navigation (HIGH)
- **`index.css`**: Added global `:focus-visible` with gold outline. Cards/slots/action-circles get a gold glow box-shadow instead.

### Task 5: Skip-to-content link (HIGH)
- **`GameShell.tsx`**: Added `<a href="#main-content" className="skip-link">Skip to game</a>` as first focusable element, and `id="main-content"` on the main game area.
- **`index.css`**: Added `.skip-link` styles — hidden off-screen, slides into view on focus.

### Task 6: ARIA landmarks and semantic structure (MEDIUM)
- **`GameShell.tsx`**: Wrapped game zones 2-4 in `<main>` with `id="main-content"`.
- **`Arena.tsx`**: Added `role="region" aria-label="Staging Area"`.
- **`Shop.tsx`**: Added `role="region" aria-label="Your Hand"`.
- **`GameTopBar.tsx`**: Added `role="navigation" aria-label="Game controls"`.
- **`ManaBar.tsx`**: Added `role="status" aria-label="Mana: X of Y"`.

### Task 7: Fix dead clicks (MEDIUM)
- **`ManaBar.tsx`**: Added `pointer-events-none` to mana segments, `aria-hidden="true"` to prevent them from appearing interactive.
- **`UnitCard.tsx`** (`EmptySlot`): Changed from always `cursor-pointer` to conditional — only shows pointer cursor when the slot is actionable (`isTarget` or `isHovered`).

### Task 8: Tutorial doesn't explain how to play cards (MEDIUM)
- **`tutorials/how-to-play/05-shop.tsx`**: Added explicit instructions to the Shop Phase tutorial slide: "Tap a card to select it, then tap an empty board slot to place it. You can also drag cards directly to the board."

### Task 9: Prevent accidental battle with empty board (HIGH)
- **`store/gameStore.ts`** (`endTurn`): Added a guard that checks if the board has any units before allowing battle. If the board is empty, shows a toast warning ("You have no units on the board! Place cards before battling.") and blocks the action.
