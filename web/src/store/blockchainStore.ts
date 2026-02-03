import { create } from 'zustand';
import { createClient, Binary, getTypedCodecs } from 'polkadot-api';
import { getWsProvider } from 'polkadot-api/ws-provider';
import { withPolkadotSdkCompat } from 'polkadot-api/polkadot-sdk-compat';
import { getInjectedExtensions, connectInjectedExtension } from 'polkadot-api/pjs-signer';
import { auto_battle } from '@polkadot-api/descriptors';
import { useGameStore } from './gameStore';
import { sr25519CreateDerive } from "@polkadot-labs/hdkd"
import {
  DEV_PHRASE,
  entropyToMiniSecret,
  mnemonicToEntropy,
} from "@polkadot-labs/hdkd-helpers"
import { getPolkadotSigner } from "polkadot-api/signer"
import { AccountId, Enum } from "@polkadot-api/substrate-bindings";
import type {
  Ability,
  AbilityEffect,
  AbilityTarget,
  AbilityTrigger,
  CompareOp,
  Condition,
  Matcher,
  SortOrder,
  StatType,
  TargetScope,
} from "../types";

interface BlockchainStore {
  // Connection state
  client: any;
  api: any;
  codecs: any;
  isConnected: boolean;
  isConnecting: boolean;

  // Account state
  accounts: any[];
  selectedAccount: any | null;

  // Game state
  chainState: any | null;
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
  createCardSet: (cards: { card_id: number, rarity: number }[]) => Promise<void>;
}

const DEV_ACCOUNTS = ["Alice", "Bob", "Charlie", "Dave", "Eve", "Ferdie"];

const getDevAccounts = () => {
  const miniSecret = entropyToMiniSecret(mnemonicToEntropy(DEV_PHRASE));
  const derive = sr25519CreateDerive(miniSecret);
  const accountId = AccountId(42);

  return DEV_ACCOUNTS.map(name => {
    const hdkdKeyPair = derive(`//${name}`);
    const address = accountId.dec(hdkdKeyPair.publicKey);
    const polkadotSigner = getPolkadotSigner(
      hdkdKeyPair.publicKey,
      "Sr25519",
      hdkdKeyPair.sign,
    );

    return {
      address,
      name,
      polkadotSigner,
      source: 'dev'
    };
  });
};

const toChainTargetScope = (scope: TargetScope) => Enum(scope);
const toChainStatType = (stat: StatType) => Enum(stat);
const toChainSortOrder = (order: SortOrder) => Enum(order);
const toChainCompareOp = (op: CompareOp) => Enum(op);

const toChainMatcher = (matcher: Matcher): any => {
  switch (matcher.type) {
    case "StatValueCompare":
      return Enum("StatValueCompare", {
        scope: toChainTargetScope(matcher.data.scope),
        stat: toChainStatType(matcher.data.stat),
        op: toChainCompareOp(matcher.data.op),
        value: matcher.data.value,
      });
    case "StatStatCompare":
      return Enum("StatStatCompare", {
        source_stat: toChainStatType(matcher.data.source_stat),
        op: toChainCompareOp(matcher.data.op),
        target_scope: toChainTargetScope(matcher.data.target_scope),
        target_stat: toChainStatType(matcher.data.target_stat),
      });
    case "UnitCount":
      return Enum("UnitCount", {
        scope: toChainTargetScope(matcher.data.scope),
        op: toChainCompareOp(matcher.data.op),
        value: matcher.data.value,
      });
    case "IsPosition":
      return Enum("IsPosition", {
        scope: toChainTargetScope(matcher.data.scope),
        index: matcher.data.index,
      });
    default:
      return matcher as never;
  }
};

const toChainCondition = (condition: Condition): any => {
  switch (condition.type) {
    case "Is":
      return Enum("Is", toChainMatcher(condition.data));
    case "AnyOf":
      return Enum("AnyOf", condition.data.map(toChainMatcher));
    default:
      return condition as never;
  }
};

