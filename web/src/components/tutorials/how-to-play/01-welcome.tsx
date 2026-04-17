import { useGameStore } from '../../../store/gameStore';
import { UnitCard } from '../../UnitCard';

export default function Welcome() {
  const setPreviewCards = useGameStore((s) => s.setPreviewCards);

  // Grab first 10 cards from any loaded set for the VS display
  const allCards = Object.values(setPreviewCards).flat();
  const leftCards = allCards.slice(0, 5);
  const rightCards = allCards.slice(5, 10);

  return (
    <div className="text-center">
      <h1 className="text-3xl lg:text-5xl font-title font-bold text-transparent bg-clip-text theme-title-text mb-4 lg:mb-6">
        Welcome to Open Auto Battler!
      </h1>
      <p className="text-base-300 text-sm lg:text-lg leading-relaxed max-w-lg mx-auto mb-6 lg:mb-10">
        Draft cards, build a team, and watch them clash automatically. Each round you grow stronger,
        but so do your opponents. Can you rack up 10 wins before your lives run out?
      </p>

      {/* VS card display */}
      {leftCards.length > 0 && rightCards.length > 0 && (
        <div className="flex items-center justify-center gap-2 lg:gap-6">
          <div className="flex gap-1 lg:gap-2">
            {leftCards.map((card) => (
              <div key={card.id} className="w-10 h-14 lg:w-16 lg:h-[5.25rem]">
                <UnitCard
                  card={card}
                  showCost={false}
                  showBurn={false}
                  enableTilt={false}
                  enableWobble={false}
                />
              </div>
            ))}
          </div>

          <div
            className="text-2xl lg:text-4xl font-title font-bold text-accent shrink-0"
            style={{ textShadow: '0 0 20px rgba(212, 168, 67, 0.4)' }}
          >
            VS
          </div>

          <div className="flex gap-1 lg:gap-2">
            {rightCards.map((card) => (
              <div key={card.id} className="w-10 h-14 lg:w-16 lg:h-[5.25rem]">
                <UnitCard
                  card={card}
                  showCost={false}
                  showBurn={false}
                  enableTilt={false}
                  enableWobble={false}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
