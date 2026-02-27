import React, { useState } from 'react';
import { useBlockchainStore } from '../store/blockchainStore';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import {
  type AnyAbility,
  type BattleAbility,
  type BattleTrigger,
  type BattleEffect,
  type BattleTarget,
  type BattleScope,
  type ShopAbility,
  type ShopTrigger,
  type ShopEffect,
  type ShopTarget,
  type ShopScope,
  type StatType,
} from '../types';
import {
  STATUS_ICON,
  STATUS_ORDER,
  emptyStatusMask,
  hasStatus,
  statusesFromMask,
  toggleStatus,
} from '../utils/status';

import EmojiPicker, { Theme } from 'emoji-picker-react';

const BATTLE_TRIGGERS: BattleTrigger[] = [
  'OnStart',
  'OnFaint',
  'OnAllyFaint',
  'OnHurt',
  'OnSpawn',
  'OnAllySpawn',
  'OnEnemySpawn',
  'BeforeUnitAttack',
  'AfterUnitAttack',
  'BeforeAnyAttack',
  'AfterAnyAttack',
];

const SHOP_TRIGGERS: ShopTrigger[] = ['OnBuy', 'OnSell', 'OnShopStart'];

const BATTLE_SCOPES: BattleScope[] = [
  'SelfUnit',
  'Allies',
  'Enemies',
  'All',
  'AlliesOther',
  'TriggerSource',
  'Aggressor',
];

const SHOP_SCOPES: ShopScope[] = ['SelfUnit', 'Allies', 'All', 'AlliesOther', 'TriggerSource'];

const STATS: StatType[] = ['Health', 'Attack', 'Mana'];

