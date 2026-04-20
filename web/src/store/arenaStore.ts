import { create } from 'zustand';
import { createClient, Binary, getTypedCodecs } from 'polkadot-api';
import { getWsProvider } from 'polkadot-api/ws-provider';
import { withPolkadotSdkCompat } from 'polkadot-api/polkadot-sdk-compat';
import { getInjectedExtensions, connectInjectedExtension } from 'polkadot-api/pjs-signer';
import {
  injectSpektrExtension,
  createPapiProvider,
  createAccountsProvider,
} from '@novasamatech/product-sdk';
import { isInHost } from '../services/hostEnvironment';
import { storageService } from '../services/storage';
import { auto_battle } from '@polkadot-api/descriptors';
import { useGameStore } from './gameStore';
import { sr25519CreateDerive } from '@polkadot-labs/hdkd';
import {
  DEV_PHRASE,
  entropyToMiniSecret,
  mnemonicToEntropy,
  generateMnemonic,
} from '@polkadot-labs/hdkd-helpers';
import { getPolkadotSigner } from 'polkadot-api/signer';
import { AccountId } from '@polkadot-api/substrate-bindings';
import { createCallArgCoercer } from '../utils/papiCoercion';
import { initEmojiMap } from '../utils/emoji';
import { submitTx, type SubmitTxResult } from '../utils/tx';
import { useSettingsStore } from './settingsStore';
import type { GameBackend } from '../backends/types';
import { createPalletBackend } from '../backends/pallet';
import { ignoreError, isRecord } from '../utils/safe';

// Keep the host-backed provider path available for debugging, but default to
// direct WS until host transport issues are resolved.
const ENABLE_HOST_PAPI_PROVIDER = false;

// ============================================================================
// PAPI-to-serde conversion helpers
//
// PAPI decodes blockchain enums as {type: "Variant", value: {...data...}}.
// The WASM engine deserializes via serde_wasm_bindgen, which expects different
// formats depending on the serde tag attribute:
//   - Simple enum (no tag attr):           "VariantName"
//   - Internally tagged (tag="type"):       {type: "V", field1: ..., field2: ...}
//   - Adjacently tagged (tag="type", content="data"): {type: "V", data: {...}}
// ============================================================================

/** Extract variant name from PAPI enum (for simple enums like AbilityTrigger, CompareOp, etc.) */
function papiEnumStr(v: any): string {
  if (typeof v === 'string') return v;
  return v?.type ?? String(v);
}

/**
 * Convert AbilityEffect from PAPI to serde format.
 * Serde: internally tagged (#[serde(tag = "type")])
 * PAPI:  {type: "Damage", value: {amount: 5, target: ...}}
 * Serde: {type: "Damage", amount: 5, target: ...}
 */
function convertEffect(v: any): any {
  if (!v) return v;
  const result: any = { type: papiEnumStr(v) };
  const data = v.value;
  if (data && typeof data === 'object') {
    for (const [key, val] of Object.entries(data)) {
      if (key === 'target') {
        result[key] = convertTarget(val);
      } else if (key === 'card_id') {
        // CardId is #[serde(transparent)] — just a number
        result[key] = typeof val === 'number' ? val : Number(val);
      } else if (key === 'spawn_location') {
        // SpawnLocation is a simple enum — serde expects a string
        result[key] = papiEnumStr(val);
      } else {
        result[key] = val;
      }
    }
  }
  return result;
}

/**
 * Convert AbilityTarget from PAPI to serde format.
 * Serde: adjacently tagged (#[serde(tag = "type", content = "data")])
 * PAPI:  {type: "All", value: {scope: {type: "Enemies"}}}
 * Serde: {type: "All", data: {scope: "Enemies"}}
 */
function convertTarget(v: any): any {
  if (!v) return v;
  const tag = papiEnumStr(v);
  const data = v.value;
  if (data && typeof data === 'object') {
    const converted: any = {};
    for (const [key, val] of Object.entries(data)) {
      // scope, stat, order, op are all simple enums
      if (
        ['scope', 'target_scope', 'stat', 'source_stat', 'target_stat', 'order', 'op'].includes(key)
      ) {
        converted[key] = papiEnumStr(val);
      } else {
        converted[key] = val;
      }
    }
    return { type: tag, data: converted };
  }
  return { type: tag };
}

/**
 * Convert Matcher from PAPI to serde format.
 * Serde: adjacently tagged (#[serde(tag = "type", content = "data")])
 */
function convertMatcher(v: any): any {
  if (!v) return v;
  const tag = papiEnumStr(v);
  const data = v.value;
  if (data && typeof data === 'object') {
    const converted: any = {};
    for (const [key, val] of Object.entries(data)) {
      if (key === 'target') {
        converted[key] = convertTarget(val);
      } else if (
        ['scope', 'target_scope', 'stat', 'source_stat', 'target_stat', 'order', 'op'].includes(key)
      ) {
        converted[key] = papiEnumStr(val);
      } else {
        converted[key] = val;
      }
    }
    return { type: tag, data: converted };
  }
  return { type: tag };
}

/**
 * Convert Condition from PAPI to serde format.
 * Serde: adjacently tagged (#[serde(tag = "type", content = "data")])
 * Condition::Is(Matcher) or Condition::AnyOf(Vec<Matcher>)
 */
function convertCondition(v: any): any {
  if (!v) return v;
  const tag = papiEnumStr(v);
  if (tag === 'Is') {
    return { type: 'Is', data: convertMatcher(v.value) };
  }
  if (tag === 'AnyOf') {
    return { type: 'AnyOf', data: (v.value || []).map(convertMatcher) };
  }
  return { type: tag };
}

