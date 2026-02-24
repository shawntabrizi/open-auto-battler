import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useBlockchainStore } from '../store/blockchainStore';
import { useCustomizationStore, type CustomizationType, type NftItem } from '../store/customizationStore';
import { CustomizationPreview } from './CustomizationPreview';

const SECTIONS: { type: CustomizationType; label: string; icon: string; description: string; specs: string }[] = [
  {
    type: 'board_bg',
    label: 'Background',
    icon: '🖼',
    description: 'Background image for the game arena',
    specs: '16:9 ratio, 1920x1080 recommended, PNG/WebP, max 2 MB',
  },
  {
    type: 'hand_bg',
    label: 'Hand',
    icon: '🃏',
    description: 'Background image for the hand/shop area',
    specs: '5:1 ratio, 1920x384 recommended, PNG/WebP, max 1 MB',
  },
  {
    type: 'card_style',
    label: 'Card Border',
    icon: '🪟',
    description: 'Overlay frame for all cards',
    specs: '3:4 ratio, 256x352 recommended, PNG with alpha, max 500 KB',
  },
  {
    type: 'avatar',
    label: 'Avatar',
    icon: '👤',
    description: 'Your avatar displayed in the HUD',
    specs: '1:1 ratio, 256x256 recommended, PNG/WebP, max 500 KB',
  },
];

const SLOT_MAP: Record<CustomizationType, keyof ReturnType<typeof useCustomizationStore.getState>['selections']> = {
  board_bg: 'boardBackground',
  hand_bg: 'handBackground',
  card_style: 'cardStyle',
  avatar: 'playerAvatar',
};