const toChainAbilityTarget = (target: AbilityTarget): any => {
  switch (target.type) {
    case "Position":
      return Enum("Position", {
        scope: toChainTargetScope(target.data.scope),
        index: target.data.index,
      });
    case "Adjacent":
      return Enum("Adjacent", {
        scope: toChainTargetScope(target.data.scope),
      });
    case "Random":
      return Enum("Random", {
        scope: toChainTargetScope(target.data.scope),
        count: target.data.count,
      });
    case "Standard":
      return Enum("Standard", {
        scope: toChainTargetScope(target.data.scope),
        stat: toChainStatType(target.data.stat),
        order: toChainSortOrder(target.data.order),
        count: target.data.count,
      });
    case "All":
      return Enum("All", {
        scope: toChainTargetScope(target.data.scope),
      });
    default:
      return target as never;
  }
};

const toChainAbilityEffect = (effect: AbilityEffect): any => {
  switch (effect.type) {
    case "Damage":
      return Enum("Damage", {
        amount: effect.amount,
        target: toChainAbilityTarget(effect.target),
      });
    case "ModifyStats":
      return Enum("ModifyStats", {
        health: effect.health,
        attack: effect.attack,
        target: toChainAbilityTarget(effect.target),
      });
    case "SpawnUnit":
      return Enum("SpawnUnit", {
        template_id: Binary.fromText(effect.template_id),
      });
    case "Destroy":
      return Enum("Destroy", {
        target: toChainAbilityTarget(effect.target),
      });
    default:
      return effect as never;
  }
};

const toChainAbilityTrigger = (trigger: AbilityTrigger) => Enum(trigger);

