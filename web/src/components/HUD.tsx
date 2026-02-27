import { useEffect, useState, useRef } from 'react';
import { useGameStore } from '../store/gameStore';
import { useMultiplayerStore } from '../store/multiplayerStore';
import { useCustomizationStore } from '../store/customizationStore';
import { useAudioStore } from '../store/audioStore';
import {
  HeartIcon,
  HeartOutlineIcon,
  StarIcon,
  StarOutlineIcon,
  BagIcon,
  SpeakerIcon,
  SpeakerMutedIcon,
  HourglassIcon,
  WarningIcon,
  CardIcon,
  SwordIcon,
  AbilityIcon,
} from './Icons';
import battleSwordIcon from '../../battle-sword.svg';

const BATTLE_TIMER_SECONDS = 20;

function AudioControls() {
  const [open, setOpen] = useState(false);
  const {
    masterVolume,
    sfxVolume,
    musicVolume,
    isMuted,
    setMasterVolume,
    setSfxVolume,
    setMusicVolume,
    toggleMute,
  } = useAudioStore();

  return (
    <div className="relative ml-2">
      <button
        onClick={() => setOpen(!open)}
        className="w-7 h-7 lg:w-8 lg:h-8 flex items-center justify-center rounded-full bg-warm-800 hover:bg-warm-700 text-warm-400 hover:text-warm-100 transition-colors text-xs lg:text-sm"
        title="Audio settings"
      >
        {isMuted ? <SpeakerMutedIcon className="w-4 h-4" /> : <SpeakerIcon className="w-4 h-4" />}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-44 bg-warm-900 border border-warm-700 rounded-lg p-3 shadow-xl z-50">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs text-warm-400">Audio</span>
            <button onClick={toggleMute} className="text-xs text-warm-400 hover:text-white">
              {isMuted ? 'Unmute' : 'Mute'}
            </button>
          </div>
          <label className="flex items-center justify-between text-[10px] text-warm-400 mb-1">
            <span>Master</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={masterVolume}
              onChange={(e) => setMasterVolume(Number(e.target.value))}
              className="w-20 h-1 accent-amber-500"
            />
          </label>
          <label className="flex items-center justify-between text-[10px] text-warm-400 mb-1">
            <span>SFX</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={sfxVolume}
              onChange={(e) => setSfxVolume(Number(e.target.value))}
              className="w-20 h-1 accent-amber-500"
            />
          </label>
          <label className="flex items-center justify-between text-[10px] text-warm-400">
            <span>Music</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={musicVolume}
              onChange={(e) => setMusicVolume(Number(e.target.value))}
              className="w-20 h-1 accent-amber-500"
            />
          </label>
        </div>
      )}
    </div>
  );
}

function AnimatedValue({ value, className }: { value: number; className?: string }) {
  const [bouncing, setBouncing] = useState(false);
  const prevRef = useRef(value);

  useEffect(() => {
    if (value !== prevRef.current) {
      prevRef.current = value;
      setBouncing(true);
      const timer = setTimeout(() => setBouncing(false), 500);
      return () => clearTimeout(timer);
    }
  }, [value]);

  return (
    <span className={`${className || ''} ${bouncing ? 'animate-scale-bounce inline-block' : ''}`}>
      {value}
    </span>
  );
}

interface HUDProps {
  hideEndTurn?: boolean;
  customAction?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    variant?: 'primary' | 'chain';
  };
}

