import type { CardView, BoardUnitView } from '../types';

interface UnitCardProps {
  card: CardView | BoardUnitView;
  isSelected?: boolean;
  onClick?: () => void;
  showCost?: boolean;
  frozen?: boolean;
  canAfford?: boolean;
}

export function UnitCard({
  card,
  isSelected = false,
  onClick,
  showCost = true,
  frozen = false,
  canAfford = true,
}: UnitCardProps) {
  const isBoardUnit = 'currentHealth' in card;
  const currentHealth = isBoardUnit ? card.currentHealth : card.health;
  const maxHealth = isBoardUnit ? card.maxHealth : card.health;
  const isDamaged = currentHealth < maxHealth;

  return (
    <div
      onClick={onClick}
      className={`
        card relative w-24 h-32 cursor-pointer select-none
        ${isSelected ? 'card-selected ring-2 ring-yellow-400' : ''}
        ${frozen ? 'ring-2 ring-cyan-400' : ''}
        ${!canAfford && showCost ? 'opacity-60' : ''}
      `}
    >
      {/* Card name */}
      <div className="text-xs font-bold text-center truncate mb-1">
        {card.name}
      </div>

      {/* Card art placeholder */}
      <div className="w-full h-14 bg-gray-700 rounded flex items-center justify-center text-2xl">
        {getCardEmoji(card.templateId)}
      </div>

      {/* Stats row */}
      <div className="flex justify-between items-center mt-1">
        {/* Attack */}
        <div className="flex items-center text-sm">
          <span className="text-red-400 mr-1">⚔</span>
          <span className="font-bold">{card.attack}</span>
        </div>

        {/* Health */}
        <div className="flex items-center text-sm">
          <span className={isDamaged ? 'text-red-500' : 'text-green-400'}>❤</span>
          <span className={`font-bold ml-1 ${isDamaged ? 'text-red-400' : ''}`}>
            {currentHealth}
          </span>
        </div>
      </div>

      {/* Cost badge (top left) */}
      {showCost && (
        <div className="absolute -top-2 -left-2 w-6 h-6 bg-mana-blue rounded-full flex items-center justify-center text-xs font-bold border-2 border-blue-300">
          {card.playCost}
        </div>
      )}

      {/* Pitch value badge (top right) */}
      <div className="absolute -top-2 -right-2 w-6 h-6 bg-pitch-red rounded-full flex items-center justify-center text-xs font-bold border-2 border-red-300">
        {card.pitchValue}
      </div>

      {/* Frozen indicator */}
      {frozen && (
        <div className="absolute inset-0 bg-cyan-400/20 rounded-lg flex items-center justify-center">
          <span className="text-2xl">❄</span>
        </div>
      )}
    </div>
  );
}

function getCardEmoji(templateId: string): string {
  const emojis: Record<string, string> = {
    goblin_scout: '👺',
    goblin_looter: '💰',
    militia: '🛡',
    shield_bearer: '🏰',
    wolf_rider: '🐺',
    orc_warrior: '👹',
    troll_brute: '🧌',
    ogre_mauler: '👊',
    giant_crusher: '🦣',
    dragon_tyrant: '🐉',
  };
  return emojis[templateId] || '❓';
}

// Empty slot component
interface EmptySlotProps {
  onClick?: () => void;
  isTarget?: boolean;
  label?: string;
}

export function EmptySlot({ onClick, isTarget = false, label }: EmptySlotProps) {
  return (
    <div
      onClick={onClick}
      className={`
        slot w-24 h-32 cursor-pointer
        ${isTarget ? 'border-yellow-400 bg-yellow-400/10' : ''}
      `}
    >
      {label && <span className="text-gray-500 text-xs">{label}</span>}
    </div>
  );
}
