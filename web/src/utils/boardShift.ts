/**
 * Pure board shift logic for SAP-style insert/shift drag-and-drop.
 *
 * All functions operate on generic nullable arrays — no engine, React, or
 * state dependencies — so they are trivially unit-testable.
 */

/** Returns true when every board slot is occupied. */
export function isBoardFull<T>(board: (T | null)[]): boolean {
  return board.every((slot) => slot !== null);
}

/**
 * Find the nearest empty slot to `targetSlot`.
 * Prefers higher indices (right) first at each search distance,
 * then falls back to lower indices (left).
 *
 * Returns the slot index, or `null` if the board is full.
 */
export function findNearestEmpty<T>(board: (T | null)[], targetSlot: number): number | null {
  // If target itself is empty, return it directly
  if (board[targetSlot] === null) return targetSlot;

  const len = board.length;
  for (let distance = 1; distance < len; distance++) {
    const right = targetSlot + distance;
    if (right < len && board[right] === null) return right;

    const left = targetSlot - distance;
    if (left >= 0 && board[left] === null) return left;
  }

  return null;
}

/**
 * Compute the sequence of adjacent swap pairs needed to move the empty slot
 * from `emptySlot` to `targetSlot`.
 *
 * Each entry is `[slotA, slotB]` — a single `swap_board_positions` call.
 * After executing all swaps in order, `targetSlot` will be empty and the
 * units that were between have shifted one position toward `emptySlot`.
 */
export function computeInsertShifts(emptySlot: number, targetSlot: number): [number, number][] {
  const swaps: [number, number][] = [];

  if (emptySlot > targetSlot) {
    // Empty is to the right — swap leftward toward target
    for (let i = emptySlot; i > targetSlot; i--) {
      swaps.push([i, i - 1]);
    }
  } else if (emptySlot < targetSlot) {
    // Empty is to the left — swap rightward toward target
    for (let i = emptySlot; i < targetSlot; i++) {
      swaps.push([i, i + 1]);
    }
  }
  // emptySlot === targetSlot → no swaps needed

  return swaps;
}

/**
 * Compute the shift direction for a single slot during a board-to-board drag.
 * Returns -1, 0, or +1 in array-index space.
 *
 * Slots between source and target shift toward the source (filling the gap
 * left by removing the dragged unit).
 */
export function computeSlotShift(slot: number, source: number, target: number): number {
  if (slot === source) return 0; // Dragged card stays put (invisible via isDragging opacity)
  if (source > target) {
    // Dragging toward lower indices: slots in [target, source) shift +1
    if (slot >= target && slot < source) return 1;
  } else {
    // Dragging toward higher indices: slots in (source, target] shift -1
    if (slot > source && slot <= target) return -1;
  }
  return 0;
}

/**
 * Compute per-slot visual shift directions for a hand-to-board insert preview.
 *
 * Returns a `Map<slotIndex, shiftDirection>` where direction is +1 (toward
 * higher indices) or -1 (toward lower indices) in array-index space.
 *
 * Returns `null` when no shift is needed (target is empty or board is full).
 */
export function computeHandInsertShift<T>(
  board: (T | null)[],
  targetSlot: number
): Map<number, number> | null {
  // No shift needed if target is empty
  if (board[targetSlot] === null) return null;

  // No shift possible if board is full
  if (isBoardFull(board)) return null;

  const emptySlot = findNearestEmpty(board, targetSlot);
  if (emptySlot === null) return null;

  const shifts = new Map<number, number>();

  if (emptySlot > targetSlot) {
    // Empty is to the right — slots in [target, empty) shift +1
    for (let i = targetSlot; i < emptySlot; i++) {
      shifts.set(i, 1);
    }
  } else {
    // Empty is to the left — slots in (empty, target] shift -1
    for (let i = emptySlot + 1; i <= targetSlot; i++) {
      shifts.set(i, -1);
    }
  }

  return shifts;
}
