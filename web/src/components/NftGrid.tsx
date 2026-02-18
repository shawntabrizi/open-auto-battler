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
      <div className="text-center py-6 text-slate-500 text-sm">
        <p>{emptyMessage || 'No NFTs found'}</p>
        {emptyAction}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
      {/* Default / None option */}
      <button
        onClick={onDeselect}
        className={`p-3 rounded-xl border-2 transition-all text-center ${
          selectedItemId === null
            ? 'border-yellow-400 bg-yellow-400/10'
            : 'border-white/10 bg-slate-800/50 hover:border-white/20'
        }`}
      >
        <div className="w-full aspect-square bg-slate-700/50 rounded-lg flex items-center justify-center mb-2">
          <span className="text-slate-400 text-2xl">--</span>
        </div>
        <span className="text-xs font-bold text-slate-400">Default</span>
      </button>

      {items.map((nft) => (
        <button
          key={`${nft.collectionId}-${nft.itemId}`}
          onClick={() => onSelect(nft)}
          className={`p-3 rounded-xl border-2 transition-all text-left ${
            selectedItemId === nft.itemId
              ? 'border-yellow-400 bg-yellow-400/10'
              : 'border-white/10 bg-slate-800/50 hover:border-white/20'
          }`}
        >
          <div className="w-full aspect-square rounded-lg overflow-hidden mb-2 bg-slate-700/50">
            <IpfsImage
              src={nft.imageUrl}
              alt={nft.name}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="text-xs font-bold truncate">{nft.name}</div>
          <div className="text-[10px] text-slate-500">#{nft.itemId}</div>
        </button>
      ))}
    </div>
  );
}
