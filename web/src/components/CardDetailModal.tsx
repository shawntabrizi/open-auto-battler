import React from 'react';
import type { CardView } from '../types';
import { getCardEmoji } from '../utils/emoji';

interface CardDetailModalProps {
  card: CardView;
  isOpen: boolean;
  onClose: () => void;
}

export function CardDetailModal({ card, isOpen, onClose }: CardDetailModalProps) {
  const [showRaw, setShowRaw] = React.useState(false);

  if (!isOpen) return null;

  const getTriggerDescription = (trigger: string): string => {
    switch (trigger) {
      case 'onStart':
        return 'Battle Start';
      case 'onFaint':
        return 'When Dies';
      default:
        return trigger;
    }
  };

  const getEffectDescription = (effect: any): string => {
    switch (effect.type) {
      case 'damage':
        return `Deal ${effect.amount} damage to ${getTargetDescription(effect.target)}`;
      case 'heal':
        return `Heal ${effect.amount} health to ${getTargetDescription(effect.target)}`;
      case 'attackBuff':
        return `Give +${effect.amount} attack to ${getTargetDescription(effect.target)}`;
      case 'healthBuff':
        return `Give +${effect.amount} max health to ${getTargetDescription(effect.target)}`;
      case 'spawnUnit':
        return `Spawn a ${effect.templateId.replace('_', ' ')}`;
      default:
        return JSON.stringify(effect);
    }
  };

  const getTargetDescription = (target: string): string => {
    switch (target) {
      case 'selfUnit':
        return 'this unit';
      case 'allAllies':
        return 'all allies';
      case 'allEnemies':
        return 'all enemies';
      case 'randomAlly':
        return 'a random ally';
      case 'randomEnemy':
        return 'a random enemy';
      case 'frontAlly':
        return 'the front ally';
      case 'frontEnemy':
        return 'the front enemy';
      case 'backAlly':
        return 'the back ally';
      case 'backEnemy':
        return 'the back enemy';
      default:
        return target;
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-card-bg border-2 border-gray-600 rounded-lg p-6 max-w-md w-full mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-xl font-bold text-white">{card.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">
            ×
          </button>
        </div>

        {/* Card Display */}
        <div className="flex flex-col items-center mb-6">
          {/* Card Art */}
          <div className="w-32 h-32 bg-gray-700 rounded-lg flex items-center justify-center text-6xl mb-4">
            {getCardEmoji(card.templateId)}
          </div>

          {/* Stats */}
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

          {/* Costs */}
          <div className="flex gap-4 mt-4">
            <div className="flex items-center gap-1">
              <div className="w-6 h-6 bg-mana-blue rounded-full flex items-center justify-center text-xs font-bold border border-blue-300">
                {card.playCost}
              </div>
              <span className="text-xs text-gray-400">Play</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-6 h-6 bg-pitch-red rounded-full flex items-center justify-center text-xs font-bold border border-red-300">
                {card.pitchValue}
              </div>
              <span className="text-xs text-gray-400">Pitch</span>
            </div>
          </div>
        </div>

        {/* Ability Section */}
        {card.abilities.length > 0 && (
          <div className="mb-6">
            {card.abilities.map((ability, index) => (
              <div key={index} className="mb-4 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                <h3 className="text-lg font-bold text-yellow-400 mb-2">
                  Ability: {ability.name}
                </h3>
                <div className="text-sm text-gray-300 mb-2">
                  <strong>Trigger:</strong> {getTriggerDescription(ability.trigger)}
                </div>
                <div className="text-sm text-white">{ability.description}</div>
                <div className="text-xs text-gray-400 mt-2 italic">
                  {getEffectDescription(ability.effect)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => setShowRaw(!showRaw)}
            className="flex-1 btn bg-gray-600 hover:bg-gray-500 text-white"
          >
            {showRaw ? 'Hide' : 'Show'} Raw JSON
          </button>
          <button onClick={onClose} className="flex-1 btn btn-primary">
            Close
          </button>
        </div>

        {/* Raw JSON Section */}
        {showRaw && (
          <div className="mt-4 p-3 bg-gray-900 rounded border border-gray-700">
            <pre className="text-xs text-gray-300 overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(card, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
