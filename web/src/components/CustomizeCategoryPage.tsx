import { useEffect, useState } from 'react';
import { Link, useParams, Navigate } from 'react-router-dom';
import { useArenaStore } from '../store/arenaStore';
import {
  useCustomizationStore,
  type CustomizationType,
  type NftItem,
} from '../store/customizationStore';
import { CustomizationPreview } from './CustomizationPreview';
import { TopBar } from './TopBar';
import { IpfsImage } from './IpfsImage';
import { fetchIpfsJson } from '../utils/ipfs';
import { DEFAULT_WARM_THEME } from '../theme/themes';

type TileShape = 'landscape' | 'wide' | 'card' | 'circle';

const CATEGORIES: Record<
  string,
  {
    type: CustomizationType;
    label: string;
    icon: string;
    description: string;
    specs: string;
    shape: TileShape;
    selectionKey: string;
  }
> = {
  backgrounds: {
    type: 'board_bg',
    label: 'Background',
    icon: '🖼',
    description: 'Background image for the game arena',
    specs: '16:9 ratio, 1920x1080',
    shape: 'landscape',
    selectionKey: 'boardBackground',
  },
  hand: {
    type: 'hand_bg',
    label: 'Hand',
    icon: '🃏',
    description: 'Background image for the hand/shop area',
    specs: '5:1 ratio, 1920x384',
    shape: 'wide',
    selectionKey: 'handBackground',
  },
  'card-border': {
    type: 'card_style',
    label: 'Card Border',
    icon: '🪟',
    description: 'Overlay frame for all cards',
    specs: '3:4 ratio, 256x352, PNG with alpha',
    shape: 'card',
    selectionKey: 'cardStyle',
  },
  avatar: {
    type: 'avatar',
    label: 'Avatar',
    icon: '👤',
    description: 'Your avatar displayed in the HUD',
    specs: '1:1 ratio, 256x256',
    shape: 'circle',
    selectionKey: 'playerAvatar',
  },
  'card-art': {
    type: 'card_art',
    label: 'Card Art',
    icon: '🎨',
    description: 'Art set for all card illustrations',
    specs: 'IPFS directory with WebP images',
    shape: 'card',
    selectionKey: 'cardArt',
  },
  theme: {
    type: 'theme',
    label: 'Theme',
    icon: '🎭',
    description: 'Full UI theme with colors, fonts, and icons',
    specs: 'ThemeDefinition JSON on IPFS',
    shape: 'landscape',
    selectionKey: 'theme',
  },
};

const SHAPE_CLASSES: Record<TileShape, { sm: string; lg: string; rounded: string }> = {
  landscape: { sm: 'w-44 h-[6.2rem]', lg: 'w-full aspect-[16/9]', rounded: 'rounded-lg' },
  wide: { sm: 'w-44 h-10', lg: 'w-full aspect-[5/1]', rounded: 'rounded-lg' },
  card: { sm: 'w-32 h-[10.7rem]', lg: 'w-full aspect-[3/4]', rounded: 'rounded-lg' },
  circle: { sm: 'w-32 h-32', lg: 'w-full aspect-square', rounded: 'rounded-full' },
};

