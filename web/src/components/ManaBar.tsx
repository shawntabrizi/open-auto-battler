import { useGameStore } from '../store/gameStore';

export function ManaBar() {
  const { view } = useGameStore();

  if (!view) return null;

  return (
    <div className="mana-bar-container zone-divider w-full px-4 py-2.5 lg:py-3 bg-warm-900/70 border-y border-warm-600/50">
      <div className="flex items-center gap-3">
        {/* Mana label */}
        <div className="text-xs lg:text-sm text-mana-blue font-bold uppercase tracking-wide whitespace-nowrap">
          Mana
        </div>

        {/* Mana bar with segments */}
        <div className="flex-1 flex gap-1 lg:gap-1.5">
          {Array.from({ length: view.mana_limit }, (_, i) => (
            <div
              key={i}
              className={`flex-1 h-4 lg:h-5 rounded-md transition-all duration-200 ${
                i < view.mana
                  ? 'bg-gradient-to-t from-mana-blue to-blue-400 shadow-[0_0_8px_rgba(91,143,170,0.6)]'
                  : 'bg-warm-700 border border-warm-600'
              }`}
            />
          ))}
        </div>

        {/* Mana count */}
        <div className="text-sm lg:text-base font-bold font-stat text-white whitespace-nowrap">
          <span className="text-mana-blue">{view.mana}</span>
          <span className="text-warm-500">/{view.mana_limit}</span>
        </div>
      </div>
    </div>
  );
}
