import { create } from 'zustand';
import { createClient, Binary, getTypedCodecs } from 'polkadot-api';
import { getWsProvider } from 'polkadot-api/ws-provider';
import { withPolkadotSdkCompat } from 'polkadot-api/polkadot-sdk-compat';
import { getInjectedExtensions, connectInjectedExtension } from 'polkadot-api/pjs-signer';
import { injectSpektrExtension, createPapiProvider, createAccountsProvider } from '@novasamatech/product-sdk';
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
import { submitTx } from '../utils/tx';
import { useSettingsStore } from './settingsStore';

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

function deriveLocalBattleSeed(
  blockNumber: number | null,
  setId: number,
  round: number,
  wins: number,
  lives: number
): number {
  const seed = ((blockNumber ?? 1) ^ (setId << 16) ^ (round << 8) ^ (wins << 4) ^ lives) >>> 0;
  return seed === 0 ? 1 : seed;
}

function nextXorShift32(seed: number): number {
  let x = seed >>> 0;
  if (x === 0) x = 1;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x >>> 0;
}

function bracketDistance(
  candidate: { round: number; wins: number; lives: number },
  target: { round: number; wins: number; lives: number }
): number {
  return (
    Math.abs(candidate.round - target.round) * 100 +
    Math.abs(candidate.wins - target.wins) * 10 +
    Math.abs(candidate.lives - target.lives) * 5
  );
}

function normalizeGhostBoard(ghost: any): any[] {
  const board = ghost?.board ?? ghost;
  const rawUnits = Array.isArray(board) ? board : board?.units || [];

  return rawUnits.map((unit: any) => ({
    card_id:
      typeof unit.card_id === 'number' ? unit.card_id : Number(unit.card_id?.value ?? unit.card_id),
    perm_attack:
      typeof unit.perm_attack === 'number' ? unit.perm_attack : Number(unit.perm_attack || 0),
    perm_health:
      typeof unit.perm_health === 'number' ? unit.perm_health : Number(unit.perm_health || 0),
  }));
}

function collectGhostCandidates(entries: any[], setId: number) {
  return entries
    .map((entry: any) => {
      const [entrySetId, round, wins, lives] = entry.keyArgs.map((value: any) => Number(value));
      const ghosts = Array.isArray(entry.value) ? entry.value : entry.value ? [entry.value] : [];

      return {
        setId: entrySetId,
        round,
        wins,
        lives,
        ghosts,
      };
    })
    .filter((entry: any) => entry.setId === setId && entry.ghosts.length > 0);
}

interface ArenaStore {
  // Connection state
  client: any;
  api: any;
  codecs: any;
  isConnected: boolean;
  isConnecting: boolean;
  connectionError: string | null;