/** Convert a full PAPI-decoded ability to serde format for the WASM engine */
function convertAbility(a: any): any {
  return {
    trigger: papiEnumStr(a.trigger),
    effect: convertEffect(a.effect),
    conditions: (a.conditions || []).map(convertCondition),
    max_triggers: a.max_triggers ?? null,
  };
}

function buildBlockchainCardNameMap(cards: any[]): Record<number, string> {
  return Object.fromEntries(
    cards.map((card) => [card.id, card.metadata?.name || `Card #${card.id}`])
  );
}

function blockchainCardToEngineCard(card: any) {
  const shopAbilities = (card.data.shop_abilities || []).map(convertAbility);
  const battleAbilities = (card.data.battle_abilities || []).map(convertAbility);

  return {
    id: card.id,
    name: card.metadata?.name || `Card #${card.id}`,
    stats: {
      attack: card.data.stats.attack,
      health: card.data.stats.health,
    },
    economy: {
      play_cost: card.data.economy.play_cost,
      burn_value: card.data.economy.burn_value,
    },
    shop_abilities: shopAbilities,
    battle_abilities: battleAbilities,
  };
}

function injectCardsIntoEngine(engine: any, cards: any[]) {
  for (const card of cards) {
    try {
      engine.add_card(blockchainCardToEngineCard(card));
    } catch (e) {
      console.warn(`Failed to inject card ${card.id} into engine:`, e);
    }
  }
}

function injectSetsIntoEngine(engine: any, sets: any[]) {
  for (const setData of sets) {
    try {
      const entries = setData.cards.map((card: any) => ({
        card_id:
          typeof card.card_id === 'object' ? (card.card_id.value ?? card.card_id[0]) : card.card_id,
        rarity: card.rarity,
      }));
      engine.add_set(setData.id, entries);
    } catch (e) {
      console.warn(`Failed to inject set ${setData.id} into engine:`, e);
    }
  }
}

function syncGameStoreWithBlockchainContent(cards: any[], sets: any[]) {
  const existingNames = useGameStore.getState().cardNameMap;
  useGameStore.setState({
    setMetas: sets.map((setData) => ({ id: setData.id, name: setData.name })),
    cardNameMap: {
      ...existingNames,
      ...buildBlockchainCardNameMap(cards),
    },
  });

  const { engine, currentSetId } = useGameStore.getState();
  if (!engine) return;

  injectCardsIntoEngine(engine, cards);
  injectSetsIntoEngine(engine, sets);

  // Rebuild rarity map so blockchain-set cards display rarity correctly
  if (currentSetId != null) {
    try {
      const setCards: { id: number; rarity: number }[] = engine.get_set_cards(currentSetId);
      const rarityMap = new Map<number, number>();
      let rarityTotalWeight = 0;
      for (const card of setCards) {
        rarityMap.set(card.id, card.rarity);
        rarityTotalWeight += card.rarity;
      }
      useGameStore.setState({ rarityMap, rarityTotalWeight });
    } catch {
      // set not loaded yet — rarity will be built when the game starts
    }
  }
}

interface ArenaStore {
  // Backend
  backend: GameBackend | null;

  // Connection state
  client: any;
  api: any;
  codecs: any;
  isConnected: boolean;
  isConnecting: boolean;
  connectionError: string | null;

  // Account state
  accounts: ArenaAccount[];
  selectedAccount: ArenaAccount | null;
  isLoggedIn: boolean;
  /** True while restoring a previous login session from localStorage */
  isRestoringSession: boolean;

  // Game state
  chainState: any;
  blockNumber: number | null;
  isRefreshing: boolean;
  lastRefresh: number;
  allCards: any[];
  availableSets: any[];

  // Actions
  disconnect: () => void;
  connect: () => Promise<boolean>;
  selectAccount: (account: ArenaAccount | undefined) => Promise<void>;
  startGame: (set_id?: number) => Promise<void>;
  refreshGameState: (force?: boolean) => Promise<void>;
  submitTurnOnChain: () => Promise<void>;
  endGame: () => Promise<void>;
  abandonGame: () => Promise<void>;
  fetchBag: () => any[];
  fetchCards: () => Promise<void>;
  fetchSets: () => Promise<void>;
  hydrateGameEngineFromChainData: () => void;
  getLocalBattleOpponent: (
    setId: number,
    round: number,
    wins: number,
    lives: number
  ) => Promise<{ board: any[]; seed: number } | null>;
  submitCard: (cardData: any, metadata: any) => Promise<void>;
  createCardSet: (cards: { card_id: number; rarity: number }[], name?: string) => Promise<void>;

  // Constructed mode
  constructedChainState: any;
  startConstructedGame: (deck: number[]) => Promise<void>;
  refreshConstructedGameState: (force?: boolean) => Promise<void>;
  submitConstructedTurnOnChain: () => Promise<void>;
  endConstructedGame: () => Promise<void>;
  abandonConstructedGame: () => Promise<void>;

  // Auth
  login: () => void;
  logout: () => void;
  getAccountBalance: (address: string) => Promise<bigint>;

  // Local account management
  createLocalAccount: (name: string) => Promise<void>;
  removeLocalAccount: (address: string) => void;
  fundSelectedAccount: () => Promise<void>;
  getLocalAccountMnemonic: (address: string) => string | null;

  // Internal helpers
  cardDataCoercer?: ((value: unknown) => any) | null;
}

export interface ArenaAccount {
  address: string;
  name: string;
  polkadotSigner: unknown;
  source: string;
}

type ChainEventRecord = NonNullable<SubmitTxResult['events']>[number];
type RawOpponentUnit = {
  card_id?: unknown;
  perm_attack?: unknown;
  perm_health?: unknown;
};

function decodeCompactNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (isRecord(value) && 'value' in value) {
    return Number(value.value);
  }
  return Number(value ?? 0);
}

function decodeBigInt(value: unknown): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' || typeof value === 'string') {
    return BigInt(value);
  }
  if (isRecord(value) && 'value' in value) {
    return decodeBigInt(value.value);
  }
  return BigInt(0);
}

function getChainEventPayload(event: ChainEventRecord | undefined): Record<string, unknown> {
  const payload = event?.value?.value;
  return isRecord(payload) ? payload : {};
}

function getOpponentUnits(board: unknown): RawOpponentUnit[] {
  if (Array.isArray(board)) {
    return board as RawOpponentUnit[];
  }
  if (isRecord(board) && Array.isArray(board.units)) {
    return board.units as RawOpponentUnit[];
  }
  return [];
}

function normalizeInjectedAccount(
  source: string,
  account: {
    address: string;
    name?: string;
    polkadotSigner: unknown;
    source?: string;
  }
): ArenaAccount {
  return {
    address: account.address,
    name: account.name ?? 'Extension Account',
    polkadotSigner: account.polkadotSigner,
    source: account.source ?? source,
  };
}

/** Convert raw public key bytes to SS58 address (generic substrate prefix 42). */
const toSs58 = (publicKey: Uint8Array): string => AccountId(42).dec(publicKey);

const LOCAL_ACCOUNTS_KEY = 'oab-local-accounts';

export interface StoredLocalAccount {
  name: string;
  mnemonic: string;
}