export const CustomizePage: React.FC = () => {
  const { isConnected, connect, api, selectedAccount } = useBlockchainStore();
  const { ownedNfts, selections, isLoading, fetchUserNfts, selectCustomization, loadFromStorage } = useCustomizationStore();
  const [activeSection, setActiveSection] = useState<CustomizationType | null>(null);

  useEffect(() => {
    if (isConnected && api && selectedAccount) {
      void fetchUserNfts(api, selectedAccount.address);
      loadFromStorage(selectedAccount.address);
    }
  }, [isConnected, api, selectedAccount, fetchUserNfts, loadFromStorage]);

  const handleSelect = (type: CustomizationType, nft: NftItem) => {
    selectCustomization(type, nft, selectedAccount?.address);
  };

  const handleDeselect = (type: CustomizationType) => {
    selectCustomization(type, null, selectedAccount?.address);
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen min-h-svh bg-slate-900 flex flex-col items-center justify-center p-4 text-white">
        <h1 className="text-2xl lg:text-4xl font-black mb-6 lg:mb-8 italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-600 uppercase">
          Customize
        </h1>
        <button
          onClick={connect}
          className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 px-6 lg:py-4 lg:px-8 rounded-full text-sm lg:text-base transition-all transform hover:scale-105"
        >
          CONNECT WALLET TO START
        </button>
        <Link to="/blockchain" className="mt-6 lg:mt-8 text-slate-400 hover:text-white underline text-sm">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  const activeSectionData = SECTIONS.find((s) => s.type === activeSection);
  const filteredNfts = activeSection ? ownedNfts.filter((n) => n.type === activeSection) : [];
  const selectedNft = activeSection ? selections[SLOT_MAP[activeSection]] : null;

  // ── Detail view: horizontal scroll on mobile, grid on desktop ──
  if (activeSection && activeSectionData) {
    return (
      <div className="h-screen h-svh bg-slate-950 text-slate-200 flex flex-col overflow-hidden">
        {/* Header bar */}
        <div className="flex items-center gap-2 p-2 lg:p-4 shrink-0 border-b border-white/5">
          <button
            onClick={() => setActiveSection(null)}
            className="text-slate-400 hover:text-white text-sm lg:text-base px-2 py-1 rounded hover:bg-slate-800 transition-colors"
          >
            &larr;
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm lg:text-xl font-bold truncate">
              {activeSectionData.icon} {activeSectionData.label}
            </h2>
            <p className="text-[9px] lg:text-xs text-slate-500 truncate">{activeSectionData.description}</p>
          </div>
          <p className="text-[8px] lg:text-[10px] text-slate-600 hidden lg:block shrink-0">{activeSectionData.specs}</p>
        </div>

        {/* NFT selection area */}
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-xs lg:text-sm">
            Loading your NFTs...
          </div>
        ) : filteredNfts.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-xs lg:text-sm">
            <p>No {activeSectionData.label.toLowerCase()} NFTs found.</p>
            <Link
              to="/blockchain/mint-nft"
              className="mt-2 text-yellow-500 text-xs hover:underline"
            >
              Mint one
            </Link>
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
                />
                {filteredNfts.map((nft) => (
                  <NftTile
                    key={`${nft.collectionId}-${nft.itemId}`}
                    isSelected={selectedNft?.itemId === nft.itemId}
                    onClick={() => handleSelect(activeSection, nft)}
                    label={nft.name}
                    imageUrl={nft.imageUrl}
                    subtitle={`#${nft.itemId}`}
                  />
                ))}
              </div>
            </div>

            {/* Desktop: grid with vertical scroll */}
            <div className="hidden lg:block flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 max-w-5xl">
                <NftTile
                  isSelected={selectedNft === null || selectedNft === undefined}
                  onClick={() => handleDeselect(activeSection)}
                  label="Default"
                  placeholder="--"
                  size="lg"
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
    <div className="h-screen h-svh bg-slate-950 text-slate-200 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-2 lg:p-6 shrink-0">
        <div>
          <h1 className="text-base lg:text-3xl font-black italic tracking-tighter text-yellow-500 uppercase">
            Customize
          </h1>
          <p className="text-slate-500 text-[9px] lg:text-sm">Select a category to customize</p>
        </div>
        <Link
          to="/blockchain/creator"
          className="text-slate-400 hover:text-white border border-slate-800 px-2 py-1 lg:px-3 lg:py-2 rounded lg:rounded-lg text-[9px] lg:text-sm transition-colors"
        >
          Creator Hub
        </Link>
      </div>

      {/* Category grid */}
      <div className="flex-1 flex items-center justify-center p-2 lg:p-8">
        <div className="grid grid-cols-2 gap-2 lg:gap-6 w-full max-w-sm lg:max-w-lg">
          {SECTIONS.map((section) => {
            const current = selections[SLOT_MAP[section.type]];
            return (
              <button
                key={section.type}
                onClick={() => setActiveSection(section.type)}
                className="bg-slate-900/50 border border-white/5 hover:border-yellow-500/30 rounded-lg lg:rounded-2xl p-2 lg:p-6 text-center transition-all hover:bg-slate-800/50 active:scale-95"
              >
                <div className="text-2xl lg:text-5xl mb-1 lg:mb-3">{section.icon}</div>
                <div className="text-[10px] lg:text-base font-bold text-white">{section.label}</div>
                <div className="text-[8px] lg:text-xs text-slate-500 mt-0.5 lg:mt-1">
                  {current ? current.name : 'Default'}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Desktop: preview below categories */}
      <div className="hidden lg:flex justify-center pb-8">
        <div className="w-full max-w-md">
          <CustomizationPreview />
        </div>
      </div>

      {/* Footer */}
      <div className="text-center pb-2 lg:pb-6 shrink-0">
        <Link to="/blockchain/creator" className="text-slate-600 hover:text-slate-400 text-[9px] lg:text-xs">
          Back to Creator Hub
        </Link>
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
}

function NftTile({ isSelected, onClick, label, imageUrl, placeholder, subtitle, size = 'sm' }: NftTileProps) {
  const isLg = size === 'lg';
  return (
    <button
      onClick={onClick}
      className={`shrink-0 ${isLg ? 'p-3 rounded-xl' : 'p-1.5 rounded-lg'} border-2 transition-all text-center ${
        isSelected
          ? 'border-yellow-400 bg-yellow-400/10'
          : 'border-white/10 bg-slate-800/50 hover:border-white/20'
      }`}
    >
      <div
        className={`${isLg ? 'w-full aspect-[3/4]' : 'w-24 h-32'} bg-slate-700/50 rounded overflow-hidden ${isLg ? 'mb-2' : 'mb-0.5'} flex items-center justify-center`}
>
        {imageUrl ? (
          <IpfsImage src={imageUrl} alt={label} className="w-full h-full object-cover" />
        ) : (
          <span className={`text-slate-400 ${isLg ? 'text-2xl' : 'text-sm'}`}>{placeholder}</span>
        )}
      </div>
      <div className={`font-bold truncate ${isLg ? 'text-xs max-w-none' : 'text-[10px] max-w-[6rem]'}`}>{label}</div>
      {subtitle && (
        <div className={`text-slate-500 ${isLg ? 'text-[10px]' : 'text-[7px] hidden'}`}>{subtitle}</div>
      )}
    </button>
  );
}
