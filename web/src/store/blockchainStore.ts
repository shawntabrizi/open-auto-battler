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
import { AccountId } from "@polkadot-api/substrate-bindings";

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

  // Actions
  connect: () => Promise<void>;
  selectAccount: (account: any) => Promise<void>;
  startGame: () => Promise<void>;
  refreshGameState: (force?: boolean) => Promise<void>;
  submitTurnOnChain: () => Promise<void>;
  fetchDeck: () => any[];
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

      if (get().selectedAccount) {
        await get().refreshGameState();
      }
    } catch (err) {
      console.error("Blockchain connection failed:", err);
      set({ isConnecting: false });
    }
  },

  selectAccount: async (account) => {
    // Wait for any pending refresh to complete before switching
    const { isRefreshing } = get();
    if (isRefreshing) {
      console.log("Waiting for current refresh to complete before switching accounts...");
      // Simple wait - in production you'd want a more robust solution
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    set({ selectedAccount: account });
    await get().refreshGameState();
  },

  refreshGameState: async (force = false) => {
    console.log("entering refresh game state");
    const { api, client, selectedAccount, isRefreshing, lastRefresh } = get();
    console.log({ api, selectedAccount, isRefreshing })
    if (!api || !selectedAccount || isRefreshing) return;
    console.log("entering refresh game state: past initial check");

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
        if (engine) {
          try {
            // Heartbeat check
            engine.is_ready();
            return engine;
          } catch (e) {
            console.warn(`Engine instance exists but is not ready yet (attempt ${i + 1}/10)...`);
          }
        }
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

            console.log("storage keys", { gameKey, cardSetKey });

            const gameRawHex = await client.rawQuery(gameKey);
            const cardSetRawHex = await client.rawQuery(cardSetKey);

            if (!gameRawHex || !cardSetRawHex) {
              throw new Error("Failed to fetch raw SCALE bytes from chain");
            }

            const gameRaw = Binary.fromHex(gameRawHex).asBytes();
            const cardSetRaw = Binary.fromHex(cardSetRawHex).asBytes();

            // 2. Send to WASM via SCALE bridge
            // Double check readiness right before call
            let ready = engine.is_ready();

            console.log("engine ready", { ready });
            engine.init_from_scale(gameRaw, cardSetRaw);

            console.log("engine initialized");


            // 3. Receive view and update store
            const view = engine.get_view();
            console.log("got view");

            const cardSet = engine.get_card_set();
            console.log("got card set");

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

  startGame: async () => {
    const { api, selectedAccount } = get();
    if (!api || !selectedAccount) return;

    try {
      // Start game with set_id 0 (Starter Set)
      const tx = api.tx.AutoBattle.start_game({ set_id: 0 });

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
      const action = codecs.tx.AutoBattle.submit_shop_phase.dec(actionRaw);
      console.log("Submitting turn action:", action);

      // Submit the action directly - PAPI handles the SCALE encoding
      // The action is now { actions: TurnAction[] }
      const tx = api.tx.AutoBattle.submit_shop_phase(action);

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
  }
}));
