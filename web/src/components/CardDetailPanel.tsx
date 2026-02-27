import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import type { CardView } from '../types';
import { getCardArtMd } from '../utils/cardArt';
import { CardIcon, BookIcon, GearIcon, BagIcon, SwordIcon, HeartIcon, StarIcon, AbilityIcon, BoltIcon, FlameIcon } from './Icons';
import { getRarityTier } from './UnitCard';

// Blockchain account type
export interface BlockchainAccount {
  address: string;
  name?: string;
  source?: string;
}

// Discriminated union for panel modes
export type CardDetailPanelMode =
  | { type: 'standard' }
  | { type: 'sandbox' }
  | { type: 'readOnly' }
  | {
      type: 'blockchain';
      blockNumber: number | null;
      accounts: BlockchainAccount[];
      selectedAccount?: BlockchainAccount;
      onSelectAccount?: (account: BlockchainAccount | undefined) => void;
    };

export interface CardDetailPanelProps {
  card: CardView | null;
  isVisible: boolean;
  mode?: CardDetailPanelMode;
  topOffset?: string;
  // Legacy props for backwards compatibility - prefer using mode
  isSandbox?: boolean;
  isReadOnly?: boolean;
  blockchainMode?: boolean;
  blockNumber?: number | null;
  accounts?: BlockchainAccount[];
  selectedAccount?: BlockchainAccount;
  onSelectAccount?: (account: BlockchainAccount | undefined) => void;
}

type TabType = 'card' | 'rules' | 'mode';

/** Sidebar-specific rarity styles (border, glow, accent bar, particle color). */
const SIDEBAR_RARITY = {
  common: {
    border: 'border-amber-900/60',
    glow: '#92400e',
    accent: 'bg-amber-900/60',
    particleColor: '#92400e',
  },
  uncommon: {
    border: 'border-emerald-700/70',
    glow: '#059669',
    accent: 'bg-emerald-700/70',
    particleColor: '#059669',
  },
  rare: {
    border: 'border-sky-500/70',
    glow: '#0ea5e9',
    accent: 'bg-sky-500/70',
    particleColor: '#0ea5e9',
  },
  legendary: {
    border: 'border-amber-400/80',
    glow: '#fbbf24',
    accent: 'bg-amber-400/80',
    particleColor: '#fbbf24',
  },
} as const;

