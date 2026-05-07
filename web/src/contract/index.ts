/**
 * Contract Backend — talks to the OAB arena PolkaVM contract on Polkadot Asset Hub
 * via PAPI + @dotdm/cdm. Signs with @parity/product-sdk-signer (DevProvider for
 * local zombienet, HostProvider when running inside a Polkadot Triangle host).
 */

import { Binary, createClient, type SS58String } from 'polkadot-api';
import { getWsProvider } from 'polkadot-api/ws-provider/web';
import { withPolkadotSdkCompat } from 'polkadot-api/polkadot-sdk-compat';
import type { PolkadotClient } from 'polkadot-api';
import { createCdm, type Cdm } from '@dotdm/cdm';
import { SignerManager } from '@parity/product-sdk-signer';
import cdmJson from '../../cdm.json';
// Augments @dotdm/cdm's CdmContracts with @oab/arena method types:
import '../../.cdm/cdm.d.ts';

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
  address: SS58String;
  source: 'dev' | 'host';
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

// keccak256("BattleReported(uint8,uint8,uint8,uint8,uint64,bytes)")
const BATTLE_REPORTED_TOPIC = '0x96fd1736ea4fbef32e328d7005021b05c7ee31f32694ddef23dd55af68e089bd';

export function isMissingArenaSessionPayload(data: Uint8Array): boolean {
  // revive's Mapping getter currently materializes a zeroed ArenaSession for
  // missing keys instead of returning an empty byte payload. Treat that sentinel
  // as "no active game" so the frontend doesn't restore an empty shop.
  return data.every((byte) => byte === 0);
}

