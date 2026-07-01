/**
 * Contract Backend — talks to the OAB arena PolkaVM contract on Asset Hub via
 * the Polkadot Product SDK: `@parity/product-sdk-chain-client` (host-routed
 * chain client), `@parity/product-sdk-contracts` (typed pallet-revive calls),
 * and `@parity/product-sdk-signer` (HostProvider inside a Polkadot host,
 * DevProvider for local dev).
 *
 * Reads use `.query()` (dry-run); state changes use `.tx()`, which resolves at
 * best-block by default — so no hand-rolled `Revive.call` / Solidity ABI
 * encoding is needed (the SDK uses the contract ABI + viem codec internally).
 */

import type { SS58String } from 'polkadot-api';
import { createChainClient } from '@parity/product-sdk-chain-client';
import { paseo_asset_hub } from '@parity/product-sdk-descriptors/paseo-asset-hub';
import {
  ContractManager,
  createContract,
  createContractRuntimeFromClient,
  ensureContractAccountMapped,
  type AbiEntry,
} from '@parity/product-sdk-contracts';
import type { TxResult } from '@parity/product-sdk-tx';
import { SignerManager, HostProvider, DevProvider } from '@parity/product-sdk-signer';
import { isInHost } from '../services/hostEnvironment';
import cdmJson from '../../cdm.json';

/** Host-routed Asset Hub chain client (the resolved type of createChainClient). */
type AssetHubClient = Awaited<
  ReturnType<typeof createChainClient<{ assetHub: typeof paseo_asset_hub }>>
>;

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

/**
 * Structural shape of a `@parity/product-sdk-contracts` `query()` result.
 * (The package surfaces this internally; declared locally to avoid depending on
 * a non-exported type name.)
 */
type QueryResult<T> =
  | { success: true; value: T; gasRequired: unknown }
  | { success: false; value: unknown; gasRequired?: unknown };

/**
 * Minimal typed view of the `@oab/arena` contract. `createContract` returns a
 * generic handle; we cast to this so call sites stay type-checked. The SDK's
 * viem ABI codec maps `bytes` ⇄ `0x`-hex strings, `uint64` → `bigint`, and
 * `bool` → `boolean`.
 */
interface ArenaContract {
  startGame: {
    query(setId: number, seedNonce: bigint): Promise<QueryResult<bigint>>;
    tx(setId: number, seedNonce: bigint): Promise<TxResult>;
  };
  submitTurn: {
    query(action: string): Promise<QueryResult<bigint>>;
    tx(action: string): Promise<TxResult>;
  };
  getGameState: { query(): Promise<QueryResult<string>> };
  getSet: { query(setId: number): Promise<QueryResult<string>> };
  endGame: { query(): Promise<QueryResult<boolean>>; tx(): Promise<TxResult> };
  abandonGame: { query(): Promise<QueryResult<boolean>>; tx(): Promise<TxResult> };
}

const ARENA_LIBRARY = '@oab/arena';

/**
 * The new `cdm` CLI manifest carries a top-level `registry` address and resolves
 * each contract's address + ABI from the on-chain CDM registry at runtime (a
 * redeploy is picked up without shipping a new cdm.json). Legacy `@dotdm/cdm`
 * manifests instead inline `contracts[target]['@oab/arena'].address`+`.abi`.
 */
function hasLiveRegistry(cdm: unknown): boolean {
  return typeof (cdm as { registry?: unknown }).registry === 'string';
}

function arenaContractInfo(): { address: `0x${string}`; abi: AbiEntry[] } {
  // The cdm CLI manifest keys contracts directly by package name.
  const entry = (
    cdmJson.contracts as unknown as Record<string, { address: string; abi: unknown }>
  )[ARENA_LIBRARY];
  return { address: entry.address as `0x${string}`, abi: entry.abi as AbiEntry[] };
}

export function isMissingArenaSessionPayload(data: Uint8Array): boolean {
  // revive's Mapping getter currently materializes a zeroed ArenaSession for
  // missing keys instead of returning an empty byte payload. Treat that sentinel
  // as "no active game" so the frontend doesn't restore an empty shop.
  return data.every((byte) => byte === 0);
}