export function CardDetailPanel({
  card,
  isVisible,
  mode,
  topOffset = '4rem',
  // Legacy props
  isSandbox = false,
  isReadOnly = false,
  blockchainMode = false,
  blockNumber,
  accounts = [],
  selectedAccount,
  onSelectAccount,
}: CardDetailPanelProps) {
  const [activeTab, setActiveTab] = React.useState<TabType>('card');
  const [animKey, setAnimKey] = React.useState(0);
  const prevCardId = React.useRef<number | null>(null);
  const navigate = useNavigate();
  const {
    view,
    selection,
    pitchHandCard,
    pitchBoardUnit,
    setSelection,
    setMobileTab,
    showRawJson,
    toggleShowRawJson,
  } = useGameStore();

  // Normalize mode from legacy props if not provided
  const resolvedMode: CardDetailPanelMode =
    mode ??
    (isSandbox
      ? { type: 'sandbox' }
      : isReadOnly
        ? { type: 'readOnly' }
        : blockchainMode
          ? {
              type: 'blockchain',
              blockNumber: blockNumber ?? null,
              accounts,
              selectedAccount,
              onSelectAccount,
            }
          : { type: 'standard' });

  // Animate card content on card change (desktop only via CSS class)
  React.useEffect(() => {
    if (card && card.id !== prevCardId.current) {
      prevCardId.current = card.id;
      setAnimKey((k) => k + 1);
    }
  }, [card]);

  if (!isVisible) return null;

  // Get the selected hand/board index for actions
  const selectedHandIndex = selection?.type === 'hand' ? selection.index : -1;
  const selectedBoardIndex = selection?.type === 'board' ? selection.index : -1;
  const isBoardUnit = selection?.type === 'board';

  // Check if actions should be disabled
  const isActionDisabled = resolvedMode.type === 'sandbox' || resolvedMode.type === 'readOnly';

  const renderCardTab = () => {
    if (!card) {
      return (
        <div className="flex flex-col items-center justify-center py-8 lg:py-16 text-center">
          <div className="w-14 h-14 lg:w-20 lg:h-20 rounded-2xl bg-warm-800/60 border border-warm-700/50 flex items-center justify-center mb-3 lg:mb-5">
            <CardIcon className="w-7 h-7 lg:w-10 lg:h-10 text-warm-500" />
          </div>
          <h3 className="text-xs lg:text-base font-bold text-warm-300 mb-1 lg:mb-2">
            No Card Selected
          </h3>
          <p className="text-[10px] lg:text-xs text-warm-400 leading-relaxed max-w-[10rem] lg:max-w-[14rem]">
            Tap a card in your hand or on the board to see its stats and abilities.
          </p>
        </div>
      );
    }

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
        case 'OnBuy':
          return 'On Buy';
        case 'OnSell':
          return 'On Sell';
        case 'OnShopStart':
          return 'Shop Start';
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

    /** Natural-language sentence prefix for each trigger type. */
    const getTriggerPrefix = (trigger: any): string => {
      const type = typeof trigger === 'string' ? trigger : trigger?.type;
      switch (type) {
        case 'OnStart': return 'At battle start,';
        case 'OnFaint': return 'When this unit dies,';
        case 'OnAllyFaint': return 'When an ally dies,';
        case 'OnHurt': return 'When hurt,';
        case 'OnBuy': return 'When bought,';
        case 'OnSell': return 'When sold,';
        case 'OnShopStart': return 'At shop start,';
        case 'OnSpawn': return 'When spawned,';
        case 'OnAllySpawn': return 'When an ally spawns,';
        case 'OnEnemySpawn': return 'When an enemy spawns,';
        case 'BeforeUnitAttack': return 'Before attacking,';
        case 'AfterUnitAttack': return 'After attacking,';
        case 'BeforeAnyAttack': return 'Before any attack,';
        case 'AfterAnyAttack': return 'After any attack,';
        default: return '';
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
        case 'ModifyStatsPermanent': {
          const h = data.health || 0;
          const a = data.attack || 0;
          return `Give ${a >= 0 ? '+' : ''}${a}/${h >= 0 ? '+' : ''}${h} permanently to ${getTargetDescription(data.target)}`;
        }
        case 'SpawnUnit':
          return `Spawn unit (card #${data.card_id ?? '?'})`;
        case 'Destroy':
          return `Destroy ${getTargetDescription(data.target)}`;
        case 'GainMana':
          return `Gain ${data.amount || 0} mana`;
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
            (typeof order === 'string' ? order : order?.type) === 'Ascending'
              ? 'lowest'
              : 'highest';
          const countStr = count === 1 ? 'the' : `the ${count}`;
          return `${countStr} ${orderName} ${typeof stat === 'string' ? stat : stat?.type} ${describeScopeSingular(data.scope)}`;
        }
        case 'Adjacent':
          return `units adjacent to ${describeScope(data.scope)}`;
        default:
          return `Target: ${type}`;
      }
    };

    const rarity = getRarityTier(card);
    const sidebarRarity = SIDEBAR_RARITY[rarity];

    return (
      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
        {/* Action Buttons */}
        {!isActionDisabled && (
          <div className="mb-3 lg:mb-6 space-y-1.5 lg:space-y-2">
            {isBoardUnit ? (
              // Board unit actions
              <button
                onClick={() => {
                  if (selectedBoardIndex >= 0) {
                    pitchBoardUnit(selectedBoardIndex);
                    setSelection(null); // Clear selection after pitching
                  }
                }}
                className="w-full btn btn-pitch text-[10px] lg:text-sm py-1.5 lg:py-2"
              >
                Pitch (+{card.pitch_value})
              </button>
            ) : (
              // Hand card actions
              <>
                <button
                  onClick={() => setMobileTab('board')}
                  disabled={selectedHandIndex >= 0 && view ? !view.can_afford[selectedHandIndex] : true}
                  className="w-full btn btn-primary text-[10px] lg:text-sm py-1.5 lg:py-2 lg:hidden"
                >
                  Deploy to Board
                </button>
                <button
                  onClick={() => {
                    if (selectedHandIndex >= 0) {
                      pitchHandCard(selectedHandIndex);
                      setSelection(null); // Clear selection after pitching
                    }
                  }}
                  className="w-full btn btn-pitch text-[10px] lg:text-sm py-1.5 lg:py-2"
                >
                  Pitch (+{card.pitch_value})
                </button>
              </>
            )}
          </div>
        )}

        {/* Animated card content — re-mounts on card change */}
        <div key={animKey} className="lg:animate-panel-card-enter">

        {/* Rarity accent line — desktop only */}
        <div className={`hidden lg:block h-0.5 rounded-full mb-4 ${sidebarRarity.accent}`} />

        {/* Card Portrait with rarity frame */}
        <div className="card-info flex flex-col items-center gap-2 lg:gap-3 mb-3 lg:mb-6">
          <div className="relative flex justify-center">
            {/* Ambient glow — desktop only */}
            <div
              className="hidden lg:block absolute -inset-4 rounded-full blur-xl opacity-50"
              style={{ background: `radial-gradient(circle, ${sidebarRarity.glow}40, transparent 70%)` }}
            />
            {/* Portrait frame */}
            <div
              className={`relative w-20 h-20 lg:w-44 lg:h-52 rounded-xl lg:rounded-2xl border-2 ${sidebarRarity.border} overflow-hidden shadow-inner flex-shrink-0 bg-warm-800 ${rarity === 'legendary' ? 'sidebar-legendary-pulse' : ''}`}
            >
              {getCardArtMd(card.id) ? (
                <img
                  src={getCardArtMd(card.id)!}
                  alt=""
                  className="w-full h-full object-cover object-[center_30%]"
                />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center text-3xl lg:text-5xl font-bold text-warm-500/60 select-none">
                  {card.name.charAt(0)}
                </span>
              )}
              {/* Vignette overlay — desktop only */}
              <div className="hidden lg:block absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.5)_100%)]" />
            </div>
            {/* Floating particles — desktop only */}
            <div
              className="hidden lg:block sidebar-particles"
              style={{ '--particle-color': sidebarRarity.particleColor } as React.CSSProperties}
            >
              <span />
            </div>
          </div>

          {/* Card name + stats */}
          <div className="card-stats min-w-0 text-center">
            <h2 className="card-name text-base lg:text-2xl font-bold lg:font-heading text-white leading-tight truncate">
              {card.name}
            </h2>
            {/* Mobile stats — unchanged */}
            <div className="flex gap-1 mt-1 justify-center lg:hidden">
              <span className="px-1.5 py-0.5 bg-red-900/50 text-red-400 border border-red-800 rounded text-[10px] font-bold">
                ATK: {card.attack}
              </span>
              <span className="px-1.5 py-0.5 bg-green-900/50 text-green-400 border border-green-800 rounded text-[10px] font-bold">
                HP: {card.health}
              </span>
            </div>
            {/* Desktop iconic stats */}
            <div className="hidden lg:flex items-center justify-center gap-3 mt-2">
              <div className="flex items-center gap-1">
                <SwordIcon className="w-5 h-5 text-red-400" />
                <span className="text-2xl font-stat font-bold text-white">{card.attack}</span>
              </div>
              <div className="w-px h-6 bg-warm-600" />
              <div className="flex items-center gap-1">
                <HeartIcon className="w-5 h-5 text-green-400" />
                <span className="text-2xl font-stat font-bold text-white">{card.health}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Ability Section */}
        {card.abilities.length > 0 && (
          <div className="mb-3 lg:mb-6">
            {card.abilities.map((ability, index) => (
              <div
                key={index}
                className="mb-2 lg:mb-4 p-2 lg:p-3 bg-warm-800/50 rounded-lg border border-warm-700"
              >
                <h3 className="text-xs lg:text-base font-bold lg:font-heading text-yellow-400 mb-1 lg:mb-2">
                  {ability.name}
                </h3>
                {/* Mobile: trigger + description + effect (existing layout) */}
                <div className="lg:hidden text-xs text-warm-300 mb-1">
                  <strong>Trigger:</strong> {getTriggerDescription(ability.trigger)}
                </div>
                {ability.max_triggers && (
                  <div className="text-xs text-amber-400 mb-1 lg:hidden">
                    <strong>Max:</strong> {ability.max_triggers}
                  </div>
                )}
                <div className="lg:hidden text-xs text-warm-200 bg-warm-900/50 p-1.5 rounded border border-warm-700/50 italic">
                  &ldquo;{ability.description}&rdquo;
                </div>
                <div className="mt-1 lg:hidden text-xs text-blue-400 font-semibold">
                  {getEffectDescription(ability.effect)}
                </div>
                {/* Desktop: single natural sentence (trigger prefix + effect) */}
                <div className="hidden lg:block text-sm text-warm-200 leading-relaxed">
                  <span className="text-warm-100">{getTriggerPrefix(ability.trigger)}</span>{' '}
                  <span className="text-blue-400 font-semibold">{getEffectDescription(ability.effect).replace(/^./, c => c.toLowerCase())}</span>
                  {ability.max_triggers && (
                    <span className="text-warm-500 text-xs ml-2">({ability.max_triggers}&times;)</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Economy — Mobile: 2-col grid */}
        <div className="grid grid-cols-2 gap-1.5 mb-3 lg:hidden">
          <div className="p-1.5 bg-blue-900/20 border border-blue-800/50 rounded-lg">
            <div className="text-[10px] text-blue-400 uppercase font-bold mb-0.5">Cost</div>
            <div className="text-sm font-bold text-white flex items-center gap-0.5">
              {card.play_cost} <span className="text-blue-400 text-[10px]">Mana</span>
            </div>
          </div>
          <div className="p-1.5 bg-amber-900/20 border border-amber-800/50 rounded-lg">
            <div className="text-[10px] text-amber-400 uppercase font-bold mb-0.5">Pitch</div>
            <div className="text-sm font-bold text-white flex items-center gap-0.5">
              +{card.pitch_value} <span className="text-amber-400 text-[10px]">Mana</span>
            </div>
          </div>
        </div>

        {/* Economy — Desktop: compact horizontal row */}
        <div className="hidden lg:flex items-center justify-center gap-4 mb-6 py-2">
          <div className="flex items-center gap-2">
            <div className="cost-badge w-10 h-12 rounded-lg flex flex-col items-center justify-center font-stat font-bold text-white">
              <BoltIcon className="w-3.5 h-3.5 opacity-40" />
              <span className="text-lg -mt-0.5">{card.play_cost}</span>
            </div>
            <span className="text-xs text-warm-400 uppercase font-bold">Cost</span>
          </div>
          <div className="w-px h-8 bg-warm-700" />
          <div className="flex items-center gap-2">
            <span className="text-xs text-warm-400 uppercase font-bold">Pitch</span>
            <div className="pitch-badge w-10 h-12 rounded-lg flex flex-col items-center justify-center font-stat font-bold">
              <FlameIcon className="w-3.5 h-3.5 opacity-40" />
              <span className="text-lg -mt-0.5">+{card.pitch_value}</span>
            </div>
          </div>
        </div>

        {/* Metadata */}
        <div className="text-[10px] text-warm-500 font-mono flex flex-col gap-1 border-t border-warm-800 pt-4">
          <div>CARD_ID: {card.id}</div>
        </div>

        {/* Card Raw JSON */}
        {showRawJson && (
          <div className="mt-4 p-2 bg-black/50 rounded border border-warm-800">
            <div className="text-[10px] text-warm-500 mb-1 flex justify-between items-center">
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
      </div>
    );
  };

  const renderRulesTab = () => {
    return (
      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-5 text-sm text-warm-300 pb-4">
        {/* Card Anatomy Legend */}
        <section>
          <h3 className="font-bold text-amber-400 mb-2 border-b border-warm-700 pb-1 flex items-center gap-1.5">
            <CardIcon className="w-4 h-4" />
            Reading a Card
          </h3>
          <div className="grid grid-cols-2 gap-2 text-[10px] lg:text-xs">
            <div className="flex items-center gap-1.5">
              <div className="cost-badge w-5 h-5 lg:w-6 lg:h-6 rounded-lg flex items-center justify-center font-stat font-bold text-white text-[10px] lg:text-xs flex-shrink-0">
                3
              </div>
              <span className="text-warm-300">Mana Cost</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="pitch-badge w-5 h-5 lg:w-6 lg:h-6 rounded-lg flex items-center justify-center font-stat font-bold text-[10px] lg:text-xs flex-shrink-0">
                2
              </div>
              <span className="text-warm-300">Pitch Value</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 lg:w-6 lg:h-6 rounded bg-warm-800 border border-warm-700 flex items-center justify-center flex-shrink-0">
                <SwordIcon className="w-3 h-3 text-red-400" />
              </div>
              <span className="text-warm-300">Attack</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 lg:w-6 lg:h-6 rounded bg-warm-800 border border-warm-700 flex items-center justify-center flex-shrink-0">
                <HeartIcon className="w-3 h-3 text-green-400" />
              </div>
              <span className="text-warm-300">Health</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 lg:w-6 lg:h-6 rounded-full bg-yellow-500 border border-yellow-300 flex items-center justify-center flex-shrink-0">
                <AbilityIcon className="w-2.5 h-2.5" />
              </div>
              <span className="text-warm-300">Has Ability</span>
            </div>
          </div>
          <p className="mt-2 text-[10px] lg:text-xs text-warm-500 leading-relaxed">
            Blue = mana spent to play. Gold = mana gained when pitched. Yellow circle = has an ability.
          </p>
        </section>

        <section>
          <h3 className="font-bold text-amber-400 mb-2 border-b border-warm-700 pb-1 flex items-center gap-1.5">
            <BagIcon className="w-4 h-4" />
            Your Cards
          </h3>
          <p className="leading-relaxed text-xs">
            You start with a <strong className="text-white">Bag</strong> full of cards. Each round,
            you draw <strong className="text-white">5 cards</strong> into your hand. Cards you don't
            use go back into your Bag for next time.
          </p>
          <p className="mt-2 text-xs text-warm-400 leading-relaxed">
            But any card you play or pitch is gone from your Bag for good — so think carefully about
            what you spend!
          </p>
        </section>

        <section>
          <h3 className="font-bold text-amber-400 mb-2 border-b border-warm-700 pb-1 flex items-center gap-1.5">
            <CardIcon className="w-4 h-4" />
            Playing & Pitching
          </h3>
          <p className="leading-relaxed text-xs">
            Every card can be <strong className="text-blue-400">Played</strong> onto your board (up
            to <strong className="text-white">5 slots</strong>) to fight, or{' '}
            <strong className="text-amber-400">Pitched</strong> to gain Mana. You need Mana to play
            cards, so you'll always be making tough choices about what to keep and what to
            sacrifice.
          </p>
          <p className="mt-2 text-xs text-warm-400 leading-relaxed">
            You can also pitch units already on your board if you need to make room or need more
            Mana.
          </p>
        </section>

        <section>
          <h3 className="font-bold text-amber-400 mb-2 border-b border-warm-700 pb-1 flex items-center gap-1.5">
            <span className="w-4 h-4 rounded-full bg-mana-blue/40 border border-mana-blue/60 inline-block flex-shrink-0" />
            Mana
          </h3>
          <ul className="space-y-1.5 text-xs">
            <li className="flex items-start gap-2">
              <span className="text-blue-400 font-bold mt-0.5">*</span>
              <span>
                You start each turn with <strong className="text-blue-400">0 Mana</strong> — pitch
                cards to fill up.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-400 font-bold mt-0.5">*</span>
              <span>
                Your Mana tank starts at <strong className="text-white">3</strong> capacity and
                grows by +1 each round, up to 10.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-400 font-bold mt-0.5">*</span>
              <span>
                You can pitch, spend, then pitch again in the same turn — just can't go over your
                max.
              </span>
            </li>
          </ul>
        </section>

        <section>
          <h3 className="font-bold text-amber-400 mb-2 border-b border-warm-700 pb-1 flex items-center gap-1.5">
            <SwordIcon className="w-4 h-4" />
            Battle
          </h3>
          <p className="leading-relaxed text-xs">
            When you end your turn, your units fight automatically! The two front units clash{' '}
            <strong className="text-white">at the same time</strong>, dealing damage to each other
            simultaneously. When a unit falls, the next one steps up. The team that loses all its
            units first takes a loss.
          </p>
          <p className="mt-2 text-xs text-warm-400 leading-relaxed">
            Many units have special <strong className="text-yellow-400">abilities</strong> that
            trigger during battle — like buffing allies, damaging enemies, or spawning new units
            when they die. When multiple abilities trigger at once, stronger units go first.
          </p>
        </section>

        <section>
          <h3 className="font-bold text-amber-400 mb-2 border-b border-warm-700 pb-1 flex items-center gap-1.5">
            <AbilityIcon className="w-4 h-4" />
            Chain Reactions
          </h3>
          <p className="leading-relaxed text-xs">
            Abilities can cause <strong className="text-yellow-500">chain reactions</strong>. If a
            unit dies and its death triggers a new effect, that happens right away — even in the
            middle of another ability resolving. This is where clever combos come to life!
          </p>
        </section>

        <section>
          <h3 className="font-bold text-amber-400 mb-2 border-b border-warm-700 pb-1 flex items-center gap-1.5">
            <StarIcon className="w-4 h-4" />
            Winning
          </h3>
          <p className="leading-relaxed text-xs">
            Win battles to earn <strong className="text-yellow-500">Stars</strong>. Collect{' '}
            <strong className="text-yellow-500">10 Stars</strong> and you win the run! But be
            careful — you start with just <strong className="text-red-400">3 lives</strong>. Lose
            them all and it's game over.
          </p>
        </section>
      </div>
    );
  };

  const renderModeTab = () => {
    const isBlockchain = resolvedMode.type === 'blockchain';

    return (
      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-4">
        {/* Blockchain Connection Status - only shown in blockchain mode */}
        {isBlockchain && (
          <div className="p-4 bg-warm-800/50 rounded-lg border border-warm-700">
            <h3 className="font-bold text-white mb-3">Chain Connection</h3>

            {/* Connection Status */}
            <div className="flex items-center gap-2 mb-3 p-2 bg-warm-900 rounded border border-white/5">
              <div
                className={`w-2 h-2 rounded-full ${resolvedMode.blockNumber != null ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}
              />
              <span className="text-xs font-mono text-warm-400">
                {resolvedMode.blockNumber != null
                  ? `Block #${resolvedMode.blockNumber.toLocaleString()}`
                  : 'Offline'}
              </span>
            </div>

            {/* Account Selector */}
            {resolvedMode.accounts.length > 0 && (
              <div className="space-y-2">
                <label className="text-[10px] text-warm-500 uppercase font-bold">Account</label>
                <select
                  value={resolvedMode.selectedAccount?.address || ''}
                  onChange={(e) => {
                    const account = resolvedMode.accounts.find((a) => a.address === e.target.value);
                    resolvedMode.onSelectAccount?.(account);
                  }}
                  className="w-full bg-warm-800 border border-white/10 rounded px-2 py-1.5 text-xs outline-none focus:border-yellow-500/50"
                >
                  {resolvedMode.accounts.map((acc) => (
                    <option key={acc.address} value={acc.address}>
                      {acc.source === 'dev' ? '[DEV] ' : ''}
                      {acc.name} ({acc.address.slice(0, 6)}...)
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        <div className="p-4 bg-warm-800/50 rounded-lg border border-warm-700">
          <div className="space-y-3">
            <button
              onClick={() => navigate('/blockchain/customize')}
              className="w-full btn bg-yellow-900/50 hover:bg-yellow-800 text-yellow-200 border border-yellow-700 text-xs py-2"
            >
              Customize
            </button>
            <button
              onClick={() => navigate('/')}
              className="w-full btn bg-warm-700/50 hover:bg-warm-600 text-warm-300 border border-warm-600 text-xs py-2"
            >
              Exit to Menu
            </button>
          </div>
        </div>

        <div className="p-4 bg-warm-800/50 rounded-lg border border-warm-700">
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
          <div className="mt-4 p-2 bg-black/50 rounded border border-warm-800">
            <div className="text-[10px] text-warm-500 mb-1 flex justify-between items-center">
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
      className="card-detail-panel fixed left-0 bottom-0 w-44 lg:w-80 bg-warm-900 border-r border-warm-700 shadow-2xl flex flex-col z-10"
      style={{ top: topOffset }}
    >
      {/* Tabs */}
      <div className="flex border-b border-warm-800">
        <button
          onClick={() => setActiveTab('card')}
          className={`flex-1 py-2 lg:py-3 text-xs font-bold uppercase tracking-wider transition-colors ${
            activeTab === 'card'
              ? 'bg-warm-800 text-yellow-500 border-b-2 border-yellow-500'
              : 'text-warm-500 hover:text-warm-300'
          }`}
        >
          <span className="lg:hidden">
            <CardIcon className="w-5 h-5 mx-auto" />
          </span>
          <span className="hidden lg:inline">Card</span>
        </button>
        <button
          onClick={() => setActiveTab('rules')}
          className={`flex-1 py-2 lg:py-3 text-xs font-bold uppercase tracking-wider transition-colors ${
            activeTab === 'rules'
              ? 'bg-warm-800 text-yellow-500 border-b-2 border-yellow-500'
              : 'text-warm-500 hover:text-warm-300'
          }`}
        >
          <span className="lg:hidden">
            <BookIcon className="w-5 h-5 mx-auto" />
          </span>
          <span className="hidden lg:inline">Rules</span>
        </button>
        <button
          onClick={() => setActiveTab('mode')}
          className={`flex-1 py-2 lg:py-3 text-xs font-bold uppercase tracking-wider transition-colors ${
            activeTab === 'mode'
              ? 'bg-warm-800 text-yellow-500 border-b-2 border-yellow-500'
              : 'text-warm-500 hover:text-warm-300'
          }`}
        >
          <span className="lg:hidden">
            <GearIcon className="w-5 h-5 mx-auto" />
          </span>
          <span className="hidden lg:inline">System</span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 p-3 lg:p-5 flex flex-col overflow-hidden">
        {activeTab === 'card' && renderCardTab()}
        {activeTab === 'rules' && renderRulesTab()}
        {activeTab === 'mode' && renderModeTab()}
      </div>
    </div>
  );
}
