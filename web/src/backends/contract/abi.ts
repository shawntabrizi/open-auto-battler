/**
 * ABI encoding helpers for the OAB arena contract.
 *
 * The contract uses Ethereum-compatible 4-byte function selectors with
 * ABI-encoded parameters. Game data (cards, units, actions) is SCALE-encoded
 * and wrapped in ABI `bytes` parameters.
 */

// ── Function selectors (keccak256 of signature, first 4 bytes) ───────────────

export const SELECTORS = {
  registerCard:  '0xd6c09c1d' as const,
  registerSet:   '0xd8f41b6a' as const,
  startGame:     '0xe8c0127d' as const,
  submitTurn:    '0x217081fe' as const,  // keccak256("submitTurn(bytes)")
  getGameState:  '0x1760f3a3' as const,
  abandonGame:   '0xd6b56ded' as const,
  endGame:       '0xccaa31e4' as const,
  getCard:       '0xcd25ba26' as const,
  getSet:        '0x3e42c388' as const,
} as const;

// ── ABI encoding helpers ─────────────────────────────────────────────────────

/** Pad a hex string to 32 bytes (64 hex chars), left-padded with zeros. */
function padLeft(hex: string, bytes = 32): string {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  return clean.padStart(bytes * 2, '0');
}

/** Encode a uint value as a 32-byte ABI word. */
function encodeUint(value: number | bigint): string {
  return padLeft(BigInt(value).toString(16));
}

/** Encode bytes as ABI dynamic data (offset + length + padded data). */
function encodeBytes(data: Uint8Array): { offset: string; data: string } {
  const len = encodeUint(data.length);
  const hex = Array.from(data).map(b => b.toString(16).padStart(2, '0')).join('');
  const paddedLen = Math.ceil(hex.length / 64) * 64;
  const paddedHex = hex.padEnd(paddedLen, '0');
  return { offset: '', data: len + paddedHex };
}

// ── Calldata builders ────────────────────────────────────────────────────────

/** Build calldata for startGame(uint16 setId, uint64 seedNonce) */
export function encodeStartGame(setId: number, seedNonce: bigint): `0x${string}` {
  return `0x${SELECTORS.startGame.slice(2)}${encodeUint(setId)}${encodeUint(seedNonce)}` as `0x${string}`;
}

/** Build calldata for submitTurn(bytes actionScale) — contract selects opponent internally */
export function encodeSubmitTurn(actionScale: Uint8Array): `0x${string}` {
  const action = encodeBytes(actionScale);
  const offset = encodeUint(32);
  return `0x${SELECTORS.submitTurn.slice(2)}${offset}${action.data}` as `0x${string}`;
}

/** Build calldata for getGameState() */
export function encodeGetGameState(): `0x${string}` {
  return `0x${SELECTORS.getGameState.slice(2)}` as `0x${string}`;
}

/** Build calldata for abandonGame() */
export function encodeAbandonGame(): `0x${string}` {
  return `0x${SELECTORS.abandonGame.slice(2)}` as `0x${string}`;
}

/** Build calldata for endGame() */
export function encodeEndGame(): `0x${string}` {
  return `0x${SELECTORS.endGame.slice(2)}` as `0x${string}`;
}

/** Build calldata for registerCard(bytes cardScale) */
export function encodeRegisterCard(cardScale: Uint8Array): `0x${string}` {
  const card = encodeBytes(cardScale);
  const offset = encodeUint(32);
  return `0x${SELECTORS.registerCard.slice(2)}${offset}${card.data}` as `0x${string}`;
}

/** Build calldata for registerSet(uint16 setId, bytes cardSetScale) */
export function encodeRegisterSet(setId: number, cardSetScale: Uint8Array): `0x${string}` {
  const setData = encodeBytes(cardSetScale);
  const setIdWord = encodeUint(setId);
  const offset = encodeUint(64);
  return `0x${SELECTORS.registerSet.slice(2)}${setIdWord}${offset}${setData.data}` as `0x${string}`;
}

// ── Response decoders ────────────────────────────────────────────────────────

/** Decode submitTurn return: (uint8 result, uint8 wins, uint8 lives, uint8 round, uint64 battleSeed) */
export function decodeSubmitTurnResult(data: `0x${string}`): {
  result: 'Victory' | 'Defeat' | 'Draw';
  wins: number;
  lives: number;
  round: number;
  battleSeed: bigint;
} {
  const hex = data.startsWith('0x') ? data.slice(2) : data;
  // 5 words of 32 bytes each = 320 hex chars
  const resultByte = parseInt(hex.slice(62, 64), 16);
  const wins = parseInt(hex.slice(126, 128), 16);
  const lives = parseInt(hex.slice(190, 192), 16);
  const round = parseInt(hex.slice(254, 256), 16);
  const battleSeed = BigInt('0x' + hex.slice(304, 320));

  const resultMap: Record<number, 'Victory' | 'Defeat' | 'Draw'> = {
    0: 'Victory',
    1: 'Defeat',
    2: 'Draw',
  };

  return {
    result: resultMap[resultByte] ?? 'Draw',
    wins,
    lives,
    round,
    battleSeed,
  };
}

/** Decode getGameState return: ABI-encoded bytes containing SCALE session data */
export function decodeGetGameStateResult(data: `0x${string}`): Uint8Array | null {
  const hex = data.startsWith('0x') ? data.slice(2) : data;
  if (hex.length < 128) return null; // Minimum: offset(32) + length(32) = 128 hex

  // First word is offset to bytes (should be 32 = 0x20)
  // Second word is length of bytes
  const length = parseInt(hex.slice(120, 128), 16);
  if (length === 0) return null;

  // Data starts at hex offset 128 (byte 64)
  const dataHex = hex.slice(128, 128 + length * 2);
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = parseInt(dataHex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Decode startGame return: uint64 seed */
export function decodeStartGameResult(data: `0x${string}`): bigint {
  const hex = data.startsWith('0x') ? data.slice(2) : data;
  return BigInt('0x' + hex.slice(48, 64));
}

/** Build calldata for getCard(uint16 cardId) */
export function encodeGetCard(cardId: number): `0x${string}` {
  return `0x${SELECTORS.getCard.slice(2)}${encodeUint(cardId)}` as `0x${string}`;
}

/** Build calldata for getSet(uint16 setId) */
export function encodeGetSet(setId: number): `0x${string}` {
  return `0x${SELECTORS.getSet.slice(2)}${encodeUint(setId)}` as `0x${string}`;
}