export function createContractBackend(deps: {
  /** Force the dev signer provider (Alice/Bob) instead of auto-detecting the host. */
  useDevAccounts?: boolean;
}): ContractBackend {
  // Host-first: derive the signer provider from the host environment, with an
  // explicit override for local-dev (`useDevAccounts`).
  const providerType: 'dev' | 'host' = (deps.useDevAccounts ?? !isInHost()) ? 'dev' : 'host';

  let client: AssetHubClient | null = null;
  let contract: ArenaContract | null = null;
  // Set only on the live-registry (new cdm) path; lets selectAccount rebind
  // defaults without another registry round-trip.
  let manager: ContractManager | null = null;
  let signerManager: SignerManager | null = null;
  let _accounts: Account[] = [];
  let _selectedAccount: Account | null = null;
  let _isConnected = false;
  let _activeSetId = 0;

  function arena(): ArenaContract {
    if (!contract) throw new Error('Not connected');
    return contract;
  }

  const backend: ContractBackend = {
    async connect() {
      signerManager = new SignerManager({
        dappName: 'oab',
        persistence: null,
        // Build the host provider from an explicit product account with
        // `requestName: false` so connect() does NOT request the host's
        // "primary username" / identity permission (the default dappName path
        // hardcodes requestName: true). A game needs a signing account, not the
        // user's identity. The product-account signer also routes through
        // host_create_transaction, which the Asset Hub Next runtime requires.
        createProvider: (type: 'host' | 'dev') =>
          type === 'host'
            ? new HostProvider({
                ss58Prefix: 0,
                productAccount: {
                  dotNsIdentifier: 'oab.dot',
                  derivationIndex: 0,
                  requestName: false,
                },
              })
            : new DevProvider(),
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

      // Host-routed Asset Hub client (no direct WebSocket).
      const chainClient = await createChainClient({ chains: { assetHub: paseo_asset_hub } });
      client = chainClient;
      const rawClient = chainClient.raw.assetHub;
      const runtime = createContractRuntimeFromClient(rawClient, paseo_asset_hub);

      // Every SS58 origin must be mapped to its H160 once before pallet-revive
      // calls — including the registry lookup below — or they fail
      // `AccountUnmapped`. Idempotent (no-op if already mapped).
      await ensureContractAccountMapped(runtime, _selectedAccount.address, signer);

      if (hasLiveRegistry(cdmJson)) {
        // New `cdm` CLI manifest: resolve the arena address + ABI from the live
        // on-chain CDM registry.
        manager = await ContractManager.fromLiveClient(cdmJson as never, rawClient, paseo_asset_hub, {
          defaultOrigin: _selectedAccount.address,
          defaultSigner: signer,
          registryOrigin: _selectedAccount.address,
          libraries: [ARENA_LIBRARY],
        } as never);
        contract = manager.getContract(ARENA_LIBRARY) as unknown as ArenaContract;
      } else {
        // Legacy @dotdm/cdm snapshot: inline address + ABI.
        manager = null;
        const { address, abi } = arenaContractInfo();
        contract = createContract(runtime, address, abi, {
          defaultSigner: signer,
          defaultOrigin: _selectedAccount.address,
        }) as unknown as ArenaContract;
      }

      _isConnected = true;
    },

    disconnect() {
      client?.destroy();
      signerManager?.disconnect();
      contract = null;
      manager = null;
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
      if (!signerManager) return;
      const r = signerManager.selectAccount(account.address);
      if (!r.ok) return;
      _selectedAccount = account;
      // Re-bind the contract defaults to the newly selected signer/origin.
      const signer = signerManager.getSigner();
      if (!signer || !client) return;
      if (manager) {
        // Live-registry path: rebind defaults without another registry lookup.
        manager.setDefaults({ defaultOrigin: account.address, defaultSigner: signer } as never);
        contract = manager.getContract(ARENA_LIBRARY) as unknown as ArenaContract;
      } else {
        const { address, abi } = arenaContractInfo();
        const runtime = createContractRuntimeFromClient(client.raw.assetHub, paseo_asset_hub);
        contract = createContract(runtime, address, abi, {
          defaultSigner: signer,
          defaultOrigin: account.address,
        }) as unknown as ArenaContract;
      }
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
      const action = '0x' + bytesToHex(actionScale);
      const dryRun = await arena().submitTurn.query(action);
      if (!dryRun.success || dryRun.value === 0n) {
        throw new Error('Contract rejected submitTurn');
      }
      const tx = await arena().submitTurn.tx(action);
      if (!tx.ok) throw new Error('submitTurn tx failed');

      const eventBytes = findBattleReportedEventData(tx.events);
      if (!eventBytes) {
        console.warn(
          'No BattleReported event in tx; full events array follows for debug:',
          tx.events
        );
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
      const arenaSessionBytes = hexToBytes(r.value);
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
      const cardSetBytes = setRes.success ? hexToBytes(setRes.value) : new Uint8Array();

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

// ── Byte/hex helpers ─────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}

function decodeArenaSessionSetId(data: Uint8Array): number {
  if (data.length < 2) return 0;
  const lo = data[data.length - 2] ?? 0;
  const hi = data[data.length - 1] ?? 0;
  return lo | (hi << 8);
}

// ── BattleReported event decoding ────────────────────────────────────────────
//
// The contract emits a packed (NOT standard Solidity ABI) byte layout to keep
// the on-chain encoder small, so we decode the raw `Revive.ContractEmitted`
// event data ourselves rather than relying on the ABI codec.

/**
 * Walk the tx's events looking for `Revive.ContractEmitted` whose first topic
 * matches our BattleReported signature, and return its raw `data` bytes.
 * Returns null if the event isn't present.
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

  // PAPI's signSubmitAndWatch wrapper: { phase, event: {type, value}, topics }
  // — descend into event.
  if (typeof e.event === 'object' && e.event !== null) {
    const inner = unwrapContractEmitted(e.event);
    if (inner) return inner;
  }

  // Tagged-union: { type: 'Revive', value: { type: 'ContractEmitted', value: {...} } }
  if (e.type === 'Revive' && typeof e.value === 'object' && e.value !== null) {
    const v = e.value as Record<string, unknown>;
    if (v.type === 'ContractEmitted' && typeof v.value === 'object' && v.value !== null) {
      return v.value as unknown as ContractEmittedPayload;
    }
  }

  // Already-flattened: { contract, data, topics } directly.
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
    return hexToBytes(data);
  }
  return new Uint8Array();
}

/**
 * Decode the OAB BattleReported event payload. The contract emits a packed
 * byte layout:
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