function loadStoredLocalAccounts(): StoredLocalAccount[] {
  if (isInHost()) return [];
  try {
    const raw = localStorage.getItem(LOCAL_ACCOUNTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveStoredLocalAccounts(accounts: StoredLocalAccount[]) {
  void storageService.writeJSON(LOCAL_ACCOUNTS_KEY, accounts);
}

function deriveAccountFromMnemonic(mnemonic: string, name: string): ArenaAccount {
  const miniSecret = entropyToMiniSecret(mnemonicToEntropy(mnemonic));
  const derive = sr25519CreateDerive(miniSecret);
  const accountId = AccountId(42);
  const hdkdKeyPair = derive('//0');
  const address = accountId.dec(hdkdKeyPair.publicKey);
  const polkadotSigner = getPolkadotSigner(hdkdKeyPair.publicKey, 'Sr25519', hdkdKeyPair.sign);

  return {
    address,
    name,
    polkadotSigner,
    source: 'local' as const,
  };
}

function getLocalAccounts(): ArenaAccount[] {
  return loadStoredLocalAccounts().map((stored) =>
    deriveAccountFromMnemonic(stored.mnemonic, stored.name)
  );
}

const SHOW_DEV_ACCOUNTS = false;
const DEV_ACCOUNTS = ['Alice', 'Bob', 'Charlie', 'Dave', 'Eve', 'Ferdie'];

export const getDevAccounts = (): ArenaAccount[] => {
  const miniSecret = entropyToMiniSecret(mnemonicToEntropy(DEV_PHRASE));
  const derive = sr25519CreateDerive(miniSecret);
  const accountId = AccountId(42);

  return DEV_ACCOUNTS.map((name) => {
    const hdkdKeyPair = derive(`//${name}`);
    const address = accountId.dec(hdkdKeyPair.publicKey);
    const polkadotSigner = getPolkadotSigner(hdkdKeyPair.publicKey, 'Sr25519', hdkdKeyPair.sign);

    return {
      address,
      name,
      polkadotSigner,
      source: 'dev',
    };
  });
};

export const useArenaStore = create<ArenaStore>((set, get) => ({
  // Backend
  backend: null,

  // Connection state
  client: null,
  api: null,
  codecs: null,
  isConnected: false,
  isConnecting: false,
  connectionError: null,

  // Account state
  accounts: [],
  selectedAccount: null,
  isLoggedIn: false,
  // In host mode, initHostStorage() sets this before first render.
  isRestoringSession: (() => {
    if (isInHost()) return false;
    try {
      return !!localStorage.getItem('oab-logged-in');
    } catch {
      return false;
    }
  })(),

  // Game state
  chainState: null,
  constructedChainState: null,
  blockNumber: null,
  isRefreshing: false,
  lastRefresh: 0,

  disconnect: () => {
    const { client } = get();
    if (client) {
      client.destroy();
    }
    set({
      client: null,
      api: null,
      codecs: null,
      backend: null,
      isConnected: false,
      isConnecting: false,
      isLoggedIn: false,
      connectionError: null,
      blockNumber: null,
      chainState: null,
      allCards: [],
      availableSets: [],
    });
  },

  connect: async () => {
    get().disconnect();
    set({ isConnecting: true, connectionError: null });

    let client: any = null;

    try {
      const wsEndpoint = useSettingsStore.getState().endpoint;
      const wsProvider = withPolkadotSdkCompat(getWsProvider(wsEndpoint));

      if (isInHost() && ENABLE_HOST_PAPI_PROVIDER) {
        // In host mode, discover genesis hash via WS (allowed in sandbox),
        // then route through host's shared connection for efficiency.
        let tempClient: any = null;
        try {
          tempClient = createClient(wsProvider);
          const chainSpec = await tempClient.getChainSpecData();
          const provider = createPapiProvider(
            chainSpec.genesisHash as `0x${string}`,
            wsProvider // fallback if host doesn't support this chain
          );
          client = createClient(provider);
        } catch (e) {
          console.warn('Host provider setup failed, falling back to WS:', e);
          client = createClient(wsProvider);
        } finally {
          tempClient?.destroy?.();
        }
      } else {
        client = createClient(wsProvider);
      }

      // Fail fast on transport or metadata issues before hydrating the store.
      await client.getChainSpecData();

      client.bestBlocks$.subscribe({
        next: (blocks: any[]) => {
          if (blocks.length === 0 || get().client !== client) return;
          set({
            blockNumber: blocks[0].number,
            connectionError: null,
          });
        },
        error: (err: unknown) => {
          if (get().client !== client) return;
          console.error('Best block subscription failed:', err);
          client.destroy();
          set({
            client: null,
            api: null,
            codecs: null,
            cardDataCoercer: null,
            isConnected: false,
            isConnecting: false,
            isLoggedIn: false,
            blockNumber: null,
            connectionError: err instanceof Error ? err.message : String(err),
          });
        },
      });

      const api = client.getTypedApi(auto_battle);
      const codecs = await getTypedCodecs(auto_battle);
      const cardDataCoercer = await createCallArgCoercer(
        auto_battle,
        'OabCardRegistry',
        'submit_card',
        'card_data'
      );

      let allAccounts: ArenaAccount[] = [];

      if (isInHost()) {
        // Host mode: use host-managed accounts, suppress dev/local accounts
        try {
          await injectSpektrExtension();
        } catch (error) {
          ignoreError(error);
        }

        // Get accounts from host via createAccountsProvider
        try {
          const accountsProvider = createAccountsProvider();
          const result = await accountsProvider.getNonProductAccounts();
          if (result.isOk()) {
            const hostAccounts = result.value.map(
              (acct): ArenaAccount => ({
                address: toSs58(acct.publicKey),
                name: acct.name || 'Host Account',
                polkadotSigner: accountsProvider.getNonProductAccountSigner({
                  dotNsIdentifier: '',
                  derivationIndex: 0,
                  publicKey: acct.publicKey,
                }),
                source: 'host' as const,
              })
            );
            allAccounts = [...allAccounts, ...hostAccounts];
          }
        } catch (e) {
          console.warn('Host account provider failed:', e);
        }

        // Also try injected extensions (Spektr injection makes them available)
        try {
          const extensions = getInjectedExtensions();
          for (const ext of extensions) {
            try {
              const pjs = await connectInjectedExtension(ext);
              allAccounts = [
                ...allAccounts,
                ...pjs.getAccounts().map((account) => normalizeInjectedAccount(ext, account)),
              ];
            } catch (error) {
              ignoreError(error);
            }
          }
        } catch (error) {
          ignoreError(error);
        }
      } else {
        // Standalone: current flow — dev accounts, local accounts, wallet extensions
        const devAccounts = SHOW_DEV_ACCOUNTS ? getDevAccounts() : [];
        const localAccounts = getLocalAccounts();
        allAccounts = [...devAccounts, ...localAccounts];

        try {
          await injectSpektrExtension();
        } catch (e) {
          console.warn('Spektr extension not available:', e);
        }

        try {
          const extensions = getInjectedExtensions();
          for (const ext of extensions) {
            try {
              const pjs = await connectInjectedExtension(ext);
              allAccounts = [
                ...allAccounts,
                ...pjs.getAccounts().map((account) => normalizeInjectedAccount(ext, account)),
              ];
            } catch (extErr) {
              console.warn(`Failed to connect extension "${ext}":`, extErr);
            }
          }
        } catch (walletErr) {
          console.warn('Wallet extensions not available:', walletErr);
        }
      }

      const backend = createPalletBackend({
        getApi: () => get().api,
        getClient: () => get().client,
        getCodecs: () => get().codecs,
        getSelectedAccount: () => get().selectedAccount,
        getBlockNumber: () => get().blockNumber,
      });

      set({
        client,
        api,
        codecs,
        backend,
        accounts: allAccounts,
        selectedAccount: allAccounts[0],
        cardDataCoercer,
      });

      // Fetch available sets and cards
      await Promise.all([get().fetchSets(), get().fetchCards()]);
      get().hydrateGameEngineFromChainData();
      set({ isConnected: true, isConnecting: false, connectionError: null });

      // Restore login session if the previously logged-in account is still available
      try {
        const savedAddress = await storageService.readString('oab-logged-in');
        if (savedAddress) {
          const match = get().accounts.find((a: any) => a.address === savedAddress);
          if (match) {
            await get().selectAccount(match);
            set({ isLoggedIn: true, isRestoringSession: false });
          } else {
            set({ isRestoringSession: false });
          }
        } else {
          set({ isRestoringSession: false });
        }
      } catch {
        set({ isRestoringSession: false });
      }

      if (get().selectedAccount) {
        await get().refreshGameState();
      }
      return true;
    } catch (err) {
      console.error('Blockchain connection failed:', err);
      client?.destroy?.();
      set({
        client: null,
        api: null,
        codecs: null,
        isConnected: false,
        isConnecting: false,
        isRestoringSession: false,
        blockNumber: null,
        chainState: null,
        allCards: [],
        availableSets: [],
        connectionError: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  },

  selectAccount: async (account) => {
    set({ selectedAccount: account ?? null });
    // Fetch achievements for the new account
    const { api } = get();
    if (api && account) {
      const { useAchievementStore } = await import('./achievementStore');
      void useAchievementStore.getState().fetchAchievements(api, account.address);
    }
    await get().refreshGameState(true);
  },

  refreshGameState: async (force = false) => {
    const { backend, selectedAccount, isRefreshing, lastRefresh } = get();
    if (!backend || !selectedAccount || isRefreshing) return;

    const now = Date.now();
    if (!force && now - lastRefresh < 500) {
      console.log('Refresh throttled...');
      return;
    }

    set({ isRefreshing: true, lastRefresh: now });

    const waitForEngine = async (maxRetries = 10): Promise<any> => {
      for (let i = 0; i < maxRetries; i++) {
        const { engine } = useGameStore.getState();
        if (engine) return engine;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return null;
    };

    try {
      console.log(`Refreshing game state for ${selectedAccount.address}...`);
      const gameStateRaw = await backend.getGameState();
      set({ chainState: gameStateRaw ? true : null }); // truthy if active game exists

      if (gameStateRaw) {
        const engine = await waitForEngine();

        if (engine) {
          console.log('On-chain game found. Syncing WASM engine via SCALE bytes...');
          try {
            const { allCards } = get();
            injectCardsIntoEngine(engine, allCards);

            engine.init_from_scale(gameStateRaw.stateBytes, gameStateRaw.cardSetBytes);

            const view = engine.get_view();
            const cardSet = engine.get_card_set();

            console.log('WASM engine synced successfully via SCALE bytes. View:', view);
            const existingNames = useGameStore.getState().cardNameMap;
            useGameStore.setState({
              view,
              cardSet,
              currentSetId: view?.set_id ?? 0,
              gameStarted: true,
              cardNameMap: {
                ...existingNames,
                ...buildBlockchainCardNameMap(allCards),
              },
            });
          } catch (e) {
            console.error('Failed to sync engine with chain state via SCALE:', e);
          }
        } else {
          console.warn('WASM engine timed out or is not ready, skipping sync.');
        }
      } else {
        console.log('No active game found on-chain for this account.');
      }
    } catch (err) {
      console.error('Failed to fetch game state:', err);
    } finally {
      set({ isRefreshing: false });
    }
  },

  startGame: async (set_id = 0) => {
    const { backend } = get();
    if (!backend) return;

    try {
      await backend.startGame(set_id);
      await get().refreshGameState();
    } catch (err) {
      console.error('Start game failed:', err);
    }
  },

  submitTurnOnChain: async () => {
    const { backend } = get();
    const { engine } = useGameStore.getState();
    if (!backend || !engine) return;

    try {
      // Capture player board BEFORE submitting (chain will modify state)
      const playerBoard = engine.get_board();

      // Get SCALE-encoded action from engine
      const actionScale = engine.get_commit_action_scale();

      // Submit turn through backend (handles PAPI/contract differences)
      const turnResult = await backend.submitTurn(actionScale, new Uint8Array());

      // Replay battle locally with the chain's seed and opponent
      const battleOutput = engine.resolve_battle_p2p(
        playerBoard,
        turnResult.opponentBoard,
        turnResult.battleSeed
      );

      // Verify local result matches chain result
      if (battleOutput?.events) {
        const localEndEvent = battleOutput.events.find((e: any) => e.type === 'BattleEnd');
        const localResult = localEndEvent?.payload?.result;
        if (localResult && localResult !== turnResult.result) {
          console.warn(`Battle result mismatch! Chain: ${turnResult.result}, Local: ${localResult}`);
        }
      }

      // Set up blockchain-aware continue: defer refreshGameState to "Continue" click
      useGameStore.setState({
        battleOutput,
        selection: null,
        showBattleOverlay: true,
        afterBattleCallback: async () => {
          await get().refreshGameState(true);
        },
      });
    } catch (err) {
      console.error('Submit turn failed:', err);
    }
  },

  endGame: async () => {
    const { backend } = get();
    if (!backend) return;

    try {
      await backend.endGame();
      set({ chainState: null });
    } catch (err) {
      console.error('End game failed:', err);
    }
  },

  abandonGame: async () => {
    const { backend } = get();
    if (!backend) {
      throw new Error('Blockchain backend is not ready');
    }

    try {
      await backend.abandonGame();
      set({ chainState: null });
      useGameStore.getState().resetActiveSessionView();
    } catch (err) {
      console.error('Abandon game failed:', err);
      throw err;
    }
  },

  // ── Constructed mode ────────────────────────────────────────────────

  startConstructedGame: async (deck: number[]) => {
    const { api, selectedAccount } = get();
    if (!api || !selectedAccount) return;

    try {
      const tx = api.tx.OabConstructed.start_game({ deck });
      await submitTx(tx, selectedAccount.polkadotSigner, 'OabConstructed.start_game');
      await get().refreshConstructedGameState(true);
    } catch (err) {
      console.error('Start constructed game failed:', err);
      throw err;
    }
  },

  refreshConstructedGameState: async (_force = false) => {
    const { api, client, selectedAccount } = get();
    if (!api || !selectedAccount) return;

    try {
      const game = await api.query.OabConstructed.ActiveGame.getValue(selectedAccount.address);
      set({ constructedChainState: game });

      if (game) {
        const engine = useGameStore.getState().engine;
        if (engine) {
          const { allCards } = get();
          injectCardsIntoEngine(engine, allCards);

          // Fetch raw SCALE bytes for constructed game session
          const gameKey = await api.query.OabConstructed.ActiveGame.getKey(selectedAccount.address);
          const gameRawHex = await client.rawQuery(gameKey);

          if (!gameRawHex) {
            throw new Error('Failed to fetch raw SCALE bytes');
          }

          const gameRaw = Binary.fromHex(gameRawHex).asBytes();

          // For constructed, we load the full card pool instead of a specific set.
          // Load all cards into engine and use set 0 as the card set for SCALE decoding.
          if (typeof engine.load_full_card_pool === 'function') {
            engine.load_full_card_pool();
          } else {
            engine.load_card_set(0);
          }

          // Get the card set SCALE bytes (set 0) for init_from_scale
          const cardSetKey = await api.query.OabCardRegistry.CardSets.getKey(0);
          const cardSetRawHex = await client.rawQuery(cardSetKey);

          if (cardSetRawHex) {
            const cardSetRaw = Binary.fromHex(cardSetRawHex).asBytes();
            engine.init_from_scale(gameRaw, cardSetRaw);
          }

          const view = engine.get_view();
          const cardSet = engine.get_card_set();
          const existingNames = useGameStore.getState().cardNameMap;

          useGameStore.setState({
            view,
            cardSet,
            gameStarted: true,
            isLoading: false,
            engineReady: true,
            currentSetId: 0,
            cardNameMap: Object.keys(existingNames).length > 0 ? existingNames : {},
          });
        }
      } else {
        set({ constructedChainState: null });
      }
    } catch (err) {
      console.error('Refresh constructed game state failed:', err);
    }
  },

  submitConstructedTurnOnChain: async () => {
    const { api, codecs, selectedAccount } = get();
    const { engine } = useGameStore.getState();
    if (!api || !codecs || !selectedAccount || !engine) return;

    try {
      const playerBoard = engine.get_board();
      const actionRaw = engine.get_commit_action_scale();
      const action = codecs.tx.OabConstructed.submit_turn.dec(actionRaw);

      const tx = api.tx.OabConstructed.submit_turn(action);
      const txResult = await submitTx(
        tx,
        selectedAccount.polkadotSigner,
        'OabConstructed.submit_turn'
      );

      const battleEvent = txResult.events?.find(
        (e: ChainEventRecord) => e.type === 'OabConstructed' && e.value?.type === 'BattleReported'
      );

      if (battleEvent) {
        const battlePayload = getChainEventPayload(battleEvent);
        const battleSeed = battlePayload.battle_seed;
        const opponentBoard = battlePayload.opponent_board;

        const rawUnits = getOpponentUnits(opponentBoard);
        const opponentUnits = rawUnits.map((u: RawOpponentUnit) => ({
          card_id: decodeCompactNumber(u.card_id),
          perm_attack: decodeCompactNumber(u.perm_attack),
          perm_health: decodeCompactNumber(u.perm_health),
        }));

        const battleOutput = engine.resolve_battle_p2p(
          playerBoard,
          opponentUnits,
          decodeBigInt(battleSeed)
        );

        useGameStore.setState({
          battleOutput,
          selection: null,
          showBattleOverlay: true,
          afterBattleCallback: async () => {
            await get().refreshConstructedGameState(true);
          },
        });
      } else {
        console.warn('No BattleReported event found');
        await get().refreshConstructedGameState(true);
      }
    } catch (err) {
      console.error('Submit constructed turn failed:', err);
    }
  },

  endConstructedGame: async () => {
    const { api, selectedAccount } = get();
    if (!api || !selectedAccount) return;

    try {
      const tx = api.tx.OabConstructed.end_game({});
      await submitTx(tx, selectedAccount.polkadotSigner, 'Saving Results');
      set({ constructedChainState: null });
    } catch (err) {
      console.error('End constructed game failed:', err);
    }
  },

  abandonConstructedGame: async () => {
    const { api, selectedAccount } = get();
    if (!api || !selectedAccount) {
      throw new Error('Blockchain account is not ready');
    }

    try {
      const tx = api.tx.OabConstructed.abandon_game({});
      await submitTx(tx, selectedAccount.polkadotSigner, 'OabConstructed.abandon_game');
      set({ constructedChainState: null });
      useGameStore.getState().resetActiveSessionView();
    } catch (err) {
      console.error('Abandon constructed game failed:', err);
      throw err;
    }
  },

  /**
   * Fetch the full bag from the WASM engine (Cold Path - on demand only)
   * Use sparingly as this includes all card data.
   */
  fetchBag: () => {
    const { engine } = useGameStore.getState();
    if (!engine) {
      console.warn('WASM engine not ready, cannot fetch bag.');
      return [];
    }

    try {
      const bag = engine.get_bag();
      console.log('Fetched full bag IDs from WASM:', bag.length, 'cards');
      return bag;
    } catch (e) {
      console.error('Failed to fetch bag:', e);
      return [];
    }
  },

  allCards: [],
  availableSets: [],
  cardDataCoercer: null,

  fetchCards: async () => {
    const { api } = get();
    if (!api) return;

    try {
      // Fetch all UserCards and CardMetadataStore
      const cardEntries = await api.query.OabCardRegistry.UserCards.getEntries();
      const metadataEntries = await api.query.OabCardRegistry.CardMetadataStore.getEntries();

      const metadataMap = new Map();
      metadataEntries.forEach((entry: any) => {
        const meta = entry.value.metadata;
        metadataMap.set(entry.keyArgs[0], {
          name: meta.name.asText(),
          emoji: meta.emoji.asText(),
          description: meta.description.asText(),
          creator: entry.value.creator,
        });
      });

      const cards = cardEntries.map((entry: any) => {
        const id = Number(entry.keyArgs[0]);
        const metadata = metadataMap.get(id);
        return {
          id,
          data: entry.value,
          metadata: metadata || { name: `Card #${id}`, emoji: '❓', description: '' },
          creator: metadata?.creator,
        };
      });

      set({ allCards: cards });

      // Update emoji map from blockchain metadata (source of truth)
      initEmojiMap(cards.map((c: any) => ({ id: c.id, emoji: c.metadata.emoji })));
      syncGameStoreWithBlockchainContent(cards, get().availableSets);
    } catch (err) {
      console.error('Failed to fetch cards:', err);
    }
  },

  fetchSets: async () => {
    const { api } = get();
    if (!api) return;

    try {
      const setEntries = await api.query.OabCardRegistry.CardSets.getEntries();

      // Fetch set metadata
      const metadataMap = new Map<number, string>();
      try {
        const metaEntries = await api.query.OabCardRegistry.CardSetMetadataStore.getEntries();
        metaEntries.forEach((entry: any) => {
          metadataMap.set(Number(entry.keyArgs[0]), entry.value.name.asText());
        });
      } catch {
        // CardSetMetadataStore may not exist on older chains
      }

      const sets = setEntries.map((entry: any) => {
        const id = Number(entry.keyArgs[0]);
        return {
          id,
          cards: entry.value,
          name: metadataMap.get(id) || `Set #${id}`,
        };
      });
      set({ availableSets: sets });
      syncGameStoreWithBlockchainContent(get().allCards, sets);
    } catch (err) {
      console.error('Failed to fetch sets:', err);
    }
  },

  hydrateGameEngineFromChainData: () => {
    syncGameStoreWithBlockchainContent(get().allCards, get().availableSets);
  },

  getLocalBattleOpponent: async (setId, round, wins, lives) => {
    const { backend } = get();
    if (!backend) return null;

    try {
      const result = await backend.getGhostOpponent(setId, round, wins, lives);
      if (!result) return null;
      return { board: result.board, seed: Number(result.seed) };
    } catch (err) {
      console.error('Failed to fetch blockchain-controlled local opponent:', err);
      return null;
    }
  },

  submitCard: async (cardData, metadata) => {
    const { api, selectedAccount, cardDataCoercer } = get();
    if (!api || !selectedAccount) return;

    try {
      const cardDataForChain = cardDataCoercer ? cardDataCoercer(cardData) : cardData;

      // 1. Submit the card data
      const cardTx = api.tx.OabCardRegistry.submit_card({ card_data: cardDataForChain });
      await submitTx(cardTx, selectedAccount.polkadotSigner, 'OabCardRegistry.submit_card');

      // We need to wait for the card to be indexed to get the ID,
      // but for simplicity in this prototype, we'll just fetch next card ID
      const nextId = await api.query.OabCardRegistry.NextUserCardId.getValue();
      const cardId = Number(nextId) - 1;

      // 2. Set metadata
      const metaTx = api.tx.OabCardRegistry.set_card_metadata({
        card_id: cardId,
        metadata: {
          name: Binary.fromText(metadata.name),
          emoji: Binary.fromText(metadata.emoji),
          description: Binary.fromText(metadata.description),
        },
      });
      await submitTx(
        metaTx,
        selectedAccount.polkadotSigner,
        `OabCardRegistry.set_card_metadata(${cardId})`
      );

      await get().fetchCards();
    } catch (err) {
      console.error('Submit card failed:', err);
      throw err;
    }
  },

  createCardSet: async (cards, name) => {
    const { api, selectedAccount } = get();
    if (!api || !selectedAccount) return;

    try {
      const setTx = api.tx.OabCardRegistry.create_card_set({
        cards,
        name: Binary.fromText(name || ''),
      });
      await submitTx(setTx, selectedAccount.polkadotSigner, 'OabCardRegistry.create_card_set');
      await get().fetchSets();
    } catch (err) {
      console.error('Create card set failed:', err);
      throw err;
    }
  },

  createLocalAccount: async (name: string) => {
    const { api, accounts } = get();
    if (!api) return;

    // Generate new mnemonic and derive account
    const mnemonic = generateMnemonic();
    const account = deriveAccountFromMnemonic(mnemonic, name);

    // Persist to localStorage
    const stored = loadStoredLocalAccounts();
    stored.push({ name, mnemonic });
    saveStoredLocalAccounts(stored);

    // Add to accounts list
    const newAccounts = [...accounts, account];
    set({ accounts: newAccounts });

    // Fund the account and mint genesis style NFTs in a single batch
    try {
      const alice = getDevAccounts()[0];
      await fundAndMintStyleNfts(api, alice, account.address, name);
      console.log(`Funded and minted NFTs for local account ${name} (${account.address})`);
    } catch (err) {
      console.error('Failed to fund local account:', err);
    }

    // Auto-select the new account
    await get().selectAccount(account);
  },

  removeLocalAccount: (address: string) => {
    const { accounts, selectedAccount } = get();

    // Find the account to get its name for localStorage removal
    const accountToRemove = accounts.find((a) => a.address === address && a.source === 'local');
    if (!accountToRemove) return;

    // Remove from localStorage
    const stored = loadStoredLocalAccounts();
    const updated = stored.filter((s) => {
      const derived = deriveAccountFromMnemonic(s.mnemonic, s.name);
      return derived.address !== address;
    });
    saveStoredLocalAccounts(updated);

    // Remove from accounts list
    const newAccounts = accounts.filter((a) => !(a.address === address && a.source === 'local'));
    set({ accounts: newAccounts });

    // If the removed account was selected, switch to first account
    if (selectedAccount?.address === address) {
      const fallback = newAccounts[0] || null;
      set({ selectedAccount: fallback });
    }
  },

  fundSelectedAccount: async () => {
    const { api, selectedAccount } = get();
    if (!api || !selectedAccount) return;

    const alice = getDevAccounts()[0];
    const label = selectedAccount.name ?? selectedAccount.address.slice(0, 6);
    await fundAndMintStyleNfts(api, alice, selectedAccount.address, label);
  },

  getLocalAccountMnemonic: (address: string) => {
    const stored = loadStoredLocalAccounts();
    for (const s of stored) {
      const derived = deriveAccountFromMnemonic(s.mnemonic, s.name);
      if (derived.address === address) return s.mnemonic;
    }
    return null;
  },

  login: () => {
    const { selectedAccount } = get();
    if (selectedAccount) {
      set({ isLoggedIn: true });
      void storageService.writeString('oab-logged-in', selectedAccount.address);
    }
  },

  logout: () => {
    set({ isLoggedIn: false });
    void storageService.remove('oab-logged-in');
  },

  getAccountBalance: async (address: string) => {
    const { api } = get();
    if (!api) return BigInt(0);
    try {
      const acct = await api.query.System.Account.getValue(address);
      return acct?.data?.free ?? BigInt(0);
    } catch {
      return BigInt(0);
    }
  },
}));

// Genesis style NFT items (from cards/styles.json).
// Each entry: [collectionId, type, name, cid]
const GENESIS_STYLE_ITEMS: [number, string, string, string][] = [
  [0, 'avatar', 'Cosmic Elf', 'bafkreie47hbisockampzum46sebuwwcopkb5wovku7nksvkqgb2qmu6ggq'],
  [0, 'hand_bg', 'Cosmic Soil', 'bafybeicuqz6a4ejkrbv644lt5rxz6ha3oah22lrofkdnaxwk5lyt6kvdue'],
  [0, 'card_style', 'Cosmic Vines', 'bafkreieiwi6hgi7bgg4vw5pdpr6fqaxijktk42gd7cq443slztqvkazwmy'],
  [0, 'board_bg', 'Cosmic Tree', 'bafybeicdlpsvd2hk3bv5a3uakmcnlehp7nmhkgksvvusr66lbbla35ennu'],
  [0, 'card_art', 'Cosmic Cards', 'bafybeialdf7cqyadsw2i57s6f5vdjyggotdtmcjzu7jr2oyp2ejuvkmxfy'],
  [0, 'card_art', 'Kawaii Cards', 'bafybeibugexbiptjgnenqu5j3xbyia2rwlxeamb5va4y4v3qzwgqrdq6b4'],
  [0, 'card_art', 'Full Moon Cards', 'bafybeigjxpozflqt335k7izwl4m2hrjvrlmu3zqy6zd2tk43vuls62l5cu'],
  [1, 'theme', 'Cyberpunk', 'bafkreihqnb3ouk36t6x4eiv6bsjyzqwjhl4wfjcmr763v4o2mhdcmfp7vu'],
  [1, 'theme', 'Pastel', 'bafkreiaho64e3fazspquhr5glnhs4yi43bbuwptmhraij7tpdz2sj3kshm'],
];

/** Deterministic item ID for a given target address + style item. */
function styleItemId(
  targetAddress: string,
  collectionId: number,
  type: string,
  name: string
): number {
  const idSeed = targetAddress + collectionId + type + name;
  let hash = 0;
  for (let i = 0; i < idSeed.length; i++) {
    hash = ((hash << 5) - hash + idSeed.charCodeAt(i)) | 0;
  }
  return (Math.abs(hash) % 900000) + 100000; // 100000-999999 range (avoid genesis 0-4)
}

/** Fund an account and mint genesis style NFTs.
 *  Fund goes through Sudo (requires root). NFT mints are signed by Alice (collection admin). */
async function fundAndMintStyleNfts(
  api: any,
  alice: ReturnType<typeof getDevAccounts>[0],
  targetAddress: string,
  label: string
) {
  // 1. Fund via sudo
  const fundCall = api.tx.Balances.force_set_balance({
    who: { type: 'Id', value: targetAddress },
    new_free: BigInt(10_000_000_000_000),
  });
  const sudoTx = api.tx.Sudo.sudo({ call: fundCall.decodedCall });

  // 2. Create any missing collections (Alice as admin)
  const neededCollections = [...new Set(GENESIS_STYLE_ITEMS.map(([c]) => c))];
  for (const collectionId of neededCollections) {
    const existing = await api.query.Nfts.Collection.getValue(collectionId);
    if (!existing) {
      const createTx = api.tx.Nfts.create({
        admin: { type: 'Id', value: alice.address },
        config: {
          settings: 0n,
          max_supply: undefined,
          mint_settings: {
            mint_type: { type: 'Public' },
            price: undefined,
            start_block: undefined,
            end_block: undefined,
            default_item_settings: 0n,
          },
        },
      });
      await submitTx(createTx, alice.polkadotSigner, `Nfts.create(collection ${collectionId})`);
    }
  }

  // 3. Batch mint + set_metadata for each style item (signed by Alice as collection admin)
  const mintCalls: any[] = [];
  for (const [collectionId, type, name, cid] of GENESIS_STYLE_ITEMS) {
    const itemId = styleItemId(targetAddress, collectionId, type, name);
    mintCalls.push(
      api.tx.Nfts.mint({
        collection: collectionId,
        item: itemId,
        mint_to: { type: 'Id', value: targetAddress },
        witness_data: undefined,
      }).decodedCall
    );
    mintCalls.push(
      api.tx.Nfts.set_metadata({
        collection: collectionId,
        item: itemId,
        data: Binary.fromText(JSON.stringify({ type, name, image: `ipfs://${cid}` })),
      }).decodedCall
    );
  }

  const mintBatch = api.tx.Utility.batch_all({ calls: mintCalls });

  // Submit both: sudo fund first, then Alice-signed mint batch
  await submitTx(sudoTx, alice.polkadotSigner, `Sudo.sudo(fund ${label})`);
  await submitTx(mintBatch, alice.polkadotSigner, `Utility.force_batch(mint NFTs for ${label})`);
}
