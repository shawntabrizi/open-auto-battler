import { getCardEmoji } from '../../utils/emoji';
import type { CardView } from '../../types';

/**
 * A self-contained card detail breakdown for presentations.
 * Mirrors the CardDetailPanel's card tab layout without needing
 * the game store or router.
 */
export function CardBreakdownComponent({ card }: { card: CardView }) {
  return (
    <div className="w-80 bg-gray-900 rounded-xl border border-gray-700 shadow-2xl p-5 text-left">
      {/* Card Basic Info */}
      <div className="flex items-center gap-4 mb-4">
        <div className="w-16 h-16 bg-gray-800 rounded-xl border-2 border-gray-700 flex items-center justify-center text-3xl shadow-inner flex-shrink-0">
          {getCardEmoji(card.template_id)}
        </div>
        <div>
          <h2 className="text-xl font-bold text-white leading-tight">{card.name}</h2>
          <div className="flex gap-2 mt-1">
            <span className="px-2 py-0.5 bg-red-900/50 text-red-400 border border-red-800 rounded text-xs font-bold">
              ATK: {card.attack}
            </span>
            <span className="px-2 py-0.5 bg-green-900/50 text-green-400 border border-green-800 rounded text-xs font-bold">
              HP: {card.health}
            </span>
          </div>
        </div>
      </div>

      {/* Abilities */}
      {card.abilities.map((ability, index) => (
        <div
          key={index}
          className="mb-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700"
        >
          <h3 className="text-sm font-bold text-yellow-400 mb-1">{ability.name}</h3>
          <div className="text-xs text-gray-300 mb-1">
            <strong>Trigger:</strong> {formatTrigger(ability.trigger)}
          </div>
          <div className="text-sm text-gray-200 bg-gray-900/50 p-2 rounded border border-gray-700/50 italic">
            "{ability.description}"
          </div>
        </div>
      ))}

      {/* Economy */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 bg-blue-900/20 border border-blue-800/50 rounded-lg">
          <div className="text-[10px] text-blue-400 uppercase font-bold mb-1">Cost</div>
          <div className="text-lg font-bold text-white flex items-center gap-1">
            {card.play_cost} <span className="text-blue-400 text-sm">Mana</span>
          </div>
        </div>
        <div className="p-3 bg-orange-900/20 border border-orange-800/50 rounded-lg">
          <div className="text-[10px] text-orange-400 uppercase font-bold mb-1">Pitch</div>
          <div className="text-lg font-bold text-white flex items-center gap-1">
            +{card.pitch_value} <span className="text-orange-400 text-sm">Mana</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatTrigger(trigger: string): string {
  switch (trigger) {
    case 'OnStart': return 'Battle Start';
    case 'OnFaint': return 'When Dies';
    case 'OnAllyFaint': return 'When Ally Dies';
    case 'OnHurt': return 'When Hurt';
    case 'OnSpawn': return 'On Spawn';
    case 'BeforeUnitAttack': return 'Before Attacking';
    case 'AfterUnitAttack': return 'After Attacking';
    case 'BeforeAnyAttack': return 'Before Any Attack';
    case 'AfterAnyAttack': return 'After Any Attack';
    default: return trigger;
  }
}