export function HUD() {
  const { view, setShowBag, showBag, selection, startingLives, winsToVictory, mobileTab, setMobileTab } = useGameStore();
  const playerAvatar = useCustomizationStore((s) => s.selections.playerAvatar);
  const [showRules, setShowRules] = useState(false);

  // Keyboard shortcut for Bag view
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'b') {
        setShowBag(!showBag);
      } else if (e.key === 'Escape') {
        setShowBag(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setShowBag, showBag]);

  if (!view) return null;

  // Responsive panel margin — no mobile sidebar during shop phase (both tabs), desktop during shop phase
  const showCardPanel = view?.phase === 'shop' || selection?.type === 'board' || showBag;
  const hasSelection = selection !== null || showBag;
  const isShopMobile = view?.phase === 'shop'; // Both hand and board tabs hide sidebar on mobile
  const hudMargin = `${hasSelection && !isShopMobile ? 'ml-44' : ''} ${showCardPanel ? 'lg:ml-80' : ''}`;

  const isShopPhase = view.phase === 'shop';

  return (
    <div
      className={`hud h-9 lg:h-16 bg-warm-950/90 border-b border-warm-800/60 flex items-center justify-between px-1.5 lg:px-6 relative z-20 ${hudMargin}`}
      style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}
    >
      {/* === MOBILE: single consolidated bar === */}
      <div className="flex lg:hidden items-center w-full gap-1.5">
        {/* Tab toggle — left side for thumb reach */}
        {isShopPhase ? (
          <div className="flex items-center bg-warm-800/80 rounded-full p-0.5 flex-shrink-0">
            <button
              onClick={() => setMobileTab('hand')}
              className={`px-2.5 py-0.5 rounded-full text-[0.65rem] font-bold uppercase tracking-wide transition-colors ${
                mobileTab === 'hand'
                  ? 'bg-gold/90 text-warm-950'
                  : 'text-warm-400 hover:text-warm-200'
              }`}
            >
              Hand
            </button>
            <button
              onClick={() => setMobileTab('board')}
              className={`px-2.5 py-0.5 rounded-full text-[0.65rem] font-bold uppercase tracking-wide transition-colors ${
                mobileTab === 'board'
                  ? 'bg-gold/90 text-warm-950'
                  : 'text-warm-400 hover:text-warm-200'
              }`}
            >
              Board
            </button>
          </div>
        ) : (
          <span className="text-sm font-bold text-gold flex-shrink-0">{view.round}</span>
        )}

        {/* Segmented mana bar — center */}
        {isShopPhase && (
          <div className="flex items-center gap-0.5 flex-1 justify-center">
            <svg className="w-3.5 h-3.5 text-mana-blue flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M13 3L4 14h7l-2 7 9-11h-7l2-7z" />
            </svg>
            <div className="flex gap-[3px]">
              {Array.from({ length: view.mana_limit }).map((_, i) => (
                <div
                  key={i}
                  className={`w-4 h-[0.6rem] rounded-sm transition-colors ${
                    i < view.mana
                      ? 'bg-mana-blue shadow-[0_0_4px_rgba(91,143,170,0.5)]'
                      : 'bg-warm-800 border border-warm-700/50'
                  }`}
                />
              ))}
            </div>
            <span className="text-[0.6rem] font-bold text-mana-blue/80 ml-0.5 flex-shrink-0">
              {view.mana}
            </span>
          </div>
        )}
        {!isShopPhase && <div className="flex-1" />}

        {/* Lives, Wins, Info, Audio — evenly spaced */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <div className="flex items-center gap-0.5">
            <HeartIcon className="w-3.5 h-3.5 text-red-500" />
            <span className="font-bold text-[0.7rem]">
              <AnimatedValue value={view.lives} />/{startingLives}
            </span>
          </div>
          <div className="flex items-center gap-0.5">
            <StarIcon className="w-3.5 h-3.5 text-gold" />
            <span className="font-bold text-[0.7rem]">
              <AnimatedValue value={view.wins} />/{winsToVictory}
            </span>
          </div>
          <button
            onClick={() => setShowRules(true)}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-warm-800 hover:bg-warm-700 text-warm-400 hover:text-warm-100 transition-colors"
            title="Rules"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
            </svg>
          </button>
          <AudioControls />
        </div>
      </div>

      {/* Mobile rules overlay */}
      {showRules && <RulesOverlay onClose={() => setShowRules(false)} />}

      {/* === DESKTOP: original full layout === */}
      {/* Left: Lives */}
      <div className="hidden lg:flex items-center gap-2">
        {playerAvatar && (
          <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-yellow-500/50 flex-shrink-0">
            <img src={playerAvatar.imageUrl} alt="avatar" className="w-full h-full object-cover" />
          </div>
        )}
        <span className="text-warm-400">Lives:</span>
        <div className="flex gap-1">
          {Array.from({ length: startingLives }).map((_, i) =>
            i < view.lives ? (
              <HeartIcon key={i} className="w-5 h-5 text-red-500" />
            ) : (
              <HeartOutlineIcon key={i} className="w-5 h-5 text-warm-600" />
            )
          )}
        </div>
      </div>

      {/* Center: Round + Bag */}
      <div className="hidden lg:flex items-center gap-3">
        <div className="text-center">
          <div className="text-sm text-warm-400">Round</div>
          <div className="text-2xl font-bold text-gold">{view.round}</div>
        </div>
        {view.phase === 'shop' && (
          <button
            onClick={() => setShowBag(true)}
            className="flex btn bg-warm-800 hover:bg-warm-700 text-warm-100 border-warm-600 items-center gap-2 px-4"
            title="View your draw pool"
          >
            <BagIcon className="w-6 h-6 text-amber-400" />
            <span className="font-bold text-base">{view.bag_count}</span>
          </button>
        )}
      </div>

      {/* Right: Wins + Audio */}
      <div className="hidden lg:flex items-center gap-2">
        <span className="text-warm-400">Wins:</span>
        <div className="flex gap-1">
          {Array.from({ length: winsToVictory }).map((_, i) =>
            i < view.wins ? (
              <StarIcon key={i} className="w-5 h-5 text-gold" />
            ) : (
              <StarOutlineIcon key={i} className="w-5 h-5 text-warm-600" />
            )
          )}
        </div>
        <AudioControls />
      </div>
    </div>
  );
}

function RulesOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-warm-950/95 flex flex-col safe-area-pad">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-warm-700/50">
        <h2 className="text-lg font-bold text-gold">How to Play</h2>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full bg-warm-800 text-warm-300 flex items-center justify-center active:bg-warm-700"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {/* Card Anatomy Legend */}
        <section>
          <h3 className="text-base font-bold text-amber-400 mb-2 border-b border-warm-700 pb-1 flex items-center gap-1.5">
            <CardIcon className="w-5 h-5" />
            Reading a Card
          </h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2">
              <div className="cost-badge w-7 h-7 rounded-lg flex items-center justify-center font-stat font-bold text-white text-xs flex-shrink-0">
                3
              </div>
              <span className="text-warm-300">Mana Cost</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="pitch-badge w-7 h-7 rounded-lg flex items-center justify-center font-stat font-bold text-xs flex-shrink-0">
                2
              </div>
              <span className="text-warm-300">Pitch Value</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded bg-warm-800 border border-warm-700 flex items-center justify-center flex-shrink-0">
                <SwordIcon className="w-3.5 h-3.5 text-red-400" />
              </div>
              <span className="text-warm-300">Attack</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded bg-warm-800 border border-warm-700 flex items-center justify-center flex-shrink-0">
                <HeartIcon className="w-3.5 h-3.5 text-green-400" />
              </div>
              <span className="text-warm-300">Health</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-yellow-500 border border-yellow-300 flex items-center justify-center flex-shrink-0">
                <AbilityIcon className="w-3 h-3" />
              </div>
              <span className="text-warm-300">Has Ability</span>
            </div>
          </div>
          <p className="mt-2 text-sm text-warm-500 leading-relaxed">
            Blue = mana spent to play. Gold = mana gained when pitched. Yellow circle = has an ability.
          </p>
        </section>

        <section>
          <h3 className="text-base font-bold text-amber-400 mb-2 border-b border-warm-700 pb-1 flex items-center gap-1.5">
            <BagIcon className="w-5 h-5" />
            Your Cards
          </h3>
          <p className="text-sm text-warm-300 leading-relaxed">
            You start with a <strong className="text-white">Bag</strong> full of cards. Each round,
            you draw <strong className="text-white">5 cards</strong> into your hand. Cards you don't
            use go back into your Bag for next time.
          </p>
          <p className="mt-2 text-sm text-warm-400 leading-relaxed">
            But any card you play or pitch is gone from your Bag for good — so think carefully about
            what you spend!
          </p>
        </section>

        <section>
          <h3 className="text-base font-bold text-amber-400 mb-2 border-b border-warm-700 pb-1 flex items-center gap-1.5">
            <CardIcon className="w-5 h-5" />
            Playing & Pitching
          </h3>
          <p className="text-sm text-warm-300 leading-relaxed">
            Every card can be <strong className="text-blue-400">Played</strong> onto your board (up
            to <strong className="text-white">5 slots</strong>) to fight, or{' '}
            <strong className="text-amber-400">Pitched</strong> to gain Mana. You need Mana to play
            cards, so you'll always be making tough choices about what to keep and what to
            sacrifice.
          </p>
          <p className="mt-2 text-sm text-warm-400 leading-relaxed">
            You can also pitch units already on your board if you need to make room or need more
            Mana.
          </p>
        </section>

        <section>
          <h3 className="text-base font-bold text-amber-400 mb-2 border-b border-warm-700 pb-1 flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-full bg-mana-blue/40 border border-mana-blue/60 inline-block flex-shrink-0" />
            Mana
          </h3>
          <ul className="space-y-2 text-sm text-warm-300">
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
          <h3 className="text-base font-bold text-amber-400 mb-2 border-b border-warm-700 pb-1 flex items-center gap-1.5">
            <SwordIcon className="w-5 h-5" />
            Battle
          </h3>
          <p className="text-sm text-warm-300 leading-relaxed">
            When you end your turn, your units fight automatically! The two front units clash{' '}
            <strong className="text-white">at the same time</strong>, dealing damage to each other
            simultaneously. When a unit falls, the next one steps up. The team that loses all its
            units first takes a loss.
          </p>
          <p className="mt-2 text-sm text-warm-400 leading-relaxed">
            Many units have special <strong className="text-yellow-400">abilities</strong> that
            trigger during battle — like buffing allies, damaging enemies, or spawning new units
            when they die. When multiple abilities trigger at once, stronger units go first.
          </p>
        </section>

        <section>
          <h3 className="text-base font-bold text-amber-400 mb-2 border-b border-warm-700 pb-1 flex items-center gap-1.5">
            <AbilityIcon className="w-5 h-5" />
            Chain Reactions
          </h3>
          <p className="text-sm text-warm-300 leading-relaxed">
            Abilities can cause <strong className="text-yellow-500">chain reactions</strong>. If a
            unit dies and its death triggers a new effect, that happens right away — even in the
            middle of another ability resolving. This is where clever combos come to life!
          </p>
        </section>

        <section>
          <h3 className="text-base font-bold text-amber-400 mb-2 border-b border-warm-700 pb-1 flex items-center gap-1.5">
            <StarIcon className="w-5 h-5" />
            Winning
          </h3>
          <p className="text-sm text-warm-300 leading-relaxed">
            Win battles to earn <strong className="text-yellow-500">Stars</strong>. Collect{' '}
            <strong className="text-yellow-500">10 Stars</strong> and you win the run! But be
            careful — you start with just <strong className="text-red-400">3 lives</strong>. Lose
            them all and it's game over.
          </p>
        </section>
      </div>
    </div>
  );
}

