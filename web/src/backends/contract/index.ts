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
  encodeEndGame,
  encodeGetSet,
  decodeGetGameStateResult,
} from './abi';

// ── ContractBackend ──────────────────────────────────────────────────────────

export function createContractBackend(deps: {
  rpcUrl?: string;
  contractAddress: `0x${string}`;
  chainId?: number;
  skipWallet?: boolean;
}): GameBackend {
  const contractAddress = deps.contractAddress;
  let publicClient: PublicClient | null = null;
  let walletClient: WalletClient | null = null;
  let accounts: Account[] = [];
  let _selectedAccount: Account | null = null;
  let _isConnected = false;
  let _activeSetId: number = 0; // Track which set the current game uses

  let chain: Chain = {
    id: deps.chainId ?? 420420420, // Local dev node default
    name: 'PolkaVM',
    nativeCurrency: { name: 'DEV', symbol: 'DEV', decimals: 18 },
    rpcUrls: {
      default: { http: [deps.rpcUrl ?? 'http://localhost:8545'] },
    },
  };

  let _useWallet = false;

  // BattleReported event topic = keccak256("BattleReported(uint8,uint8,uint8,uint8,uint64,bytes)")
  const BATTLE_REPORTED_TOPIC = '0x96fd1736ea4fbef32e328d7005021b05c7ee31f32694ddef23dd55af68e089bd';

  /** Send a raw JSON-RPC eth_sendTransaction (for dev accounts, no wallet needed). */
  async function sendRawTx(from: string, data: `0x${string}`): Promise<`0x${string}`> {
    if (!publicClient) throw new Error('Not connected');
    const rpcUrl = chain.rpcUrls.default.http[0];
    const body = {
      jsonrpc: '2.0',
      method: 'eth_sendTransaction',
      params: [{ from, to: contractAddress, data, gas: '0x10000000' }],
      id: Date.now(),
    };
    const resp = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await resp.json();
    if (json.error) throw new Error(`RPC error: ${json.error.message ?? JSON.stringify(json.error)}`);
    const txHash = json.result as `0x${string}`;
    // Wait for receipt
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status === 'reverted') throw new Error('Transaction reverted');
    return txHash;
  }

  async function sendTx(data: `0x${string}`): Promise<`0x${string}`> {
    if (!_selectedAccount) throw new Error('No account selected');

    if (_useWallet && walletClient) {
      const hash = await walletClient.sendTransaction({
        account: _selectedAccount.address as `0x${string}`,
        to: contractAddress,
        data,
        chain,
      });
      const receipt = await publicClient!.waitForTransactionReceipt({ hash });
      if (receipt.status === 'reverted') throw new Error('Transaction reverted');
      return hash;
    } else {
      return sendRawTx(_selectedAccount.address, data);
    }
  }

  async function callView(data: `0x${string}`): Promise<`0x${string}`> {
    if (!publicClient) throw new Error('Not connected');
    const result = await publicClient.call({
      to: contractAddress,
      data,
      account: _selectedAccount?.address as `0x${string}` | undefined,
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
      const rpcUrl = chain.rpcUrls.default.http[0];
      const transport: Transport = http(rpcUrl);

      // Auto-detect chain ID from the node
      try {
        const resp = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_chainId', params: [], id: 1 }),
        });
        const json = await resp.json();
        const detectedChainId = parseInt(json.result, 16);
        if (detectedChainId) {
          chain = { ...chain, id: detectedChainId };
        }
      } catch {}

      publicClient = createPublicClient({ chain, transport });

      // Try MetaMask first (unless skipWallet is set)
      const ethereum = !deps.skipWallet ? (window as any).ethereum : null;
      if (ethereum) {
        try {
          walletClient = createWalletClient({
            chain,
            transport: custom(ethereum),
          });
          const addresses = await walletClient.requestAddresses();
          if (addresses.length > 0) {
            accounts = addresses.map((addr: `0x${string}`, i: number) => ({
              name: `MetaMask ${i + 1}`,
              address: addr,
              signer: ethereum,
              source: 'extension',
            }));
            _useWallet = true;
          }
        } catch (e) {
          console.warn('MetaMask connection failed, trying dev accounts:', e);
          walletClient = null;
        }
      }

      // Fall back to dev accounts from the node (eth_accounts)
      if (accounts.length === 0) {
        try {
          const resp = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0', method: 'eth_accounts', params: [], id: 1,
            }),
          });
          const json = await resp.json();
          const devAddresses: string[] = json.result ?? [];
          accounts = devAddresses.map((addr, i) => ({
            name: `Dev Account ${i + 1}`,
            address: addr,
            signer: null,
            source: 'dev',
          }));
          _useWallet = false;
        } catch (e) {
          throw new Error(`Cannot connect: no wallet and dev accounts unavailable (${e})`);
        }
      }

      if (accounts.length === 0) {
        throw new Error('No accounts available');
      }

      _selectedAccount = accounts[0];
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

      // Send transaction and get receipt with logs
      if (!_selectedAccount) throw new Error('No account selected');

      let receipt: any;
      if (_useWallet && walletClient) {
        const hash = await walletClient.sendTransaction({
          account: _selectedAccount.address as `0x${string}`,
          to: contractAddress,
          data,
          chain,
        });
        receipt = await publicClient!.waitForTransactionReceipt({ hash });
      } else {
        const rpcUrl = chain.rpcUrls.default.http[0];
        const txResp = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0', method: 'eth_sendTransaction',
            params: [{ from: _selectedAccount.address, to: contractAddress, data, gas: '0x10000000' }],
            id: Date.now(),
          }),
        });
        const txJson = await txResp.json();
        if (txJson.error) throw new Error(txJson.error.message);
        const txHash = txJson.result;
        receipt = await publicClient!.waitForTransactionReceipt({ hash: txHash });
      }

      if (receipt.status === 'reverted') throw new Error('Transaction reverted');

      // Parse BattleReported event from logs
      const battleLog = receipt.logs?.find(
        (log: any) => log.topics?.[0]?.toLowerCase() === BATTLE_REPORTED_TOPIC
      );

      if (battleLog?.data) {
        // Event data: result(1) + wins(1) + lives(1) + round(1) + battleSeed(8) + ghost(SCALE)
        const hex = (battleLog.data as string).startsWith('0x')
          ? (battleLog.data as string).slice(2)
          : (battleLog.data as string);
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < bytes.length; i++) {
          bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
        }

        const resultByte = bytes[0];
        const wins = bytes[1];
        const lives = bytes[2];
        const round = bytes[3];
        const battleSeed = BigInt('0x' + hex.slice(8, 24));

        // Decode SCALE-encoded Vec<GhostBoardUnit> from bytes[12..]
        // Each GhostBoardUnit = CardId(u16) + perm_attack(i16) + perm_health(i16) = 6 bytes
        // SCALE Vec prefix: compact length
        const ghostBytes = bytes.slice(12);
        const opponentBoard: GhostBoardUnit[] = [];
        if (ghostBytes.length > 0) {
          const count = ghostBytes[0] / 4; // SCALE compact encoding for small numbers
          let offset = 1; // skip compact length byte
          for (let i = 0; i < count && offset + 6 <= ghostBytes.length; i++) {
            const card_id = ghostBytes[offset] | (ghostBytes[offset + 1] << 8);
            const perm_attack = (ghostBytes[offset + 2] | (ghostBytes[offset + 3] << 8)) << 16 >> 16; // sign-extend i16
            const perm_health = (ghostBytes[offset + 4] | (ghostBytes[offset + 5] << 8)) << 16 >> 16;
            opponentBoard.push({ card_id, perm_attack, perm_health });
            offset += 6;
          }
        }

        const resultMap: Record<number, 'Victory' | 'Defeat' | 'Draw'> = { 0: 'Victory', 1: 'Defeat', 2: 'Draw' };
        return {
          battleSeed,
          opponentBoard,
          result: resultMap[resultByte] ?? 'Draw',
          wins, lives, round,
        };
      }

      // Fallback: no event found
      console.warn('No BattleReported event in receipt');
      return { battleSeed: 0n, opponentBoard: [], result: 'Draw', wins: 0, lives: 0, round: 0 };
    },

    async getGameState(): Promise<GameStateRaw | null> {
      const returnData = await callView(encodeGetGameState());
      const arenaSessionBytes = decodeGetGameStateResult(returnData);
      if (!arenaSessionBytes || arenaSessionBytes.length === 0) return null;

      // The WASM engine expects BoundedGameSession = { state, set_id, config }
      // The contract returns ArenaSession = { state_fields..., set_id }
      // which is already state + set_id in SCALE. We just append the config bytes.
      // default_config() SCALE = [3, 10, 3, 10, 0, 5, 5, 50]
      const DEFAULT_CONFIG_SCALE = new Uint8Array([3, 10, 3, 10, 0, 5, 5, 50]);
      const stateBytes = new Uint8Array(arenaSessionBytes.length + DEFAULT_CONFIG_SCALE.length);
      stateBytes.set(arenaSessionBytes);
      stateBytes.set(DEFAULT_CONFIG_SCALE, arenaSessionBytes.length);

      // Fetch the card set for the active game
      const setData = await callView(encodeGetSet(_activeSetId));
      const cardSetBytes = decodeBytesResponse(setData) ?? new Uint8Array();

      return { stateBytes, cardSetBytes };
    },

    async endGame(): Promise<void> {
      await sendTx(encodeEndGame());
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
