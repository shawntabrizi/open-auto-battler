import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import type { CardView } from '../types';
import { getCardEmoji } from '../utils/emoji';

interface CardDetailPanelProps {
  card: CardView | null;
  isVisible: boolean;
  isSandbox?: boolean;
}

type TabType = 'card' | 'rules' | 'mode';

export function CardDetailPanel({ card, isVisible, isSandbox = false }: CardDetailPanelProps) {
  const [activeTab, setActiveTab] = React.useState<TabType>('card');
  const navigate = useNavigate();
  const { view, selection, playHandCard, pitchHandCard, pitchBoardUnit, setSelection, showRawJson, toggleShowRawJson } = useGameStore();

  if (!isVisible) return null;

  // Get the selected hand/board index for actions
  const selectedHandIndex = selection?.type === 'hand' ? selection.index : -1;
  const selectedBoardIndex = selection?.type === 'board' ? selection.index : -1;
  const isBoardUnit = selection?.type === 'board';

  const renderCardTab = () => {
    if (!card) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="text-4xl mb-4">👆</div>
          <h3 className="text-lg font-bold text-gray-300 mb-2">Select a Card</h3>
          <p className="text-sm text-gray-400">
            Click on any card in your hand or board to view its detailed information.
          </p>
        </div>
      );
    }

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
        case 'onSpawn':
          return 'On Spawn';
        case 'onAllySpawn':
          return 'Ally Spawned';
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
        case 'modifyStats':
          const h = effect.health || 0;
          const a = effect.attack || 0;
          return `Give ${a >= 0 ? '+' : ''}${a}/${h >= 0 ? '+' : ''}${h} to ${getTargetDescription(effect.target)}`;
        default:
          return JSON.stringify(effect);
      }
    };

    const getTargetDescription = (target: string | undefined): string => {
      if (!target) return 'unknown target';

      switch (target) {
        case 'selfUnit':
          return 'this unit';
        case 'triggerTarget':
          return 'the target';
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
          return 'the ally in front';
        case 'lowestHealthEnemy':
          return 'the weakest enemy';
        case 'highestAttackEnemy':
          return 'the strongest enemy';
        case 'highestHealthEnemy':
          return 'the healthiest enemy';
        case 'lowestAttackEnemy':
          return 'the weakest enemy';
        default:
          return target;
      }
    };

    const emptyBoardSlot = view?.board.findIndex(slot => slot === null) ?? -1;

    return (
      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
        {/* Action Buttons */}
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
                Pitch Board Unit (+{card.pitchValue} mana)
              </button>
            ) : (
              // Hand card actions
              <>
                <button
                  onClick={() => {
                    if (selectedHandIndex >= 0 && emptyBoardSlot >= 0) {
                      playHandCard(selectedHandIndex, emptyBoardSlot);
                      setSelection(null); // Clear selection after playing
                    }
                  }}
                  disabled={selectedHandIndex < 0 || emptyBoardSlot < 0 || !view?.canAfford[selectedHandIndex]}
                  className={`w-full btn text-sm ${selectedHandIndex >= 0 && emptyBoardSlot >= 0 && view?.canAfford[selectedHandIndex] ? 'btn-primary' : 'btn-disabled'}`}
                >
                  {emptyBoardSlot < 0 ? 'Board Full' : `Play (-${card.playCost} mana)`}
                </button>
                <button
                  onClick={() => {
                    if (selectedHandIndex >= 0) {
                      pitchHandCard(selectedHandIndex);
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

        {/* Card Basic Info */}
        <div className="flex items-center gap-4 mb-6">
          <div className="w-20 h-20 bg-gray-800 rounded-xl border-2 border-gray-700 flex items-center justify-center text-4xl shadow-inner">
            {getCardEmoji(card.templateId)}
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white leading-tight">{card.name}</h2>
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
                {ability.maxTriggers && (
                  <div className="text-xs text-orange-400 mb-2">
                    <strong>Max Triggers:</strong> {ability.maxTriggers}
                  </div>
                )}
                <div className="text-sm text-gray-200 bg-gray-900/50 p-2 rounded border border-gray-700/50 italic">
                  "{ability.description}"
                </div>
                <div className="mt-2 text-xs text-blue-400 font-semibold">
                  Result: {getEffectDescription(ability.effect)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Economy Section */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="p-3 bg-blue-900/20 border border-blue-800/50 rounded-lg">
            <div className="text-[10px] text-blue-400 uppercase font-bold mb-1">Play Cost</div>
            <div className="text-xl font-bold text-white flex items-center gap-1">
              {card.playCost} <span className="text-blue-400 text-sm">Mana</span>
            </div>
          </div>
          <div className="p-3 bg-orange-900/20 border border-orange-800/50 rounded-lg">
            <div className="text-[10px] text-orange-400 uppercase font-bold mb-1">Pitch Value</div>
            <div className="text-xl font-bold text-white flex items-center gap-1">
              +{card.pitchValue} <span className="text-orange-400 text-sm">Mana</span>
            </div>
          </div>
        </div>

        {/* Metadata */}
        <div className="text-[10px] text-gray-500 font-mono flex flex-col gap-1 border-t border-gray-800 pt-4">
          <div>TEMPLATE_ID: {card.templateId}</div>
          <div>INSTANCE_ID: {card.id}</div>
          {card.isToken && <div className="text-yellow-600 font-bold">TOKEN UNIT</div>}
        </div>

        {/* Card Raw JSON */}
        {showRawJson && (
          <div className="mt-4 p-2 bg-black/50 rounded border border-gray-800">
            <div className="text-[10px] text-gray-500 mb-1 flex justify-between items-center">
              <span>CARD_DATA.JSON</span>
              <button 
                onClick={() => navigator.clipboard.writeText(JSON.stringify(card, null, 2))}
                className="text-blue-500 hover:text-blue-400 font-mono text-[9px]"
              >
                Copy
              </button>
            </div>
            <pre className="text-[9px] text-blue-400/80 custom-scrollbar max-h-48 overflow-auto">
              {JSON.stringify(card, null, 2)}
            </pre>
          </div>
        )}
      </div>
    );
  };

  const renderRulesTab = () => {
    return (
      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-4 text-sm text-gray-300">
        <section>
          <h3 className="font-bold text-white mb-1 border-b border-gray-700 pb-1">Planning Phase</h3>
          <p>Each turn you get a new Hand of 7 cards from your Bag. Unused cards return to your bag.</p>
        </section>
        <section>
          <h3 className="font-bold text-white mb-1 border-b border-gray-700 pb-1">Mana System</h3>
          <p>You start each turn with 0 Mana. Pitch cards from your Hand or Units from your Board to gain Mana.</p>
          <p className="mt-1 text-xs text-gray-400 italic">Your maximum mana capacity increases every round.</p>
        </section>
        <section>
          <h3 className="font-bold text-white mb-1 border-b border-gray-700 pb-1">Combat</h3>
          <p>Units fight from front to back. High Attack units trigger their abilities first when a trigger is shared.</p>
        </section>
        <section>
          <h3 className="font-bold text-white mb-1 border-b border-gray-700 pb-1">Winning</h3>
          <p>Reach 10 Wins before you lose all 3 Lives!</p>
        </section>
      </div>
    );
  };

  const renderModeTab = () => {
    return (
      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-4">
        <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
          <h3 className="font-bold text-white mb-2">Debug Tools</h3>
          <div className="space-y-3">
            <button 
              onClick={toggleShowRawJson}
              className="w-full btn btn-secondary text-xs py-2"
            >
              {showRawJson ? 'Hide Raw State' : 'View Raw Game State'}
            </button>
            <button 
              onClick={() => navigate('/sandbox')}
              className="w-full btn bg-purple-900/50 hover:bg-purple-800 text-purple-200 border border-purple-700 text-xs py-2"
            >
              Enter Sandbox Mode
            </button>
            <button 
              onClick={() => navigate('/multiplayer')}
              className="w-full btn bg-blue-900/50 hover:bg-blue-800 text-blue-200 border border-blue-700 text-xs py-2"
            >
              Enter Multiplayer Mode
            </button>
          </div>
        </div>
        
        {showRawJson && view && (
          <div className="mt-4 p-2 bg-black/50 rounded border border-gray-800">
            <div className="text-[10px] text-gray-500 mb-1 flex justify-between items-center">
              <span>GAME_VIEW.JSON</span>
              <button 
                onClick={() => navigator.clipboard.writeText(JSON.stringify(view, null, 2))}
                className="text-blue-500 hover:text-blue-400"
              >
                Copy
              </button>
            </div>
            <pre className="text-[9px] text-green-500/80 custom-scrollbar max-h-64 overflow-auto">
              {JSON.stringify(view, null, 2)}
            </pre>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed left-0 top-16 bottom-0 w-80 bg-gray-900 border-r border-gray-700 shadow-2xl flex flex-col z-10">
      {/* Tabs */}
      <div className="flex border-b border-gray-800">
        <button
          onClick={() => setActiveTab('card')}
          className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${
            activeTab === 'card' ? 'bg-gray-800 text-yellow-500 border-b-2 border-yellow-500' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Card
        </button>
        <button
          onClick={() => setActiveTab('rules')}
          className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${
            activeTab === 'rules' ? 'bg-gray-800 text-yellow-500 border-b-2 border-yellow-500' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Rules
        </button>
        <button
          onClick={() => setActiveTab('mode')}
          className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${
            activeTab === 'mode' ? 'bg-gray-800 text-yellow-500 border-b-2 border-yellow-500' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          System
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 p-5 flex flex-col overflow-hidden">
        {activeTab === 'card' && renderCardTab()}
        {activeTab === 'rules' && renderRulesTab()}
        {activeTab === 'mode' && renderModeTab()}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-800 bg-black/20 text-[10px] text-gray-600 text-center uppercase tracking-tighter">
        Manalimit Engine v0.2.0 • Build 2026.01
      </div>
    </div>
  );
}
