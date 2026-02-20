import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useBlockchainStore } from '../store/blockchainStore';
import { useCustomizationStore, type CustomizationType, type NftItem } from '../store/customizationStore';
import { NftGrid } from './NftGrid';
import { CustomizationPreview } from './CustomizationPreview';

const SECTIONS: { type: CustomizationType; label: string; description: string; specs: string }[] = [
  {
    type: 'board_bg',
    label: 'Board Background',
    description: 'Background image for the game arena',
    specs: '16:9 ratio, 1920x1080 recommended, PNG/WebP, max 2 MB',
  },
  {
    type: 'hand_bg',
    label: 'Hand Background',
    description: 'Background image for the hand/shop area',
    specs: '5:1 ratio, 1920x384 recommended, PNG/WebP, max 1 MB',
  },
  {
    type: 'card_style',
    label: 'Card Style Frame',
    description: 'Overlay frame for all cards (transparent center, decorative border)',
    specs: '3:4 ratio, 256x352 recommended, PNG with alpha, max 500 KB',
  },
  {
    type: 'avatar',
    label: 'Player Avatar',
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
  const [showPreview, setShowPreview] = useState(false);

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
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 text-white">
        <h1 className="text-4xl font-black mb-8 italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-600 uppercase">
          Customize
        </h1>
        <button
          onClick={connect}
          className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-4 px-8 rounded-full transition-all transform hover:scale-105"
        >
          CONNECT WALLET TO START
        </button>
        <Link to="/blockchain" className="mt-8 text-slate-400 hover:text-white underline">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6 lg:mb-8">
          <div>
            <h1 className="text-2xl lg:text-3xl font-black italic tracking-tighter text-yellow-500 uppercase">
              Customize
            </h1>
            <p className="text-slate-500 text-sm">Select NFT cosmetics for your game</p>
          </div>
          <Link
            to="/blockchain/creator"
            className="text-slate-400 hover:text-white border border-slate-800 px-3 py-2 rounded-lg text-xs lg:text-sm transition-colors"
          >
            Creator Hub
          </Link>
        </div>

        {/* Mobile preview toggle */}
        <div className="lg:hidden mb-4">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="w-full bg-slate-900/50 border border-white/5 rounded-xl p-3 text-sm text-slate-400 hover:text-white transition-colors"
          >
            {showPreview ? 'Hide Preview' : 'Show Preview'}
          </button>
          {showPreview && (
            <div className="mt-3">
              <CustomizationPreview />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          {/* Left: Customization sections */}
          <div className="lg:col-span-2 space-y-6">
            {isLoading && (
              <div className="text-center py-8 text-slate-400">
                Loading your NFTs...
              </div>
            )}

            {SECTIONS.map((section) => {
              const filtered = ownedNfts.filter((n) => n.type === section.type);
              const selected = selections[SLOT_MAP[section.type]];

              return (
                <div key={section.type} className="bg-slate-900/50 border border-white/5 rounded-2xl p-4 lg:p-6 backdrop-blur-sm">
                  <div className="mb-4">
                    <h2 className="text-lg font-bold">{section.label}</h2>
                    <p className="text-xs text-slate-500 mt-1">{section.description}</p>
                    <p className="text-[10px] text-slate-600 mt-0.5">{section.specs}</p>
                  </div>
                  <NftGrid
                    items={filtered}
                    selectedItemId={selected?.itemId ?? null}
                    onSelect={(nft) => handleSelect(section.type, nft)}
                    onDeselect={() => handleDeselect(section.type)}
                    emptyMessage={`No ${section.label.toLowerCase()} NFTs found`}
                    emptyAction={
                      <Link
                        to="/blockchain/mint-nft"
                        className="inline-block mt-2 text-yellow-500 text-xs hover:underline"
                      >
                        Mint one
                      </Link>
                    }
                  />
                </div>
              );
            })}
          </div>

          {/* Right: Live Preview (desktop only) */}
          <div className="hidden lg:block">
            <div className="sticky top-8">
              <CustomizationPreview />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
