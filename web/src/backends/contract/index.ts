/**
 * Contract Backend — implements GameBackend for the PolkaVM smart contract.
 *
 * Communicates with the OAB arena contract on Polkadot Hub via Ethereum
 * JSON-RPC using viem. Signs transactions with MetaMask or injected wallets.
 */

import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  type PublicClient,
  type WalletClient,
  type Transport,
  type Chain,
} from 'viem';
import type { GameBackend, TurnResult, GameStateRaw, CardData, SetData, GhostBoardUnit, Account } from '../types';
import {
  encodeStartGame,
  encodeSubmitTurn,
  encodeGetGameState,
  encodeAbandonGame,
  decodeSubmitTurnResult,
  decodeGetGameStateResult,
} from './abi';

// ── Chain definition for Polkadot Hub TestNet ────────────────────────────────

const polkadotHubTestnet: Chain = {
  id: 420420417,
  name: 'Polkadot Hub TestNet',
  nativeCurrency: { name: 'PAS', symbol: 'PAS', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://eth-rpc-testnet.polkadot.io/'] },
  },
  blockExplorers: {
    default: { name: 'Blockscout', url: 'https://blockscout-testnet.polkadot.io/' },
  },
};

// ── ContractBackend ──────────────────────────────────────────────────────────

export function createContractBackend(deps: {
  rpcUrl?: string;
  contractAddress: `0x${string}`;
}): GameBackend {
  const contractAddress = deps.contractAddress;
  let publicClient: PublicClient | null = null;
  let walletClient: WalletClient | null = null;
  let accounts: Account[] = [];
  let _selectedAccount: Account | null = null;
  let _isConnected = false;
  let chain: Chain = {
    ...polkadotHubTestnet,
    rpcUrls: deps.rpcUrl
      ? { default: { http: [deps.rpcUrl] } }
      : polkadotHubTestnet.rpcUrls,
  };

  /** Send a transaction to the contract and wait for receipt. */
  async function sendTx(data: `0x${string}`): Promise<`0x${string}`> {
    if (!walletClient || !_selectedAccount) throw new Error('Not connected');
    const hash = await walletClient.sendTransaction({
      account: _selectedAccount.address as `0x${string}`,
      to: contractAddress,
      data,
      chain,
    });
    // Wait for receipt
    const receipt = await publicClient!.waitForTransactionReceipt({ hash });
    if (receipt.status === 'reverted') throw new Error('Transaction reverted');
    return hash;
  }

  /** Call a view function on the contract (no gas, no signing). */
  async function callView(data: `0x${string}`): Promise<`0x${string}`> {
    if (!publicClient) throw new Error('Not connected');
    const result = await publicClient.call({
      to: contractAddress,
      data,
    });
    return (result.data ?? '0x') as `0x${string}`;
  }

  const backend: GameBackend = {
    name: 'PolkaVM Contract',

    async connect() {
      // Set up public client for reads
      const transport: Transport = deps.rpcUrl
        ? http(deps.rpcUrl)
        : http(polkadotHubTestnet.rpcUrls.default.http[0]);

      publicClient = createPublicClient({ chain, transport });

      // Check for injected Ethereum provider (MetaMask etc.)
      const ethereum = (window as any).ethereum;
      if (ethereum) {
        walletClient = createWalletClient({
          chain,
          transport: custom(ethereum),
        });

        // Request account access
        const addresses = await walletClient.requestAddresses();
        accounts = addresses.map((addr: `0x${string}`, i: number) => ({
          name: `Account ${i + 1}`,
          address: addr,
          signer: ethereum,
          source: 'extension',
        }));

        if (accounts.length > 0) {
          _selectedAccount = accounts[0];
        }
      }

      _isConnected = true;
    },

    disconnect() {
      publicClient = null;
      walletClient = null;
      accounts = [];
      _selectedAccount = null;
      _isConnected = false;
    },

    get isConnected() { return _isConnected; },

    async getAccounts() { return accounts; },
    get selectedAccount() { return _selectedAccount; },
    selectAccount(account: Account) { _selectedAccount = account; },

    // ── Arena game ─────────────────────────────────────────────────────

    async startGame(setId: number): Promise<{ seed: bigint }> {
      // Generate a random seed nonce
      const seedNonce = BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
      const data = encodeStartGame(setId, seedNonce);
      await sendTx(data);

      // Read back the game state to get the seed
      // (The contract returns the seed but we can't easily read tx return values)
      // For now, use the nonce as an approximation; the real seed comes from getGameState
      return { seed: seedNonce };
    },

    async submitTurn(actionScale: Uint8Array, _enemyBoard: Uint8Array): Promise<TurnResult> {
      // Contract selects the ghost opponent internally — we only send the action.
      const data = encodeSubmitTurn(actionScale);

      // Simulate first to get the return value (result, wins, lives, round, battleSeed)
      const returnData = await callView(data);
      const result = decodeSubmitTurnResult(returnData);

      // Send the actual transaction
      await sendTx(data);

      // The contract picked the opponent — we don't know the board here.
      // The caller will need to get it from getGameState or skip local replay.
      return {
        battleSeed: result.battleSeed,
        opponentBoard: [], // Ghost selected on-chain, not available to frontend
        result: result.result,
        wins: result.wins,
        lives: result.lives,
        round: result.round,
      };
    },

    async getGameState(): Promise<GameStateRaw | null> {
      const data = encodeGetGameState();
      const returnData = await callView(data);
      const scaleBytes = decodeGetGameStateResult(returnData);
      if (!scaleBytes || scaleBytes.length === 0) return null;

      // The contract returns the ArenaSession SCALE bytes.
      // We also need the card set bytes — load from the session's set_id.
      // For now, return the session bytes; card set handling TBD.
      return {
        stateBytes: scaleBytes,
        cardSetBytes: new Uint8Array(), // TODO: fetch card set from contract
      };
    },

    async endGame(): Promise<void> {
      // Contract games auto-complete — no separate endGame needed.
    },

    async abandonGame(): Promise<void> {
      await sendTx(encodeAbandonGame());
    },

    // ── Card data ──────────────────────────────────────────────────────

    async getCards(): Promise<CardData[]> {
      // Cards are stored in the contract by the admin.
      // For now, use the baked-in card data from oab-assets (loaded by WASM engine).
      // A full implementation would read cards from contract storage.
      return [];
    },

    async getSets(): Promise<SetData[]> {
      // Sets are stored in the contract by the admin.
      // Same as above — use baked-in data for now.
      return [];
    },

    async getGhostOpponent(): Promise<{ board: GhostBoardUnit[]; seed: bigint } | null> {
      // Contract doesn't have on-chain ghost pool yet.
      // The frontend provides the opponent board directly.
      return null;
    },
  };

  return backend;
}
