import { useGameStore } from '../store/gameStore';

export function ManaBar() {
  const { view } = useGameStore();

  if (!view) return null;

  return (
    <div
      className="mana-bar-container theme-panel w-full px-4 py-1.5 bg-surface-dark/75 border-y border-base-700"
      aria-label={`Mana: ${view.mana} of ${view.mana_limit}`}
    >
      <div className="flex items-center gap-3">
        {/* Mana label */}
        <div className="text-[10px] lg:text-xs text-mana-blue font-bold uppercase tracking-wide whitespace-nowrap">
          Mana
        </div>

        {/* Mana bar with segments */}
        <div className="flex-1 flex gap-1 lg:gap-1.5 pointer-events-none" aria-hidden="true">
          {Array.from({ length: view.mana_limit }, (_, i) => (
            <div
              key={i}
              className={`flex-1 h-2.5 lg:h-3 rounded-full transition-all duration-200 ${
                i < view.mana ? 'mana-segment-filled' : 'bg-surface-mid/80 border border-base-700'
              }`}
            />
          ))}
        </div>

        {/* Mana count */}
        <div className="text-xs lg:text-sm font-bold text-white whitespace-nowrap">
          <span className="text-mana-blue">{view.mana}</span>
          <span className="text-base-400">/{view.mana_limit}</span>
        </div>
      </div>
    </div>
  );
}
