import { create } from 'zustand';
import { fetchIpfsJson } from '../utils/ipfs';
import { sanitizeTheme, resolveTheme, type ThemeDefinition } from '../theme/themes';
import { useThemeStore } from './themeStore';

export type CustomizationType =
  | 'board_bg'
  | 'hand_bg'
  | 'card_style'
  | 'avatar'
  | 'card_art'
  | 'theme';

export interface ThemePreviewData {
  colors: string[];
  bg: string;
  font: string;
  titleGradient: string;
  label: string;
}

export interface NftItem {
  collectionId: number;
  itemId: number;
  type: CustomizationType;
  name: string;
  imageUrl: string;
  ipfsCid: string;
  description?: string;
  themePreview?: ThemePreviewData;
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

  selectCustomization: (type, nft) => {
    const slotKey = SLOT_MAP[type];
    const selections = { ...get().selections, [slotKey]: nft };
    set({ selections });

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
