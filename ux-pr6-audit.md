# PR #6 UX Remediation — Audit Items

## Bugs

- [ ] **`endTurn` blocks battle permanently when board is empty** — `gameStore.ts:475` — The empty-board guard hard-blocks with no override. If a player has no cards in hand and no mana, they're soft-locked. Should be a confirmation dialog or allow after second press, not a hard block.

- [ ] **`aria-hidden="true"` on RotatePrompt hides close button from assistive tech** — `RotatePrompt.tsx:9` — The outer div has `aria-hidden="true"` unconditionally, making the dismiss button invisible to screen readers when the prompt is visible. Should be conditional on actual visibility.

- [ ] **Drop hint toast fires on missed drops from board cards too** — `useDragAndDrop.ts:94-98` — If a user picks up a board card and drops on nothing (cancel), they get "Drop on the board to play or the flame to burn" which is misleading. Should check source type and only show for hand cards.

- [ ] **`playHandCard` board-full check uses stale `view`** — `gameStore.ts:418-422` — The guard reads `view` from the store but `view` is only updated after engine calls. Rapid taps could race. Minor since the engine likely handles it, but the guard gives false safety.

## Improvements

- [ ] **Onboarding hint never auto-dismisses** — `Arena.tsx:161-169` — PR description says "auto-dismiss once the player places their first card" but there's no session flag implementing that. It just switches to "X/5 units deployed" permanently.

- [ ] **Two process artifact files committed to repo** — `ux-remediation-plan-2026-03-20.md` (187 lines) and `ux-report-2026-03-20.md` (420 lines) are process docs that will be stale immediately. Consider moving to issue/wiki or deleting.

- [ ] **GameTopBar uses `role="navigation"` on a div instead of semantic `<nav>`** — `GameTopBar.tsx:155-156` — PR description says "wrap in `<nav>`" but the code just adds a role to the existing div. Using `<nav>` would be cleaner and consistent with the `<main>` added in GameShell.

- [ ] **ManaBar `role="status"` creates a live region that announces every mana change** — `ManaBar.tsx:12` — Screen readers will announce every burn/play action. Could be noisy. Consider `aria-live="polite"` with debounce or removing live region semantics.

- [ ] **Formatting-only changes inflate the diff** — A large portion of the 1100 additions / 229 deletions is whitespace reformatting. Makes real changes harder to review. Consider separating formatting from functional changes in future PRs.

## Missed Items

- [ ] **"Board full" hint doesn't account for empty hand** — `Arena.tsx:165-166` — When board is full it says "burn a unit to make room" but if the hand is also empty, that advice is wrong. No alternative guidance shown.

- [ ] **Empty board slots are not keyboard-focusable** — `EmptySlot` is a plain div with no `tabIndex` or `onKeyDown`. Keyboard users still can't place cards by pressing Enter on a slot despite the new `:focus-visible` styles.

- [ ] **CardDetailPanel has no Escape-to-close** — `CardDetailPanel.tsx:170-177` — The close button works but there's no Escape key handler or focus trap, which is a standard panel/dialog pattern.
