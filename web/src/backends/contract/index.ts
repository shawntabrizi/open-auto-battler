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
  encodeGetSet,
  decodeSubmitTurnResult,
  decodeGetGameStateResult,
} from './abi';

// ── ContractBackend ──────────────────────────────────────────────────────────

export function createContractBackend(deps: {
  rpcUrl?: string;
  contractAddress: `0x${string}`;
  chainId?: number;
}): GameBackend {
  const contractAddress = deps.contractAddress;
  let publicClient: PublicClient | null = null;
  let walletClient: WalletClient | null = null;
  let accounts: Account[] = [];
  let _selectedAccount: Account | null = null;
  let _isConnected = false;
  let _activeSetId: number = 0; // Track which set the current game uses

  const chain: Chain = {
    id: deps.chainId ?? 420420420, // Local dev node default
    name: 'PolkaVM',
    nativeCurrency: { name: 'DEV', symbol: 'DEV', decimals: 18 },
    rpcUrls: {
      default: { http: [deps.rpcUrl ?? 'http://localhost:8545'] },
    },
  };

  async function sendTx(data: `0x${string}`): Promise<`0x${string}`> {
    if (!walletClient || !_selectedAccount) throw new Error('Not connected');
    const hash = await walletClient.sendTransaction({
      account: _selectedAccount.address as `0x${string}`,
      to: contractAddress,
      data,
      chain,
    });
    const receipt = await publicClient!.waitForTransactionReceipt({ hash });
    if (receipt.status === 'reverted') throw new Error('Transaction reverted');
    return hash;
  }

  async function callView(data: `0x${string}`): Promise<`0x${string}`> {
    if (!publicClient) throw new Error('Not connected');
    const result = await publicClient.call({
      to: contractAddress,
      data,
    });
    return (result.data ?? '0x') as `0x${string}`;
  }

  /** Decode ABI-wrapped bytes response into Uint8Array */
  function decodeBytesResponse(data: `0x${string}`): Uint8Array | null {
    return decodeGetGameStateResult(data); // Same ABI layout: offset + length + data
  }

  const backend: GameBackend = {
    name: 'PolkaVM Contract',

    async connect() {
      const transport: Transport = http(chain.rpcUrls.default.http[0]);
      publicClient = createPublicClient({ chain, transport });

      const ethereum = (window as any).ethereum;
      if (ethereum) {
        walletClient = createWalletClient({
          chain,
          transport: custom(ethereum),
        });

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
      } else {
        throw new Error('No Ethereum wallet found. Install MetaMask.');
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
      _activeSetId = setId;
      const seedNonce = BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
      await sendTx(encodeStartGame(setId, seedNonce));
      return { seed: seedNonce };
    },

    async submitTurn(actionScale: Uint8Array, _enemyBoard: Uint8Array): Promise<TurnResult> {
      const data = encodeSubmitTurn(actionScale);

      // Simulate to get return value, then send actual TX
      const returnData = await callView(data);
      const result = decodeSubmitTurnResult(returnData);
      await sendTx(data);

      return {
        battleSeed: result.battleSeed,
        opponentBoard: [], // Ghost selected on-chain
        result: result.result,
        wins: result.wins,
        lives: result.lives,
        round: result.round,
      };
    },

    async getGameState(): Promise<GameStateRaw | null> {
      const returnData = await callView(encodeGetGameState());
      const stateBytes = decodeGetGameStateResult(returnData);
      if (!stateBytes || stateBytes.length === 0) return null;

      // Fetch the card set for the active game
      const setData = await callView(encodeGetSet(_activeSetId));
      const cardSetBytes = decodeBytesResponse(setData) ?? new Uint8Array();

      return { stateBytes, cardSetBytes };
    },

    async endGame(): Promise<void> {
      // Contract games auto-complete
    },

    async abandonGame(): Promise<void> {
      await sendTx(encodeAbandonGame());
    },

    // ── Card data ──────────────────────────────────────────────────────

    async getCards(): Promise<CardData[]> {
      // The WASM engine has baked-in card data from oab-assets.
      // We don't need to fetch individual cards from the contract for the UI.
      // The contract stores them for on-chain battle resolution.
      return [];
    },

    async getSets(): Promise<SetData[]> {
      // Same — the WASM engine has baked-in set data.
      return [];
    },

    async getGhostOpponent(): Promise<{ board: GhostBoardUnit[]; seed: bigint } | null> {
      // Ghost selection happens on-chain in submitTurn
      return null;
    },
  };

  return backend;
}
