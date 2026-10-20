/**
 * Contract Backend — talks to the casual arena (`@oab/arena`, CDM version 4)
 * on Paseo Asset Hub Next via the Polkadot Product SDK:
 * `@parity/product-sdk-chain-client` (host-routed chain client),
 * `@parity/product-sdk-contracts` (typed pallet-revive calls), and
 * `@parity/product-sdk-signer` (HostProvider inside a Polkadot host,
 * DevProvider for local dev).
 *
 * Reads use `.query()` (dry-run); state changes use `.tx()`, which resolves at
 * best-block by default. `.tx()` and `ensureContractAccountMapped` return a
 * `Result`: a failed dispatch, a rejected signature, or a host timeout arrives
 * on the `err` arm. A revert arrives as a typed error (`./errors.ts`).
 *
 * The arena resolves every game call through `@oab/identity`, so a session
 * key plays for its owner (`./session.ts`). Views take the player address,
 * so reads need no mapped origin. The card data for play and replay is the
 * arena's cached `SetBundle` (pinned by the set hash in each game).
 */

import type { SS58String } from 'polkadot-api';
import { createChainClient } from '@parity/product-sdk-chain-client';
import { paseo_asset_hub } from '@parity/product-sdk-descriptors/paseo-asset-hub';
import {
  createContract,
  createContractRuntimeFromClient,
  ensureContractAccountMapped,
  QUERY_FALLBACK_ORIGIN,
  type AbiEntry,
} from '@parity/product-sdk-contracts';
import type { TxResult, TxStatus } from '@parity/product-sdk-tx';
import { SignerManager, HostProvider, DevProvider } from '@parity/product-sdk-signer';
import { ss58ToH160 } from '@parity/product-sdk-address';
import { isInHost } from '../services/hostEnvironment';
import cdmJson from '../../cdm.json';
import {
  createProxySession,
  createSponsor,
  SessionExpiredError,
  type PreparedCall,
  type Sponsor,
  type SponsorDeps,
  type SponsorStatus,
} from './session';
import { createRegistrySession, type IdentityContract } from './registrySession';
import { collectionAddress, COLLECTIBLES_COLLECTION } from '../services/nftOwnership';
import {
  decodeBattleReport,
  decodeBattleReportedEvent,
  decodeModeGame,
  hexToBytes,
  type BattleReportInfo,
  type ModeGameInfo,
} from './codec';
import {
  dryRunError,
  startWithHeadroom,
  withGasHeadroom,
  type QueryResult,
  type TxOutcome,
} from './arenaFlows';
import type { PrepareOptions, Prepared, StartMethod, TxOptions } from './arenaFlows';

export type { SponsorStatus } from './session';
export { chainErrorMessage } from './errors';

/** Host-routed Asset Hub chain client (the resolved type of createChainClient). */
type AssetHubClient = Awaited<
  ReturnType<typeof createChainClient<{ assetHub: typeof paseo_asset_hub }>>
>;

// ── Shared types ─────────────────────────────────────────────────────────────

/** The player's game on chain, with the set bundle it runs on. */
export interface ChainGame {
  info: ModeGameInfo;
  /** SCALE `ModeGame` (`getGame`). */
  gameBytes: Uint8Array;
  /** SCALE `SetBundle` of the game's set (`getSetBundle`). */
  bundleBytes: Uint8Array;
}

/** One committed turn: the chain's battle report and what a replay needs. */
export interface TurnReport {
  report: BattleReportInfo;
  /** SCALE `BattleReport` from the `BattleReported` event. */
  reportBytes: Uint8Array;
  bundleBytes: Uint8Array;
  /** Board size of the game's config (the replay's `board_size`). */
  boardSize: number;
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
  /** Sponsored play (session key) state; `active` means no prompts. */
  readonly sponsorStatus: SponsorStatus;
  /**
   * Logout of sponsored play: revoke the session key (one prompt if it is
   * live) and return its leftover to the player. Later calls on this
   * connection use normal signing.
   */
  endSession(): Promise<void>;
  selectAccount(account: Account): void;
  /** Start a casual game. Returns the run id of the dry-run (advisory). */
  startGame(setId: number): Promise<{ runId: bigint }>;
  submitTurn(actionScale: Uint8Array): Promise<TurnReport>;
  /** The selected account's game, or null when it has none. */
  getGameState(): Promise<ChainGame | null>;
  /** End a completed game. */
  endGame(): Promise<void>;
  abandonGame(): Promise<void>;
  /** Item-scope metadata of an OAB Collectibles item, as UTF-8 (empty if unset). */
  readItemMetadata(item: number, key: string): Promise<string>;
}

