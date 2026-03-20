import { useGameStore } from '../../../store/gameStore';
import { UnitCard } from '../../UnitCard';

export default function Welcome() {
  const setPreviewCards = useGameStore((s) => s.setPreviewCards);

  // Grab first 6 cards from any loaded set for the VS display
  const allCards = Object.values(setPreviewCards).flat();
  const leftCards = allCards.slice(0, 3);
  const rightCards = allCards.slice(3, 6);

  return (
    <div className="text-center">
      <h1 className="text-3xl lg:text-5xl font-title font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500 mb-4 lg:mb-6">
        How to Play
      </h1>
      <p className="text-warm-300 text-sm lg:text-lg leading-relaxed max-w-lg mx-auto mb-6 lg:mb-10">
        Open Auto Battler is a roguelike deck-building auto-battler. Build an army, then watch them
        fight automatically! Each round gives you access to more resources to power up your team!
      </p>

      {/* VS card display */}
      {leftCards.length > 0 && rightCards.length > 0 && (
        <div className="flex items-center justify-center gap-2 lg:gap-6">
          <div className="flex gap-1 lg:gap-2">
            {leftCards.map((card) => (
              <div key={card.id} className="w-[3.75rem] h-[5rem] lg:w-[6rem] lg:h-[8rem]">
                <UnitCard card={card} showCost={false} showBurn={false} enableTilt={false} enableWobble={false} />
              </div>
            ))}
          </div>

          <div
            className="text-2xl lg:text-4xl font-title font-bold text-gold shrink-0"
            style={{ textShadow: '0 0 20px rgba(212, 168, 67, 0.4)' }}
          >
            VS
          </div>

          <div className="flex gap-1 lg:gap-2">
            {rightCards.map((card) => (
              <div key={card.id} className="w-[3.75rem] h-[5rem] lg:w-[6rem] lg:h-[8rem]">
                <UnitCard card={card} showCost={false} showBurn={false} enableTilt={false} enableWobble={false} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