export function CustomizeCategoryPage() {
  const { category } = useParams<{ category: string }>();
  const { isConnected, api, selectedAccount } = useArenaStore();
  const { ownedNfts, selections, isLoading, fetchUserNfts, selectCustomization } =
    useCustomizationStore();

  const cat = category ? CATEGORIES[category] : undefined;

  useEffect(() => {
    if (isConnected && api && selectedAccount) {
      void fetchUserNfts(api, selectedAccount.address);
    }
  }, [isConnected, api, selectedAccount, fetchUserNfts]);

  if (!cat) {
    return <Navigate to="/customize" replace />;
  }

  const filteredNfts = ownedNfts.filter((n) => n.type === cat.type);
  const selectedNft = (selections as any)[cat.selectionKey] as NftItem | null | undefined;

  const handleSelect = (nft: NftItem) => selectCustomization(cat.type, nft);
  const handleDeselect = () => selectCustomization(cat.type, null);

  return (
    <div className="app-shell h-screen h-svh text-base-200 flex flex-col overflow-hidden">
      <TopBar backTo="/customize" backLabel="Customize" title={cat.label} />

      {/* Preview bar — desktop only */}
      <div className="hidden lg:flex shrink-0 border-b border-base-800/40 px-6 py-3 justify-center">
        <div className="w-full max-w-sm">
          <CustomizationPreview />
        </div>
      </div>

      {/* NFT selection area */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-base-400 text-xs lg:text-sm">
          Loading your NFTs...
        </div>
      ) : filteredNfts.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-base-500 text-xs lg:text-sm">
          <p>
            {isConnected
              ? `No ${cat.label.toLowerCase()} NFTs found.`
              : 'Connect to a blockchain node to browse NFTs.'}
          </p>
          {isConnected && (
            <Link to="/creator/mint" className="mt-2 text-accent text-xs hover:underline">
              Mint one
            </Link>
          )}
          {!isConnected && (
            <Link to="/network" className="mt-2 text-accent text-xs hover:underline">
              Network Settings
            </Link>
          )}
        </div>
      ) : (
        <>
          {/* Mobile: horizontal scroll */}
          <div className="flex-1 flex items-center lg:hidden overflow-x-auto px-2">
            <div className="flex gap-2 py-1">
              <NftTile
                isSelected={selectedNft === null || selectedNft === undefined}
                onClick={handleDeselect}
                label={cat.type === 'theme' ? 'Warm' : 'Default'}
                placeholder={cat.type === 'theme' ? undefined : '--'}
                preview={
                  cat.type === 'theme' ? <WarmThemeSwatch className="w-full h-full" /> : undefined
                }
                shape={cat.shape}
              />
              {filteredNfts.map((nft) => (
                <NftTile
                  key={`${nft.collectionId}-${nft.itemId}`}
                  isSelected={selectedNft?.itemId === nft.itemId}
                  onClick={() => handleSelect(nft)}
                  label={nft.name}
                  imageUrl={nft.type === 'theme' ? undefined : nft.imageUrl}
                  preview={
                    nft.type === 'theme' ? (
                      <ThemeSwatch cid={nft.ipfsCid} name={nft.name} className="w-full h-full" />
                    ) : undefined
                  }
                  subtitle={`#${nft.itemId}`}
                  shape={cat.shape}
                />
              ))}
            </div>
          </div>

          {/* Desktop: grid */}
          <div className="hidden lg:block flex-1 overflow-y-auto p-6">
            <div
              className={`grid gap-5 max-w-4xl ${
                cat.shape === 'card' || cat.shape === 'circle'
                  ? 'grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'
                  : 'grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'
              }`}
            >
              <NftTile
                isSelected={selectedNft === null || selectedNft === undefined}
                onClick={handleDeselect}
                label={cat.type === 'theme' ? 'Warm' : 'Default'}
                placeholder={cat.type === 'theme' ? undefined : '--'}
                preview={
                  cat.type === 'theme' ? <WarmThemeSwatch className="w-full h-full" /> : undefined
                }
                size="lg"
                shape={cat.shape}
              />
              {filteredNfts.map((nft) => (
                <NftTile
                  key={`${nft.collectionId}-${nft.itemId}`}
                  isSelected={selectedNft?.itemId === nft.itemId}
                  onClick={() => handleSelect(nft)}
                  label={nft.name}
                  imageUrl={nft.imageUrl}
                  subtitle={`#${nft.itemId}`}
                  size="lg"
                  shape={cat.shape}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Reusable NFT tile ──

function NftTile({
  isSelected,
  onClick,
  label,
  imageUrl,
  placeholder,
  preview,
  subtitle,
  size = 'sm',
  shape = 'card',
}: {
  isSelected: boolean;
  onClick: () => void;
  label: string;
  imageUrl?: string;
  placeholder?: string;
  preview?: React.ReactNode;
  subtitle?: string;
  size?: 'sm' | 'lg';
  shape?: TileShape;
}) {
  const isLg = size === 'lg';
  const s = SHAPE_CLASSES[shape];
  return (
    <button
      onClick={onClick}
      className={`theme-panel shrink-0 ${isLg ? 'p-3 rounded-xl' : 'p-1.5 rounded-lg'} border-2 transition-all text-center ${
        isSelected
          ? 'border-accent bg-accent/10'
          : 'border-white/10 bg-base-800/50 hover:border-white/20'
      }`}
    >
      <div
        className={`${isLg ? s.lg : s.sm} bg-base-700/50 ${s.rounded} overflow-hidden ${isLg ? 'mb-2' : 'mb-0.5'} flex items-center justify-center`}
      >
        {preview ? (
          preview
        ) : imageUrl ? (
          <IpfsImage
            src={imageUrl}
            alt={label}
            className={`w-full h-full object-cover ${s.rounded}`}
          />
        ) : (
          <span className={`text-base-400 ${isLg ? 'text-2xl' : 'text-sm'}`}>{placeholder}</span>
        )}
      </div>
      <div
        className={`font-bold truncate ${isLg ? 'text-xs max-w-none' : 'text-[10px] max-w-[6rem]'}`}
      >
        {label}
      </div>
      {subtitle && (
        <div className={`text-base-500 ${isLg ? 'text-[10px]' : 'text-[7px] hidden'}`}>
          {subtitle}
        </div>
      )}
    </button>
  );
}

interface ThemePreviewData {
  colors: string[];
  font: string;
  label: string;
  accent: string;
  bg: string;
  titleGradient: string;
}

/** Fetches a theme JSON from IPFS and renders a mini theme preview. */
function ThemeSwatch({ cid, name, className }: { cid: string; name: string; className?: string }) {
  const [data, setData] = useState<ThemePreviewData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    fetchIpfsJson(cid.startsWith('ipfs://') ? cid : `ipfs://${cid}`)
      .then((json: any) => {
        const b = json.base || {};
        setData({
          colors: [
            b.accent || '#888',
            (json.battleShop && json.battleShop.mana) || '#55a',
            b.positive || '#5a5',
            b.defeat || '#a55',
            b.special || '#a5a',
            (json.unitCard && json.unitCard.cardBurn) || '#aa5',
          ],
          font: b.decorative || 'serif',
          label: json.label || name,
          accent: b.accent || '#888',
          bg: b.surfaceDark || '#111',
          titleGradient:
            b.titleGradient ||
            `linear-gradient(to right, ${b.accent || '#888'}, ${b.accent || '#888'})`,
        });
      })
      .catch(() => setFailed(true));
  }, [cid, name]);

  if (!data) {
    return (
      <div className={`${className} flex items-center justify-center`}>
        <span className={`text-base-400 text-sm ${failed ? '' : 'animate-pulse'}`}>
          {failed ? name : 'Loading...'}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`${className} flex flex-col items-center justify-center gap-1 p-2`}
      style={{ backgroundColor: data.bg }}
    >
      <span
        className="font-bold text-transparent bg-clip-text text-center leading-tight"
        style={{
          fontFamily: data.font,
          backgroundImage: data.titleGradient,
          fontSize: 'clamp(0.7rem, 2.5cqi, 1.2rem)',
        }}
      >
        {data.label}
      </span>
      <div className="flex gap-1">
        {data.colors.map((c, i) => (
          <div
            key={i}
            className="rounded-full"
            style={{ backgroundColor: c, width: 'clamp(6px, 1.5cqi, 12px)', aspectRatio: '1' }}
          />
        ))}
      </div>
    </div>
  );
}

/** Renders the warm (default) theme swatch from built-in data — no fetch needed. */
function WarmThemeSwatch({ className }: { className?: string }) {
  const b = DEFAULT_WARM_THEME.base;
  const colors = [b.accent, DEFAULT_WARM_THEME.battleShop.mana, b.positive, b.defeat, b.special, DEFAULT_WARM_THEME.unitCard.cardBurn];

  return (
    <div
      className={`${className} flex flex-col items-center justify-center gap-1 p-2`}
      style={{ backgroundColor: b.surfaceDark }}
    >
      <span
        className="font-bold text-transparent bg-clip-text text-center leading-tight"
        style={{
          fontFamily: b.decorative,
          backgroundImage: b.titleGradient,
          fontSize: 'clamp(0.7rem, 2.5cqi, 1.2rem)',
        }}
      >
        Warm
      </span>
      <div className="flex gap-1">
        {colors.map((c, i) => (
          <div
            key={i}
            className="rounded-full"
            style={{ backgroundColor: c, width: 'clamp(6px, 1.5cqi, 12px)', aspectRatio: '1' }}
          />
        ))}
      </div>
    </div>
  );
}