export function createContractBackend(deps: {
  wsUrl?: string;
  useDevAccounts?: boolean;
}): ContractBackend {
  const wsUrl = deps.wsUrl ?? 'ws://127.0.0.1:10020';
  const providerType: 'dev' | 'host' = deps.useDevAccounts ? 'dev' : 'host';

  let client: PolkadotClient | null = null;
  let cdm: Cdm | null = null;
  let signerManager: SignerManager | null = null;
  let _accounts: Account[] = [];
  let _selectedAccount: Account | null = null;
  let _isConnected = false;
  let _activeSetId = 0;

  function arena() {
    if (!cdm) throw new Error('Not connected');
    return cdm.getContract('@oab/arena');
  }

  const backend: ContractBackend = {
    async connect() {
      signerManager = new SignerManager({
        ss58Prefix: 0,
        dappName: 'oab',
        persistence: null,
      });
      const result = await signerManager.connect(providerType);
      if (!result.ok) {
        throw new Error(`Signer connect failed: ${result.error.message}`);
      }
      _accounts = result.value.map((acc) => ({
        name: acc.name ?? '(unnamed)',
        address: acc.address,
        source: providerType,
      }));
      if (_accounts.length === 0) throw new Error('No accounts available');
      _selectedAccount = _accounts[0];
      const selected = signerManager.selectAccount(_selectedAccount.address);
      if (!selected.ok) throw new Error(`Could not select account: ${selected.error.message}`);

      const signer = signerManager.getSigner();
      if (!signer) throw new Error('No signer for selected account');

      client = createClient(withPolkadotSdkCompat(getWsProvider(wsUrl)));
      cdm = createCdm(cdmJson, {
        client,
        defaultSigner: signer,
        defaultOrigin: _selectedAccount.address,
      });
      _isConnected = true;
    },

    disconnect() {
      cdm?.destroy();
      client?.destroy();
      signerManager?.disconnect();
      cdm = null;
      client = null;
      signerManager = null;
      _accounts = [];
      _selectedAccount = null;
      _isConnected = false;
    },

    get isConnected() {
      return _isConnected;
    },
    getAccounts() {
      return Promise.resolve(_accounts);
    },
    get selectedAccount() {
      return _selectedAccount;
    },
    selectAccount(account: Account) {
      if (!signerManager || !cdm) return;
      const r = signerManager.selectAccount(account.address);
      if (!r.ok) return;
      _selectedAccount = account;
      const signer = signerManager.getSigner();
      if (signer) cdm.setDefaults({ signer, origin: account.address });
    },

    async startGame(setId: number): Promise<{ seed: bigint }> {
      const seedNonce = BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
      const dryRun = await arena().startGame.query(setId, seedNonce);
      if (!dryRun.success || dryRun.value === 0n) {
        throw new Error(`Contract rejected startGame for set ${setId}`);
      }
      _activeSetId = setId;
      const tx = await arena().startGame.tx(setId, seedNonce);
      if (!tx.ok) throw new Error('startGame tx failed');
      return { seed: dryRun.value };
    },

    async submitTurn(actionScale: Uint8Array): Promise<TurnResult> {
      const action = Binary.fromBytes(actionScale);
      const dryRun = await arena().submitTurn.query(action);
      if (!dryRun.success || dryRun.value === 0n) {
        throw new Error('Contract rejected submitTurn');
      }
      const tx = await arena().submitTurn.tx(action);
      if (!tx.ok) throw new Error('submitTurn tx failed');

      const eventBytes = findBattleReportedEventData(tx.events);
      if (!eventBytes) {
        console.warn('No BattleReported event in tx');
        return {
          battleSeed: 0n,
          opponentBoard: [],
          result: 'Draw',
          wins: 0,
          lives: 0,
          round: 0,
        };
      }
      return decodeBattleReported(eventBytes);
    },

    async getGameState(): Promise<GameStateRaw | null> {
      const r = await arena().getGameState.query();
      if (!r.success) return null;
      const arenaSessionBytes = r.value.asBytes();
      if (arenaSessionBytes.length === 0) return null;
      if (isMissingArenaSessionPayload(arenaSessionBytes)) return null;

      _activeSetId = decodeArenaSessionSetId(arenaSessionBytes);

      // The WASM engine expects BoundedGameSession = { state, set_id, config }.
      // The contract returns ArenaSession = { state_fields..., set_id }, so we
      // append the default config bytes to make it a full BoundedGameSession.
      const DEFAULT_CONFIG_SCALE = new Uint8Array([3, 10, 3, 10, 0, 5, 5, 50]);
      const stateBytes = new Uint8Array(arenaSessionBytes.length + DEFAULT_CONFIG_SCALE.length);
      stateBytes.set(arenaSessionBytes);
      stateBytes.set(DEFAULT_CONFIG_SCALE, arenaSessionBytes.length);

      const setRes = await arena().getSet.query(_activeSetId);
      const cardSetBytes = setRes.success ? setRes.value.asBytes() : new Uint8Array();

      return { stateBytes, cardSetBytes, setId: _activeSetId };
    },

    async endGame(): Promise<void> {
      const dryRun = await arena().endGame.query();
      if (!dryRun.success || !dryRun.value) throw new Error('Contract rejected endGame');
      const tx = await arena().endGame.tx();
      if (!tx.ok) throw new Error('endGame tx failed');
    },

    async abandonGame(): Promise<void> {
      const dryRun = await arena().abandonGame.query();
      if (!dryRun.success || !dryRun.value) throw new Error('Contract rejected abandonGame');
      const tx = await arena().abandonGame.tx();
      if (!tx.ok) throw new Error('abandonGame tx failed');
    },
  };

  return backend;
}

function decodeArenaSessionSetId(data: Uint8Array): number {
  if (data.length < 2) return 0;
  const lo = data[data.length - 2] ?? 0;
  const hi = data[data.length - 1] ?? 0;
  return lo | (hi << 8);
}

/**
 * Walk PAPI's tagged-union events looking for Revive.ContractEmitted whose
 * first topic matches our BattleReported signature, and return its raw `data`
 * bytes. Returns null if the event isn't present.
 *
 * The shape we expect (PAPI v1.x):
 *   { type: "Revive", value: { type: "ContractEmitted",
 *     value: { contract, data: Binary, topics: Binary[] } } }
 * but we walk defensively in case sdk-ink wraps or flattens it differently.
 */
function findBattleReportedEventData(events: unknown[]): Uint8Array | null {
  const target = BATTLE_REPORTED_TOPIC.toLowerCase();
  for (const evt of events) {
    const inner = unwrapContractEmitted(evt);
    if (!inner) continue;
    const topics = inner.topics ?? [];
    const topic0 = topicToHex(topics[0]);
    if (topic0?.toLowerCase() === target) {
      return binaryToBytes(inner.data);
    }
  }
  return null;
}

