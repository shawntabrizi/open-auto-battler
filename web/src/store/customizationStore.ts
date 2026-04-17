import { create } from 'zustand';
import { ipfsUrl, fetchIpfsJson } from '../utils/ipfs';
import { sanitizeTheme, resolveTheme, type ThemeDefinition } from '../theme/themes';
import { useThemeStore } from './themeStore';
import { isRecord } from '../utils/safe';

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
  imageUrl: string; // resolved gateway URL
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
  fetchUserNfts: (api: NftsApi | null, accountAddress: string) => Promise<void>;
  selectCustomization: (type: CustomizationType, nft: NftItem | null) => void;
  clearSelections: () => void;
}

interface ThemePreviewSource {
  base?: {
    accent?: string;
    positive?: string;
    defeat?: string;
    special?: string;
    surfaceDark?: string;
    decorative?: string;
    titleGradient?: string;
  };
  battleShop?: { mana?: string };
  unitCard?: { cardBurn?: string };
  label?: string;
}

interface NftAccountEntry {
  keyArgs: unknown[];
}

interface NftMetadataValue {
  data?: string | { asText?: () => string };
}

interface ParsedNftMetadata {
  type?: unknown;
  image?: unknown;
  name?: unknown;
  description?: unknown;
}

interface NftsApi {
  query: {
    Nfts: {
      Account: {
        getEntries: (accountAddress: string) => Promise<NftAccountEntry[]>;
      };
      ItemMetadataOf: {
        getValue: (collectionId: number, itemId: number) => Promise<NftMetadataValue | null>;
      };
    };
  };
}

type CustomizationSetState = (
  partial:
    | Partial<CustomizationStore>
    | ((state: CustomizationStore) => Partial<CustomizationStore>)
) => void;

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

function extractThemePreview(json: ThemePreviewSource, name: string): ThemePreviewData {
  const b = json.base || {};
  return {
    colors: [
      b.accent || '#888',
      (json.battleShop && json.battleShop.mana) || '#55a',
      b.positive || '#5a5',
      b.defeat || '#a55',
      b.special || '#a5a',
      (json.unitCard && json.unitCard.cardBurn) || '#aa5',
    ],
    bg: b.surfaceDark || '#111',
    font: b.decorative || 'serif',
    titleGradient:
      b.titleGradient || `linear-gradient(to right, ${b.accent || '#888'}, ${b.accent || '#888'})`,
    label: json.label || name,
  };
}

/** Pre-fetch theme preview data for all theme NFTs in the background. */
function prefetchThemePreviews(nfts: NftItem[], set: CustomizationSetState): void {
  for (const nft of nfts) {
    if (nft.type !== 'theme' || nft.themePreview) continue;
    fetchIpfsJson(nft.ipfsCid.startsWith('ipfs://') ? nft.ipfsCid : `ipfs://${nft.ipfsCid}`)
      .then((json: unknown) => {
        const preview = extractThemePreview(
          (isRecord(json) ? json : {}) as ThemePreviewSource,
          nft.name
        );
        set((state) => ({
          ownedNfts: state.ownedNfts.map((n: NftItem) =>
            n.collectionId === nft.collectionId && n.itemId === nft.itemId
              ? { ...n, themePreview: preview }
              : n
          ),
        }));
      })
      .catch(() => {
        // Silently fail — preview will show name only
      });
  }
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

  fetchUserNfts: async (api: NftsApi | null, accountAddress: string) => {
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

          const parsed = JSON.parse(metadataStr) as ParsedNftMetadata;
          const validTypes: CustomizationType[] = [
            'board_bg',
            'hand_bg',
            'card_style',
            'avatar',
            'card_art',
            'theme',
          ];
          if (
            typeof parsed.type !== 'string' ||
            !validTypes.includes(parsed.type as CustomizationType)
          )
            continue;

          const rawImage = typeof parsed.image === 'string' ? parsed.image : '';
          const rawCid = rawImage.replace('ipfs://', '');
          // card_art CIDs point to a directory; use a sample card as the preview
          const previewImage =
            parsed.type === 'card_art' && rawCid ? `ipfs://${rawCid}/md/0.webp` : rawImage;

          nfts.push({
            collectionId,
            itemId,
            type: parsed.type as CustomizationType,
            name: typeof parsed.name === 'string' ? parsed.name : `Item #${itemId}`,
            imageUrl: ipfsUrl(previewImage),
            ipfsCid: rawCid,
            description: typeof parsed.description === 'string' ? parsed.description : undefined,
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

      // Pre-fetch theme preview data in the background
      prefetchThemePreviews(nfts, set);
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
