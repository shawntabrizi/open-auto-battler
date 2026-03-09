import React from 'react';
import { useGameStore } from '../store/gameStore';
import type { CardView } from '../types';
import { getCardEmoji } from '../utils/emoji';
import { formatAbilitySentence } from '../utils/abilityText';

const STATUS_MASK_KEYS = new Set(['base_statuses', 'perm_statuses', 'active_statuses', 'statuses']);

function stringifyWithCompactStatusMasks(value: unknown): string {
  const encoded = JSON.stringify(
    value,
    (key, currentValue) => {
      if (STATUS_MASK_KEYS.has(key) && Array.isArray(currentValue)) {
        const normalized = currentValue.map((x) => Number(x) & 0xff);
        return `__STATUS_MASK__${JSON.stringify(normalized)}`;
      }
      return currentValue;
    },
    2
  );

  return (encoded ?? 'null').replace(/"__STATUS_MASK__(\[[^"]*\])"/g, '$1');
}

interface CardDetailModalProps {
  card: CardView;
  isOpen: boolean;
  onClose: () => void;
}

export function CardDetailModal({ card, isOpen, onClose }: CardDetailModalProps) {
  const cardNameMap = useGameStore((state) => state.cardNameMap);
  const [showRaw, setShowRaw] = React.useState(false);
  const resolveCardName = React.useCallback((cardId: number) => cardNameMap[cardId], [cardNameMap]);
  const rawJson = React.useMemo(() => stringifyWithCompactStatusMasks(card), [card]);
  const allAbilities = [...card.shop_abilities, ...card.battle_abilities];

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-card-bg border-2 border-warm-600 rounded-lg p-6 max-w-md w-full mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-xl font-bold text-white">{card.name}</h2>
          <button onClick={onClose} className="text-warm-400 hover:text-white text-xl">
            ×
          </button>
        </div>

        <div className="flex flex-col items-center mb-6">
          <div className="w-32 h-32 bg-warm-700 rounded-lg flex items-center justify-center text-6xl mb-4">
            {getCardEmoji(card.id)}
          </div>

          <div className="flex gap-6 text-center">
            <div>
              <div className="text-red-400 text-sm">⚔ ATTACK</div>
              <div className="text-2xl font-bold text-white">{card.attack}</div>
            </div>
            <div>
              <div className="text-green-400 text-sm">❤ HEALTH</div>
              <div className="text-2xl font-bold text-white">{card.health}</div>
            </div>
          </div>

          <div className="flex gap-4 mt-4">
            <div className="flex items-center gap-1">
              <div className="w-6 h-6 bg-mana-blue rounded-full flex items-center justify-center text-xs font-bold border border-blue-300">
                {card.play_cost}
              </div>
              <span className="text-xs text-warm-400">Play</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-6 h-6 bg-pitch-red rounded-full flex items-center justify-center text-xs font-bold border border-red-300">
                {card.pitch_value}
              </div>
              <span className="text-xs text-warm-400">Pitch</span>
            </div>
          </div>
        </div>

        {allAbilities.length > 0 && (
          <div className="mb-6">
            {allAbilities.map((ability, index) => (
              <div
                key={index}
                className="mb-4 p-4 bg-warm-800/50 rounded-lg border border-warm-700"
              >
                <h3 className="text-lg font-bold text-yellow-400 mb-2">
                  {allAbilities.length > 1 ? `Ability ${index + 1}` : 'Ability'}
                </h3>
                <div className="text-sm text-white">
                  {formatAbilitySentence(ability, { resolveCardName })}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => setShowRaw(!showRaw)}
            className="flex-1 btn bg-warm-600 hover:bg-warm-500 text-white"
          >
            {showRaw ? 'Hide' : 'Show'} Raw JSON
          </button>
          <button onClick={onClose} className="flex-1 btn btn-primary">
            Close
          </button>
        </div>

        {showRaw && (
          <div className="mt-4 p-3 bg-warm-900 rounded border border-warm-700">
            <pre className="text-xs text-warm-300 overflow-x-auto whitespace-pre-wrap">
              {rawJson}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
