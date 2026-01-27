import { create } from 'zustand';
import { createClient } from 'polkadot-api';
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
  client: any;
  api: any;
  accounts: any[];
  selectedAccount: any | null;
  isConnected: boolean;
  isConnecting: boolean;
  chainState: any | null;
  blockNumber: number | null;

  connect: () => Promise<void>;
  selectAccount: (account: any) => void;
  startGame: () => Promise<void>;
  refreshGameState: () => Promise<void>;
  submitTurnOnChain: () => Promise<void>;
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

  selectAccount: (account) => {
    set({ selectedAccount: account });
    get().refreshGameState();
  },

  refreshGameState: async () => {
    const { api, selectedAccount } = get();
    if (!api || !selectedAccount) return;

    try {
      const game = await api.query.AutoBattle.ActiveGame.getValue(selectedAccount.address);
      set({ chainState: game });

      if (game) {
        // Sync local WASM engine with chain state
        const { engine } = useGameStore.getState();
        if (engine) {
          // Convert bounded state back to core state (this might need helper)
          // For now, we assume the engine can handle it if we pass it correctly
          // engine.set_state(game.state);
        }
      }
    } catch (err) {
      console.error("Failed to fetch game state:", err);
    }
  },

  startGame: async () => {
    const { api, selectedAccount } = get();
    if (!api || !selectedAccount) return;

    try {
      // Use current time as seed or something similar
      const seed = BigInt(Math.floor(Date.now() / 1000));
      const tx = api.tx.AutoBattle.start_game({ seed });

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
      const action = engine.get_commit_action();
      const tx = api.tx.AutoBattle.submit_shop_phase({ action });

      await tx.signAndSubmit(selectedAccount.polkadotSigner);
      await get().refreshGameState();

      // After submission, we might need to report battle outcome
      // For now, assume it's done or triggered manually
    } catch (err) {
      console.error("Submit turn failed:", err);
    }
  }
}));