const toChainAbility = (ability: Ability): any => ({
  trigger: toChainAbilityTrigger(ability.trigger),
  effect: toChainAbilityEffect(ability.effect),
  name: Binary.fromText(ability.name),
  description: Binary.fromText(ability.description),
  conditions: ability.conditions.map(toChainCondition),
  max_triggers: ability.max_triggers,
});

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
      const client = createClient(
        withPolkadotSdkCompat(
          getWsProvider('ws://127.0.0.1:9944')
        )
      );

      // Subscribe to best blocks to show block number
      client.bestBlocks$.subscribe((blocks) => {
        if (blocks.length > 0) {
          set({ blockNumber: blocks[0].number });
        }
      });

      const api = client.getTypedApi(auto_battle);
      const codecs = await getTypedCodecs(auto_battle);

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
        console.warn("Wallet extension not available:", walletErr);
      }

      // Fetch available sets and cards
      await Promise.all([
        get().fetchSets(),
        get().fetchCards(),
      ]);

      if (get().selectedAccount) {
        await get().refreshGameState();
      }
    } catch (err) {
      console.error("Blockchain connection failed:", err);
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
      console.log("Refresh throttled...");
      return;
    }

    set({ isRefreshing: true, lastRefresh: now });

    // Internal helper to wait for engine to be ready
    const waitForEngine = async (maxRetries = 10): Promise<any> => {
      for (let i = 0; i < maxRetries; i++) {
        const { engine } = useGameStore.getState();
        if (engine) return engine;
        await new Promise(resolve => setTimeout(resolve, 100));
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
          console.log("On-chain game found. Syncing WASM engine via SCALE bytes...");
          try {
            // 1. Fetch raw SCALE bytes from the blockchain
            const gameKey = await api.query.AutoBattle.ActiveGame.getKey(selectedAccount.address);
            const cardSetKey = await api.query.AutoBattle.CardSets.getKey(game.set_id);

            const gameRawHex = await client.rawQuery(gameKey);
            const cardSetRawHex = await client.rawQuery(cardSetKey);

            if (!gameRawHex || !cardSetRawHex) {
              throw new Error("Failed to fetch raw SCALE bytes from chain");
            }

            const gameRaw = Binary.fromHex(gameRawHex).asBytes();
            const cardSetRaw = Binary.fromHex(cardSetRawHex).asBytes();

            // 2. Send to WASM via SCALE bridge
            engine.init_from_scale(gameRaw, cardSetRaw);

            // 3. Receive view and update store
            const view = engine.get_view();
            const cardSet = engine.get_card_set();

            console.log("WASM engine synced successfully via SCALE bytes. View:", view);
            useGameStore.setState({ view, cardSet });
          } catch (e) {
            console.error("Failed to sync engine with chain state via SCALE:", e);
          }
        } else {
          console.warn("WASM engine timed out or is not ready, skipping sync.");
        }
      } else {
        console.log("No active game found on-chain for this account.");
      }
    } catch (err) {
      console.error("Failed to fetch game state:", err);
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

      await tx.signAndSubmit(selectedAccount.polkadotSigner);
      await get().refreshGameState();
    } catch (err) {
      console.error("Start game failed:", err);
    }
  },

  submitTurnOnChain: async () => {
    const { api, codecs, selectedAccount } = get();
    const { engine } = useGameStore.getState();
    if (!api || !codecs || !selectedAccount || !engine) return;

    try {
      // Get commit action from engine and decode via SCALE
      const actionRaw = engine.get_commit_action_scale();
      const action = codecs.tx.AutoBattle.submit_turn.dec(actionRaw);
      console.log("Submitting turn action:", action);

      // Submit the turn - this runs shop actions + battle on-chain
      const tx = api.tx.AutoBattle.submit_turn(action);

      await tx.signAndSubmit(selectedAccount.polkadotSigner);
      await get().refreshGameState();

      // After submission, we might need to report battle outcome
      // For now, assume it's done or triggered manually
    } catch (err) {
      console.error("Submit turn failed:", err);
    }
  },

  /**
   * Fetch the full deck/bag from the WASM engine (Cold Path - on demand only)
   * Use sparingly as this includes all card data.
   */
  fetchDeck: () => {
    const { engine } = useGameStore.getState();
    if (!engine) {
      console.warn("WASM engine not ready, cannot fetch deck.");
      return [];
    }

    try {
      const bag = engine.get_bag();
      console.log("Fetched full deck IDs from WASM:", bag.length, "cards");
      return bag;
    } catch (e) {
      console.error("Failed to fetch deck:", e);
      return [];
    }
  },

  allCards: [],
  availableSets: [],

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
          creator: entry.value.creator
        });
      });

      const cards = cardEntries.map((entry: any) => {
        const id = Number(entry.keyArgs[0]);
        const metadata = metadataMap.get(id);
        return {
          id,
          data: entry.value,
          metadata: metadata || { name: `Card #${id}`, emoji: '❓', description: '' },
          creator: metadata?.creator
        };
      });

      set({ allCards: cards });
    } catch (err) {
      console.error("Failed to fetch cards:", err);
    }
  },

  fetchSets: async () => {
    const { api } = get();
    if (!api) return;

    try {
      const setEntries = await api.query.AutoBattle.CardSets.getEntries();
      const sets = setEntries.map((entry: any) => ({
        id: Number(entry.keyArgs[0]),
        cards: entry.value
      }));
      set({ availableSets: sets });
    } catch (err) {
      console.error("Failed to fetch sets:", err);
    }
  },

  submitCard: async (cardData, metadata) => {
    const { api, selectedAccount } = get();
    if (!api || !selectedAccount) return;

    try {
      const cardDataForChain = {
        stats: cardData.stats,
        economy: cardData.economy,
        abilities: cardData.abilities.map(toChainAbility),
      };

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
          description: Binary.fromText(metadata.description)
        }
      });
      await metadataTx.signAndSubmit(selectedAccount.polkadotSigner);

      await get().fetchCards();
    } catch (err) {
      console.error("Submit card failed:", err);
      throw err;
    }
  },

  createCardSet: async (cards) => {
    const { api, selectedAccount } = get();
    if (!api || !selectedAccount) return;

    try {
      const tx = api.tx.AutoBattle.create_card_set({ cards });
      await tx.signAndSubmit(selectedAccount.polkadotSigner);
      await get().fetchSets();
    } catch (err) {
      console.error("Create card set failed:", err);
      throw err;
    }
  }
}));