type ReadOptions = { origin?: SS58String };
/**
 * Origin for views. They take the player as an argument, so they do not
 * depend on the caller, and the player's own origin fails while unmapped.
 */
const PUBLIC_READ: ReadOptions = { origin: QUERY_FALLBACK_ORIGIN };

type NoArgWrite = {
  query(): Promise<QueryResult<unknown>>;
  tx(opts?: TxOptions): Promise<TxOutcome>;
  prepare(opts?: PrepareOptions): Promise<Prepared>;
};

/**
 * Typed view of `@oab/arena` (casual). The SDK's viem ABI codec maps `bytes`
 * ⇄ `0x`-hex strings, `uint64` → `bigint`, and `bool` → `boolean`.
 */
interface ArenaContract {
  startGame: StartMethod;
  submitTurn: {
    query(action: string): Promise<QueryResult<unknown>>;
    tx(action: string, opts?: TxOptions): Promise<TxOutcome>;
    prepare(action: string, opts?: PrepareOptions): Promise<Prepared>;
  };
  endGame: NoArgWrite;
  abandonGame: NoArgWrite;
  getGame: { query(player: string, opts?: ReadOptions): Promise<QueryResult<string>> };
  getSetBundle: { query(setId: number, opts?: ReadOptions): Promise<QueryResult<string>> };
}

/** Wrap an SDK error with a call label, keeping the original as `cause`. */
function labelled(label: string, error: Error): Error {
  return Object.assign(new Error(`${label} failed: ${error.message}`), { cause: error });
}

/** Unwrap a `.tx()` Result, throwing the labelled SDK error on failure. */
function txOrThrow(label: string, r: TxOutcome): TxResult {
  if (!r.ok) throw labelled(label, r.error);
  return r.value;
}

/**
 * True when the failure (or an error on its cause chain) is a host call that
 * got no answer in time. Checked by name: `HostTimeoutError` ships in
 * `@parity/product-sdk-host` 0.28, and older hosts report a plain decode error.
 */
