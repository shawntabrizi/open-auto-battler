import { describe, it, expect } from 'vitest';
import {
  findNearestEmpty,
  computeInsertShifts,
  computeHandInsertShift,
  computeSlotShift,
  isBoardFull,
} from './boardShift';

// Helper: create board from shorthand. Letters are occupied, null is empty.
type Board = (string | null)[];
const _ = null;

/**
 * Simulate a full shop-to-board insert: find empty, apply swaps, place "X" at target.
 * Returns the resulting board.
 */
function simulateInsert(board: Board, target: number): Board | null {
  const b = [...board];
  const empty = findNearestEmpty(b, target);
  if (empty === null) return null;

  const swaps = computeInsertShifts(empty, target);
  for (const [a, c] of swaps) {
    [b[a], b[c]] = [b[c], b[a]];
  }

  // target should now be empty
  if (b[target] !== null) return null;
  b[target] = 'X';
  return b;
}

/**
 * Simulate a board-to-board move (sequential adjacent swaps from source to target).
 */
function simulateBoardMove(board: Board, from: number, to: number): Board {
  const b = [...board];
  if (from < to) {
    for (let i = from; i < to; i++) [b[i], b[i + 1]] = [b[i + 1], b[i]];
  } else {
    for (let i = from; i > to; i--) [b[i], b[i - 1]] = [b[i - 1], b[i]];
  }
  return b;
}

