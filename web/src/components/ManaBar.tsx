import { useGameStore } from '../store/gameStore';

export function ManaBar() {
  const { view } = useGameStore();

  if (!view) return null;

  return (
    <div className="mana-bar-container w-full px-4 py-1.5 bg-warm-900/70 border-y border-warm-700">
      <div className="flex items-center gap-3">
        {/* Mana label */}
        <div className="text-[10px] lg:text-xs text-mana-blue font-bold uppercase tracking-wide whitespace-nowrap">
          Mana
        </div>

        {/* Mana bar with segments */}
        <div className="flex-1 flex gap-1 lg:gap-1.5">
          {Array.from({ length: view.mana_limit }, (_, i) => (
            <div
              key={i}
              className={`flex-1 h-2.5 lg:h-3 rounded-full transition-all duration-200 ${
                i < view.mana
                  ? 'bg-gradient-to-t from-mana-blue to-blue-400 shadow-[0_0_6px_rgba(59,130,246,0.5)]'
                  : 'bg-warm-700 border border-warm-600'
              }`}
            />
          ))}
        </div>

        {/* Mana count */}
        <div className="text-xs lg:text-sm font-bold text-white whitespace-nowrap">
          <span className="text-mana-blue">{view.mana}</span>
          <span className="text-warm-500">/{view.mana_limit}</span>
        </div>
      </div>
    </div>
  );
}
