import { useGameStore } from '../../../store/gameStore';
import { UnitCard } from '../../UnitCard';
import { SwordIcon, HeartIcon, AbilityIcon } from '../../Icons';

export default function Cards() {
  const setPreviewCards = useGameStore((s) => s.setPreviewCards);

  // Pick a card with decent stats for a good demo
  const allCards = Object.values(setPreviewCards).flat();
  const demoCard = allCards.find((c) => c.play_cost >= 3) ?? allCards[0];

  return (
    <div>
      <div className="flex flex-row items-center gap-4 lg:gap-8">
        {/* Large card display */}
        {demoCard && (
          <div className="w-[7.5rem] h-[10rem] lg:w-[12rem] lg:h-[16rem] shrink-0">
            <UnitCard card={demoCard} showCost={true} showBurn={true} enableTilt={false} enableWobble={false} />
          </div>
        )}

        {/* Stat explanations */}
        <div className="space-y-3 lg:space-y-4 text-sm lg:text-base">
          <h2 className="text-2xl lg:text-3xl font-heading font-bold text-white">
            Cards
          </h2>
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 lg:w-8 lg:h-8 shrink-0 rounded bg-mana-blue/15 border border-mana-blue/30 flex items-center justify-center text-mana-blue font-stat font-bold text-sm lg:text-base">
              {demoCard?.play_cost ?? '3'}
            </div>
            <div>
              <span className="text-mana-blue font-bold">Mana Cost</span>
              <span className="text-base-400"> — the mana required to play this card onto your board.</span>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-7 h-7 lg:w-8 lg:h-8 shrink-0 rounded bg-accent-amber/15 border border-accent-amber/30 flex items-center justify-center text-accent-amber font-stat font-bold text-sm lg:text-base">
              {demoCard?.burn_value ?? '1'}
            </div>
            <div>
              <span className="text-accent-amber font-bold">Burn Value</span>
              <span className="text-base-400"> — burn this card from your hand or board to gain this much mana.</span>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex items-center gap-1 shrink-0">
              <SwordIcon className="w-5 h-5 lg:w-6 lg:h-6 text-defeat-red" />
              <span className="font-stat font-bold text-white text-base lg:text-lg">{demoCard?.attack ?? '3'}</span>
            </div>
            <div>
              <span className="text-defeat-red font-bold">Attack</span>
              <span className="text-base-400"> — damage dealt to the front enemy unit in each clash.</span>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex items-center gap-1 shrink-0">
              <HeartIcon className="w-5 h-5 lg:w-6 lg:h-6 text-accent-emerald" />
              <span className="font-stat font-bold text-white text-base lg:text-lg">{demoCard?.health ?? '5'}</span>
            </div>
            <div>
              <span className="text-accent-emerald font-bold">Health</span>
              <span className="text-base-400"> — how much damage this unit can take before being destroyed.</span>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex items-center gap-1 shrink-0">
              <AbilityIcon className="w-5 h-5 lg:w-6 lg:h-6 text-gold" />
            </div>
            <div>
              <span className="text-gold font-bold">Abilities</span>
              <span className="text-base-400"> — special effects that trigger during battle or in the shop. Read the card text carefully!</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
