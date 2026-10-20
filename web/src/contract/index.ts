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
 * `.tx()` and `ensureContractAccountMapped` return a `Result`: a failed
 * dispatch, a rejected signature, or a host timeout arrives on the `err` arm.
 *
 * Inside a host, game calls go through sponsored play when the player allows
 * it (`./session.ts`): one approval, then a local session key signs every call
 * and fees are paid in PGAS. Otherwise they are signed by the product account.
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
  type ProxySession,
  type Sponsor,
  type SponsorStatus,
} from './session';
import { collectionAddress, COLLECTIBLES_COLLECTION } from '../services/nftOwnership';
import {
  decodeBadgeEvent,
  decodeBadges,
  decodeBestRun,
  decodeLeaderboard,
  isZeroAlias,
  type BadgeEvent,
  type BadgeRecord,
  type Hex,
  type LeaderboardEntry,
} from './codec';
import {
  bindPersonhood,
  classifyBinding,
  DERIVATION_INDEX,
  PRODUCT_ID,
  readAliasBinding,
  type RankedEligibility,
} from './personhood';
import {
  claimBadges,
  RANKED_REFUSED_MESSAGE,
  RankedIneligibleError,
  startRanked,
  startWithHeadroom,
  type ClaimMethod,
  type PrepareOptions,
  type Prepared,
  type QueryResult,
  type StartMethod,
  type TxOptions,
  type TxOutcome,
} from './arenaFlows';

export type { SponsorStatus } from './session';
export type { BadgeEvent, BadgeRecord, LeaderboardEntry } from './codec';
export type { RankedEligibility } from './personhood';
export { RankedIneligibleError } from './arenaFlows';

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
  /** Sponsored play (PGAS + session key) state; `active` means no prompts. */
  readonly sponsorStatus: SponsorStatus;
  selectAccount(account: Account): void;
  startGame(setId: number): Promise<{ seed: bigint }>;
  /**
   * Start a ranked game. Throws `RankedIneligibleError` (no signing prompt)
   * when the account has no personhood alias in OAB's context.
   */
  startRankedGame(setId: number): Promise<{ seed: bigint }>;
  submitTurn(actionScale: Uint8Array): Promise<TurnResult>;
  getGameState(): Promise<GameStateRaw | null>;
  /** Finalize the game; returns the badge events the run emitted (ranked only). */
  endGame(): Promise<BadgeEvent[]>;
  abandonGame(): Promise<void>;
  /** The selected account's ranked eligibility (alias binding vs the arena context). */
  rankedEligibility(): Promise<RankedEligibility>;
  /** Bind the product account to the player's personhood alias (host only). */
  bindPersonhood(): Promise<void>;
  /** Alias of the active ranked game, or null for a casual game or none. */
  getRankedAlias(): Promise<Hex | null>;
  getLeaderboard(setId: number, offset: number, limit: number): Promise<LeaderboardEntry[]>;
  /** 1-based place of `alias` on the set's board; 0 if absent. */
  getPlayerRank(setId: number, alias: Hex): Promise<number>;
  getBestRun(setId: number, alias: Hex): Promise<LeaderboardEntry | null>;
  /** The selected account's badges, in the order earned. */
  getBadges(): Promise<BadgeRecord[]>;
  /** Retry pending badge mints; returns the badges minted now. */
  claimPendingBadges(): Promise<BadgeEvent[]>;
  /** Item-scope metadata of an OAB Collectibles item, as UTF-8 (empty if unset). */
  readItemMetadata(item: number, key: string): Promise<string>;
}

// keccak256("BattleReported(uint8,uint8,uint8,uint8,uint64,bytes)")
const BATTLE_REPORTED_TOPIC = '0x96fd1736ea4fbef32e328d7005021b05c7ee31f32694ddef23dd55af68e089bd';

/**
 * Minimal typed view of the `@oab/arena` contract. `createContract` returns a
 * generic handle; we cast to this so call sites stay type-checked. The SDK's
 * viem ABI codec maps `bytes` ⇄ `0x`-hex strings, `uint64` → `bigint`, and
 * `bool` → `boolean`.
 */
