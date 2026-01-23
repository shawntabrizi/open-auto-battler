import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import type { CardView } from '../types';

interface CardDetailPanelProps {
  card: CardView | null;
  isVisible: boolean;
  isSandbox?: boolean;
}

type TabType = 'card' | 'rules';

export function CardDetailPanel({ card, isVisible, isSandbox = false }: CardDetailPanelProps) {
  const [activeTab, setActiveTab] = React.useState<TabType>('card');
  const navigate = useNavigate();
  const { view, selection, buyCard, toggleFreeze, pitchShopCard, pitchBoardUnit, setSelection, showRawJson, toggleShowRawJson } = useGameStore();

  if (!isVisible) return null;

  // Get the selected shop/board index for actions
  const selectedShopIndex = selection?.type === 'shop' ? selection.index : -1;
  const selectedBoardIndex = selection?.type === 'board' ? selection.index : -1;
  const isBoardUnit = selection?.type === 'board';

  const renderCardTab = () => {
    if (!card) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="text-4xl mb-4">👆</div>
          <h3 className="text-lg font-bold text-gray-300 mb-2">Select a Card</h3>
          <p className="text-sm text-gray-400">
            Click on any card in the shop to view its detailed information, abilities, and stats.
          </p>
        </div>
      );
    }

    const getCardEmoji = (templateId: string): string => {
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
        sniper: '🎯',
        archer: '🏹',
        corpse_cart: '⚰️',
        lich: '💀',
        golem: '🗿',
        raging_orc: '🤬',
        pain_smith: '⛓️',
        headhunter: '🕵️',
        giant_slayer: '🗡️',
        behemoth: '🐘',
        mana_reaper: '⚖️',
        shield_squire: '🛡️',
      };
      return emojis[templateId] || '❓';
    };

    const getTriggerDescription = (trigger: string): string => {
      switch (trigger) {
        case 'onStart':
          return 'Battle Start';
        case 'onFaint':
          return 'When Dies';
        case 'onAllyFaint':
          return 'When Ally Dies';
        case 'onDamageTaken':
          return 'When Hurt';
        case 'beforeUnitAttack':
          return 'Before Attacking';
        case 'afterUnitAttack':
          return 'After Attacking';
        case 'beforeAnyAttack':
          return 'Before Any Attack';
        case 'afterAnyAttack':
          return 'After Any Attack';
        default:
          return trigger;
      }
    };

    const getEffectDescription = (effect: any): string => {
      if (!effect || typeof effect !== 'object') {
        return 'Unknown effect';
      }

      switch (effect.type) {
        case 'damage':
          return `Deal ${effect.amount || 0} damage to ${getTargetDescription(effect.target)}`;
        case 'heal':
          return `Heal ${effect.amount || 0} health to ${getTargetDescription(effect.target)}`;
        case 'attackBuff':
          return `Give +${effect.amount || 0} attack to ${getTargetDescription(effect.target)}`;
        case 'healthBuff':
          return `Give +${effect.amount || 0} max health to ${getTargetDescription(effect.target)}`;
        case 'spawnUnit':
          return `Spawn a ${effect.templateId ? effect.templateId.replace('_', ' ') : 'unit'}`;
        case 'destroy':
          return `Destroy ${getTargetDescription(effect.target)}`;
        default:
          return JSON.stringify(effect);
      }
    };

    const getTargetDescription = (target: string | undefined): string => {
      if (!target) return 'unknown target';

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
        case 'allyAhead':
          return 'the ally ahead';
        case 'lowestHealthEnemy':
          return 'the lowest health enemy';
        case 'highestAttackEnemy':
          return 'the highest attack enemy';
        case 'highestHealthEnemy':
          return 'the highest health enemy';
        case 'lowestAttackEnemy':
          return 'the lowest attack enemy';
        case 'highestManaEnemy':
          return 'the highest mana enemy';
        case 'lowestManaEnemy':
          return 'the lowest mana enemy';
        default:
          return target;
      }
    };

    return (
      <>
        {/* Card Display */}
        <div className="flex flex-col items-center mb-6">
          {/* Card Art */}
          <div className="w-24 h-24 bg-gray-700 rounded-lg flex items-center justify-center text-4xl mb-4">
            {getCardEmoji(card.templateId)}
          </div>

          {/* Card Name */}
          <div className="text-lg font-bold text-center text-white mb-2">{card.name}</div>

          {/* Stats */}
          <div className="flex gap-4 text-center">
            <div>
              <div className="text-red-400 text-xs">⚔ ATTACK</div>
              <div className="text-xl font-bold text-white">{card.attack}</div>
            </div>
            <div>
              <div className="text-green-400 text-xs">❤ HEALTH</div>
              <div className="text-xl font-bold text-white">{card.health}</div>
            </div>
          </div>

          {/* Costs */}
          <div className="flex gap-3 mt-3">
            <div className="flex items-center gap-1">
              <div className="w-5 h-5 bg-mana-blue rounded-full flex items-center justify-center text-xs font-bold border border-blue-300">
                {card.playCost}
              </div>
              <span className="text-xs text-gray-400">Play</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-5 h-5 bg-pitch-red rounded-full flex items-center justify-center text-xs font-bold border border-red-300">
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
              <div key={index} className="mb-4 p-3 bg-gray-800/50 rounded-lg border border-gray-700">
                <h3 className="text-md font-bold text-yellow-400 mb-2">
                  Ability: {ability.name}
                </h3>
                <div className="text-xs text-gray-300 mb-2">
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

        {/* Action Buttons - Only show in main game, not sandbox */}
        {!isSandbox && (
          <div className="mb-6 space-y-2">
            {isBoardUnit ? (
              // Board unit actions
              <button
                onClick={() => {
                  if (selectedBoardIndex >= 0) {
                    pitchBoardUnit(selectedBoardIndex);
                    setSelection(null); // Clear selection after pitching
                  }
                }}
                className="w-full btn btn-danger text-sm"
              >
                Pitch Board Unit
              </button>
            ) : (
              // Shop card actions
              <>
                <button
                  onClick={() => {
                    if (selectedShopIndex >= 0) {
                      buyCard(selectedShopIndex);
                      setSelection(null); // Clear selection after buying
                    }
                  }}
                  disabled={selectedShopIndex < 0 || !view?.canAfford[selectedShopIndex]}
                  className={`w-full btn text-sm ${selectedShopIndex >= 0 && view?.canAfford[selectedShopIndex] ? 'btn-primary' : 'btn-disabled'}`}
                >
                  Buy (-{card.playCost} mana)
                </button>
                <button
                  onClick={() => {
                    if (selectedShopIndex >= 0) {
                      toggleFreeze(selectedShopIndex);
                    }
                  }}
                  className="w-full btn bg-cyan-600 hover:bg-cyan-500 text-white text-sm"
                >
                  {view?.shop[selectedShopIndex]?.frozen ? 'Unfreeze' : 'Freeze'}
                </button>
                <button
                  onClick={() => {
                    if (selectedShopIndex >= 0) {
                      pitchShopCard(selectedShopIndex);
                      setSelection(null); // Clear selection after pitching
                    }
                  }}
                  className="w-full btn btn-danger text-sm"
                >
                  Pitch (+{card.pitchValue} mana)
                </button>
              </>
            )}
          </div>
        )}

        {/* Raw JSON Section */}
        <div className="mb-4">
          <button
            onClick={toggleShowRawJson}
            className="w-full btn bg-gray-600 hover:bg-gray-500 text-white text-sm"
          >
            {showRawJson ? 'Hide' : 'Show'} Raw JSON
          </button>

          {showRawJson && (
            <div className="mt-2 p-2 bg-gray-900 rounded border border-gray-700">
              <pre className="text-xs text-gray-300 overflow-x-auto whitespace-pre-wrap max-h-40 overflow-y-auto">
                {JSON.stringify(card, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </>
    );
  };

  const renderRulesTab = () => {
    return (
      <div className="space-y-4">
        <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700">
          <h3 className="text-md font-bold text-yellow-400 mb-2">🎯 Game Objective</h3>
          <p className="text-sm text-white">
            Build a powerful board of units to defeat enemy units in battle. Survive 10 rounds to
            win!
          </p>
        </div>

        <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700">
          <h3 className="text-md font-bold text-yellow-400 mb-2">⚔️ Battle Mechanics</h3>
          <ul className="text-sm text-white space-y-1">
            <li>• Front units clash simultaneously</li>
            <li>• Units die when health reaches 0</li>
            <li>• Survivors slide forward to fill gaps</li>
            <li>• Abilities trigger at specific times</li>
          </ul>
        </div>

        <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700">
          <h3 className="text-md font-bold text-yellow-400 mb-2">🏪 Shop Phase</h3>
          <ul className="text-sm text-white space-y-1">
            <li>• Select cards to buy with mana</li>
            <li>• Freeze cards to keep them</li>
            <li>• Pitch cards to gain mana</li>
            <li>• Build your board strategically</li>
          </ul>
        </div>

        <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700">
          <h3 className="text-md font-bold text-yellow-400 mb-2">💎 Ability Triggers</h3>
          <ul className="text-sm text-white space-y-1">
            <li>
              <strong>Battle Start:</strong> Triggers when battle begins
            </li>
            <li>
              <strong>When Dies:</strong> Triggers when unit is defeated
            </li>
          </ul>
        </div>

        <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700">
          <h3 className="text-md font-bold text-yellow-400 mb-2">🧪 Sandbox Mode</h3>
          <p className="text-sm text-white mb-3">
            Test unit combinations and battle scenarios without affecting your main game progress.
          </p>
          <button
            onClick={() => navigate('/sandbox')}
            className="w-full btn bg-purple-600 hover:bg-purple-500 text-white text-sm"
          >
            Open Sandbox
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed left-0 top-16 bottom-0 w-80 bg-card-bg border-r-2 border-gray-600 shadow-2xl z-40 overflow-hidden flex flex-col">
      {/* Tab Navigation */}
      <div className="flex border-b border-gray-600">
        <button
          onClick={() => setActiveTab('card')}
          className={`flex-1 py-2 px-4 text-sm font-medium transition-colors ${
            activeTab === 'card'
              ? 'bg-gray-700 text-white border-b-2 border-yellow-400'
              : 'text-gray-400 hover:text-white hover:bg-gray-800'
          }`}
        >
          Card Details
        </button>
        <button
          onClick={() => setActiveTab('rules')}
          className={`flex-1 py-2 px-4 text-sm font-medium transition-colors ${
            activeTab === 'rules'
              ? 'bg-gray-700 text-white border-b-2 border-yellow-400'
              : 'text-gray-400 hover:text-white hover:bg-gray-800'
          }`}
        >
          Rules
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'card' ? renderCardTab() : renderRulesTab()}
      </div>
    </div>
  );
}
