import { create } from 'zustand';
import { ipfsUrl, fetchIpfsJson } from '../utils/ipfs';
import {
  sanitizeTheme,
  resolveTheme,
  type ThemeDefinition,
} from '../theme/themes';
import { useThemeStore } from './themeStore';

export type CustomizationType =
  | 'board_bg'
  | 'hand_bg'
  | 'card_style'
  | 'avatar'
  | 'card_art'
  | 'theme';

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
  cardArt: NftItem | null;
  theme: NftItem | null;
}

interface CustomizationStore {
  ownedNfts: NftItem[];
  selections: CustomizationSelections;
  isLoading: boolean;
  fetchUserNfts: (api: any, accountAddress: string) => Promise<void>;
  selectCustomization: (type: CustomizationType, nft: NftItem | null) => void;
  clearSelections: () => void;
}

const emptySelections: CustomizationSelections = {
  boardBackground: null,
  handBackground: null,
  cardStyle: null,
  playerAvatar: null,
  cardArt: null,
  theme: null,
};

const SLOT_MAP: Record<CustomizationType, keyof CustomizationSelections> = {
  board_bg: 'boardBackground',
  hand_bg: 'handBackground',
  card_style: 'cardStyle',
  avatar: 'playerAvatar',
  card_art: 'cardArt',
  theme: 'theme',
};

function nftKey(nft: NftItem | null): string | null {
  if (!nft) return null;
  return `${nft.collectionId}-${nft.itemId}`;
}

function filterSelectionsByOwnership(
  selections: CustomizationSelections,
  ownedNfts: NftItem[]
): CustomizationSelections {
  const ownedKeys = new Set(ownedNfts.map((nft) => nftKey(nft)));

  return {
    boardBackground: ownedKeys.has(nftKey(selections.boardBackground))
      ? selections.boardBackground
      : null,
    handBackground: ownedKeys.has(nftKey(selections.handBackground))
      ? selections.handBackground
      : null,
    cardStyle: ownedKeys.has(nftKey(selections.cardStyle)) ? selections.cardStyle : null,
    playerAvatar: ownedKeys.has(nftKey(selections.playerAvatar)) ? selections.playerAvatar : null,
    cardArt: ownedKeys.has(nftKey(selections.cardArt)) ? selections.cardArt : null,
    theme: ownedKeys.has(nftKey(selections.theme)) ? selections.theme : null,
  };
}

async function fetchAndApplyTheme(nft: NftItem): Promise<void> {
  try {
    const json = await fetchIpfsJson(
      nft.ipfsCid.startsWith('ipfs://') ? nft.ipfsCid : `ipfs://${nft.ipfsCid}`
    );
    const sanitized = sanitizeTheme(json as ThemeDefinition);
    const resolved = resolveTheme(sanitized);
    useThemeStore.getState().setNftTheme(resolved, nft);
  } catch (err) {
    console.error('Failed to load theme from IPFS:', err);
    useThemeStore.getState().resetToWarm();
  }
}

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

          const metadataStr =
            typeof metadata.data === 'string' ? metadata.data : metadata.data?.asText?.() || '';

          if (!metadataStr) continue;

          const parsed = JSON.parse(metadataStr);
          const validTypes: CustomizationType[] = [
            'board_bg',
            'hand_bg',
            'card_style',
            'avatar',
            'card_art',
            'theme',
          ];
          if (!validTypes.includes(parsed.type)) continue;

          const rawImage = parsed.image || '';
          const rawCid = rawImage.replace('ipfs://', '');
          // card_art CIDs point to a directory; use a sample card as the preview
          const previewImage =
            parsed.type === 'card_art' && rawCid ? `ipfs://${rawCid}/md/0.webp` : rawImage;

          nfts.push({
            collectionId,
            itemId,
            type: parsed.type as CustomizationType,
            name: parsed.name || `Item #${itemId}`,
            imageUrl: ipfsUrl(previewImage),
            ipfsCid: rawCid,
            description: parsed.description,
          });
        } catch {
          // Skip items with invalid metadata
        }
      }

      const filtered = filterSelectionsByOwnership(get().selections, nfts);

      set({
        ownedNfts: nfts,
        selections: filtered,
        isLoading: false,
      });
    } catch (err) {
      console.error('Failed to fetch user NFTs:', err);
      set({ isLoading: false });
    }
  },

  selectCustomization: (type, nft) => {
    const slotKey = SLOT_MAP[type];
    const selections = { ...get().selections, [slotKey]: nft };
    set({ selections });

    // Theme NFTs: fetch JSON from IPFS and apply
    if (type === 'theme') {
      if (nft) {
        void fetchAndApplyTheme(nft);
      } else {
        useThemeStore.getState().resetToWarm();
      }
    }
  },

  clearSelections: () => {
    set({ selections: { ...emptySelections } });
  },
}));
