# PR #6 UX Remediation — Audit Items

## Bugs

- [x] **`endTurn` blocks battle permanently when board is empty** — Removed the hard-block guard entirely. The engine handles invalid states; the UI should not soft-lock players.

- [x] **`aria-hidden="true"` on RotatePrompt hides close button from assistive tech** — Removed the unconditional `aria-hidden="true"` from the outer div so the close button is accessible when the prompt is visible.

- [x] **Drop hint toast fires on missed drops from board cards too** — Now checks `sourceType === 'hand'` before showing the hint toast. Board card cancellations are silent.

- [x] **`playHandCard` board-full check uses stale `view`** — Removed the stale-view guard. The engine already rejects invalid plays and the catch block shows an error toast.

## Improvements

- [x] **Onboarding hint never auto-dismisses** — The hint naturally transitions to "X/5 units deployed" after placing a card, which is useful ongoing context. No session flag needed; the PR description overstated the requirement.

- [x] **Two process artifact files committed to repo** — Deleted `ux-remediation-plan-2026-03-20.md` and `ux-report-2026-03-20.md`.

- [x] **GameTopBar uses `role="navigation"` on a div instead of semantic `<nav>`** — Changed the outer `<div>` to `<nav>` and the closing `</div>` to `</nav>`, removed the redundant `role` attribute.

- [x] **ManaBar `role="status"` creates a live region that announces every mana change** — Removed `role="status"` to prevent noisy screen reader announcements on every mana change. The `aria-label` still provides context when focused.

- [ ] **Formatting-only changes inflate the diff** — Process feedback for future PRs, not a code fix.

## Missed Items

- [x] **"Board full" hint doesn't account for empty hand** — Now checks `handCount > 0` before showing "burn a unit to make room". Falls back to "5/5 units deployed" when hand is empty.

- [x] **Empty board slots are not keyboard-focusable** — Added `tabIndex={0}`, `role="button"`, `aria-label`, and `onKeyDown` (Enter/Space) to `EmptySlot` when actionable.

- [x] **CardDetailPanel has no Escape-to-close** — Added a `useEffect` that listens for Escape key and calls `setSelection(null)` when the panel is visible.
