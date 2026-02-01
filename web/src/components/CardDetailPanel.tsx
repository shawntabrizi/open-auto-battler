import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import type { CardView } from '../types';
import { getCardEmoji } from '../utils/emoji';

interface CardDetailPanelProps {
  card: CardView | null;
  isVisible: boolean;
  isSandbox?: boolean;
  topOffset?: string;
}

type TabType = 'card' | 'rules' | 'mode';

export function CardDetailPanel({ 
  card, 
  isVisible, 
  isSandbox = false,
  topOffset = '4rem' // Default top-16 (16 * 0.25rem = 4rem)
}: CardDetailPanelProps) {
  const [activeTab, setActiveTab] = React.useState<TabType>('card');
  const navigate = useNavigate();
  const { view, selection, pitchHandCard, pitchBoardUnit, setSelection, showRawJson, toggleShowRawJson } = useGameStore();

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
          return trigger;
      }
    };

    const getEffectDescription = (effect: any): string => {
      if (!effect || typeof effect !== 'object') {
        return 'Unknown effect';
      }

      switch (effect.type) {
        case 'Damage':
          return `Deal ${effect.amount || 0} damage to ${getTargetDescription(effect.target)}`;
        case 'ModifyStats':
          const h = effect.health || 0;
          const a = effect.attack || 0;
          return `Give ${a >= 0 ? '+' : ''}${a}/${h >= 0 ? '+' : ''}${h} to ${getTargetDescription(effect.target)}`;
        case 'SpawnUnit':
          return `Spawn a ${effect.template_id ? effect.template_id.replace('_', ' ') : 'unit'}`;
        case 'Destroy':
          return `Destroy ${getTargetDescription(effect.target)}`;
        default:
          return JSON.stringify(effect);
      }
    };

    const getTargetDescription = (target: any): string => {
      if (!target || typeof target !== 'object') return 'unknown target';

      const describeScope = (scope: string) => {
        switch (scope) {
          case 'SelfUnit': return 'this unit';
          case 'Allies': return 'all allies';
          case 'Enemies': return 'all enemies';
          case 'All': return 'all units';
          case 'AlliesOther': return 'all other allies';
          case 'TriggerSource': return 'the target';
          case 'Aggressor': return 'the attacker';
          default: return scope;
        }
      };

      const describeScopeSingular = (scope: string) => {
        switch (scope) {
          case 'SelfUnit': return 'this unit';
          case 'Allies': return 'ally';
          case 'Enemies': return 'enemy';
          case 'All': return 'unit';
          case 'AlliesOther': return 'other ally';
          case 'TriggerSource': return 'target';
          case 'Aggressor': return 'attacker';
          default: return scope;
        }
      };

      switch (target.type) {
        case 'All':
          return describeScope(target.data.scope);
        case 'Position':
          const { scope, index } = target.data;
          if (scope === 'SelfUnit') {
            if (index === -1) return 'the unit ahead';
            if (index === 1) return 'the unit behind';
            return 'this unit';
          }
          const posName = index === 0 ? 'front' : index === -1 ? 'back' : `slot ${index + 1}`;
          return `the ${posName} ${describeScopeSingular(scope)}`;
        case 'Random':
          return `a random ${describeScopeSingular(target.data.scope)}`;
        case 'Standard':
          const { stat, order, count } = target.data;
          const orderName = order === 'Ascending' ? 'lowest' : 'highest';
          const countStr = count === 1 ? 'the' : `the ${count}`;
          return `${countStr} ${orderName} ${stat} ${describeScopeSingular(target.data.scope)}`;
        case 'Adjacent':
          return `units adjacent to ${describeScope(target.data.scope)}`;
        default:
          return 'unknown';
      }
    };

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
                Pitch Board Unit (+{card.pitch_value} mana)
              </button>
            ) : (
              // Hand card actions
              <>
                <button
                  onClick={() => {
                    if (selectedHandIndex >= 0) {
                      pitchHandCard(selectedHandIndex);
                      setSelection(null); // Clear selection after pitching
                    }
                  }}
                  className="w-full btn btn-danger text-sm"
                >
                  Pitch (+{card.pitch_value} mana)
                </button>
              </>
            )}
          </div>
        )}

        {/* Card Basic Info */}
        <div className="flex items-center gap-4 mb-6">
          <div className="w-20 h-20 bg-gray-800 rounded-xl border-2 border-gray-700 flex items-center justify-center text-4xl shadow-inner">
            {getCardEmoji(card.template_id)}
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
                {ability.max_triggers && (
                  <div className="text-xs text-orange-400 mb-2">
                    <strong>Max Triggers:</strong> {ability.max_triggers}
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
              {card.play_cost} <span className="text-blue-400 text-sm">Mana</span>
            </div>
          </div>
          <div className="p-3 bg-orange-900/20 border border-orange-800/50 rounded-lg">
            <div className="text-[10px] text-orange-400 uppercase font-bold mb-1">Pitch Value</div>
            <div className="text-xl font-bold text-white flex items-center gap-1">
              +{card.pitch_value} <span className="text-orange-400 text-sm">Mana</span>
            </div>
          </div>
        </div>

        {/* Metadata */}
        <div className="text-[10px] text-gray-500 font-mono flex flex-col gap-1 border-t border-gray-800 pt-4">
          <div>TEMPLATE_ID: {card.template_id}</div>
          <div>INSTANCE_ID: {card.id}</div>
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
      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-6 text-sm text-gray-300 pb-4">
        <section>
          <h3 className="font-bold text-white mb-2 border-b border-gray-700 pb-1 flex items-center gap-2">
            <span className="text-blue-400">01.</span> Planning Phase
          </h3>
          <p className="leading-relaxed">
            Every round, you derive a fresh <strong className="text-white">Hand of 7 cards</strong> from your Bag.
            The selection is deterministic based on your game seed and the current round.
          </p>
          <p className="mt-2 text-gray-400 italic">
            Unused hand cards return to your Bag. The Bag only shrinks when you play or pitch cards.
          </p>
        </section>

        <section>
          <h3 className="font-bold text-white mb-2 border-b border-gray-700 pb-1 flex items-center gap-2">
            <span className="text-blue-400">02.</span> Mana & Economy
          </h3>
          <p className="leading-relaxed">
            You start each turn with <strong className="text-blue-400">0 Mana</strong>. Gain mana by <strong className="text-orange-400">Pitching</strong> cards from your hand or units already on your board.
          </p>
          <ul className="mt-2 space-y-1 list-disc list-inside text-xs">
            <li><strong className="text-white">Capacity:</strong> Starts at 3, increases by +1 every round (Max 10).</li>
            <li><strong className="text-white">Refilling:</strong> You can pitch, spend, and pitch again in one turn.</li>
            <li><strong className="text-white">Hard Limit:</strong> You cannot hold more than your capacity at once.</li>
          </ul>
        </section>

        <section>
          <h3 className="font-bold text-white mb-2 border-b border-gray-700 pb-1 flex items-center gap-2">
            <span className="text-blue-400">03.</span> Priority System
          </h3>
          <p className="mb-2 leading-relaxed text-xs">
            When multiple units share a trigger (e.g. "Battle Start"), the game uses a <strong className="text-white">Priority Queue</strong> to decide who goes first:
          </p>
          <div className="bg-black/30 p-3 rounded-lg border border-gray-800 font-mono text-[11px] space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-gray-500">1. Higher Power</span>
              <span className="text-red-400">ATTACK</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">2. Higher Vitality</span>
              <span className="text-green-400">HEALTH</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">3. Default Team</span>
              <span className="text-blue-400">PLAYER</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">4. Physical Lead</span>
              <span className="text-yellow-400">FRONT-MOST</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">5. Internal Logic</span>
              <span className="text-purple-400">TOP-ABILITY</span>
            </div>
          </div>
        </section>

        <section>
          <h3 className="font-bold text-white mb-2 border-b border-gray-700 pb-1 flex items-center gap-2">
            <span className="text-blue-400">04.</span> Recursive Logic
          </h3>
          <p className="leading-relaxed">
            The game state is <strong className="text-white">Live</strong>. If an ability kills a unit or spawns a new one, that unit's "On Death" or "On Spawn" triggers happen <strong className="text-yellow-500">immediately</strong>—even if it interrupts the current priority queue.
          </p>
          <p className="mt-2 text-xs text-gray-400 leading-relaxed">
            Example: If a fast sniper kills a unit with "On Death: Damage", that damage fires before the next unit in the sniper's original phase acts.
          </p>
        </section>

        <section>
          <h3 className="font-bold text-white mb-2 border-b border-gray-700 pb-1 flex items-center gap-2">
            <span className="text-blue-400">05.</span> Victory
          </h3>
          <p className="leading-relaxed text-xs">
            Battles are automated from <strong className="text-white">Front to Back</strong>.
            The first team to have all units defeated loses the round.
            Accumulate <strong className="text-yellow-500">10 Stars</strong> to win the run!
          </p>
        </section>
      </div>
    );
  };

  const renderModeTab = () => {
    return (
      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-4">
        <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
          <h3 className="font-bold text-white mb-2">Game Mode</h3>
          <div className="space-y-3">
            <button
              onClick={() => navigate('/sandbox')}
              className="w-full btn bg-purple-900/50 hover:bg-purple-800 text-purple-200 border border-purple-700 text-xs py-2"
            >
              Enter Sandbox Mode
            </button>
            <button
              onClick={() => navigate('/multiplayer')}
              className="w-full btn bg-green-900/50 hover:bg-green-800 text-green-200 border border-green-700 text-xs py-2"
            >
              Enter Multiplayer Mode
            </button>
            <button
              onClick={() => navigate('/blockchain')}
              className="w-full btn bg-yellow-900/50 hover:bg-yellow-800 text-yellow-200 border border-yellow-700 text-xs py-2"
            >
              Enter Blockchain Mode
            </button>
          </div>
        </div>

        <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
          <h3 className="font-bold text-white mb-2">Debug Tools</h3>
          <div className="space-y-3">
            <button
              onClick={toggleShowRawJson}
              className="w-full btn bg-blue-900/50 hover:bg-blue-800 text-blue-200 border border-blue-700 text-xs py-2"
            >
              {showRawJson ? 'Hide Raw State' : 'View Raw Game State'}
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
    <div 
      className="fixed left-0 bottom-0 w-80 bg-gray-900 border-r border-gray-700 shadow-2xl flex flex-col z-10"
      style={{ top: topOffset }}
    >
      {/* Tabs */}
      <div className="flex border-b border-gray-800">
        <button
          onClick={() => setActiveTab('card')}
          className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${activeTab === 'card' ? 'bg-gray-800 text-yellow-500 border-b-2 border-yellow-500' : 'text-gray-500 hover:text-gray-300'
            }`}
        >
          Card
        </button>
        <button
          onClick={() => setActiveTab('rules')}
          className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${activeTab === 'rules' ? 'bg-gray-800 text-yellow-500 border-b-2 border-yellow-500' : 'text-gray-500 hover:text-gray-300'
            }`}
        >
          Rules
        </button>
        <button
          onClick={() => setActiveTab('mode')}
          className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${activeTab === 'mode' ? 'bg-gray-800 text-yellow-500 border-b-2 border-yellow-500' : 'text-gray-500 hover:text-gray-300'
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
