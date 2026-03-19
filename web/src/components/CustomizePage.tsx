import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useBlockchainStore } from '../store/blockchainStore';
import {
  useCustomizationStore,
  type CustomizationType,
  type NftItem,
} from '../store/customizationStore';
import { CustomizationPreview } from './CustomizationPreview';
import { TopBar } from './TopBar';

type TileShape = 'landscape' | 'wide' | 'card' | 'circle';

const SECTIONS: {
  type: CustomizationType;
  label: string;
  icon: string;
  description: string;
  specs: string;
  shape: TileShape;
}[] = [
  {
    type: 'board_bg',
    label: 'Background',
    icon: '🖼',
    description: 'Background image for the game arena',
    specs: '16:9 ratio, 1920x1080 recommended, PNG/WebP, max 2 MB',
    shape: 'landscape',
  },
  {
    type: 'hand_bg',
    label: 'Hand',
    icon: '🃏',
    description: 'Background image for the hand/shop area',
    specs: '5:1 ratio, 1920x384 recommended, PNG/WebP, max 1 MB',
    shape: 'wide',
  },
  {
    type: 'card_style',
    label: 'Card Border',
    icon: '🪟',
    description: 'Overlay frame for all cards',
    specs: '3:4 ratio, 256x352 recommended, PNG with alpha, max 500 KB',
    shape: 'card',
  },
  {
    type: 'avatar',
    label: 'Avatar',
    icon: '👤',
    description: 'Your avatar displayed in the HUD',
    specs: '1:1 ratio, 256x256 recommended, PNG/WebP, max 500 KB',
    shape: 'circle',
  },
  {
    type: 'card_art',
    label: 'Card Art',
    icon: '🎨',
    description: 'Art set for all card illustrations',
    specs: 'IPFS directory with sm/ and md/ WebP images per card',
    shape: 'card',
  },
];

const SLOT_MAP: Record<
  CustomizationType,
  keyof ReturnType<typeof useCustomizationStore.getState>['selections']
> = {
  board_bg: 'boardBackground',
  hand_bg: 'handBackground',
  card_style: 'cardStyle',
  avatar: 'playerAvatar',
  card_art: 'cardArt',
};