/** Floating Battle button — rendered in the arena area, centered above the board */
export function BattleAction({
  hideEndTurn,
  customAction,
  compact = false,
}: {
  hideEndTurn?: boolean;
  customAction?: HUDProps['customAction'];
  compact?: boolean;
}) {
  const { view, endTurn, engine } = useGameStore();
  const { status, setIsReady, sendMessage, isReady, opponentReady, battleTimer } =
    useMultiplayerStore();
  const playSfx = useAudioStore((s) => s.playSfx);

  const [waitingTimer, setWaitingTimer] = useState<number | null>(null);
  const waitingTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (status === 'in-game' && isReady && !opponentReady && view?.phase === 'shop') {
      setWaitingTimer(BATTLE_TIMER_SECONDS);
      waitingTimerRef.current = setInterval(() => {
        setWaitingTimer((prev) => (prev !== null && prev > 1 ? prev - 1 : prev));
      }, 1000);
    }
    if (!isReady || opponentReady) {
      if (waitingTimerRef.current) {
        clearInterval(waitingTimerRef.current);
        waitingTimerRef.current = null;
      }
      setWaitingTimer(null);
    }
    return () => {
      if (waitingTimerRef.current) {
        clearInterval(waitingTimerRef.current);
      }
    };
  }, [isReady, opponentReady, status, view?.phase]);

  if (!view || view.phase !== 'shop') return null;
  if (hideEndTurn && !customAction) return null;

  const handleEndTurn = () => {
    playSfx('battle-start');
    if (status === 'in-game') {
      const board = engine?.get_board();
      setIsReady(true);
      sendMessage({ type: 'END_TURN_READY', board });
    } else {
      endTurn();
    }
  };

  const isWaiting = status === 'in-game' && isReady && !opponentReady;
  const opponentWaiting = status === 'in-game' && !isReady && opponentReady;
  const displayTimer = isWaiting ? waitingTimer : opponentWaiting ? battleTimer : null;

  // Compact mode: thin vertical column button for mobile board tab
  if (compact) {
    return (
      <div className="flex flex-col items-center justify-center gap-1.5 w-full h-full pointer-events-auto px-1.5 py-1">
        {!hideEndTurn && (
          <button
            onClick={handleEndTurn}
            disabled={isWaiting}
            className={`flex-1 w-full flex flex-col items-center justify-center rounded-lg border transition-colors ${
              isWaiting
                ? 'bg-warm-800 border-warm-700 opacity-50 cursor-not-allowed'
                : 'battle-btn border-amber-500/60 active:scale-95'
            }`}
          >
            {isWaiting ? (
              <>
                <span className="font-bold text-xs text-warm-400">Wait</span>
                {displayTimer !== null && (
                  <span className={`font-bold text-sm ${displayTimer <= 5 ? 'text-yellow-300' : 'text-white'}`}>
                    {displayTimer}s
                  </span>
                )}
              </>
            ) : (
              <>
                <span className="text-lg font-bold leading-none">&#9876;</span>
                <span className="text-[0.55rem] font-bold uppercase tracking-wide mt-0.5">Battle</span>
              </>
            )}
          </button>
        )}
        {customAction && (
          <button
            onClick={customAction.onClick}
            disabled={customAction.disabled}
            className={`w-full rounded-lg text-[0.55rem] px-1 py-2 transition-all font-bold uppercase tracking-wide border ${
              customAction.disabled
                ? 'bg-warm-800 border-warm-700 opacity-50 cursor-not-allowed text-warm-500'
                : customAction.variant === 'chain'
                  ? 'bg-gradient-to-b from-yellow-400 to-orange-500 border-orange-400/60 text-warm-900'
                  : 'btn-primary border-amber-500/60'
            }`}
          >
            {customAction.label}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex justify-center pt-1 lg:pt-5 pb-0.5 lg:pb-1 z-30 pointer-events-none">
      <div className="flex items-center gap-3 pointer-events-auto">
        {!hideEndTurn && (
          <>
            {displayTimer !== null && (
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
                  opponentWaiting
                    ? displayTimer <= 5
                      ? 'bg-red-600 animate-pulse'
                      : 'bg-orange-600'
                    : 'bg-blue-600'
                }`}
              >
                <span className="text-white text-sm lg:text-base font-bold flex items-center gap-1">
                  {opponentWaiting ? (
                    <>
                      <WarningIcon className="w-4 h-4" /> Submit in:
                    </>
                  ) : (
                    <>
                      <HourglassIcon className="w-4 h-4" /> Waiting:
                    </>
                  )}
                </span>
                <span
                  className={`text-white text-lg lg:text-xl font-bold ${displayTimer <= 5 ? 'text-yellow-300' : ''}`}
                >
                  {displayTimer}s
                </span>
              </div>
            )}
            <button
              onClick={handleEndTurn}
              disabled={isWaiting}
              className={`battle-btn rounded-xl transition-all flex items-center justify-center ${
                isWaiting
                  ? 'bg-warm-600 scale-95 opacity-80 cursor-not-allowed px-4 lg:px-12 py-1.5 lg:py-4'
                  : opponentWaiting && displayTimer !== null && displayTimer <= 5
                    ? 'animate-pulse bg-red-500 hover:bg-red-400 px-2 lg:px-4 py-0.5 lg:py-1'
                    : 'px-2 lg:px-4 py-0.5 lg:py-1'
              }`}
            >
              {isWaiting ? (
                <span className="font-bold tracking-wide text-base lg:text-2xl">Waiting...</span>
              ) : (
                <img
                  src={battleSwordIcon}
                  alt="Battle"
                  className="h-16 lg:h-28"
                />
              )}
            </button>
          </>
        )}
        {customAction && (
          <button
            onClick={customAction.onClick}
            disabled={customAction.disabled}
            className={`btn rounded-xl text-base lg:text-xl px-6 lg:px-10 py-2.5 lg:py-4 transition-all font-bold ${
              customAction.disabled
                ? 'bg-warm-600 scale-95 opacity-80 cursor-not-allowed'
                : customAction.variant === 'chain'
                  ? 'bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-300 hover:to-orange-400 text-warm-900'
                  : 'btn-primary'
            }`}
          >
            {customAction.label}
          </button>
        )}
      </div>
    </div>
  );
}
