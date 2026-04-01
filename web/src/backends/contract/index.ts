/**
 * Contract Backend — implements GameBackend for the PolkaVM smart contract.
 *
 * Communicates with the OAB arena contract deployed on Polkadot Hub
 * via Ethereum JSON-RPC (viem/ethers). Uses ECDSA signing (MetaMask etc.).
 *
 * TODO: This is a stub. Full implementation requires:
 * - viem dependency for Ethereum JSON-RPC
 * - ABI encoding for contract function calls
 * - MetaMask/injected wallet integration
 * - SCALE encoding of game data wrapped in ABI bytes params
 */

import type { GameBackend } from '../types';

export function createContractBackend(_deps: {
  rpcUrl: string;
  contractAddress: string;
}): GameBackend {
  const backend: GameBackend = {
    name: 'PolkaVM Contract',

    async connect() {
      throw new Error('Contract backend not yet implemented');
    },
    disconnect() {},
    get isConnected() { return false; },

    async getAccounts() { return []; },
    get selectedAccount() { return null; },
    selectAccount() {},

    async startGame(_setId) {
      throw new Error('Contract backend not yet implemented');
    },
    async submitTurn(_actionScale, _enemyBoard) {
      throw new Error('Contract backend not yet implemented');
    },
    async getGameState() {
      throw new Error('Contract backend not yet implemented');
    },
    async endGame() {
      // Contract has no separate endGame — game auto-completes
    },
    async abandonGame() {
      throw new Error('Contract backend not yet implemented');
    },

    async getCards() { return []; },
    async getSets() { return []; },
    async getGhostOpponent() { return null; },
  };

  return backend;
}
