/**
 * Contract Backend — talks to the OAB arena PolkaVM contract on Polkadot Hub
 * via Ethereum JSON-RPC using viem. Signs with MetaMask or dev accounts.
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
import {
  decodeBoolResult,
  decodeStartGameResult,
  decodeSubmitTurnSeed,
  encodeStartGame,
  encodeSubmitTurn,
  encodeGetGameState,
  encodeAbandonGame,
  encodeEndGame,
  encodeGetSet,
  decodeGetGameStateResult,
} from './abi';

// ── Shared types ─────────────────────────────────────────────────────────────

export interface TurnResult {
  battleSeed: bigint;
  opponentBoard: GhostBoardUnit[];
  result: 'Victory' | 'Defeat' | 'Draw';
  wins: number;
  lives: number;
  round: number;
}

export interface GhostBoardUnit {
  card_id: number;
  perm_attack: number;
  perm_health: number;
}

export interface GameStateRaw {
  stateBytes: Uint8Array;
  cardSetBytes: Uint8Array;
  setId?: number;
}

export interface Account {
  name: string;
  address: string;
  signer: any;
  source: 'extension' | 'dev';
}

export interface ContractBackend {
  connect(): Promise<void>;
  disconnect(): void;
  readonly isConnected: boolean;
  getAccounts(): Promise<Account[]>;
  readonly selectedAccount: Account | null;
  selectAccount(account: Account): void;
  startGame(setId: number): Promise<{ seed: bigint }>;
  submitTurn(actionScale: Uint8Array): Promise<TurnResult>;
  getGameState(): Promise<GameStateRaw | null>;
  endGame(): Promise<void>;
  abandonGame(): Promise<void>;
}

export function isMissingArenaSessionPayload(data: Uint8Array): boolean {
  // revive's Mapping getter currently materializes a zeroed ArenaSession for
  // missing keys instead of returning an empty byte payload. Treat that sentinel
  // as "no active game" so the frontend doesn't restore an empty shop.
  return data.every((byte) => byte === 0);
}

export function createContractBackend(deps: {
  rpcUrl?: string;
  contractAddress: `0x${string}`;
  chainId?: number;
  skipWallet?: boolean;
}): ContractBackend {
  const contractAddress = deps.contractAddress;
  let publicClient: PublicClient | null = null;
  let walletClient: WalletClient | null = null;
  let accounts: Account[] = [];
  let _selectedAccount: Account | null = null;
  let _isConnected = false;
  let _activeSetId: number = 0;

  let chain: Chain = {
    id: deps.chainId ?? 420420420,
    name: 'PolkaVM',
    nativeCurrency: { name: 'DEV', symbol: 'DEV', decimals: 18 },
    rpcUrls: {
      default: { http: [deps.rpcUrl ?? 'http://localhost:8545'] },
    },
  };

  let _useWallet = false;

  // BattleReported event topic = keccak256("BattleReported(uint8,uint8,uint8,uint8,uint64,bytes)")
  const BATTLE_REPORTED_TOPIC =
    '0x96fd1736ea4fbef32e328d7005021b05c7ee31f32694ddef23dd55af68e089bd';

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
    if (json.error)
      throw new Error(`RPC error: ${json.error.message ?? JSON.stringify(json.error)}`);
    const txHash = json.result as `0x${string}`;
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

  function decodeBytesResponse(data: `0x${string}`): Uint8Array | null {
    return decodeGetGameStateResult(data);
  }

  function decodeArenaSessionSetId(data: Uint8Array): number {
    if (data.length < 2) return 0;
    const lo = data[data.length - 2] ?? 0;
    const hi = data[data.length - 1] ?? 0;
    return lo | (hi << 8);
  }

  const backend: ContractBackend = {
    async connect() {
      const rpcUrl = chain.rpcUrls.default.http[0];
      const transport: Transport = http(rpcUrl);

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
      } catch {
        // Ignore chain ID detection failures; fall back to configured chain.
      }

      publicClient = createPublicClient({ chain, transport });

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

      if (accounts.length === 0) {
        try {
          const resp = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'eth_accounts',
              params: [],
              id: 1,
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
          throw new Error(
            `Cannot connect: no wallet and dev accounts unavailable (${e instanceof Error ? e.message : String(e)})`
          );
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

    get isConnected() {
      return _isConnected;
    },
    getAccounts() {
      return Promise.resolve(accounts);
    },
    get selectedAccount() {
      return _selectedAccount;
    },
    selectAccount(account: Account) {
      _selectedAccount = account;
    },

    async startGame(setId: number): Promise<{ seed: bigint }> {
      const seedNonce = BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
      const data = encodeStartGame(setId, seedNonce);
      const simulatedSeed = decodeStartGameResult(await callView(data));
      if (simulatedSeed === 0n) {
        throw new Error(`Contract rejected startGame for set ${setId}`);
      }

      _activeSetId = setId;
      await sendTx(data);
      return { seed: simulatedSeed };
    },

    async submitTurn(actionScale: Uint8Array): Promise<TurnResult> {
      const data = encodeSubmitTurn(actionScale);
      const simulatedSeed = decodeSubmitTurnSeed(await callView(data));
      if (simulatedSeed === 0n) {
        throw new Error('Contract rejected submitTurn');
      }

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
            jsonrpc: '2.0',
            method: 'eth_sendTransaction',
            params: [
              { from: _selectedAccount.address, to: contractAddress, data, gas: '0x10000000' },
            ],
            id: Date.now(),
          }),
        });
        const txJson = await txResp.json();
        if (txJson.error) throw new Error(txJson.error.message);
        const txHash = txJson.result;
        receipt = await publicClient!.waitForTransactionReceipt({ hash: txHash });
      }

      if (receipt.status === 'reverted') throw new Error('Transaction reverted');

      const battleLog = receipt.logs?.find(
        (log: any) => log.topics?.[0]?.toLowerCase() === BATTLE_REPORTED_TOPIC
      );

      if (battleLog?.data) {
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

        const ghostBytes = bytes.slice(12);
        const opponentBoard: GhostBoardUnit[] = [];
        if (ghostBytes.length > 0) {
          const count = ghostBytes[0] / 4;
          let offset = 1;
          for (let i = 0; i < count && offset + 6 <= ghostBytes.length; i++) {
            const card_id = ghostBytes[offset] | (ghostBytes[offset + 1] << 8);
            const perm_attack =
              ((ghostBytes[offset + 2] | (ghostBytes[offset + 3] << 8)) << 16) >> 16;
            const perm_health =
              ((ghostBytes[offset + 4] | (ghostBytes[offset + 5] << 8)) << 16) >> 16;
            opponentBoard.push({ card_id, perm_attack, perm_health });
            offset += 6;
          }
        }

        const resultMap: Record<number, 'Victory' | 'Defeat' | 'Draw'> = {
          0: 'Victory',
          1: 'Defeat',
          2: 'Draw',
        };
        return {
          battleSeed,
          opponentBoard,
          result: resultMap[resultByte] ?? 'Draw',
          wins,
          lives,
          round,
        };
      }

      console.warn('No BattleReported event in receipt');
      return { battleSeed: 0n, opponentBoard: [], result: 'Draw', wins: 0, lives: 0, round: 0 };
    },

    async getGameState(): Promise<GameStateRaw | null> {
      const returnData = await callView(encodeGetGameState());
      const arenaSessionBytes = decodeGetGameStateResult(returnData);
      if (!arenaSessionBytes || arenaSessionBytes.length === 0) return null;
      if (isMissingArenaSessionPayload(arenaSessionBytes)) return null;

      _activeSetId = decodeArenaSessionSetId(arenaSessionBytes);

      // The WASM engine expects BoundedGameSession = { state, set_id, config }.
      // The contract returns ArenaSession = { state_fields..., set_id }, so we
      // append the default config bytes to make it a full BoundedGameSession.
      const DEFAULT_CONFIG_SCALE = new Uint8Array([3, 10, 3, 10, 0, 5, 5, 50]);
      const stateBytes = new Uint8Array(arenaSessionBytes.length + DEFAULT_CONFIG_SCALE.length);
      stateBytes.set(arenaSessionBytes);
      stateBytes.set(DEFAULT_CONFIG_SCALE, arenaSessionBytes.length);

      const setData = await callView(encodeGetSet(_activeSetId));
      const cardSetBytes = decodeBytesResponse(setData) ?? new Uint8Array();

      return { stateBytes, cardSetBytes, setId: _activeSetId };
    },

    async endGame(): Promise<void> {
      const data = encodeEndGame();
      const allowed = decodeBoolResult('endGame', await callView(data));
      if (!allowed) throw new Error('Contract rejected endGame');
      await sendTx(data);
    },

    async abandonGame(): Promise<void> {
      const data = encodeAbandonGame();
      const allowed = decodeBoolResult('abandonGame', await callView(data));
      if (!allowed) throw new Error('Contract rejected abandonGame');
      await sendTx(data);
    },
  };

  return backend;
}