interface ArenaContract {
  startGame: StartMethod;
  startRankedGame: StartMethod;
  submitTurn: {
    query(action: string): Promise<QueryResult<bigint>>;
    tx(action: string, opts?: TxOptions): Promise<TxOutcome>;
    prepare(action: string, opts?: PrepareOptions): Promise<Prepared>;
  };
  getGameState: { query(): Promise<QueryResult<string>> };
  getSet: { query(setId: number): Promise<QueryResult<string>> };
  endGame: {
    query(): Promise<QueryResult<boolean>>;
    tx(opts?: TxOptions): Promise<TxOutcome>;
    prepare(opts?: PrepareOptions): Promise<Prepared>;
  };
  abandonGame: {
    query(): Promise<QueryResult<boolean>>;
    tx(opts?: TxOptions): Promise<TxOutcome>;
    prepare(opts?: PrepareOptions): Promise<Prepared>;
  };
  claimPendingBadges: ClaimMethod;
  getRankedAlias: { query(): Promise<QueryResult<string>> };
  getPersonhoodContext: { query(opts?: ReadOptions): Promise<QueryResult<string>> };
  getLeaderboard: {
    query(
      setId: number,
      offset: number,
      limit: number,
      opts?: ReadOptions
    ): Promise<QueryResult<string>>;
  };
  getPlayerRank: {
    query(setId: number, alias: string, opts?: ReadOptions): Promise<QueryResult<number>>;
  };
  getBestRun: {
    query(setId: number, alias: string, opts?: ReadOptions): Promise<QueryResult<string>>;
  };
  getBadges: { query(player: string, opts?: ReadOptions): Promise<QueryResult<string>> };
}

type ReadOptions = { origin?: SS58String };
/**
 * Origin for views that do not depend on the caller. The player's own origin
 * fails while it is unmapped, and these reads must work before the first game.
 */
const PUBLIC_READ: ReadOptions = { origin: QUERY_FALLBACK_ORIGIN };

