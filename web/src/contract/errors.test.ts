import { describe, expect, it } from 'vitest';
import { ArenaRevertError, chainErrorMessage, revertMessage } from './errors';

describe('typed revert messages', () => {
  it('names the game rule an invalid turn broke (SCALE GameError index)', () => {
    // InvalidTurn(bytes) carries the engine's GameError; index 0 is
    // NotEnoughMana. The player must see why the arena refused the turn.
    expect(revertMessage({ errorName: 'InvalidTurn', args: ['0x000102'] })).toMatch(
      /refused the turn: not enough mana/
    );
  });

  it('tells a player with a game on chain to resume or abandon it', () => {
    expect(revertMessage({ errorName: 'GameActive' })).toMatch(/already have a game/);
  });

  it('keeps an unknown error name so nothing is hidden', () => {
    expect(revertMessage({ errorName: 'Mystery' })).toMatch(/Mystery/);
  });

  it('finds the revert on the cause chain of a labelled SDK error', () => {
    // index.ts wraps SDK errors ("submitTurn failed: ..."), with the SDK's
    // ContractRevertedError (which has `decoded`) as the cause.
    const sdk = Object.assign(new Error('Contract reverted'), {
      decoded: { errorName: 'NoGame', args: [] },
    });
    const wrapped = Object.assign(new Error('submitTurn failed'), { cause: sdk });
    expect(chainErrorMessage(wrapped)).toMatch(/no active game/);
    expect(chainErrorMessage(new ArenaRevertError({ errorName: 'Draining' }))).toMatch(
      /no new games/
    );
    expect(chainErrorMessage(new Error('network down'))).toBeNull();
  });
});
