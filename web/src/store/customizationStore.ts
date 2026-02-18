import { create } from 'zustand';
import { ipfsUrl } from '../utils/ipfs';

export type CustomizationType = 'board_bg' | 'hand_bg' | 'card_style' | 'avatar';

export interface NftItem {
  collectionId: number;
  itemId: number;
  type: CustomizationType;
  name: string;
  imageUrl: string; // resolved gateway URL
  ipfsCid: string;
  description?: string;
}

export interface CustomizationSelections {
  boardBackground: NftItem | null;
  handBackground: NftItem | null;
  cardStyle: NftItem | null;
  playerAvatar: NftItem | null;
}

interface CustomizationStore {
  ownedNfts: NftItem[];
  selections: CustomizationSelections;
  isLoading: boolean;

  fetchUserNfts: (api: any, accountAddress: string) => Promise<void>;
  selectCustomization: (type: CustomizationType, nft: NftItem | null, accountAddress?: string) => void;
  loadFromStorage: (accountAddress?: string) => void;
  clearSelections: (accountAddress?: string) => void;
}

const STORAGE_PREFIX = 'oab_customize_';

function getStorageKey(accountAddress?: string): string {
  return accountAddress ? `${STORAGE_PREFIX}${accountAddress}` : `${STORAGE_PREFIX}default`;
}

function saveToLocalStorage(selections: CustomizationSelections, accountAddress?: string) {
  try {
    const key = getStorageKey(accountAddress);
    localStorage.setItem(key, JSON.stringify(selections));
    // Also save to the default key so other modes can read it
    if (accountAddress) {
      localStorage.setItem(`${STORAGE_PREFIX}default`, JSON.stringify(selections));
    }
  } catch {
    // localStorage may be unavailable
  }
}

function loadFromLocalStorage(accountAddress?: string): CustomizationSelections | null {
  try {
    const key = getStorageKey(accountAddress);
    const data = localStorage.getItem(key);
    if (data) return JSON.parse(data);
    // Fallback to default key
    if (accountAddress) {
      const fallback = localStorage.getItem(`${STORAGE_PREFIX}default`);
      if (fallback) return JSON.parse(fallback);
    }
  } catch {
    // localStorage may be unavailable
  }
  return null;
}

const emptySelections: CustomizationSelections = {
  boardBackground: null,
  handBackground: null,
  cardStyle: null,
  playerAvatar: null,
};

const SLOT_MAP: Record<CustomizationType, keyof CustomizationSelections> = {
  board_bg: 'boardBackground',
  hand_bg: 'handBackground',
  card_style: 'cardStyle',
  avatar: 'playerAvatar',
};

export const useCustomizationStore = create<CustomizationStore>((set, get) => ({
  ownedNfts: [],
  selections: { ...emptySelections },
  isLoading: false,

  fetchUserNfts: async (api: any, accountAddress: string) => {
    if (!api || !accountAddress) return;
    set({ isLoading: true });

    try {
      // Query all items owned by this account from the Nfts pallet
      const entries = await api.query.Nfts.Account.getEntries(accountAddress);
      const nfts: NftItem[] = [];

      for (const entry of entries) {
        try {
          const collectionId = Number(entry.keyArgs[1]);
          const itemId = Number(entry.keyArgs[2]);

          // Fetch metadata for this item
          const metadata = await api.query.Nfts.ItemMetadataOf.getValue(collectionId, itemId);
          if (!metadata) continue;

          const metadataStr = typeof metadata.data === 'string'
            ? metadata.data
            : metadata.data?.asText?.() || '';

          if (!metadataStr) continue;

          const parsed = JSON.parse(metadataStr);
          const validTypes: CustomizationType[] = ['board_bg', 'hand_bg', 'card_style', 'avatar'];
          if (!validTypes.includes(parsed.type)) continue;

          nfts.push({
            collectionId,
            itemId,
            type: parsed.type as CustomizationType,
            name: parsed.name || `Item #${itemId}`,
            imageUrl: ipfsUrl(parsed.image || ''),
            ipfsCid: (parsed.image || '').replace('ipfs://', ''),
            description: parsed.description,
          });
        } catch {
          // Skip items with invalid metadata
        }
      }

      set({ ownedNfts: nfts, isLoading: false });
    } catch (err) {
      console.error('Failed to fetch user NFTs:', err);
      set({ isLoading: false });
    }
  },

  selectCustomization: (type, nft, accountAddress) => {
    const slotKey = SLOT_MAP[type];
    const selections = { ...get().selections, [slotKey]: nft };
    set({ selections });
    saveToLocalStorage(selections, accountAddress);
  },

  loadFromStorage: (accountAddress) => {
    const saved = loadFromLocalStorage(accountAddress);
    if (saved) {
      set({ selections: saved });
    }
  },

  clearSelections: (accountAddress) => {
    set({ selections: { ...emptySelections } });
    saveToLocalStorage({ ...emptySelections }, accountAddress);
  },
}));
