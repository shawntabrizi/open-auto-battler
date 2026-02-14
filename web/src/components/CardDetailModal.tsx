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

  const getTriggerDescription = (trigger: any): string => {
    const type = typeof trigger === 'string' ? trigger : trigger?.type;

    switch (type) {
      case 'OnStart':
        return 'Battle Start';
      case 'OnFaint':
        return 'When Dies';
      case 'OnAllyFaint':
        return 'When Ally Dies';
      case 'OnHurt':
        return 'When Hurt';
      case 'OnSpawn':
        return 'On Spawn';
      case 'OnAllySpawn':
        return 'Ally Spawned';
      case 'OnEnemySpawn':
        return 'Enemy Spawned';
      case 'BeforeUnitAttack':
        return 'Before Attacking';
      case 'AfterUnitAttack':
        return 'After Attacking';
      case 'BeforeAnyAttack':
        return 'Before Any Attack';
      case 'AfterAnyAttack':
        return 'After Any Attack';
      default:
        return typeof type === 'string' ? type : 'Unknown';
    }
  };

  const getEffectDescription = (effect: any): string => {
    if (!effect || typeof effect !== 'object') {
      return 'Unknown effect';
    }

    const type = effect.type;
    const data = effect.value || effect;

    switch (type) {
      case 'Damage':
        return `Deal ${data.amount || 0} damage to ${getTargetDescription(data.target)}`;
      case 'ModifyStats': {
        const h = data.health || 0;
        const a = data.attack || 0;
        return `Give ${a >= 0 ? '+' : ''}${a}/${h >= 0 ? '+' : ''}${h} to ${getTargetDescription(data.target)}`;
      }
      case 'SpawnUnit':
        return `Spawn unit (card #${data.card_id ?? '?'})`;
      case 'Destroy':
        return `Destroy ${getTargetDescription(data.target)}`;
      default:
        return `Effect: ${type}`;
    }
  };

  const getTargetDescription = (target: any): string => {
    if (!target || typeof target !== 'object') return 'unknown target';

    const type = target.type;
    const data = target.value || target.data || target;

    const describeScope = (scope: any) => {
      const s = typeof scope === 'string' ? scope : scope?.type || 'unknown';
      switch (s) {
        case 'SelfUnit':
          return 'this unit';
        case 'Allies':
          return 'all allies';
        case 'Enemies':
          return 'all enemies';
        case 'All':
          return 'all units';
        case 'AlliesOther':
          return 'all other allies';
        case 'TriggerSource':
          return 'the target';
        case 'Aggressor':
          return 'the attacker';
        default:
          return s;
      }
    };

    const describeScopeSingular = (scope: any) => {
      const s = typeof scope === 'string' ? scope : scope?.type || 'unknown';
      switch (s) {
        case 'SelfUnit':
          return 'this unit';
        case 'Allies':
          return 'ally';
        case 'Enemies':
          return 'enemy';
        case 'All':
          return 'unit';
        case 'AlliesOther':
          return 'other ally';
        case 'TriggerSource':
          return 'target';
        case 'Aggressor':
          return 'attacker';
        default:
          return s;
      }
    };

    switch (type) {
      case 'All':
        return describeScope(data.scope);
      case 'Position': {
        const { scope, index } = data;
        const s = typeof scope === 'string' ? scope : scope?.type || 'unknown';
        if (s === 'SelfUnit') {
          if (index === -1) return 'the unit ahead';
          if (index === 1) return 'the unit behind';
          return 'this unit';
        }
        const posName = index === 0 ? 'front' : index === -1 ? 'back' : `slot ${index + 1}`;
        return `the ${posName} ${describeScopeSingular(scope)}`;
      }
      case 'Random':
        return `a random ${describeScopeSingular(data.scope)}`;
      case 'Standard': {
        const { stat, order, count } = data;
        const orderName =
          (typeof order === 'string' ? order : order?.type) === 'Ascending' ? 'lowest' : 'highest';
        const countStr = count === 1 ? 'the' : `the ${count}`;
        return `${countStr} ${orderName} ${typeof stat === 'string' ? stat : stat?.type} ${describeScopeSingular(data.scope)}`;
      }
      case 'Adjacent':
        return `units adjacent to ${describeScope(data.scope)}`;
      default:
        return `Target: ${type}`;
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
            {getCardEmoji(card.id)}
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
                {card.play_cost}
              </div>
              <span className="text-xs text-gray-400">Play</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-6 h-6 bg-pitch-red rounded-full flex items-center justify-center text-xs font-bold border border-red-300">
                {card.pitch_value}
              </div>
              <span className="text-xs text-gray-400">Pitch</span>
            </div>
          </div>
        </div>

        {/* Ability Section */}
        {card.abilities.length > 0 && (
          <div className="mb-6">
            {card.abilities.map((ability, index) => (
              <div
                key={index}
                className="mb-4 p-4 bg-gray-800/50 rounded-lg border border-gray-700"
              >
                <h3 className="text-lg font-bold text-yellow-400 mb-2">Ability: {ability.name}</h3>
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
