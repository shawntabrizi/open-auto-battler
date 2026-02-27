import { useGameStore } from '../store/gameStore';

export function MobileTabBar() {
  const { view, mobileTab, setMobileTab } = useGameStore();
  if (!view) return null;

  const handCount = view.hand.filter(Boolean).length;
  const boardCount = view.board.filter(Boolean).length;

  return (
    <div className="lg:hidden flex h-9 bg-warm-950/90 border-b border-warm-800/60 flex-shrink-0">
      <button
        onClick={() => setMobileTab('hand')}
        className={`flex-1 flex items-center justify-center gap-1.5 text-[0.7rem] font-heading font-bold uppercase tracking-wider transition-colors ${
          mobileTab === 'hand'
            ? 'text-gold border-b-2 border-gold bg-warm-900/60'
            : 'text-warm-500 hover:text-warm-300'
        }`}
      >
        Hand ({handCount})
      </button>
      <div className="w-px bg-warm-800/60" />
      <button
        onClick={() => setMobileTab('board')}
        className={`flex-1 flex items-center justify-center gap-1.5 text-[0.7rem] font-heading font-bold uppercase tracking-wider transition-colors ${
          mobileTab === 'board'
            ? 'text-gold border-b-2 border-gold bg-warm-900/60'
            : 'text-warm-500 hover:text-warm-300'
        }`}
      >
        Board ({boardCount}/5)
      </button>
    </div>
  );
}