export const CreateCardPage: React.FC = () => {
  const { isConnected, connect, submitCard } = useBlockchainStore();

  const defaultBattleAbility = (): BattleAbility => ({
    name: '',
    description: '',
    trigger: 'OnStart',
    effect: { type: 'Damage', amount: 1, target: { type: 'All', data: { scope: 'Enemies' } } },
    conditions: [],
    max_triggers: undefined,
  });

  const defaultShopAbility = (): ShopAbility => ({
    name: '',
    description: '',
    trigger: 'OnBuy',
    effect: {
      type: 'ModifyStatsPermanent',
      health: 1,
      attack: 1,
      target: { type: 'All', data: { scope: 'SelfUnit' } },
    },
    conditions: [],
    max_triggers: undefined,
  });

  const [cardForm, setCardForm] = useState({
    name: '',
    emoji: '🃏',
    attack: 1,
    health: 1,
    play_cost: 1,
    pitch_value: 1,
    description: '',
    shop_abilities: [] as ShopAbility[],
    battle_abilities: [] as BattleAbility[],
    base_statuses: emptyStatusMask(),
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [triedSubmitCard, setTriedSubmitCard] = useState(false);
  const [triedAddAbility, setTriedAddAbility] = useState(false);
  const [abilityLane, setAbilityLane] = useState<'battle' | 'shop'>('battle');

  // New Ability Form State
  const [newAbility, setNewAbility] = useState<AnyAbility>(defaultBattleAbility());

  const handleCardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTriedSubmitCard(true);
    if (!cardForm.name) {
      toast.error('Card name is required');
      return;
    }
    if (!isConnected) {
      toast.error('Connect wallet first');
      return;
    }
    setIsSubmitting(true);
    try {
      await submitCard(
        {
          stats: { attack: cardForm.attack, health: cardForm.health },
          economy: { play_cost: cardForm.play_cost, pitch_value: cardForm.pitch_value },
          base_statuses: cardForm.base_statuses,
          shop_abilities: cardForm.shop_abilities,
          battle_abilities: cardForm.battle_abilities,
        },
        {
          name: cardForm.name,
          emoji: cardForm.emoji,
          description: cardForm.description,
        }
      );
      toast.success('Card submitted successfully!');
      setTriedSubmitCard(false);
      setCardForm({
        name: '',
        emoji: '🃏',
        attack: 1,
        health: 1,
        play_cost: 1,
        pitch_value: 1,
        description: '',
        shop_abilities: [],
        battle_abilities: [],
        base_statuses: emptyStatusMask(),
      });
    } catch (err) {
      toast.error('Failed to submit card');
    } finally {
      setIsSubmitting(false);
    }
  };

  const addAbility = () => {
    setTriedAddAbility(true);
    if (!newAbility.name) {
      toast.error('Ability name is required');
      return;
    }
    if (abilityLane === 'battle') {
      setCardForm((prev) => ({
        ...prev,
        battle_abilities: [...prev.battle_abilities, { ...(newAbility as BattleAbility) }],
      }));
    } else {
      setCardForm((prev) => ({
        ...prev,
        shop_abilities: [...prev.shop_abilities, { ...(newAbility as ShopAbility) }],
      }));
    }
    // Reset ability form partially
    setTriedAddAbility(false);
    setNewAbility(abilityLane === 'battle' ? defaultBattleAbility() : defaultShopAbility());
  };

  const removeAbility = (lane: 'battle' | 'shop', index: number) => {
    if (lane === 'battle') {
      setCardForm((prev) => ({
        ...prev,
        battle_abilities: prev.battle_abilities.filter((_, i) => i !== index),
      }));
    } else {
      setCardForm((prev) => ({
        ...prev,
        shop_abilities: prev.shop_abilities.filter((_, i) => i !== index),
      }));
    }
  };

  const updateEffectType = (type: string) => {
    if (abilityLane === 'battle') {
      const target: BattleTarget = { type: 'All', data: { scope: 'Enemies' } };
      if (type === 'Damage') {
        setNewAbility({
          ...(newAbility as BattleAbility),
          effect: { type: 'Damage', amount: 1, target },
        });
      } else if (type === 'ModifyStats') {
        setNewAbility({
          ...(newAbility as BattleAbility),
          effect: { type: 'ModifyStats', health: 1, attack: 1, target },
        });
      } else if (type === 'ModifyStatsPermanent') {
        setNewAbility({
          ...(newAbility as BattleAbility),
          effect: { type: 'ModifyStatsPermanent', health: 1, attack: 1, target },
        });
      } else if (type === 'SpawnUnit') {
        setNewAbility({
          ...(newAbility as BattleAbility),
          effect: { type: 'SpawnUnit', card_id: 2 },
        });
      } else if (type === 'Destroy') {
        setNewAbility({ ...(newAbility as BattleAbility), effect: { type: 'Destroy', target } });
      } else if (type === 'GainMana') {
        setNewAbility({
          ...(newAbility as BattleAbility),
          effect: { type: 'GainMana', amount: 1 },
        });
      } else if (type === 'GrantStatusThisBattle') {
        setNewAbility({
          ...(newAbility as BattleAbility),
          effect: { type: 'GrantStatusThisBattle', status: 'Shield', target },
        });
      } else if (type === 'GrantStatusPermanent') {
        setNewAbility({
          ...(newAbility as BattleAbility),
          effect: { type: 'GrantStatusPermanent', status: 'Shield', target },
        });
      } else if (type === 'RemoveStatusPermanent') {
        setNewAbility({
          ...(newAbility as BattleAbility),
          effect: { type: 'RemoveStatusPermanent', status: 'Shield', target },
        });
      }
    } else {
      const target: ShopTarget = { type: 'All', data: { scope: 'SelfUnit' } };
      if (type === 'ModifyStatsPermanent') {
        setNewAbility({
          ...(newAbility as ShopAbility),
          effect: { type: 'ModifyStatsPermanent', health: 1, attack: 1, target },
        });
      } else if (type === 'SpawnUnit') {
        setNewAbility({
          ...(newAbility as ShopAbility),
          effect: { type: 'SpawnUnit', card_id: 2 },
        });
      } else if (type === 'Destroy') {
        setNewAbility({ ...(newAbility as ShopAbility), effect: { type: 'Destroy', target } });
      } else if (type === 'GainMana') {
        setNewAbility({ ...(newAbility as ShopAbility), effect: { type: 'GainMana', amount: 1 } });
      } else if (type === 'GrantStatusPermanent') {
        setNewAbility({
          ...(newAbility as ShopAbility),
          effect: { type: 'GrantStatusPermanent', status: 'Shield', target },
        });
      } else if (type === 'RemoveStatusPermanent') {
        setNewAbility({
          ...(newAbility as ShopAbility),
          effect: { type: 'RemoveStatusPermanent', status: 'Shield', target },
        });
      }
    }
  };

  const updateTargetType = (type: string) => {
    if (newAbility.effect.type === 'SpawnUnit' || newAbility.effect.type === 'GainMana') return;

    if (abilityLane === 'battle') {
      let target: BattleTarget;
      const scope: BattleScope = 'Enemies';
      if (type === 'Position') {
        target = { type: 'Position', data: { scope, index: 0 } };
      } else if (type === 'Adjacent') {
        target = { type: 'Adjacent', data: { scope } };
      } else if (type === 'Random') {
        target = { type: 'Random', data: { scope, count: 1 } };
      } else if (type === 'Standard') {
        target = {
          type: 'Standard',
          data: { scope, stat: 'Health', order: 'Descending', count: 1 },
        };
      } else {
        target = { type: 'All', data: { scope } };
      }
      setNewAbility({
        ...(newAbility as BattleAbility),
        effect: { ...(newAbility.effect as BattleEffect), target } as BattleEffect,
      });
    } else {
      let target: ShopTarget;
      const scope: ShopScope = 'SelfUnit';
      if (type === 'Position') {
        target = { type: 'Position', data: { scope, index: 0 } };
      } else if (type === 'Random') {
        target = { type: 'Random', data: { scope, count: 1 } };
      } else if (type === 'Standard') {
        target = {
          type: 'Standard',
          data: { scope, stat: 'Health', order: 'Descending', count: 1 },
        };
      } else {
        target = { type: 'All', data: { scope } };
      }
      setNewAbility({
        ...(newAbility as ShopAbility),
        effect: { ...(newAbility.effect as ShopEffect), target } as ShopEffect,
      });
    }
  };

  const allAbilities = [
    ...cardForm.shop_abilities.map((ability, index) => ({ lane: 'shop' as const, ability, index })),
    ...cardForm.battle_abilities.map((ability, index) => ({
      lane: 'battle' as const,
      ability,
      index,
    })),
  ];

  const rawJsonPretty = JSON.stringify(
    {
      stats: { attack: cardForm.attack, health: cardForm.health },
      economy: { play_cost: cardForm.play_cost, pitch_value: cardForm.pitch_value },
      base_statuses: cardForm.base_statuses,
      shop_abilities: cardForm.shop_abilities,
      battle_abilities: cardForm.battle_abilities,
      metadata: {
        name: cardForm.name,
        emoji: cardForm.emoji,
        description: cardForm.description,
      },
    },
    null,
    2
  );
  const rawJson = rawJsonPretty.replace(
    /"base_statuses": \[[\s\S]*?\]/,
    `"base_statuses": ${JSON.stringify(cardForm.base_statuses)}`
  );

  const baseStatuses = statusesFromMask(cardForm.base_statuses);

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 text-white">
        <h1 className="text-4xl font-black mb-8 italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-600 uppercase">
          Card Creator
        </h1>
        <button
          onClick={connect}
          className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-4 px-8 rounded-full transition-all transform hover:scale-105"
        >
          CONNECT WALLET TO START
        </button>
        <Link to="/blockchain" className="mt-8 text-slate-400 hover:text-white underline">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-black italic tracking-tighter text-yellow-500 uppercase">
              Blockchain Card Creator
            </h1>
            <p className="text-slate-500 text-sm">Design custom units with complex abilities</p>
          </div>
          <Link
            to="/blockchain/creator"
            className="text-slate-400 hover:text-white border border-slate-800 px-4 py-2 rounded-lg transition-colors"
          >
            Creator Hub
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Column 1: Card Basics */}
          <div className="space-y-6">
            <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-6 backdrop-blur-sm">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                <span className="text-yellow-500">01</span> Card Basics
              </h2>

              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                      Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={cardForm.name}
                      onChange={(e) => setCardForm({ ...cardForm, name: e.target.value })}
                      placeholder="Super Goblin"
                      className={`w-full bg-slate-800 border rounded-lg px-3 py-2 outline-none focus:border-yellow-500/50 ${triedSubmitCard && !cardForm.name ? 'border-red-500' : 'border-white/10'}`}
                    />
                    {triedSubmitCard && !cardForm.name && (
                      <span className="text-[10px] text-red-500 mt-1 block font-bold uppercase">
                        Card name is required
                      </span>
                    )}
                  </div>
                  <div className="col-span-1">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                      Emoji
                    </label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                        className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-yellow-500/50 text-xl flex items-center justify-center hover:bg-slate-700 transition-colors"
                      >
                        {cardForm.emoji}
                      </button>

                      {showEmojiPicker && (
                        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
                          <div
                            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
                            onClick={() => setShowEmojiPicker(false)}
                          ></div>
                          <div className="relative shadow-2xl animate-in fade-in zoom-in duration-200">
                            <EmojiPicker
                              theme={Theme.DARK}
                              onEmojiClick={(emojiData) => {
                                setCardForm({ ...cardForm, emoji: emojiData.emoji });
                                setShowEmojiPicker(false);
                              }}
                              width={350}
                              height={500}
                              lazyLoadEmojis={true}
                              searchPlaceholder="Search emoji..."
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                      Attack
                    </label>
                    <input
                      type="number"
                      value={cardForm.attack}
                      onChange={(e) =>
                        setCardForm({ ...cardForm, attack: parseInt(e.target.value) || 0 })
                      }
                      className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-yellow-500/50"
                      min="0"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                      Health
                    </label>
                    <input
                      type="number"
                      value={cardForm.health}
                      onChange={(e) =>
                        setCardForm({ ...cardForm, health: parseInt(e.target.value) || 1 })
                      }
                      className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-yellow-500/50"
                      min="1"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                      Play Cost
                    </label>
                    <input
                      type="number"
                      value={cardForm.play_cost}
                      onChange={(e) =>
                        setCardForm({ ...cardForm, play_cost: parseInt(e.target.value) || 0 })
                      }
                      className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-yellow-500/50"
                      min="0"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                      Pitch Value
                    </label>
                    <input
                      type="number"
                      value={cardForm.pitch_value}
                      onChange={(e) =>
                        setCardForm({ ...cardForm, pitch_value: parseInt(e.target.value) || 0 })
                      }
                      className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-yellow-500/50"
                      min="0"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                    Description
                  </label>
                  <textarea
                    value={cardForm.description}
                    onChange={(e) => setCardForm({ ...cardForm, description: e.target.value })}
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-yellow-500/50 h-20 resize-none text-sm"
                    placeholder="General description of the card..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                    Base Statuses
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {STATUS_ORDER.map((status) => {
                      const active = hasStatus(cardForm.base_statuses, status);
                      return (
                        <button
                          key={status}
                          type="button"
                          onClick={() =>
                            setCardForm({
                              ...cardForm,
                              base_statuses: toggleStatus(cardForm.base_statuses, status),
                            })
                          }
                          className={`rounded-lg border px-2 py-1.5 text-xs font-semibold transition-colors ${
                            active
                              ? 'border-yellow-500 bg-yellow-500/20 text-yellow-300'
                              : 'border-white/10 bg-slate-800 text-slate-300 hover:border-white/30'
                          }`}
                        >
                          <span className="mr-1">{STATUS_ICON[status]}</span>
                          {status}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-6 backdrop-blur-sm">
              <h2 className="text-xl font-bold mb-4">Preview</h2>
              <div className="flex justify-center p-4 bg-slate-800/50 rounded-xl border border-white/5">
                <div className="relative w-32 h-44 bg-slate-800 rounded-xl border-2 border-yellow-500/50 p-3 shadow-2xl">
                  <div className="text-[10px] font-bold text-center truncate mb-1 uppercase text-yellow-500">
                    {cardForm.name || 'Unit Name'}
                  </div>
                  <div className="w-full h-20 bg-slate-700/50 rounded-lg flex items-center justify-center text-4xl mb-2">
                    {cardForm.emoji}
                  </div>
                  {baseStatuses.length > 0 && (
                    <div className="flex flex-wrap gap-1 justify-center mb-2">
                      {baseStatuses.map((status) => (
                        <span
                          key={status}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 border border-white/10"
                          title={status}
                        >
                          {STATUS_ICON[status]}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-1">
                      <span className="text-red-500 text-sm">⚔️</span>
                      <span className="font-bold">{cardForm.attack}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-green-500 text-sm">❤️</span>
                      <span className="font-bold">{cardForm.health}</span>
                    </div>
                  </div>
                  <div className="absolute -top-2 -left-2 w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center text-xs font-bold border-2 border-blue-400">
                    {cardForm.play_cost}
                  </div>
                  <div className="absolute -top-2 -right-2 w-7 h-7 bg-red-600 rounded-full flex items-center justify-center text-xs font-bold border-2 border-red-400">
                    {cardForm.pitch_value}
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={handleCardSubmit}
              disabled={isSubmitting}
              className="w-full bg-yellow-500 hover:bg-yellow-400 text-slate-950 font-black py-4 rounded-xl transition-all disabled:opacity-50 shadow-lg shadow-yellow-500/10 uppercase tracking-wider"
            >
              {isSubmitting ? 'MINTING...' : 'MINT CARD ON-CHAIN'}
            </button>
          </div>

          {/* Column 2: Abilities Editor */}
          <div className="space-y-6">
            <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-6 backdrop-blur-sm">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                <span className="text-yellow-500">02</span> Abilities
              </h2>

              {/* Added Abilities List */}
              <div className="space-y-2 mb-6 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                {allAbilities.map(({ lane, ability, index }) => (
                  <div
                    key={`${lane}-${index}`}
                    className="bg-slate-800/50 border border-white/5 p-3 rounded-lg flex justify-between items-start"
                  >
                    <div>
                      <div className="text-sm font-bold text-yellow-500">
                        {ability.name}{' '}
                        <span className="text-[10px] uppercase text-slate-400">[{lane}]</span>
                      </div>
                      <div className="text-xs text-slate-400 italic">{ability.trigger}</div>
                    </div>
                    <button
                      onClick={() => removeAbility(lane, index)}
                      className="text-slate-500 hover:text-red-500"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>
                  </div>
                ))}
                {allAbilities.length === 0 && (
                  <div className="text-center py-4 text-slate-600 text-sm italic">
                    No abilities added yet
                  </div>
                )}
              </div>

              {/* New Ability Form */}
              <div className="bg-slate-800/30 border border-white/5 p-4 rounded-xl space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                      Ability Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={newAbility.name}
                      onChange={(e) => setNewAbility({ ...newAbility, name: e.target.value })}
                      className={`w-full bg-slate-900 border rounded px-2 py-1.5 text-sm outline-none focus:border-yellow-500/50 ${triedAddAbility && !newAbility.name ? 'border-red-500' : 'border-white/10'}`}
                      placeholder="Fireball"
                    />
                    {triedAddAbility && !newAbility.name && (
                      <span className="text-[9px] text-red-500 mt-1 block font-bold uppercase">
                        Name required
                      </span>
                    )}
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                      Ability Lane
                    </label>
                    <select
                      value={abilityLane}
                      onChange={(e) => {
                        const lane = e.target.value as 'battle' | 'shop';
                        setAbilityLane(lane);
                        setNewAbility(
                          lane === 'battle' ? defaultBattleAbility() : defaultShopAbility()
                        );
                      }}
                      className="w-full bg-slate-900 border border-white/10 rounded px-2 py-1.5 text-sm outline-none focus:border-yellow-500/50 mb-2"
                    >
                      <option value="battle">battle</option>
                      <option value="shop">shop</option>
                    </select>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                      Trigger
                    </label>
                    <select
                      value={newAbility.trigger}
                      onChange={(e) =>
                        setNewAbility({ ...newAbility, trigger: e.target.value as any })
                      }
                      className="w-full bg-slate-900 border border-white/10 rounded px-2 py-1.5 text-sm outline-none focus:border-yellow-500/50"
                    >
                      {(abilityLane === 'battle' ? BATTLE_TRIGGERS : SHOP_TRIGGERS).map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                    Effect Type
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {(abilityLane === 'battle'
                      ? [
                          'Damage',
                          'ModifyStats',
                          'ModifyStatsPermanent',
                          'SpawnUnit',
                          'Destroy',
                          'GainMana',
                          'GrantStatusThisBattle',
                          'GrantStatusPermanent',
                          'RemoveStatusPermanent',
                        ]
                      : [
                          'ModifyStatsPermanent',
                          'SpawnUnit',
                          'Destroy',
                          'GainMana',
                          'GrantStatusPermanent',
                          'RemoveStatusPermanent',
                        ]
                    ).map((type) => (
                      <button
                        key={type}
                        onClick={() => updateEffectType(type)}
                        className={`text-[10px] py-1 rounded border ${newAbility.effect.type === type ? 'bg-yellow-500/20 border-yellow-500 text-yellow-500' : 'bg-slate-900 border-white/5 text-slate-400'}`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Effect Specific Fields */}
                <div className="p-3 bg-slate-900/50 rounded-lg border border-white/5 space-y-3">
                  {newAbility.effect.type === 'Damage' && (
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                        Damage Amount
                      </label>
                      <input
                        type="number"
                        value={newAbility.effect.amount}
                        onChange={(e) =>
                          setNewAbility({
                            ...newAbility,
                            effect: {
                              ...newAbility.effect,
                              amount: parseInt(e.target.value) || 0,
                            } as any,
                          })
                        }
                        className="w-full bg-slate-800 border border-white/10 rounded px-2 py-1 text-sm outline-none"
                      />
                    </div>
                  )}
                  {newAbility.effect.type === 'ModifyStats' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                          Health Change
                        </label>
                        <input
                          type="number"
                          value={newAbility.effect.health}
                          onChange={(e) =>
                            setNewAbility({
                              ...newAbility,
                              effect: {
                                ...newAbility.effect,
                                health: parseInt(e.target.value) || 0,
                              } as any,
                            })
                          }
                          className="w-full bg-slate-800 border border-white/10 rounded px-2 py-1 text-sm outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                          Attack Change
                        </label>
                        <input
                          type="number"
                          value={newAbility.effect.attack}
                          onChange={(e) =>
                            setNewAbility({
                              ...newAbility,
                              effect: {
                                ...newAbility.effect,
                                attack: parseInt(e.target.value) || 0,
                              } as any,
                            })
                          }
                          className="w-full bg-slate-800 border border-white/10 rounded px-2 py-1 text-sm outline-none"
                        />
                      </div>
                    </div>
                  )}
                  {newAbility.effect.type === 'ModifyStatsPermanent' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                          Health Change
                        </label>
                        <input
                          type="number"
                          value={newAbility.effect.health}
                          onChange={(e) =>
                            setNewAbility({
                              ...newAbility,
                              effect: {
                                ...newAbility.effect,
                                health: parseInt(e.target.value) || 0,
                              } as any,
                            })
                          }
                          className="w-full bg-slate-800 border border-white/10 rounded px-2 py-1 text-sm outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                          Attack Change
                        </label>
                        <input
                          type="number"
                          value={newAbility.effect.attack}
                          onChange={(e) =>
                            setNewAbility({
                              ...newAbility,
                              effect: {
                                ...newAbility.effect,
                                attack: parseInt(e.target.value) || 0,
                              } as any,
                            })
                          }
                          className="w-full bg-slate-800 border border-white/10 rounded px-2 py-1 text-sm outline-none"
                        />
                      </div>
                    </div>
                  )}
                  {newAbility.effect.type === 'SpawnUnit' && (
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                        Card ID
                      </label>
                      <input
                        type="number"
                        value={newAbility.effect.card_id}
                        onChange={(e) =>
                          setNewAbility({
                            ...newAbility,
                            effect: {
                              ...newAbility.effect,
                              card_id: parseInt(e.target.value) || 0,
                            } as any,
                          })
                        }
                        className="w-full bg-slate-800 border border-white/10 rounded px-2 py-1 text-sm outline-none"
                        placeholder="2"
                      />
                    </div>
                  )}

                  {newAbility.effect.type === 'GainMana' && (
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                        Mana Amount
                      </label>
                      <input
                        type="number"
                        value={newAbility.effect.amount}
                        onChange={(e) =>
                          setNewAbility({
                            ...newAbility,
                            effect: {
                              ...newAbility.effect,
                              amount: parseInt(e.target.value) || 0,
                            } as any,
                          })
                        }
                        className="w-full bg-slate-800 border border-white/10 rounded px-2 py-1 text-sm outline-none"
                      />
                    </div>
                  )}

                  {(newAbility.effect.type === 'GrantStatusThisBattle' ||
                    newAbility.effect.type === 'GrantStatusPermanent' ||
                    newAbility.effect.type === 'RemoveStatusPermanent') && (
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                        Status
                      </label>
                      <select
                        value={(newAbility.effect as any).status || 'Shield'}
                        onChange={(e) =>
                          setNewAbility({
                            ...newAbility,
                            effect: {
                              ...(newAbility.effect as any),
                              status: e.target.value,
                            } as any,
                          })
                        }
                        className="w-full bg-slate-800 border border-white/10 rounded px-2 py-1 text-sm outline-none"
                      >
                        {STATUS_ORDER.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Target Editor (if not SpawnUnit) */}
                  {newAbility.effect.type !== 'SpawnUnit' &&
                    newAbility.effect.type !== 'GainMana' && (
                      <div className="space-y-3 pt-2 border-t border-white/5">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                              Target Type
                            </label>
                            <select
                              value={(newAbility.effect as any).target.type}
                              onChange={(e) => updateTargetType(e.target.value)}
                              className="w-full bg-slate-800 border border-white/10 rounded px-2 py-1 text-xs outline-none"
                            >
                              <option value="All">All</option>
                              <option value="Position">Position</option>
                              {abilityLane === 'battle' && (
                                <option value="Adjacent">Adjacent</option>
                              )}
                              <option value="Random">Random</option>
                              <option value="Standard">Standard</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                              Scope
                            </label>
                            <select
                              value={(newAbility.effect as any).target.data.scope}
                              onChange={(e) => {
                                const target = { ...(newAbility.effect as any).target };
                                target.data.scope = e.target.value;
                                setNewAbility({
                                  ...newAbility,
                                  effect: { ...newAbility.effect, target } as any,
                                });
                              }}
                              className="w-full bg-slate-800 border border-white/10 rounded px-2 py-1 text-xs outline-none"
                            >
                              {(abilityLane === 'battle' ? BATTLE_SCOPES : SHOP_SCOPES).map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Target Data Fields */}
                        {(newAbility.effect as any).target.type === 'Position' && (
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                              Index (0-4)
                            </label>
                            <input
                              type="number"
                              value={(newAbility.effect as any).target.data.index}
                              onChange={(e) => {
                                const target = { ...(newAbility.effect as any).target };
                                target.data.index = parseInt(e.target.value) || 0;
                                setNewAbility({
                                  ...newAbility,
                                  effect: { ...newAbility.effect, target } as any,
                                });
                              }}
                              className="w-full bg-slate-800 border border-white/10 rounded px-2 py-1 text-xs outline-none"
                              min="0"
                              max="4"
                            />
                          </div>
                        )}
                        {(newAbility.effect as any).target.type === 'Random' && (
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                              Count
                            </label>
                            <input
                              type="number"
                              value={(newAbility.effect as any).target.data.count}
                              onChange={(e) => {
                                const target = { ...(newAbility.effect as any).target };
                                target.data.count = parseInt(e.target.value) || 1;
                                setNewAbility({
                                  ...newAbility,
                                  effect: { ...newAbility.effect, target } as any,
                                });
                              }}
                              className="w-full bg-slate-800 border border-white/10 rounded px-2 py-1 text-xs outline-none"
                              min="1"
                            />
                          </div>
                        )}
                        {(newAbility.effect as any).target.type === 'Standard' && (
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                                Stat
                              </label>
                              <select
                                value={(newAbility.effect as any).target.data.stat}
                                onChange={(e) => {
                                  const target = { ...(newAbility.effect as any).target };
                                  target.data.stat = e.target.value;
                                  setNewAbility({
                                    ...newAbility,
                                    effect: { ...newAbility.effect, target } as any,
                                  });
                                }}
                                className="w-full bg-slate-800 border border-white/10 rounded px-2 py-1 text-xs outline-none"
                              >
                                {STATS.map((s) => (
                                  <option key={s} value={s}>
                                    {s}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                                Order
                              </label>
                              <select
                                value={(newAbility.effect as any).target.data.order}
                                onChange={(e) => {
                                  const target = { ...(newAbility.effect as any).target };
                                  target.data.order = e.target.value;
                                  setNewAbility({
                                    ...newAbility,
                                    effect: { ...newAbility.effect, target } as any,
                                  });
                                }}
                                className="w-full bg-slate-800 border border-white/10 rounded px-2 py-1 text-xs outline-none"
                              >
                                <option value="Descending">Descending</option>
                                <option value="Ascending">Ascending</option>
                              </select>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                    Ability Description
                  </label>
                  <textarea
                    value={newAbility.description}
                    onChange={(e) => setNewAbility({ ...newAbility, description: e.target.value })}
                    className="w-full bg-slate-900 border border-white/10 rounded px-2 py-1.5 text-xs outline-none h-12 resize-none"
                    placeholder="Deals 1 damage to all enemies..."
                  />
                </div>

                <button
                  onClick={addAbility}
                  className="w-full bg-white/5 hover:bg-white/10 text-white font-bold py-2 rounded-lg transition-all border border-white/10 text-xs"
                >
                  ADD ABILITY TO CARD
                </button>
              </div>
            </div>
          </div>

          {/* Column 3: Raw JSON Output */}
          <div className="space-y-6">
            <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-6 backdrop-blur-sm h-full flex flex-col">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                <span className="text-yellow-500">03</span> Raw JSON
              </h2>
              <div className="flex-1 relative">
                <pre className="absolute inset-0 bg-slate-950 border border-white/10 rounded-xl p-4 text-[10px] font-mono text-blue-400 overflow-auto custom-scrollbar">
                  {rawJson}
                </pre>
              </div>
              <div className="mt-4">
                <button
                  onClick={() => {
                    void navigator.clipboard.writeText(rawJson);
                    toast.success('JSON copied to clipboard');
                  }}
                  className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs py-2 rounded-lg border border-white/5"
                >
                  COPY JSON
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </div>
  );
};
