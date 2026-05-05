/**
 * ABI helpers for the OAB arena contract.
 *
 * Rust `snake_case` methods are exposed to Ethereum callers as `camelCase`
 * names in the generated ABI. Using viem to encode/decode the ABI keeps the
 * selectors in sync with the contract build artifacts instead of maintaining a
 * hand-written selector table.
 */

import { decodeFunctionResult, encodeFunctionData, fromHex, parseAbi, toHex } from 'viem';

export const CONTRACT_ABI = parseAbi([
  'function registerCard(bytes data) returns (bool)',
  'function registerSet(uint16 set_id, bytes data) returns (bool)',
  'function startGame(uint16 set_id, uint64 seed_nonce) returns (uint64)',
  'function submitTurn(bytes action) returns (uint64)',
  'function getGameState() view returns (bytes)',
  'function abandonGame() returns (bool)',
  'function endGame() returns (bool)',
  'function getCard(uint16 card_id) view returns (bytes)',
  'function getSet(uint16 set_id) view returns (bytes)',
]);

function decodeBytesResult(
  functionName: 'getGameState' | 'getCard' | 'getSet',
  data: `0x${string}`
): Uint8Array | null {
  if (data === '0x') return null;

  const decoded = decodeFunctionResult({
    abi: CONTRACT_ABI,
    functionName,
    data,
  });

  if (typeof decoded !== 'string' || decoded === '0x') return null;
  return fromHex(decoded, 'bytes');
}

export function encodeStartGame(setId: number, seedNonce: bigint): `0x${string}` {
  return encodeFunctionData({
    abi: CONTRACT_ABI,
    functionName: 'startGame',
    args: [setId, seedNonce],
  });
}

export function encodeSubmitTurn(actionScale: Uint8Array): `0x${string}` {
  return encodeFunctionData({
    abi: CONTRACT_ABI,
    functionName: 'submitTurn',
    args: [toHex(actionScale)],
  });
}

export function encodeGetGameState(): `0x${string}` {
  return encodeFunctionData({
    abi: CONTRACT_ABI,
    functionName: 'getGameState',
  });
}

export function encodeAbandonGame(): `0x${string}` {
  return encodeFunctionData({
    abi: CONTRACT_ABI,
    functionName: 'abandonGame',
  });
}

export function encodeEndGame(): `0x${string}` {
  return encodeFunctionData({
    abi: CONTRACT_ABI,
    functionName: 'endGame',
  });
}

export function encodeRegisterCard(cardScale: Uint8Array): `0x${string}` {
  return encodeFunctionData({
    abi: CONTRACT_ABI,
    functionName: 'registerCard',
    args: [toHex(cardScale)],
  });
}

export function encodeRegisterSet(setId: number, cardSetScale: Uint8Array): `0x${string}` {
  return encodeFunctionData({
    abi: CONTRACT_ABI,
    functionName: 'registerSet',
    args: [setId, toHex(cardSetScale)],
  });
}

export function decodeGetGameStateResult(data: `0x${string}`): Uint8Array | null {
  return decodeBytesResult('getGameState', data);
}

export function decodeStartGameResult(data: `0x${string}`): bigint {
  if (data === '0x') return 0n;
  return decodeFunctionResult({
    abi: CONTRACT_ABI,
    functionName: 'startGame',
    data,
  }) as bigint;
}

export function decodeSubmitTurnSeed(data: `0x${string}`): bigint {
  if (data === '0x') return 0n;
  return decodeFunctionResult({
    abi: CONTRACT_ABI,
    functionName: 'submitTurn',
    data,
  }) as bigint;
}

export function decodeBoolResult(
  functionName: 'registerCard' | 'registerSet' | 'abandonGame' | 'endGame',
  data: `0x${string}`
): boolean {
  if (data === '0x') return false;
  return decodeFunctionResult({
    abi: CONTRACT_ABI,
    functionName,
    data,
  }) as boolean;
}

export function encodeGetCard(cardId: number): `0x${string}` {
  return encodeFunctionData({
    abi: CONTRACT_ABI,
    functionName: 'getCard',
    args: [cardId],
  });
}

export function encodeGetSet(setId: number): `0x${string}` {
  return encodeFunctionData({
    abi: CONTRACT_ABI,
    functionName: 'getSet',
    args: [setId],
  });
}