// ---------------------------------------------------------------------------
// isBoardFull
// ---------------------------------------------------------------------------
describe('isBoardFull', () => {
  it('returns false for empty board', () => {
    expect(isBoardFull([_, _, _, _, _])).toBe(false);
  });

  it('returns false for partially filled board', () => {
    expect(isBoardFull(['A', _, 'C', _, _])).toBe(false);
  });

  it('returns true for full board', () => {
    expect(isBoardFull(['A', 'B', 'C', 'D', 'E'])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// findNearestEmpty
// ---------------------------------------------------------------------------
describe('findNearestEmpty', () => {
  it('returns target itself when empty', () => {
    expect(findNearestEmpty([_, _, _, _, _], 2)).toBe(2);
  });

  it('prefers right over left at equal distance', () => {
    expect(findNearestEmpty([_, 'A', _, _, _], 1)).toBe(2);
  });

  it('finds right neighbor', () => {
    expect(findNearestEmpty(['A', _, _, _, _], 0)).toBe(1);
  });

  it('finds right when further away', () => {
    expect(findNearestEmpty(['A', 'B', _, _, _], 0)).toBe(2);
    expect(findNearestEmpty(['A', 'B', _, _, _], 1)).toBe(2);
  });

  it('finds left when right is full', () => {
    expect(findNearestEmpty([_, 'A', 'B', 'C', 'D'], 3)).toBe(0);
  });

  it('finds nearest left when right is occupied', () => {
    expect(findNearestEmpty(['A', _, 'B', 'C', 'D'], 3)).toBe(1);
  });

  it('returns null when board is full', () => {
    expect(findNearestEmpty(['A', 'B', 'C', 'D', 'E'], 0)).toBeNull();
    expect(findNearestEmpty(['A', 'B', 'C', 'D', 'E'], 2)).toBeNull();
    expect(findNearestEmpty(['A', 'B', 'C', 'D', 'E'], 4)).toBeNull();
  });

  // Spec section 3: 4 pets on board
  it('finds slot 4 from target 0 with [A,B,C,D,_]', () => {
    expect(findNearestEmpty(['A', 'B', 'C', 'D', _], 0)).toBe(4);
  });

  it('finds slot 4 from target 2 with [A,B,C,D,_]', () => {
    expect(findNearestEmpty(['A', 'B', 'C', 'D', _], 2)).toBe(4);
  });

  it('finds slot 0 from target 3 with [_,A,B,C,D]', () => {
    expect(findNearestEmpty([_, 'A', 'B', 'C', 'D'], 3)).toBe(0);
  });

  it('finds slot 1 from target 3 with [A,_,B,C,D]', () => {
    expect(findNearestEmpty(['A', _, 'B', 'C', 'D'], 3)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// computeInsertShifts
// ---------------------------------------------------------------------------
describe('computeInsertShifts', () => {
  it('returns empty when empty === target', () => {
    expect(computeInsertShifts(2, 2)).toEqual([]);
  });

  it('single swap when adjacent right', () => {
    expect(computeInsertShifts(1, 0)).toEqual([[1, 0]]);
  });

  it('chain of swaps when empty is far right', () => {
    expect(computeInsertShifts(4, 0)).toEqual([
      [4, 3],
      [3, 2],
      [2, 1],
      [1, 0],
    ]);
  });

  it('chain of swaps when empty is to the right, partial', () => {
    expect(computeInsertShifts(4, 2)).toEqual([
      [4, 3],
      [3, 2],
    ]);
  });

  it('chain of swaps when empty is to the left', () => {
    expect(computeInsertShifts(0, 3)).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
    ]);
  });

  it('partial left chain', () => {
    expect(computeInsertShifts(1, 3)).toEqual([
      [1, 2],
      [2, 3],
    ]);
  });
});

// ---------------------------------------------------------------------------
// computeHandInsertShift (visual preview)
// ---------------------------------------------------------------------------
describe('computeHandInsertShift', () => {
  it('returns null when target is empty', () => {
    expect(computeHandInsertShift(['A', _, _, _, _], 1)).toBeNull();
  });

  it('returns null when board is full', () => {
    expect(computeHandInsertShift(['A', 'B', 'C', 'D', 'E'], 2)).toBeNull();
  });

  it('shifts right when empty is to the right', () => {
    const shifts = computeHandInsertShift(['A', 'B', _, _, _], 0)!;
    expect(shifts.get(0)).toBe(1); // A shifts right
    expect(shifts.get(1)).toBe(1); // B also shifts right (between target 0 and empty 2)
    expect(shifts.has(2)).toBe(false); // empty slot not shifted
  });

  it('shifts occupied slots between target and empty', () => {
    const shifts = computeHandInsertShift(['A', 'B', 'C', 'D', _], 0)!;
    // Empty at 4, target at 0 → slots 0,1,2,3 shift +1
    expect(shifts.get(0)).toBe(1);
    expect(shifts.get(1)).toBe(1);
    expect(shifts.get(2)).toBe(1);
    expect(shifts.get(3)).toBe(1);
    expect(shifts.has(4)).toBe(false);
  });

  it('shifts left when empty is to the left', () => {
    const shifts = computeHandInsertShift([_, 'A', 'B', 'C', 'D'], 3)!;
    // Empty at 0, target at 3 → slots 1,2,3 shift -1
    expect(shifts.get(1)).toBe(-1);
    expect(shifts.get(2)).toBe(-1);
    expect(shifts.get(3)).toBe(-1);
    expect(shifts.has(0)).toBe(false);
    expect(shifts.has(4)).toBe(false);
  });

  it('partial shift when empty is between', () => {
    const shifts = computeHandInsertShift(['A', _, 'B', 'C', 'D'], 3)!;
    // Empty at 1, target at 3 → slots 2,3 shift -1
    expect(shifts.get(2)).toBe(-1);
    expect(shifts.get(3)).toBe(-1);
    expect(shifts.has(0)).toBe(false);
    expect(shifts.has(1)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Integration: Shop → Board (spec section 1 — empty board)
// ---------------------------------------------------------------------------
describe('Shop → Board: empty board', () => {
  it('places directly at any slot', () => {
    expect(simulateInsert([_, _, _, _, _], 0)).toEqual(['X', _, _, _, _]);
    expect(simulateInsert([_, _, _, _, _], 2)).toEqual([_, _, 'X', _, _]);
    expect(simulateInsert([_, _, _, _, _], 4)).toEqual([_, _, _, _, 'X']);
  });
});

// ---------------------------------------------------------------------------
// Integration: Shop → Board (spec section 2 — drop on empty slot)
// ---------------------------------------------------------------------------
describe('Shop → Board: drop on empty slot', () => {
  it('[A,_,_,_,_] drop on slot 3', () => {
    expect(simulateInsert(['A', _, _, _, _], 3)).toEqual(['A', _, _, 'X', _]);
  });

  it('[A,B,_,_,_] drop on slot 4', () => {
    expect(simulateInsert(['A', 'B', _, _, _], 4)).toEqual(['A', 'B', _, _, 'X']);
  });
});

// ---------------------------------------------------------------------------
// Integration: Shop → Board on occupied (spec section 3)
// ---------------------------------------------------------------------------
describe('Shop → Board: drop on occupied slot', () => {
  // 1 pet
  it('[A,_,_,_,_] drop on slot 0 → [X,A,_,_,_]', () => {
    expect(simulateInsert(['A', _, _, _, _], 0)).toEqual(['X', 'A', _, _, _]);
  });

  it('[_,_,A,_,_] drop on slot 2 → [_,_,X,A,_]', () => {
    expect(simulateInsert([_, _, 'A', _, _], 2)).toEqual([_, _, 'X', 'A', _]);
  });

  // 2 pets
  it('[A,B,_,_,_] drop on slot 0 → [X,A,B,_,_]', () => {
    expect(simulateInsert(['A', 'B', _, _, _], 0)).toEqual(['X', 'A', 'B', _, _]);
  });

  it('[A,B,_,_,_] drop on slot 1 → [A,X,B,_,_]', () => {
    expect(simulateInsert(['A', 'B', _, _, _], 1)).toEqual(['A', 'X', 'B', _, _]);
  });

  // 3 pets
  it('[A,B,C,_,_] drop on slot 1 → [A,X,B,C,_]', () => {
    expect(simulateInsert(['A', 'B', 'C', _, _], 1)).toEqual(['A', 'X', 'B', 'C', _]);
  });

  it('[_,A,B,_,C] drop on slot 2 → [_,A,X,B,C]', () => {
    expect(simulateInsert([_, 'A', 'B', _, 'C'], 2)).toEqual([_, 'A', 'X', 'B', 'C']);
  });

  it('[_,A,B,C,_] drop on slot 2 → [_,A,X,B,C]', () => {
    expect(simulateInsert([_, 'A', 'B', 'C', _], 2)).toEqual([_, 'A', 'X', 'B', 'C']);
  });

  // 4 pets
  it('[A,B,C,D,_] drop on slot 0 → [X,A,B,C,D]', () => {
    expect(simulateInsert(['A', 'B', 'C', 'D', _], 0)).toEqual(['X', 'A', 'B', 'C', 'D']);
  });

  it('[A,B,C,D,_] drop on slot 2 → [A,B,X,C,D]', () => {
    expect(simulateInsert(['A', 'B', 'C', 'D', _], 2)).toEqual(['A', 'B', 'X', 'C', 'D']);
  });

  it('[_,A,B,C,D] drop on slot 3 → [A,B,C,X,D]', () => {
    expect(simulateInsert([_, 'A', 'B', 'C', 'D'], 3)).toEqual(['A', 'B', 'C', 'X', 'D']);
  });

  it('[A,_,B,C,D] drop on slot 3 → [A,B,C,X,D]', () => {
    expect(simulateInsert(['A', _, 'B', 'C', 'D'], 3)).toEqual(['A', 'B', 'C', 'X', 'D']);
  });

  // 5 pets (full board — blocked)
  it('[A,B,C,D,E] drop on any slot → null (blocked)', () => {
    expect(simulateInsert(['A', 'B', 'C', 'D', 'E'], 0)).toBeNull();
    expect(simulateInsert(['A', 'B', 'C', 'D', 'E'], 2)).toBeNull();
    expect(simulateInsert(['A', 'B', 'C', 'D', 'E'], 4)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Integration: Board → Board rearranging (spec sections 4-6)
// ---------------------------------------------------------------------------
describe('Board → Board: rearranging (occupied target)', () => {
  it('drag slot 4 to slot 2 with full board → [A,B,E,C,D]', () => {
    expect(simulateBoardMove(['A', 'B', 'C', 'D', 'E'], 4, 2)).toEqual(['A', 'B', 'E', 'C', 'D']);
  });

  it('drag slot 1 to slot 3 with full board → [A,C,D,B,E]', () => {
    expect(simulateBoardMove(['A', 'B', 'C', 'D', 'E'], 1, 3)).toEqual(['A', 'C', 'D', 'B', 'E']);
  });
});

describe('Board → Board: rearranging (empty target)', () => {
  it('direct move to empty slot [A,_,B,_,C] move 0→3 → [_,_,B,A,C]', () => {
    // Direct swap of slot 0 and slot 3
    const b: Board = ['A', _, 'B', _, 'C'];
    [b[0], b[3]] = [b[3], b[0]];
    expect(b).toEqual([_, _, 'B', 'A', 'C']);
  });

  it('direct move [A,B,C,D,_] move 0→4 → [_,B,C,D,A]', () => {
    const b: Board = ['A', 'B', 'C', 'D', _];
    [b[0], b[4]] = [b[4], b[0]];
    expect(b).toEqual([_, 'B', 'C', 'D', 'A']);
  });
});

describe('Board → Board: gaps between source and target', () => {
  it('[A,B,_,D,_] drag 0→3 → [B,_,D,A,_]', () => {
    expect(simulateBoardMove(['A', 'B', _, 'D', _], 0, 3)).toEqual(['B', _, 'D', 'A', _]);
  });

  it('[_,A,_,B,C] drag 3→1 → [_,B,A,_,C] (backward with gaps)', () => {
    // swap(3,2): [_,A,B,_,C] → swap(2,1): [_,B,A,_,C]
    expect(simulateBoardMove([_, 'A', _, 'B', 'C'], 3, 1)).toEqual([_, 'B', 'A', _, 'C']);
  });
});

// ---------------------------------------------------------------------------
// Board → Board: adjacent slots
// ---------------------------------------------------------------------------
describe('Board → Board: adjacent slots', () => {
  it('drag slot 0 to slot 1 with full board → [B,A,C,D,E]', () => {
    expect(simulateBoardMove(['A', 'B', 'C', 'D', 'E'], 0, 1)).toEqual(['B', 'A', 'C', 'D', 'E']);
  });

  it('drag slot 4 to slot 3 with full board → [A,B,C,E,D]', () => {
    expect(simulateBoardMove(['A', 'B', 'C', 'D', 'E'], 4, 3)).toEqual(['A', 'B', 'C', 'E', 'D']);
  });

  it('drag slot 2 to slot 3 partial board → [A,_,D,C,E]', () => {
    expect(simulateBoardMove(['A', _, 'C', 'D', 'E'], 2, 3)).toEqual(['A', _, 'D', 'C', 'E']);
  });
});

// ---------------------------------------------------------------------------
// Board → Board: extreme ends
// ---------------------------------------------------------------------------
describe('Board → Board: extreme ends', () => {
  it('drag slot 0 to slot 4 with full board → [B,C,D,E,A]', () => {
    expect(simulateBoardMove(['A', 'B', 'C', 'D', 'E'], 0, 4)).toEqual(['B', 'C', 'D', 'E', 'A']);
  });

  it('drag slot 4 to slot 0 with full board → [E,A,B,C,D]', () => {
    expect(simulateBoardMove(['A', 'B', 'C', 'D', 'E'], 4, 0)).toEqual(['E', 'A', 'B', 'C', 'D']);
  });
});

// ---------------------------------------------------------------------------
// computeSlotShift (visual preview for board-to-board drag)
// ---------------------------------------------------------------------------
describe('computeSlotShift', () => {
  it('source slot always returns 0', () => {
    expect(computeSlotShift(2, 2, 4)).toBe(0);
    expect(computeSlotShift(0, 0, 3)).toBe(0);
  });

  it('slots outside source-target range return 0', () => {
    // drag 1→3: slots 0 and 4 are unaffected
    expect(computeSlotShift(0, 1, 3)).toBe(0);
    expect(computeSlotShift(4, 1, 3)).toBe(0);
  });

  it('drag toward higher index: slots shift -1 (toward source)', () => {
    // drag slot 1 to slot 3: slots 2,3 shift -1
    expect(computeSlotShift(2, 1, 3)).toBe(-1);
    expect(computeSlotShift(3, 1, 3)).toBe(-1);
  });

  it('drag toward lower index: slots shift +1 (toward source)', () => {
    // drag slot 4 to slot 2: slots 2,3 shift +1
    expect(computeSlotShift(2, 4, 2)).toBe(1);
    expect(computeSlotShift(3, 4, 2)).toBe(1);
  });

  it('adjacent drag: only target shifts', () => {
    // drag 0→1: slot 1 shifts -1
    expect(computeSlotShift(1, 0, 1)).toBe(-1);
    expect(computeSlotShift(2, 0, 1)).toBe(0);

    // drag 3→2: slot 2 shifts +1
    expect(computeSlotShift(2, 3, 2)).toBe(1);
    expect(computeSlotShift(1, 3, 2)).toBe(0);
  });

  it('full range drag: all intermediate slots shift', () => {
    // drag 0→4: slots 1,2,3,4 shift -1
    expect(computeSlotShift(1, 0, 4)).toBe(-1);
    expect(computeSlotShift(2, 0, 4)).toBe(-1);
    expect(computeSlotShift(3, 0, 4)).toBe(-1);
    expect(computeSlotShift(4, 0, 4)).toBe(-1);

    // drag 4→0: slots 0,1,2,3 shift +1
    expect(computeSlotShift(0, 4, 0)).toBe(1);
    expect(computeSlotShift(1, 4, 0)).toBe(1);
    expect(computeSlotShift(2, 4, 0)).toBe(1);
    expect(computeSlotShift(3, 4, 0)).toBe(1);
  });
});
