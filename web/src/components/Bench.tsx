import { useGameStore } from '../store/gameStore';
import { UnitCard, EmptySlot } from './UnitCard';

export function Bench() {
  const { view, selection, setSelection, pitchBenchUnit } = useGameStore();

  if (!view) return null;

  const handleBenchSlotClick = (index: number) => {
    const card = view.bench[index];

    if (card) {
      // Toggle selection
      if (selection?.type === 'bench' && selection.index === index) {
        setSelection(null);
      } else {
        setSelection({ type: 'bench', index });
      }
    }
  };

  return (
    <div className="bg-gray-800/50 border-t border-gray-700 py-4">
      <div className="flex items-center justify-center gap-4">
        <div className="text-sm text-gray-400">Bench</div>
        <div className="flex gap-2">
          {view.bench.map((card, i) => (
            card ? (
              <UnitCard
                key={card.id}
                card={card}
                showCost={false}
                isSelected={selection?.type === 'bench' && selection.index === i}
                onClick={() => handleBenchSlotClick(i)}
              />
            ) : (
              <EmptySlot key={`empty-${i}`} />
            )
          ))}
        </div>
      </div>

      {/* Action buttons for selected bench unit */}
      {selection?.type === 'bench' && view.bench[selection.index] && (
        <div className="flex justify-center gap-2 mt-2">
          <span className="text-sm text-gray-400 self-center">
            Click a board slot to place, or:
          </span>
          <button
            onClick={() => pitchBenchUnit(selection.index)}
            className="btn btn-danger text-sm"
          >
            Pitch (+{view.bench[selection.index]?.pitchValue})
          </button>
        </div>
      )}
    </div>
  );
}
