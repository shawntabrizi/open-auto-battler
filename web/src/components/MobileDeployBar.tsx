import { useGameStore } from '../store/gameStore';
import { useAudioStore } from '../store/audioStore';

export function MobileHandActions() {
  const { selection, view, setMobileTab, setSelection, pitchHandCard, undo } = useGameStore();
  const playSfx = useAudioStore((s) => s.playSfx);

  if (!view || selection?.type !== 'hand') return null;

  const card = view.hand[selection.index];
  if (!card) return null;

  const canAfford = view.can_afford[selection.index];

  const handlePitch = () => {
    playSfx('pitch-burn');
    pitchHandCard(selection.index);
    setSelection(null);
  };

  return (
    <div className="lg:hidden flex-shrink-0 bg-warm-900/95 border-t border-warm-700/50 px-2 py-1.5 flex items-center gap-2">
      <span className="text-[0.65rem] text-warm-300 truncate min-w-0 flex-1">
        {card.name}
        <span className="text-mana-blue ml-1">({card.play_cost})</span>
      </span>
      <button
        onClick={handlePitch}
        className="flex-shrink-0 text-[0.65rem] font-bold px-2.5 py-1.5 rounded-lg transition-colors btn-danger"
      >
        Pitch +{card.pitch_value}
      </button>
      <button
        onClick={() => setMobileTab('board')}
        disabled={!canAfford}
        className={`flex-shrink-0 text-[0.65rem] font-bold px-2.5 py-1.5 rounded-lg transition-colors ${
          canAfford
            ? 'btn-primary'
            : 'bg-warm-700 text-warm-500 cursor-not-allowed'
        }`}
      >
        Deploy
      </button>
      <button
        onClick={undo}
        disabled={!view.can_undo}
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
          view.can_undo
            ? 'bg-warm-700 text-warm-200 active:bg-warm-600'
            : 'bg-warm-800 text-warm-600 cursor-not-allowed'
        }`}
        title="Undo"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
          <path
            fillRule="evenodd"
            d="M9.53 2.47a.75.75 0 0 1 0 1.06L4.81 8.25H15a6.75 6.75 0 0 1 0 13.5h-3a.75.75 0 0 1 0-1.5h3a5.25 5.25 0 1 0 0-10.5H4.81l4.72 4.72a.75.75 0 1 1-1.06 1.06l-6-6a.75.75 0 0 1 0-1.06l6-6a.75.75 0 0 1 1.06 0Z"
            clipRule="evenodd"
          />
        </svg>
      </button>
    </div>
  );
}
