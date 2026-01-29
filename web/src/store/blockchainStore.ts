import { create } from 'zustand';
import { createClient, Binary } from 'polkadot-api';
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
import { wasmActionToChain } from '../utils/chainConvert';

interface BlockchainStore {
  client: any;
  api: any;
  accounts: any[];
  selectedAccount: any | null;
  isConnected: boolean;
  isConnecting: boolean;
  isRefreshing: boolean;
  chainState: any | null;
  blockNumber: number | null;

  connect: () => Promise<void>;
  selectAccount: (account: any) => Promise<void>;
  startGame: () => Promise<void>;
  refreshGameState: () => Promise<void>;
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
  client: null,
  api: null,
  accounts: [],
  selectedAccount: null,
  isConnected: false,
  isConnecting: false,
  isRefreshing: false,
  chainState: null,
  blockNumber: null,

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

      const devAccounts = getDevAccounts();
      let allAccounts: any[] = [...devAccounts];

      set({
        client,
        api,
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

  refreshGameState: async () => {
    const { api, client, selectedAccount, isRefreshing } = get();
    if (!api || !selectedAccount || isRefreshing) return;

    set({ isRefreshing: true });
    try {
      console.log(`Refreshing game state for ${selectedAccount.address}...`);
      const game = await api.query.AutoBattle.ActiveGame.getValue(selectedAccount.address);
      set({ chainState: game });

      if (game) {
        // Sync local WASM engine with chain state using Raw SCALE Bytes
        const { engine } = useGameStore.getState();
        if (engine) {
          console.log("On-chain game found. Syncing WASM engine via SCALE bytes...");
          try {
            // 1. Fetch raw SCALE bytes from the blockchain using storage keys
            const gameKey = await api.query.AutoBattle.ActiveGame.getKey(selectedAccount.address);
            const cardSetKey = await api.query.AutoBattle.CardSets.getKey(game.set_id);

            // Use low-level request to get raw storage values as hex strings
            const gameRawHex = await client.rawQuery(gameKey);
            const cardSetRawHex = await client.rawQuery(cardSetKey);

            if (!gameRawHex || !cardSetRawHex) {
              throw new Error("Failed to fetch raw SCALE bytes from chain");
            }

            // Convert hex strings to Uint8Array for WASM
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
          console.warn("WASM engine not ready yet, skipping sync.");
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
    const { api, selectedAccount } = get();
    const { engine } = useGameStore.getState();
    if (!api || !selectedAccount || !engine) return;

    try {
      // Get commit action from engine
      const action = engine.get_commit_action();

      // Convert WASM format to PAPI format (e.g. strings to Binary)
      const chainAction = wasmActionToChain(action);
      console.log({ action, chainAction });
      const tx = api.tx.AutoBattle.submit_shop_phase({ action: chainAction });

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