  // Account state
  accounts: any[];
  selectedAccount: any;
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
  selectAccount: (account: any) => Promise<void>;
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

/** Convert raw public key bytes to SS58 address (generic substrate prefix 42). */
const toSs58 = (publicKey: Uint8Array): string => AccountId(42).dec(publicKey);

const LOCAL_ACCOUNTS_KEY = 'oab-local-accounts';

interface StoredLocalAccount {
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
  storageService.writeJSON(LOCAL_ACCOUNTS_KEY, accounts);
}

function deriveAccountFromMnemonic(mnemonic: string, name: string) {
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

function getLocalAccounts() {
  return loadStoredLocalAccounts().map((stored) =>
    deriveAccountFromMnemonic(stored.mnemonic, stored.name)
  );
}

const SHOW_DEV_ACCOUNTS = false;
const DEV_ACCOUNTS = ['Alice', 'Bob', 'Charlie', 'Dave', 'Eve', 'Ferdie'];

export const getDevAccounts = () => {
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

      if (isInHost()) {
        // In host mode, discover genesis hash via WS (allowed in sandbox),
        // then route through host's shared connection for efficiency.
        try {
          const tempClient = createClient(wsProvider);
          const chainSpec = await tempClient.getChainSpecData();
          tempClient.destroy();
          const provider = createPapiProvider(
            chainSpec.genesisHash as `0x${string}`,
            wsProvider // fallback if host doesn't support this chain
          );
          client = createClient(provider);
        } catch (e) {
          console.warn('Host provider setup failed, falling back to WS:', e);
          client = createClient(wsProvider);
        }
      } else {
        client = createClient(wsProvider);
      }

      // Subscribe to best blocks — first block confirms connection is live
      client.bestBlocks$.subscribe((blocks: any[]) => {
        if (blocks.length > 0) {
          set({
            blockNumber: blocks[0].number,
            isConnected: true,
            isConnecting: false,
            connectionError: null,
          });
        }
      });

      const api = client.getTypedApi(auto_battle);
      const codecs = await getTypedCodecs(auto_battle);
      const cardDataCoercer = await createCallArgCoercer(
        auto_battle,
        'AutoBattle',
        'submit_card',
        'card_data'
      );

      let allAccounts: any[] = [];

      if (isInHost()) {
        // Host mode: use host-managed accounts, suppress dev/local accounts
        try {
          await injectSpektrExtension();
        } catch {}

        // Get accounts from host via createAccountsProvider
        try {
          const accountsProvider = createAccountsProvider();
          const result = await accountsProvider.getNonProductAccounts();
          if (result.isOk()) {
            const hostAccounts = result.value.map((acct: any) => ({
              address: toSs58(acct.publicKey),
              name: acct.name || 'Host Account',
              polkadotSigner: accountsProvider.getNonProductAccountSigner(acct),
              source: 'host' as const,
            }));
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
              allAccounts = [...allAccounts, ...pjs.getAccounts()];
            } catch {}
          }
        } catch {}
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
              allAccounts = [...allAccounts, ...pjs.getAccounts()];
            } catch (extErr) {
              console.warn(`Failed to connect extension "${ext}":`, extErr);
            }
          }
        } catch (walletErr) {
          console.warn('Wallet extensions not available:', walletErr);
        }
      }

      set({
        client,
        api,
        codecs,
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
    set({ selectedAccount: account });
    // Fetch achievements for the new account
    const { api } = get();
    if (api && account) {
      const { useAchievementStore } = await import('./achievementStore');
      useAchievementStore.getState().fetchAchievements(api, account.address);
    }
    await get().refreshGameState(true);
  },

  refreshGameState: async (force = false) => {
    const { api, client, selectedAccount, isRefreshing, lastRefresh } = get();
    if (!api || !selectedAccount || isRefreshing) return;

    // Throttle refreshes unless forced (e.g. 500ms cooldown)
    const now = Date.now();
    if (!force && now - lastRefresh < 500) {
      console.log('Refresh throttled...');
      return;
    }

    set({ isRefreshing: true, lastRefresh: now });

    // Internal helper to wait for engine to be ready
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
      const game = await api.query.AutoBattle.ActiveGame.getValue(selectedAccount.address);
      set({ chainState: game });

      if (game) {
        // Sync local WASM engine with chain state
        const engine = await waitForEngine();

        if (engine) {
          console.log('On-chain game found. Syncing WASM engine via SCALE bytes...');
          try {
            const { allCards } = get();
            injectCardsIntoEngine(engine, allCards);

            // 2. Fetch raw SCALE bytes from the blockchain
            const gameKey = await api.query.AutoBattle.ActiveGame.getKey(selectedAccount.address);
            const cardSetKey = await api.query.AutoBattle.CardSets.getKey(game.set_id);

            const gameRawHex = await client.rawQuery(gameKey);
            const cardSetRawHex = await client.rawQuery(cardSetKey);

            if (!gameRawHex || !cardSetRawHex) {
              throw new Error('Failed to fetch raw SCALE bytes from chain');
            }

            const gameRaw = Binary.fromHex(gameRawHex).asBytes();
            const cardSetRaw = Binary.fromHex(cardSetRawHex).asBytes();

            // 3. Send to WASM via SCALE bridge
            engine.init_from_scale(gameRaw, cardSetRaw);

            // 4. Receive view and update store
            const view = engine.get_view();
            const cardSet = engine.get_card_set();

            console.log('WASM engine synced successfully via SCALE bytes. View:', view);
            const existingNames = useGameStore.getState().cardNameMap;
            useGameStore.setState({
              view,
              cardSet,
              currentSetId: Number(game.set_id),
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
    const { api, selectedAccount } = get();
    if (!api || !selectedAccount) return;

    try {
      // Start game with selected set_id
      const tx = api.tx.AutoBattle.start_game({ set_id });

      await submitTx(tx, selectedAccount.polkadotSigner, `AutoBattle.start_game(set_id=${set_id})`);
      await get().refreshGameState();
    } catch (err) {
      console.error('Start game failed:', err);
    }
  },

  submitTurnOnChain: async () => {
    const { api, codecs, selectedAccount } = get();
    const { engine } = useGameStore.getState();
    if (!api || !codecs || !selectedAccount || !engine) return;

    try {
      // Capture player board BEFORE submitting (chain will modify state)
      const playerBoard = engine.get_board();

      // Get commit action from engine and decode via SCALE
      const actionRaw = engine.get_commit_action_scale();
      const action = codecs.tx.AutoBattle.submit_turn.dec(actionRaw);

      // Submit the turn - this runs shop actions + battle on-chain
      const tx = api.tx.AutoBattle.submit_turn(action);
      const txResult = await submitTx(tx, selectedAccount.polkadotSigner, 'AutoBattle.submit_turn');

      // Extract BattleReported event from transaction result
      // PAPI events: e.type is pallet name, e.value.type is event variant
      const battleEvent = txResult.events.find(
        (e: any) => e.type === 'AutoBattle' && e.value?.type === 'BattleReported'
      );

      if (battleEvent) {
        const { battle_seed, opponent_board, result: chainResult } = battleEvent.value.value;

        // Convert opponent ghost board units to the format resolve_battle_p2p expects
        // PAPI decodes BoundedGhostBoard as a flat array (not {units: [...]})
        const rawUnits = Array.isArray(opponent_board)
          ? opponent_board
          : opponent_board?.units || [];
        const opponentUnits = rawUnits.map((u: any) => ({
          card_id:
            typeof u.card_id === 'number' ? u.card_id : Number(u.card_id?.value ?? u.card_id),
          perm_attack:
            typeof u.perm_attack === 'number' ? u.perm_attack : Number(u.perm_attack || 0),
          perm_health:
            typeof u.perm_health === 'number' ? u.perm_health : Number(u.perm_health || 0),
        }));

        // Replay battle locally with the chain's seed and opponent
        const battleOutput = engine.resolve_battle_p2p(
          playerBoard,
          opponentUnits,
          BigInt(battle_seed)
        );

        // Verify local result matches chain result
        if (battleOutput?.events) {
          const localEndEvent = battleOutput.events.find((e: any) => e.type === 'BattleEnd');
          const localResult = localEndEvent?.payload?.result;
          const chainResultStr =
            typeof chainResult === 'string'
              ? chainResult
              : (chainResult?.type ?? String(chainResult));

          if (localResult && localResult !== chainResultStr) {
            console.warn(`Battle result mismatch! Chain: ${chainResultStr}, Local: ${localResult}`);
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
      } else {
        // No battle event found — fall back to refresh
        console.warn('No BattleReported event found in tx result');
        await get().refreshGameState(true);
      }
    } catch (err) {
      console.error('Submit turn failed:', err);
    }
  },

  endGame: async () => {
    const { api, selectedAccount } = get();
    if (!api || !selectedAccount) return;

    try {
      const tx = api.tx.AutoBattle.end_game({});
      await submitTx(tx, selectedAccount.polkadotSigner, 'Saving Results');
      set({ chainState: null });
    } catch (err) {
      console.error('End game failed:', err);
    }
  },

  abandonGame: async () => {
    const { api, selectedAccount } = get();
    if (!api || !selectedAccount) {
      throw new Error('Blockchain account is not ready');
    }

    try {
      const tx = api.tx.AutoBattle.abandon_game({});
      await submitTx(tx, selectedAccount.polkadotSigner, 'AutoBattle.abandon_game');
      set({ chainState: null });
      useGameStore.getState().resetActiveSessionView();
    } catch (err) {
      console.error('Abandon game failed:', err);
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
      const cardEntries = await api.query.AutoBattle.UserCards.getEntries();
      const metadataEntries = await api.query.AutoBattle.CardMetadataStore.getEntries();

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
      const setEntries = await api.query.AutoBattle.CardSets.getEntries();

      // Fetch set metadata
      let metadataMap = new Map<number, string>();
      try {
        const metaEntries = await api.query.AutoBattle.CardSetMetadataStore.getEntries();
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
    const { api, blockNumber } = get();
    if (!api) return null;

    const targetBracket = { round, wins, lives };
    try {
      let poolEntries: any[] = [];
      try {
        poolEntries = await api.query.AutoBattle.GhostOpponents.getEntries(setId);
      } catch {
        poolEntries = await api.query.AutoBattle.GhostOpponents.getEntries();
      }

      let candidates = collectGhostCandidates(poolEntries, setId);

      if (candidates.length === 0) {
        try {
          let archiveEntries: any[] = [];
          try {
            archiveEntries = await api.query.AutoBattle.GhostArchive.getEntries(setId);
          } catch {
            archiveEntries = await api.query.AutoBattle.GhostArchive.getEntries();
          }
          candidates = collectGhostCandidates(archiveEntries, setId);
        } catch {
          // Ghost archive support is optional for local opponent selection.
        }
      }

      const selectedBracket = [...candidates].sort(
        (a, b) => bracketDistance(a, targetBracket) - bracketDistance(b, targetBracket)
      )[0];

      if (!selectedBracket) {
        return null;
      }

      const seed = deriveLocalBattleSeed(blockNumber, setId, round, wins, lives);
      const index = nextXorShift32(seed) % selectedBracket.ghosts.length;
      const board = normalizeGhostBoard(selectedBracket.ghosts[index]);

      if (board.length === 0) {
        return null;
      }

      return { board, seed };
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
      const cardTx = api.tx.AutoBattle.submit_card({ card_data: cardDataForChain });
      await submitTx(cardTx, selectedAccount.polkadotSigner, 'AutoBattle.submit_card');

      // We need to wait for the card to be indexed to get the ID,
      // but for simplicity in this prototype, we'll just fetch next card ID
      const nextId = await api.query.AutoBattle.NextUserCardId.getValue();
      const cardId = Number(nextId) - 1;

      // 2. Set metadata
      const metaTx = api.tx.AutoBattle.set_card_metadata({
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
        `AutoBattle.set_card_metadata(${cardId})`
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
      const setTx = api.tx.AutoBattle.create_card_set({
        cards,
        name: Binary.fromText(name || ''),
      });
      await submitTx(setTx, selectedAccount.polkadotSigner, 'AutoBattle.create_card_set');
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
      storageService.writeString('oab-logged-in', selectedAccount.address);
    }
  },

  logout: () => {
    set({ isLoggedIn: false });
    storageService.remove('oab-logged-in');
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
function styleItemId(targetAddress: string, collectionId: number, type: string, name: string): number {
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
