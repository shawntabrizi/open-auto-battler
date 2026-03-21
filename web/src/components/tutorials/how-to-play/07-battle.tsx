import { useGameStore } from '../../../store/gameStore';
import { UnitCard } from '../../UnitCard';

export default function Battle() {
  const setPreviewCards = useGameStore((s) => s.setPreviewCards);
  const allCards = Object.values(setPreviewCards).flat();
  const playerCards = allCards.slice(0, 5);
  const enemyCards = allCards.slice(5, 10);

  return (
    <div>
      <h2 className="text-2xl lg:text-3xl font-heading font-bold text-white mb-4 text-center">
        The Battle Phase
      </h2>

      {/* Mini battle illustration using real cards */}
      {playerCards.length > 0 && enemyCards.length > 0 && (
        <div className="flex items-center justify-center gap-2 lg:gap-4 mb-4 lg:mb-6">
          {/* Player side */}
          <div className="flex gap-1 lg:gap-2">
            {playerCards.map((card) => (
              <div key={card.id} className="w-10 h-14 lg:w-16 lg:h-[5.25rem]">
                <UnitCard card={card} showCost={false} showBurn={false} enableTilt={false} enableWobble={false} />
              </div>
            ))}
          </div>

          {/* Clash indicator */}
          <div className="flex flex-col items-center shrink-0">
            <span className="text-lg lg:text-2xl">⚔️</span>
            <span className="text-[8px] lg:text-[10px] text-warm-500 font-bold">CLASH</span>
          </div>

          {/* Enemy side */}
          <div className="flex gap-1 lg:gap-2">
            {enemyCards.map((card) => (
              <div key={card.id} className="w-10 h-14 lg:w-16 lg:h-[5.25rem]">
                <UnitCard card={card} showCost={false} showBurn={false} enableTilt={false} enableWobble={false} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3 text-warm-300 text-sm lg:text-base leading-relaxed">
        <p>
          After the shop, your board fights an opponent's board{' '}
          <span className="text-gold font-bold">automatically</span>. The
          front unit on each side clashes first.
        </p>
        <p>
          Units deal damage equal to their{' '}
          <span className="text-defeat-red font-bold">attack</span> and lose{' '}
          <span className="text-accent-emerald font-bold">health</span> when hit. A
          unit with 0 health is destroyed.
        </p>
        <p>
          Watch for <span className="text-gold font-bold">abilities</span>!
          They fire during combat and can completely turn the tide.
        </p>
      </div>
    </div>
  );
}