export function isHostTimeout(err: unknown): boolean {
  let e: unknown = err;
  for (let depth = 0; e instanceof Error && depth < 5; depth++) {
    if (e.name === 'HostTimeoutError') return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

const ARENA_LIBRARY = '@oab/arena';
const IDENTITY_LIBRARY = '@oab/identity';

/**
 * Sponsored-play pattern. `registry`: an `@oab/identity` session key, fee in
 * PGAS on extension pipeline V1, or in PAS on V0 when the player cannot fund
 * PGAS (`./registrySession.ts`, the M5 design).
 * `proxy`: the arena v2 proxy session (`./session.ts`), which buys its deposit
 * through the DOT<->PGAS pool. The proxy path stays until a registry session
 * is proven in a real host (M5 report).
 */
const SESSION_KIND: 'registry' | 'proxy' = 'registry';

/** A session key that signs game calls for the player. */
interface GameSession {
  deps: SponsorDeps;
  submit(call: PreparedCall, options?: { onStatus?: (s: TxStatus) => void }): Promise<TxResult>;
  /** Revoke and drain the key (registry sessions only). */
  end?(): Promise<void>;
}

/** The one Scarcity collection view the app reads (individuality `IScarcityCollection.sol`). */
const ITEM_METADATA_ABI: AbiEntry[] = [
  {
    type: 'function',
    name: 'itemMetadata',
    stateMutability: 'view',
    inputs: [
      { name: 'item', type: 'uint32' },
      { name: 'key', type: 'bytes' },
    ],
    outputs: [{ name: 'value', type: 'bytes' }],
  },
];

// PRODUCT_ID: the host derives (and authorizes) the app's
// product-account signer from this dotNS identifier. It MUST match the app's
// deployed domain name — the app is deployed at `oab-arena.paseo` on Paseo
// Next (served as `oab-arena.paseo.li` in the browser host) — or the host
// rejects signing for a product account it doesn't scope to this origin
// ("Transaction signing was rejected"). Fixed constant, NOT read from the
// host: reading would give `oab-arena.paseo.li` on the gateway and break
// resolution. DERIVATION_INDEX is the product-account index the app signs
// with (and sponsors).
const PRODUCT_ID = 'oab-arena.paseo';
const DERIVATION_INDEX = 0;

/** A package's address and ABI from `cdm.json` (versions are pinned there). */
export function cdmContract(name: string): { address: `0x${string}`; abi: AbiEntry[] } {
  // The cdm CLI manifest keys contracts directly by package name.
  const entry = (cdmJson.contracts as unknown as Record<string, { address: string; abi: unknown }>)[
    name
  ];
  if (!entry) throw new Error(`${name} is missing from cdm.json`);
  return { address: entry.address as `0x${string}`, abi: entry.abi as AbiEntry[] };
}

/** Sponsor deps for environments without host sponsorship (never called). */
const noSponsorDeps = {
  playerPgas: () => Promise.resolve(0n),
  requestAllowance: () => Promise.resolve('NotAvailable' as const),
  sessionReady: () => Promise.resolve(false),
  setUp: () => Promise.reject(new Error('Sponsored play is not available')),
};

export function createContractBackend(deps: {
  /** Force the dev signer provider (Alice/Bob) instead of auto-detecting the host. */
  useDevAccounts?: boolean;
  /** Lifecycle of each submitted transaction, for progress UI. */
  onTxStatus?: (status: TxStatus) => void;
}): ContractBackend {
  const onStatus = deps.onTxStatus;
  // Host-first: derive the signer provider from the host environment, with an
  // explicit override for local-dev (`useDevAccounts`).
  const providerType: 'dev' | 'host' = (deps.useDevAccounts ?? !isInHost()) ? 'dev' : 'host';

  let client: AssetHubClient | null = null;
  let contract: ArenaContract | null = null;
  let signerManager: SignerManager | null = null;
  let _accounts: Account[] = [];
  let _selectedAccount: Account | null = null;
  let _isConnected = false;
  // The last game read from chain, for the replay's set and board size.
  let _activeGame: ModeGameInfo | null = null;
  // SCALE SetBundle per set id. A cached set never changes (its hash is pinned).
  const _bundles = new Map<number, Uint8Array>();
  // Runtime for the currently-selected account, kept so mapping can be done
  // lazily (see ensureMapped). Reset whenever the selected account changes.
  let _runtime: ReturnType<typeof createContractRuntimeFromClient> | null = null;
  let _mapped = false;
  // Sponsored play. Host only: the session key lives in host storage and the
  // PGAS allowance is a host resource. Rebuilt per selected account.
  let _session: GameSession | null = null;
  let _sponsor: Sponsor = createSponsor(noSponsorDeps, 'unavailable');

  function resetSponsor(account: Account): void {
    const signer = signerManager?.getSigner();
    if (providerType !== 'host' || !client || !signer) {
      _session = null;
      _sponsor = createSponsor(noSponsorDeps, 'unavailable');
      return;
    }
    const common = {
      api: client.assetHub,
      player: account.address,
      playerSigner: signer,
      derivationIndex: DERIVATION_INDEX,
      storePrefix: PRODUCT_ID,
    };
    if (SESSION_KIND === 'registry') {
      if (!_runtime) throw new Error('Not connected');
      const { address, abi } = cdmContract(IDENTITY_LIBRARY);
      const identity = createContract(_runtime, address, abi) as unknown as IdentityContract;
      _session = createRegistrySession({ ...common, identity });
    } else {
      _session = createProxySession(common);
    }
    _sponsor = createSponsor(_session.deps);
  }

  // Before a write: set up sponsored play if the player allows it (its setup
  // batch also maps the account), then make sure the origin is mapped.
  async function prepareWrite(): Promise<void> {
    await _sponsor.ensure();
    await ensureMapped();
  }

  // Send one game call: through the session key when sponsored play is live
  // (no prompt), else (or if the session expires) with the product account.
  async function sendGameCall(
    label: string,
    prepare: () => Promise<Prepared>,
    direct: () => Promise<TxOutcome>
  ): Promise<TxResult> {
    return _sponsor.send(
      async () => {
        const session = _session;
        if (!session) throw new SessionExpiredError('No session');
        const call = await prepare();
        if (!call.ok) throw labelled(label, call.error);
        try {
          return await session.submit(call.value, { onStatus });
        } catch (err) {
          if (err instanceof SessionExpiredError || !(err instanceof Error)) throw err;
          throw labelled(label, err);
        }
      },
      async () => txOrThrow(label, await direct())
    );
  }

  function arena(): ArenaContract {
    if (!contract) throw new Error('Not connected');
    return contract;
  }

  function playerH160(): string {
    if (!_selectedAccount) throw new Error('Not connected');
    return ss58ToH160(_selectedAccount.address);
  }

  async function setBundle(setId: number): Promise<Uint8Array> {
    const cached = _bundles.get(setId);
    if (cached) return cached;
    const r = await arena().getSetBundle.query(setId, PUBLIC_READ);
    if (!r.success) throw dryRunError(r.value, () => new Error('getSetBundle read failed'));
    const bytes = hexToBytes(r.value);
    if (bytes.length === 0) throw new Error(`Card set ${setId} is not available on chain`);
    _bundles.set(setId, bytes);
    return bytes;
  }

  // Map the selected SS58 origin to its H160 once. pallet-revive rejects calls
  // from an unmapped origin with `AccountUnmapped`, so this must run before the
  // first contract call that acts as the player. Deferred out of connect() —
  // connect must never submit a transaction — to the first write action, where
  // a signing prompt is expected. Idempotent: a no-op once mapped.
  async function ensureMapped(): Promise<void> {
    if (_mapped) return;
    if (!_runtime || !_selectedAccount || !signerManager) {
      throw new Error('Not connected');
    }
    const signer = signerManager.getSigner();
    if (!signer) throw new Error('No signer for selected account');
    // Read at the best block: the SDK check reads the finalized block, so a
    // mapping the session setup batch just made (at best) looks missing and
    // costs a second prompt.
    const h160 = ss58ToH160(_selectedAccount.address);
    const original = await client?.assetHub.query.Revive.OriginalAccount.getValue(h160, {
      at: 'best',
    });
    if (original !== undefined) {
      _mapped = true;
      return;
    }
    const r = await ensureContractAccountMapped(_runtime, _selectedAccount.address, signer, {
      onStatus: (s) => onStatus?.(s as TxStatus),
    });
    if (!r.ok) throw labelled('Account mapping', r.error);
    _mapped = true;
  }

  /** Dry-run a no-argument write, then send it; a revert throws its typed error. */
  async function sendChecked(label: string, method: NoArgWrite): Promise<TxResult> {
    await prepareWrite();
    const dryRun = await method.query();
    if (!dryRun.success) {
      throw dryRunError(dryRun.value, () => new Error(`Contract rejected ${label}`));
    }
    return sendGameCall(
      label,
      // Session key: headroom (see submitTurn).
      () => method.prepare({ gasLimit: withGasHeadroom(dryRun.gasRequired) }),
      () => method.tx({ onStatus })
    );
  }

  const backend: ContractBackend = {
    async connect() {
      signerManager = new SignerManager({
        dappName: PRODUCT_ID,
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
                  dotNsIdentifier: PRODUCT_ID,
                  derivationIndex: DERIVATION_INDEX,
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
      _runtime = createContractRuntimeFromClient(rawClient, paseo_asset_hub);
      _mapped = false;

      // connect() must be transaction-free: no signing prompt on connect. The
      // contract is bound from the inline address + ABI in cdm.json, which
      // needs no registry lookup. Account mapping is deferred to the first
      // write action via ensureMapped.
      const { address, abi } = cdmContract(ARENA_LIBRARY);
      contract = createContract(_runtime, address, abi, {
        defaultSigner: signer,
        defaultOrigin: _selectedAccount.address,
      }) as unknown as ArenaContract;
      resetSponsor(_selectedAccount);

      _isConnected = true;
    },

    disconnect() {
      client?.destroy();
      signerManager?.disconnect();
      contract = null;
      client = null;
      signerManager = null;
      _session = null;
      _sponsor = createSponsor(noSponsorDeps, 'unavailable');
      _accounts = [];
      _selectedAccount = null;
      _activeGame = null;
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
    get sponsorStatus() {
      return _sponsor.status;
    },
    async endSession() {
      const session = _session;
      if (!session?.end) throw new Error('No session to end');
      await session.end();
      _sponsor = createSponsor(session.deps, 'declined');
    },
    selectAccount(account: Account) {
      if (!signerManager) return;
      const r = signerManager.selectAccount(account.address);
      if (!r.ok) return;
      _selectedAccount = account;
      _activeGame = null;
      // Re-bind the contract defaults to the newly selected signer/origin.
      const signer = signerManager.getSigner();
      if (!signer || !client) return;
      // A different account needs its own mapping before the next write.
      _mapped = false;
      const { address, abi } = cdmContract(ARENA_LIBRARY);
      _runtime = createContractRuntimeFromClient(client.raw.assetHub, paseo_asset_hub);
      contract = createContract(_runtime, address, abi, {
        defaultSigner: signer,
        defaultOrigin: account.address,
      }) as unknown as ArenaContract;
      resetSponsor(account);
    },

    async startGame(setId: number): Promise<{ runId: bigint }> {
      // First write of the session: set up sponsored play (one prompt) and
      // make sure the player origin is mapped, on an explicit action. The
      // contract seeds the game from the block; the client supplies nothing
      // seed-related. The real game state comes from the post-start refresh.
      await prepareWrite();
      const runId = await startWithHeadroom({
        label: 'startGame',
        method: arena().startGame,
        setId,
        send: sendGameCall,
        onStatus,
        rejected: () => new Error(`Contract rejected startGame for set ${setId}`),
      });
      return { runId };
    },

    async submitTurn(actionScale: Uint8Array): Promise<TurnReport> {
      await prepareWrite();
      const game = _activeGame;
      if (!game) throw new Error('No game loaded');
      const action = '0x' + bytesToHex(actionScale);
      // Normal signing: no explicit pre-query, `.tx()` already dry-runs to
      // size gas and fail fast with the typed revert (a turn's dry-run runs the
      // whole battle). Session key: the dry-run runs as the player (M5
      // deviation 2), and a turn sent by the key with exactly that gas ran
      // out of gas live (`Revive.OutOfGas`, 2026-10-20), so it gets the
      // startGame headroom. The result comes from the BattleReported event.
      const tx = await sendGameCall(
        'submitTurn',
        async () => {
          const dryRun = await arena().submitTurn.query(action);
          if (!dryRun.success) {
            throw dryRunError(dryRun.value, () => new Error('Contract rejected submitTurn'));
          }
          return arena().submitTurn.prepare(action, {
            gasLimit: withGasHeadroom(dryRun.gasRequired),
          });
        },
        () => arena().submitTurn.tx(action, { onStatus })
      );
      const reportBytes = findBattleReport(tx.events, playerH160());
      if (!reportBytes) {
        console.warn('No BattleReported event in tx; events follow for debug:', tx.events);
        // The turn IS committed on-chain at this point; fabricating a result
        // here would show the player a battle that never happened. Surface the
        // failure so the caller resyncs from chain state instead.
        throw new Error(
          'Turn submitted, but the battle report could not be read. Resyncing from chain.'
        );
      }
      const report = decodeBattleReport(reportBytes);
      return {
        report,
        reportBytes,
        bundleBytes: await setBundle(report.setId),
        boardSize: game.boardSize,
      };
    },

    async getGameState(): Promise<ChainGame | null> {
      const r = await arena().getGame.query(playerH160(), PUBLIC_READ);
      if (!r.success) throw dryRunError(r.value, () => new Error('getGame read failed'));
      const gameBytes = hexToBytes(r.value);
      const info = decodeModeGame(gameBytes);
      _activeGame = info;
      if (!info) return null;
      return { info, gameBytes, bundleBytes: await setBundle(info.setId) };
    },

    async endGame(): Promise<void> {
      await sendChecked('endGame', arena().endGame);
      _activeGame = null;
    },

    async abandonGame(): Promise<void> {
      await sendChecked('abandonGame', arena().abandonGame);
      _activeGame = null;
    },

    async readItemMetadata(item, key) {
      if (!_runtime) throw new Error('Not connected');
      const collection = createContract(
        _runtime,
        collectionAddress(COLLECTIBLES_COLLECTION),
        ITEM_METADATA_ABI
      ) as unknown as {
        itemMetadata: {
          query(item: number, key: string, opts?: ReadOptions): Promise<QueryResult<string>>;
        };
      };
      const keyHex = '0x' + bytesToHex(new TextEncoder().encode(key));
      const r = await collection.itemMetadata.query(item, keyHex, PUBLIC_READ);
      if (!r.success) throw new Error('itemMetadata read failed');
      return new TextDecoder().decode(hexToBytes(r.value));
    },
  };

  return backend;
}

/** The SCALE report of the first `BattleReported` for `player` (H160) in `events`. */
export function findBattleReport(events: unknown[], player: string): Uint8Array | null {
  for (const evt of events) {
    const inner = unwrapContractEmitted(evt);
    if (!inner) continue;
    const topics = (inner.topics ?? []).map(topicToHex).filter((t): t is string => t !== null);
    const report = decodeBattleReportedEvent(topics, binaryToBytes(inner.data), player);
    if (report) return report;
  }
  return null;
}

// ── Byte/hex helpers ─────────────────────────────────────────────────────────

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}

// ── Contract event plumbing ──────────────────────────────────────────────────

interface ContractEmittedPayload {
  contract: unknown;
  data: unknown;
  topics: unknown[];
}

function unwrapContractEmitted(evt: unknown): ContractEmittedPayload | null {
  if (typeof evt !== 'object' || evt === null) return null;
  const e = evt as Record<string, unknown>;

  // PAPI's tx event record: { phase, event: {type, value}, topics }
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
  if (typeof data === 'string') return hexToBytes(data);
  return new Uint8Array();
}
