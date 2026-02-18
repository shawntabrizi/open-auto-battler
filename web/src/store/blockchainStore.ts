import { create } from 'zustand';
import { createClient, Binary, getTypedCodecs } from 'polkadot-api';
import { getWsProvider } from 'polkadot-api/ws-provider';
import { withPolkadotSdkCompat } from 'polkadot-api/polkadot-sdk-compat';
import { getInjectedExtensions, connectInjectedExtension } from 'polkadot-api/pjs-signer';
import { auto_battle } from '@polkadot-api/descriptors';
import { useGameStore } from './gameStore';
import { sr25519CreateDerive } from '@polkadot-labs/hdkd';
import { DEV_PHRASE, entropyToMiniSecret, mnemonicToEntropy } from '@polkadot-labs/hdkd-helpers';
import { getPolkadotSigner } from 'polkadot-api/signer';
import { AccountId } from '@polkadot-api/substrate-bindings';
import { createCallArgCoercer } from '../utils/papiCoercion';
import { initEmojiMap } from '../utils/emoji';

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

/** Convert Binary/BoundedVec<u8> to string */
function binaryToStr(v: any): string {
  if (typeof v === 'string') return v;
  return v?.asText?.() || '';
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
    name: binaryToStr(a.name),
    description: binaryToStr(a.description),
    conditions: (a.conditions || []).map(convertCondition),
    max_triggers: a.max_triggers ?? null,
  };
}

interface BlockchainStore {
  // Connection state
  client: any;
  api: any;
  codecs: any;
  isConnected: boolean;
  isConnecting: boolean;

  // Account state
  accounts: any[];
  selectedAccount: any;

  // Game state
  chainState: any;
  blockNumber: number | null;
  isRefreshing: boolean;
  lastRefresh: number;
  allCards: any[];
  availableSets: any[];

  // Actions
  connect: () => Promise<void>;
  selectAccount: (account: any) => Promise<void>;
  startGame: (set_id?: number) => Promise<void>;
  refreshGameState: (force?: boolean) => Promise<void>;
  submitTurnOnChain: () => Promise<void>;
  fetchDeck: () => any[];
  fetchCards: () => Promise<void>;
  fetchSets: () => Promise<void>;
  submitCard: (cardData: any, metadata: any) => Promise<void>;
  createCardSet: (cards: { card_id: number; rarity: number }[], name?: string) => Promise<void>;

  // Internal helpers
  cardDataCoercer?: ((value: unknown) => any) | null;
}

const DEV_ACCOUNTS = ['Alice', 'Bob', 'Charlie', 'Dave', 'Eve', 'Ferdie'];

