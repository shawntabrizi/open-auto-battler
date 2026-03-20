import { useGameStore } from '../../../store/gameStore';
import { UnitCard } from '../../UnitCard';
import { SwordIcon } from '../../Icons';

export default function Cards() {
  const setPreviewCards = useGameStore((s) => s.setPreviewCards);

  // Pick a card with decent stats for a good demo
  const allCards = Object.values(setPreviewCards).flat();
  const demoCard = allCards.find((c) => c.play_cost >= 3) ?? allCards[0];

  return (
    <div>
      <h2 className="text-2xl lg:text-3xl font-heading font-bold text-white mb-4 lg:mb-6 text-center">
        Cards
      </h2>

      <div className="flex flex-row items-center gap-4 lg:gap-8">
        {/* Large card display */}
        {demoCard && (
          <div className="w-[7.5rem] h-[10rem] lg:w-[12rem] lg:h-[16rem] shrink-0">
            <UnitCard card={demoCard} showCost={true} showBurn={true} enableTilt={false} enableWobble={false} />
          </div>
        )}

        {/* Stat explanations */}
        <div className="space-y-3 lg:space-y-4 text-sm lg:text-base">
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 lg:w-8 lg:h-8 shrink-0 rounded bg-blue-900/40 border border-blue-700/50 flex items-center justify-center text-blue-400 font-stat font-bold text-sm lg:text-base">
              {demoCard?.play_cost ?? '3'}
            </div>
            <div>
              <span className="text-blue-400 font-bold">Mana Cost</span>
              <span className="text-warm-400"> — the mana required to play this card onto your board.</span>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-7 h-7 lg:w-8 lg:h-8 shrink-0 rounded bg-orange-900/40 border border-orange-700/50 flex items-center justify-center text-orange-400 font-stat font-bold text-sm lg:text-base">
              {demoCard?.burn_value ?? '1'}
            </div>
            <div>
              <span className="text-orange-400 font-bold">Burn Value</span>
              <span className="text-warm-400"> — burn this card from your hand or board to gain this much mana.</span>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex items-center gap-1 shrink-0">
              <SwordIcon className="w-5 h-5 lg:w-6 lg:h-6 text-red-400" />
              <span className="font-stat font-bold text-white text-base lg:text-lg">{demoCard?.attack ?? '3'}</span>
            </div>
            <div>
              <span className="text-red-400 font-bold">Attack</span>
              <span className="text-warm-400"> — damage dealt to the enemy unit each clash.</span>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex items-center gap-1 shrink-0">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 lg:w-6 lg:h-6 text-green-400">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
              <span className="font-stat font-bold text-white text-base lg:text-lg">{demoCard?.health ?? '5'}</span>
            </div>
            <div>
              <span className="text-green-400 font-bold">Health</span>
              <span className="text-warm-400"> — how much damage this unit can take before being destroyed.</span>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex items-center gap-1 shrink-0">
              <svg viewBox="0 0 24 24" fill="#eab308" className="w-5 h-5 lg:w-6 lg:h-6">
                <path d="M13 3L4 14h7l-2 7 9-11h-7l2-7z" />
              </svg>
            </div>
            <div>
              <span className="text-yellow-400 font-bold">Abilities</span>
              <span className="text-warm-400"> — cards may have one or more abilities which trigger in battle.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