interface ContractEmittedPayload {
  contract: unknown;
  data: unknown;
  topics: unknown[];
}

function unwrapContractEmitted(evt: unknown): ContractEmittedPayload | null {
  if (typeof evt !== 'object' || evt === null) return null;
  const e = evt as Record<string, unknown>;
  // PAPI tagged-union: { type: 'Revive', value: { type: 'ContractEmitted', value: {...} } }
  if (e.type === 'Revive' && typeof e.value === 'object' && e.value !== null) {
    const v = e.value as Record<string, unknown>;
    if (v.type === 'ContractEmitted' && typeof v.value === 'object' && v.value !== null) {
      return v.value as unknown as ContractEmittedPayload;
    }
  }
  // Already-flattened: { contract, data, topics } directly on the event
  if ('topics' in e && 'data' in e) return e as unknown as ContractEmittedPayload;
  return null;
}

function topicToHex(topic: unknown): string | null {
  if (typeof topic === 'string') return topic;
  if (topic instanceof Uint8Array) return '0x' + bytesToHex(topic);
  if (topic && typeof (topic as { asHex?: () => string }).asHex === 'function') {
    return (topic as { asHex: () => string }).asHex();
  }
  if (topic && typeof (topic as { asBytes?: () => Uint8Array }).asBytes === 'function') {
    return '0x' + bytesToHex((topic as { asBytes: () => Uint8Array }).asBytes());
  }
  return null;
}

function binaryToBytes(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (data && typeof (data as { asBytes?: () => Uint8Array }).asBytes === 'function') {
    return (data as { asBytes: () => Uint8Array }).asBytes();
  }
  if (typeof data === 'string') {
    const hex = data.startsWith('0x') ? data.slice(2) : data;
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return out;
  }
  return new Uint8Array();
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}

/**
 * Decode the OAB BattleReported event payload. The contract emits a packed
 * (NOT standard Solidity ABI) byte layout to keep the on-chain encoder small:
 *   byte 0:    result (0=Victory, 1=Defeat, 2=Draw)
 *   byte 1:    wins
 *   byte 2:    lives
 *   byte 3:    round
 *   bytes 4-11: battleSeed (uint64, big-endian)
 *   bytes 12+:  SCALE-encoded Vec<GhostBoardUnit> (1-byte compact prefix, then
 *               6 bytes per unit: u16 card_id LE, i16 attack LE, i16 health LE)
 */
function decodeBattleReported(bytes: Uint8Array): TurnResult {
  if (bytes.length < 12) {
    return { battleSeed: 0n, opponentBoard: [], result: 'Draw', wins: 0, lives: 0, round: 0 };
  }
  const resultByte = bytes[0];
  const wins = bytes[1];
  const lives = bytes[2];
  const round = bytes[3];

  let battleSeed = 0n;
  for (let i = 4; i < 12; i++) {
    battleSeed = (battleSeed << 8n) | BigInt(bytes[i] ?? 0);
  }

  const ghostBytes = bytes.slice(12);
  const opponentBoard: GhostBoardUnit[] = [];
  if (ghostBytes.length > 0) {
    const count = (ghostBytes[0] ?? 0) / 4;
    let offset = 1;
    for (let i = 0; i < count && offset + 6 <= ghostBytes.length; i++) {
      const card_id = (ghostBytes[offset] ?? 0) | ((ghostBytes[offset + 1] ?? 0) << 8);
      const perm_attack =
        (((ghostBytes[offset + 2] ?? 0) | ((ghostBytes[offset + 3] ?? 0) << 8)) << 16) >> 16;
      const perm_health =
        (((ghostBytes[offset + 4] ?? 0) | ((ghostBytes[offset + 5] ?? 0) << 8)) << 16) >> 16;
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
    result: resultMap[resultByte ?? 0] ?? 'Draw',
    wins: wins ?? 0,
    lives: lives ?? 0,
    round: round ?? 0,
  };
}