const getDevAccounts = () => {
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

export const useBlockchainStore = create<BlockchainStore>((set, get) => ({
  // Connection state
  client: null,
  api: null,
  codecs: null,
  isConnected: false,
  isConnecting: false,

  // Account state
  accounts: [],
  selectedAccount: null,

  // Game state
  chainState: null,
  blockNumber: null,
  isRefreshing: false,
  lastRefresh: 0,

  connect: async () => {
    set({ isConnecting: true });
    try {
      const client = createClient(withPolkadotSdkCompat(getWsProvider('ws://127.0.0.1:9944')));

      // Subscribe to best blocks to show block number
      client.bestBlocks$.subscribe((blocks) => {
        if (blocks.length > 0) {
          set({ blockNumber: blocks[0].number });
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

      const devAccounts = getDevAccounts();
      let allAccounts: any[] = [...devAccounts];

      set({
        client,
        api,
        codecs,
        isConnected: true,
        isConnecting: false,
        accounts: allAccounts,
        selectedAccount: allAccounts[0],
        cardDataCoercer,
      });

      // Try to connect wallet extension (non-blocking)
      try {
        const extensions = getInjectedExtensions();
        if (extensions && extensions.length > 0) {
          const pjs = await connectInjectedExtension(extensions[0]);
          const pjsAccounts = pjs.getAccounts();
          allAccounts = [...allAccounts, ...pjsAccounts];
          set({
            accounts: allAccounts,
          });
        }
      } catch (walletErr) {
        console.warn('Wallet extension not available:', walletErr);
      }

      // Fetch available sets and cards
      await Promise.all([get().fetchSets(), get().fetchCards()]);

      if (get().selectedAccount) {
        await get().refreshGameState();
      }
    } catch (err) {
      console.error('Blockchain connection failed:', err);
      set({ isConnecting: false });
    }
  },

  selectAccount: async (account) => {
    set({ selectedAccount: account });
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
            // 1. Inject ALL cards from blockchain into the engine's card pool.
            //    This replaces any static genesis cards with the authoritative
            //    blockchain versions and adds any custom user-created cards.
            const { allCards } = get();
            for (const card of allCards) {
              try {
                engine.add_card({
                  id: card.id,
                  name: card.metadata?.name || `Card #${card.id}`,
                  stats: {
                    attack: card.data.stats.attack,
                    health: card.data.stats.health,
                  },
                  economy: {
                    play_cost: card.data.economy.play_cost,
                    pitch_value: card.data.economy.pitch_value,
                  },
                  abilities: card.data.abilities.map(convertAbility),
                });
              } catch (e) {
                console.warn(`Failed to inject card ${card.id} into engine:`, e);
              }
            }

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
            useGameStore.setState({ view, cardSet });
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

  startGame: async (set_id = 1) => {
    const { api, selectedAccount } = get();
    if (!api || !selectedAccount) return;

    try {
      // Start game with selected set_id
      const tx = api.tx.AutoBattle.start_game({ set_id });

      await tx.signAndSubmit(selectedAccount.polkadotSigner);
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
      const txResult = await tx.signAndSubmit(selectedAccount.polkadotSigner);

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
          card_id: typeof u.card_id === 'number' ? u.card_id : Number(u.card_id),
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
          showBattleOverlay: true,
          afterBattleCallback: () => get().refreshGameState(true),
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

  /**
   * Fetch the full deck/bag from the WASM engine (Cold Path - on demand only)
   * Use sparingly as this includes all card data.
   */
  fetchDeck: () => {
    const { engine } = useGameStore.getState();
    if (!engine) {
      console.warn('WASM engine not ready, cannot fetch deck.');
      return [];
    }

    try {
      const bag = engine.get_bag();
      console.log('Fetched full deck IDs from WASM:', bag.length, 'cards');
      return bag;
    } catch (e) {
      console.error('Failed to fetch deck:', e);
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

      // Inject sets into the WASM engine so preview/load works for blockchain sets
      const { engine } = useGameStore.getState();
      if (engine) {
        for (const s of sets) {
          try {
            const entries = s.cards.map((c: any) => ({
              card_id: typeof c.card_id === 'object' ? c.card_id.value ?? c.card_id[0] : c.card_id,
              rarity: c.rarity,
            }));
            engine.add_set(s.id, entries);
          } catch (e) {
            console.warn(`Failed to inject set ${s.id} into engine:`, e);
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch sets:', err);
    }
  },

  submitCard: async (cardData, metadata) => {
    const { api, selectedAccount, cardDataCoercer } = get();
    if (!api || !selectedAccount) return;

    try {
      const cardDataForChain = cardDataCoercer ? cardDataCoercer(cardData) : cardData;

      // 1. Submit the card data
      const submitTx = api.tx.AutoBattle.submit_card({ card_data: cardDataForChain });
      await submitTx.signAndSubmit(selectedAccount.polkadotSigner);

      // We need to wait for the card to be indexed to get the ID,
      // but for simplicity in this prototype, we'll just fetch next card ID
      const nextId = await api.query.AutoBattle.NextUserCardId.getValue();
      const cardId = Number(nextId) - 1;

      // 2. Set metadata
      const metadataTx = api.tx.AutoBattle.set_card_metadata({
        card_id: cardId,
        metadata: {
          name: Binary.fromText(metadata.name),
          emoji: Binary.fromText(metadata.emoji),
          description: Binary.fromText(metadata.description),
        },
      });
      await metadataTx.signAndSubmit(selectedAccount.polkadotSigner);

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
      const tx = api.tx.AutoBattle.create_card_set({
        cards,
        name: Binary.fromText(name || ''),
      });
      await tx.signAndSubmit(selectedAccount.polkadotSigner);
      await get().fetchSets();
    } catch (err) {
      console.error('Create card set failed:', err);
      throw err;
    }
  },
}));