export const CustomizePage: React.FC = () => {
  const { isConnected, api, selectedAccount } = useBlockchainStore();
  const { ownedNfts, selections, isLoading, fetchUserNfts, selectCustomization } =
    useCustomizationStore();
  const [activeSection, setActiveSection] = useState<CustomizationType | null>(null);
  const location = useLocation();
  const isBlockchainRoute = location.pathname.startsWith('/blockchain');
  const backLink = isBlockchainRoute ? '/blockchain' : '/';
  const backState = isBlockchainRoute ? undefined : location.state;

  useEffect(() => {
    if (isConnected && api && selectedAccount) {
      void fetchUserNfts(api, selectedAccount.address);
    }
  }, [isConnected, api, selectedAccount, fetchUserNfts]);

  const handleSelect = (type: CustomizationType, nft: NftItem) => {
    selectCustomization(type, nft);
  };

  const handleDeselect = (type: CustomizationType) => {
    selectCustomization(type, null);
  };

  const activeSectionData = SECTIONS.find((s) => s.type === activeSection);
  const filteredNfts = activeSection ? ownedNfts.filter((n) => n.type === activeSection) : [];
  const selectedNft = activeSection ? selections[SLOT_MAP[activeSection]] : null;

  // ── Detail view: horizontal scroll on mobile, grid on desktop ──
  if (activeSection && activeSectionData) {
    return (
      <div className="h-screen h-svh bg-warm-950 text-warm-200 flex flex-col overflow-hidden">
        {/* Header bar */}
        <div className="flex items-center gap-3 px-3 lg:px-4 py-2 lg:py-3 shrink-0 border-b border-white/5">
          <button
            onClick={() => setActiveSection(null)}
            className="inline-flex items-center gap-1 text-warm-400 hover:text-warm-200 text-xs lg:text-sm transition-colors shrink-0"
          >
            <span>&larr;</span>
            <span>Back</span>
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm lg:text-xl font-bold truncate">
              {activeSectionData.icon} {activeSectionData.label}
            </h2>
            <p className="text-[9px] lg:text-xs text-warm-500 truncate">
              {activeSectionData.description}
            </p>
          </div>
          <p className="text-[8px] lg:text-[10px] text-warm-600 hidden lg:block shrink-0">
            {activeSectionData.specs}
          </p>
        </div>

        {/* NFT selection area */}
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center text-warm-400 text-xs lg:text-sm">
            Loading your NFTs...
          </div>
        ) : filteredNfts.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-warm-500 text-xs lg:text-sm">
            <p>
              {isConnected
                ? `No ${activeSectionData.label.toLowerCase()} NFTs found.`
                : 'Connect to a blockchain node to browse NFTs.'}
            </p>
            {isConnected && (
              <Link
                to="/blockchain/mint-nft"
                className="mt-2 text-yellow-500 text-xs hover:underline"
              >
                Mint one
              </Link>
            )}
            {!isConnected && (
              <Link
                to="/network"
                state={location.state}
                className="mt-2 text-yellow-500 text-xs hover:underline"
              >
                Network Settings
              </Link>
            )}
          </div>
        ) : (
          <>
            {/* Mobile: horizontal scroll centered vertically */}
            <div className="flex-1 flex items-center lg:hidden overflow-x-auto px-2">
              <div className="flex gap-2 py-1">
                <NftTile
                  isSelected={selectedNft === null || selectedNft === undefined}
                  onClick={() => handleDeselect(activeSection)}
                  label="Default"
                  placeholder="--"
                  shape={activeSectionData.shape}
                />
                {filteredNfts.map((nft) => (
                  <NftTile
                    key={`${nft.collectionId}-${nft.itemId}`}
                    isSelected={selectedNft?.itemId === nft.itemId}
                    onClick={() => handleSelect(activeSection, nft)}
                    label={nft.name}
                    imageUrl={nft.imageUrl}
                    subtitle={`#${nft.itemId}`}
                    shape={activeSectionData.shape}
                  />
                ))}
              </div>
            </div>

            {/* Desktop: grid with vertical scroll */}
            <div className="hidden lg:block flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5 max-w-4xl">
                <NftTile
                  isSelected={selectedNft === null || selectedNft === undefined}
                  onClick={() => handleDeselect(activeSection)}
                  label="Default"
                  placeholder="--"
                  size="lg"
                  shape={activeSectionData.shape}
                />
                {filteredNfts.map((nft) => (
                  <NftTile
                    key={`${nft.collectionId}-${nft.itemId}`}
                    isSelected={selectedNft?.itemId === nft.itemId}
                    onClick={() => handleSelect(activeSection, nft)}
                    label={nft.name}
                    imageUrl={nft.imageUrl}
                    subtitle={`#${nft.itemId}`}
                    size="lg"
                    shape={activeSectionData.shape}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // ── Category menu ──
  return (
    <div className="h-screen h-svh bg-warm-950 text-warm-200 flex flex-col">
      <TopBar
        backTo={backLink}
        backState={backState}
        backLabel={isBlockchainRoute ? 'Creator Hub' : 'Menu'}
        title="Customize"
      />

      {/* Mobile: two-column layout — preview left, categories right */}
      <div className="flex-1 flex lg:hidden p-2 gap-2 min-h-0">
        <div className="w-2/3 flex items-center justify-center">
          <CustomizationPreview />
        </div>
        <div className="w-1/3 flex flex-col gap-1 overflow-y-auto justify-center">
          {SECTIONS.map((section) => {
            return (
              <button
                key={section.type}
                onClick={() => setActiveSection(section.type)}
                className="flex items-center gap-2 bg-warm-900/50 border border-white/5 hover:border-yellow-500/30 rounded-lg px-3 py-1.5 transition-all hover:bg-warm-800/50 active:scale-95"
              >
                <span className="text-base">{section.icon}</span>
                <span className="text-[10px] font-bold text-white">{section.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Desktop: preview on top, category grid below */}
      <div className="hidden lg:flex flex-col flex-1">
        <div className="flex justify-center px-8 pb-4">
          <div className="w-full max-w-xs">
            <CustomizationPreview />
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="grid grid-cols-2 gap-6 w-full max-w-lg">
            {SECTIONS.map((section) => {
              const current = selections[SLOT_MAP[section.type]];
              return (
                <button
                  key={section.type}
                  onClick={() => setActiveSection(section.type)}
                  className="bg-warm-900/50 border border-white/5 hover:border-yellow-500/30 rounded-2xl p-6 text-center transition-all hover:bg-warm-800/50 active:scale-95"
                >
                  <div className="text-5xl mb-3">{section.icon}</div>
                  <div className="text-base font-bold text-white">{section.label}</div>
                  <div className="text-xs text-warm-500 mt-1">
                    {current ? current.name : 'Default'}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Reusable NFT tile component ──

import { IpfsImage } from './IpfsImage';

interface NftTileProps {
  isSelected: boolean;
  onClick: () => void;
  label: string;
  imageUrl?: string;
  placeholder?: string;
  subtitle?: string;
  size?: 'sm' | 'lg';
  shape?: TileShape;
}

const SHAPE_CLASSES: Record<TileShape, { sm: string; lg: string; rounded: string }> = {
  landscape: { sm: 'w-44 h-[6.2rem]', lg: 'w-full aspect-[16/9]', rounded: 'rounded-lg' },
  wide: { sm: 'w-44 h-10', lg: 'w-full aspect-[5/1]', rounded: 'rounded-lg' },
  card: { sm: 'w-32 h-[10.7rem]', lg: 'w-full aspect-[3/4]', rounded: 'rounded-lg' },
  circle: { sm: 'w-32 h-32', lg: 'w-full aspect-square', rounded: 'rounded-full' },
};

function NftTile({
  isSelected,
  onClick,
  label,
  imageUrl,
  placeholder,
  subtitle,
  size = 'sm',
  shape = 'card',
}: NftTileProps) {
  const isLg = size === 'lg';
  const s = SHAPE_CLASSES[shape];
  return (
    <button
      onClick={onClick}
      className={`shrink-0 ${isLg ? 'p-3 rounded-xl' : 'p-1.5 rounded-lg'} border-2 transition-all text-center ${
        isSelected
          ? 'border-yellow-400 bg-yellow-400/10'
          : 'border-white/10 bg-warm-800/50 hover:border-white/20'
      }`}
    >
      <div
        className={`${isLg ? s.lg : s.sm} bg-warm-700/50 ${s.rounded} overflow-hidden ${isLg ? 'mb-2' : 'mb-0.5'} flex items-center justify-center`}
      >
        {imageUrl ? (
          <IpfsImage
            src={imageUrl}
            alt={label}
            className={`w-full h-full object-cover ${s.rounded}`}
          />
        ) : (
          <span className={`text-warm-400 ${isLg ? 'text-2xl' : 'text-sm'}`}>{placeholder}</span>
        )}
      </div>
      <div
        className={`font-bold truncate ${isLg ? 'text-xs max-w-none' : 'text-[10px] max-w-[6rem]'}`}
      >
        {label}
      </div>
      {subtitle && (
        <div className={`text-warm-500 ${isLg ? 'text-[10px]' : 'text-[7px] hidden'}`}>
          {subtitle}
        </div>
      )}
    </button>
  );
}