/** Unwrap a view's dry-run, throwing with the method name on failure. */
function viewOrThrow<T>(label: string, r: QueryResult<T>): T {
  if (!r.success) throw new Error(`${label} read failed`);
  return r.value;
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

// PRODUCT_ID (`./personhood`): the host derives (and authorizes) the app's
// product-account signer from this dotNS identifier. It MUST match the app's
// deployed domain name — the app is deployed at `oab-arena.paseo` on Paseo
// Next (served as `oab-arena.paseo.li` in the browser host) — or the host
// rejects signing for a product account it doesn't scope to this origin
// ("Transaction signing was rejected"). Fixed constant, NOT read from the
// host: reading would give `oab-arena.paseo.li` on the gateway and break
// resolution. See Rock-Paper-Scissors' PRODUCT_ID for the same convention.
// DERIVATION_INDEX is the product-account index the app signs with (and
// sponsors); the personhood context is scoped to it.

function arenaContractInfo(): { address: `0x${string}`; abi: AbiEntry[] } {
  // The cdm CLI manifest keys contracts directly by package name.
  const entry = (cdmJson.contracts as unknown as Record<string, { address: string; abi: unknown }>)[
    ARENA_LIBRARY
  ];
  return { address: entry.address as `0x${string}`, abi: entry.abi as AbiEntry[] };
}

/** Sponsor deps for environments without host sponsorship (never called). */
const noSponsorDeps = {
  playerPgas: () => Promise.resolve(0n),
  requestAllowance: () => Promise.resolve('NotAvailable' as const),
  sessionReady: () => Promise.resolve(false),
  setUp: () => Promise.reject(new Error('Sponsored play is not available')),
};

export function isMissingArenaSessionPayload(data: Uint8Array): boolean {
  // revive's Mapping getter currently materializes a zeroed ArenaSession for
  // missing keys instead of returning an empty byte payload. Treat that sentinel
  // as "no active game" so the frontend doesn't restore an empty shop.
  return data.every((byte) => byte === 0);
}

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
  let _activeSetId = 0;
  // Runtime for the currently-selected account, kept so mapping can be done
  // lazily (see ensureMapped). Reset whenever the selected account changes.
  let _runtime: ReturnType<typeof createContractRuntimeFromClient> | null = null;
  let _mapped = false;
  // Sponsored play. Host only: the session key lives in host storage and the
  // PGAS allowance is a host resource. Rebuilt per selected account.
  let _session: ProxySession | null = null;
  let _sponsor: Sponsor = createSponsor(noSponsorDeps, 'unavailable');

  function resetSponsor(account: Account): void {
    const signer = signerManager?.getSigner();
    if (providerType !== 'host' || !client || !signer) {
      _session = null;
      _sponsor = createSponsor(noSponsorDeps, 'unavailable');
      return;
    }
    _session = createProxySession({
      api: client.assetHub,
      player: account.address,
      playerSigner: signer,
      derivationIndex: DERIVATION_INDEX,
      storePrefix: PRODUCT_ID,
    });
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

  // Map the selected SS58 origin to its H160 once. pallet-revive rejects calls
  // (reads AND writes) from an unmapped origin with `AccountUnmapped`, so this
  // must run before the first contract call that acts as the player. We defer
  // it out of connect() — connect must never submit a transaction — and run it
  // here, right before the first write action, where a signing prompt is
  // expected. Idempotent: a no-op once mapped.
  async function ensureMapped(): Promise<void> {
    if (_mapped) return;
    if (!_runtime || !_selectedAccount || !signerManager) {
      throw new Error('Not connected');
    }
    const signer = signerManager.getSigner();
    if (!signer) throw new Error('No signer for selected account');
    const r = await ensureContractAccountMapped(_runtime, _selectedAccount.address, signer, {
      onStatus: (s) => onStatus?.(s as TxStatus),
    });
    if (!r.ok) throw labelled('Account mapping', r.error);
    _mapped = true;
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

      // connect() must be transaction-free: no signing prompt on connect. We
      // bind the contract from the inline address + ABI in cdm.json, which
      // needs no registry lookup (the live-registry query would dry-run-fail
      // with AccountUnmapped and force an eager account-mapping tx here).
      // Account mapping is deferred to the first write action via ensureMapped.
      const { address, abi } = arenaContractInfo();
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
    selectAccount(account: Account) {
      if (!signerManager) return;
      const r = signerManager.selectAccount(account.address);
      if (!r.ok) return;
      _selectedAccount = account;
      // Re-bind the contract defaults to the newly selected signer/origin.
      const signer = signerManager.getSigner();
      if (!signer || !client) return;
      // A different account needs its own mapping before the next write.
      _mapped = false;
      const { address, abi } = arenaContractInfo();
      _runtime = createContractRuntimeFromClient(client.raw.assetHub, paseo_asset_hub);
      contract = createContract(_runtime, address, abi, {
        defaultSigner: signer,
        defaultOrigin: account.address,
      }) as unknown as ArenaContract;
      resetSponsor(account);
    },

    async startGame(setId: number): Promise<{ seed: bigint }> {
      // First write of the session: set up sponsored play (one prompt) and
      // make sure the player origin is mapped, on an explicit action.
      await prepareWrite();
      // The contract derives the game seed from block entropy — the client
      // supplies nothing seed-related. The dry-run only validates the call;
      // its seed is advisory (the tx may land in a different block), so the
      // real session state comes from the post-start refresh. The SDK would
      // size gas to the exact dry-run weight, but the real run uses the
      // inclusion block's entropy and can cost more: startWithHeadroom
      // doubles the limit.
      const seed = await startWithHeadroom({
        label: 'startGame',
        method: arena().startGame,
        setId,
        send: sendGameCall,
        onStatus,
        rejected: () => new Error(`Contract rejected startGame for set ${setId}`),
      });
      _activeSetId = setId;
      return { seed };
    },

    async startRankedGame(setId: number): Promise<{ seed: bigint }> {
      // Same block-entropy seed as startGame, plus a personhood precompile
      // call, so it gets the same gas headroom. The binding check runs
      // first, so an ineligible player sees why with no prompt.
      const seed = await startRanked({
        eligibility: () => backend.rankedEligibility(),
        prepareWrite,
        start: () =>
          startWithHeadroom({
            label: 'startRankedGame',
            method: arena().startRankedGame,
            setId,
            send: sendGameCall,
            onStatus,
            rejected: () => new RankedIneligibleError(null, RANKED_REFUSED_MESSAGE),
          }),
      });
      _activeSetId = setId;
      return { seed };
    },

    async submitTurn(actionScale: Uint8Array): Promise<TurnResult> {
      await prepareWrite();
      const action = '0x' + bytesToHex(actionScale);
      // No explicit pre-query here: submitTurn resolves the whole battle
      // on-chain, so a dry-run executes that full simulation. `.tx()` already
      // runs its own dry-run to size gas and fails fast on revert/OOG, so an
      // extra `.query()` would just double that heavy simulation (and the
      // host round-trip) before the signing prompt appears. We read battleSeed
      // + the full report from the BattleReported event below, not the query.
      const tx = await sendGameCall(
        'submitTurn',
        () => arena().submitTurn.prepare(action),
        () => arena().submitTurn.tx(action, { onStatus })
      );

      const eventBytes = findBattleReportedEventData(tx.events);
      if (!eventBytes) {
        console.warn(
          'No BattleReported event in tx; full events array follows for debug:',
          tx.events
        );
        // The turn IS committed on-chain at this point; fabricating a result
        // here would show the player a battle that never happened. Surface the
        // decode failure so the caller resyncs from chain state instead.
        throw new Error(
          'Turn submitted, but the battle report could not be read — resyncing from chain'
        );
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

    async endGame(): Promise<BadgeEvent[]> {
      await prepareWrite();
      const dryRun = await arena().endGame.query();
      if (!dryRun.success || !dryRun.value) throw new Error('Contract rejected endGame');
      const tx = await sendGameCall(
        'endGame',
        () => arena().endGame.prepare(),
        () => arena().endGame.tx({ onStatus })
      );
      return playerBadgeEvents(tx.events);
    },

    async abandonGame(): Promise<void> {
      await prepareWrite();
      const dryRun = await arena().abandonGame.query();
      if (!dryRun.success || !dryRun.value) throw new Error('Contract rejected abandonGame');
      await sendGameCall(
        'abandonGame',
        () => arena().abandonGame.prepare(),
        () => arena().abandonGame.tx({ onStatus })
      );
    },

    async rankedEligibility(): Promise<RankedEligibility> {
      try {
        if (!client || !_selectedAccount) throw new Error('Not connected');
        const ctx = viewOrThrow(
          'getPersonhoodContext',
          await arena().getPersonhoodContext.query(PUBLIC_READ)
        );
        const binding = await readAliasBinding(client.assetHub, _selectedAccount.address);
        return classifyBinding(ctx as Hex, binding);
      } catch (err) {
        return { kind: 'unknown', reason: err instanceof Error ? err.message : String(err) };
      }
    },

    async bindPersonhood(): Promise<void> {
      const signer = signerManager?.getSigner();
      if (!client || !_selectedAccount || !signer) throw new Error('Not connected');
      const account = _selectedAccount.address;
      const session = _session;
      await bindPersonhood({
        api: client.assetHub,
        account,
        signer,
        // The fee and the AliasFee are paid in PGAS: claim the sponsored-play
        // allowance first if the account has none.
        ensurePgas: async () => {
          if (!session || (await session.deps.playerPgas()) > 0n) return;
          await session.deps.requestAllowance();
        },
      });
    },

    async getRankedAlias(): Promise<Hex | null> {
      const r = await arena().getRankedAlias.query();
      if (!r.success || isZeroAlias(r.value)) return null;
      return r.value as Hex;
    },

    async getLeaderboard(setId, offset, limit) {
      const r = await arena().getLeaderboard.query(setId, offset, limit, PUBLIC_READ);
      return decodeLeaderboard(viewOrThrow('getLeaderboard', r));
    },

    async getPlayerRank(setId, alias) {
      return viewOrThrow(
        'getPlayerRank',
        await arena().getPlayerRank.query(setId, alias, PUBLIC_READ)
      );
    },

    async getBestRun(setId, alias) {
      const r = await arena().getBestRun.query(setId, alias, PUBLIC_READ);
      return decodeBestRun(viewOrThrow('getBestRun', r));
    },

    async getBadges() {
      if (!_selectedAccount) throw new Error('Not connected');
      const player = ss58ToH160(_selectedAccount.address);
      return decodeBadges(
        viewOrThrow('getBadges', await arena().getBadges.query(player, PUBLIC_READ))
      );
    },

    async claimPendingBadges() {
      await prepareWrite();
      return claimBadges({
        method: arena().claimPendingBadges,
        send: sendGameCall,
        onStatus,
        parseEvents: playerBadgeEvents,
      });
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
      return new TextDecoder().decode(hexToBytes(viewOrThrow('itemMetadata', r)));
    },
  };

  /** Badge events in a tx's events that belong to the selected account. */
  function playerBadgeEvents(events: unknown[]): BadgeEvent[] {
    if (!_selectedAccount) return [];
    return findBadgeEvents(events, ss58ToH160(_selectedAccount.address));
  }

  return backend;
}

/** Decode every BadgeMinted / BadgePending event for `player` (H160) in `events`. */
export function findBadgeEvents(events: unknown[], player: string): BadgeEvent[] {
  const out: BadgeEvent[] = [];
  for (const evt of events) {
    const inner = unwrapContractEmitted(evt);
    if (!inner) continue;
    const topics = (inner.topics ?? []).map(topicToHex).filter((t): t is string => t !== null);
    const badge = decodeBadgeEvent(topics, binaryToBytes(inner.data));
    if (badge && badge.player === player.toLowerCase()) out.push(badge);
  }
  return out;
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
