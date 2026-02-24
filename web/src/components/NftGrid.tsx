import { IpfsImage } from './IpfsImage';
import type { NftItem } from '../store/customizationStore';

interface NftGridProps {
  items: NftItem[];
  selectedItemId: number | null;
  onSelect: (nft: NftItem) => void;
  onDeselect: () => void;
  emptyMessage?: string;
  emptyAction?: React.ReactNode;
}

export function NftGrid({ items, selectedItemId, onSelect, onDeselect, emptyMessage, emptyAction }: NftGridProps) {
  if (items.length === 0) {
    return (
      <div className="text-center py-2 lg:py-6 text-slate-500 text-[10px] lg:text-sm">
        <p>{emptyMessage || 'No NFTs found'}</p>
        {emptyAction}
      </div>
    );
  }

  const defaultBtn = (
    <button
      onClick={onDeselect}
      className={`shrink-0 p-1 lg:p-3 rounded lg:rounded-xl border-2 transition-all text-center ${
        selectedItemId === null
          ? 'border-yellow-400 bg-yellow-400/10'
          : 'border-white/10 bg-slate-800/50 hover:border-white/20'
      }`}
    >
      <div className="w-12 h-12 lg:w-full lg:aspect-square bg-slate-700/50 rounded flex items-center justify-center mb-0.5 lg:mb-2">
        <span className="text-slate-400 text-sm lg:text-2xl">--</span>
      </div>
      <span className="text-[8px] lg:text-xs font-bold text-slate-400">Default</span>
    </button>
  );

  const nftBtns = items.map((nft) => (
    <button
      key={`${nft.collectionId}-${nft.itemId}`}
      onClick={() => onSelect(nft)}
      className={`shrink-0 p-1 lg:p-3 rounded lg:rounded-xl border-2 transition-all text-left ${
        selectedItemId === nft.itemId
          ? 'border-yellow-400 bg-yellow-400/10'
          : 'border-white/10 bg-slate-800/50 hover:border-white/20'
      }`}
    >
      <div className="w-12 h-12 lg:w-full lg:aspect-square rounded overflow-hidden mb-0.5 lg:mb-2 bg-slate-700/50">
        <IpfsImage
          src={nft.imageUrl}
          alt={nft.name}
          className="w-full h-full object-cover"
        />
      </div>
      <div className="text-[8px] lg:text-xs font-bold truncate max-w-[3rem] lg:max-w-none">{nft.name}</div>
      <div className="text-[7px] lg:text-[10px] text-slate-500 hidden lg:block">#{nft.itemId}</div>
    </button>
  ));

  return (
    <>
      {/* Mobile: horizontal scroll row */}
      <div className="flex lg:hidden gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {defaultBtn}
        {nftBtns}
      </div>

      {/* Desktop: grid */}
      <div className="hidden lg:grid grid-cols-3 gap-3">
        {defaultBtn}
        {nftBtns}
      </div>
    </>
  );
}
