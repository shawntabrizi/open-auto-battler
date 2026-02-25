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
} from './Icons';

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
        className="w-7 h-7 lg:w-8 lg:h-8 flex items-center justify-center rounded-full bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors text-xs lg:text-sm"
        title="Audio settings"
      >
        {isMuted ? <SpeakerMutedIcon className="w-4 h-4" /> : <SpeakerIcon className="w-4 h-4" />}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-44 bg-gray-900 border border-gray-700 rounded-lg p-3 shadow-xl z-50">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs text-gray-400">Audio</span>
            <button onClick={toggleMute} className="text-xs text-gray-400 hover:text-white">
              {isMuted ? 'Unmute' : 'Mute'}
            </button>
          </div>
          <label className="flex items-center justify-between text-[10px] text-gray-400 mb-1">
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
          <label className="flex items-center justify-between text-[10px] text-gray-400 mb-1">
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
          <label className="flex items-center justify-between text-[10px] text-gray-400">
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

export function HUD({ hideEndTurn, customAction }: HUDProps) {
  const { view, endTurn, engine, setShowBag, showBag, selection, startingLives, winsToVictory } =
    useGameStore();
  const { status, setIsReady, sendMessage, isReady, opponentReady, battleTimer } =
    useMultiplayerStore();
  const playerAvatar = useCustomizationStore((s) => s.selections.playerAvatar);
  const playSfx = useAudioStore((s) => s.playSfx);

  // Local timer for the waiting player (who already submitted)
  const [waitingTimer, setWaitingTimer] = useState<number | null>(null);
  const waitingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Start waiting timer when we submit and opponent hasn't
  useEffect(() => {
    if (status === 'in-game' && isReady && !opponentReady && view?.phase === 'shop') {
      setWaitingTimer(BATTLE_TIMER_SECONDS);
      waitingTimerRef.current = setInterval(() => {
        setWaitingTimer((prev) => {
          if (prev !== null && prev > 1) return prev - 1;
          return prev;
        });
      }, 1000);
    }

    // Clear when opponent is ready or we're no longer ready
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
        waitingTimerRef.current = null;
      }
    };
  }, [isReady, opponentReady, status, view?.phase]);
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

  // Check if card panel is visible (same logic as GameLayout)
  const showCardPanel = view?.phase === 'shop' || selection?.type === 'board' || showBag;

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

  // Determine display timer
  const displayTimer = isWaiting ? waitingTimer : opponentWaiting ? battleTimer : null;

  return (
    <div
      className={`hud h-12 lg:h-16 bg-gray-900/80 border-b border-gray-700 flex items-center justify-between px-2 lg:px-6 relative z-20 ${showCardPanel ? 'show-card-panel' : ''}`}
    >
      {/* Left: Lives */}
      <div className="flex items-center gap-1 lg:gap-2">
        {playerAvatar && (
          <div className="w-6 h-6 lg:w-10 lg:h-10 rounded-full overflow-hidden border-2 border-yellow-500/50 flex-shrink-0">
            <img src={playerAvatar.imageUrl} alt="avatar" className="w-full h-full object-cover" />
          </div>
        )}
        <span className="text-gray-400 hidden lg:inline">Lives:</span>
        {/* Mobile: compact numeric */}
        <div className="flex lg:hidden items-center gap-1">
          <HeartIcon className="w-5 h-5 text-red-500" />
          <span className="font-bold text-sm">
            <AnimatedValue value={view.lives} />/{startingLives}
          </span>
        </div>
        {/* Desktop: full hearts */}
        <div className="hidden lg:flex gap-1">
          {Array.from({ length: startingLives }).map((_, i) =>
            i < view.lives ? (
              <HeartIcon key={i} className="w-6 h-6 text-red-500" />
            ) : (
              <HeartOutlineIcon key={i} className="w-6 h-6 text-gray-600" />
            ),
          )}
        </div>
      </div>

      {/* Center: Round & End Turn */}
      <div className="flex items-center gap-2 lg:gap-4">
        <div className="text-center">
          <div className="text-xs lg:text-sm text-gray-400">Round</div>
          <div className="text-lg lg:text-2xl font-bold text-gold">{view.round}</div>
        </div>

        {view.phase === 'shop' && (
          <div className="flex items-center gap-2 lg:gap-3">
            <button
              onClick={() => setShowBag(true)}
              className="btn bg-gray-800 hover:bg-gray-700 text-white border-gray-600 flex items-center gap-1 lg:gap-2 px-2 lg:px-4"
              title="View your draw pool"
            >
              <BagIcon className="w-5 h-5 lg:w-6 lg:h-6 text-amber-400" />
              <span className="font-bold text-sm lg:text-base">{view.bag_count}</span>
            </button>
            {!hideEndTurn && (
              <>
                {/* Timer display when either player is waiting */}
                {displayTimer !== null && (
                  <div
                    className={`flex items-center gap-2 px-3 py-1 rounded-lg ${
                      opponentWaiting
                        ? displayTimer <= 5
                          ? 'bg-red-600 animate-pulse'
                          : 'bg-orange-600'
                        : 'bg-blue-600'
                    }`}
                  >
                    <span className="text-white text-sm lg:text-base font-bold flex items-center gap-1">
                      {opponentWaiting ? (
                        <><WarningIcon className="w-4 h-4" /> Submit in:</>
                      ) : (
                        <><HourglassIcon className="w-4 h-4" /> Waiting:</>
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
                  className={`btn btn-primary text-sm lg:text-lg px-3 lg:px-6 py-2 lg:py-3 transition-all ${
                    isWaiting
                      ? 'bg-gray-600 scale-95 opacity-80 cursor-not-allowed'
                      : opponentWaiting && displayTimer !== null && displayTimer <= 5
                        ? 'animate-pulse bg-red-500 hover:bg-red-400'
                        : ''
                  }`}
                >
                  {isWaiting ? 'Waiting...' : 'Battle!'}
                </button>
              </>
            )}
            {customAction && (
              <button
                onClick={customAction.onClick}
                disabled={customAction.disabled}
                className={`btn text-sm lg:text-lg px-3 lg:px-6 py-2 lg:py-3 transition-all font-bold ${
                  customAction.disabled
                    ? 'bg-gray-600 scale-95 opacity-80 cursor-not-allowed'
                    : customAction.variant === 'chain'
                      ? 'bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-300 hover:to-orange-400 text-slate-900'
                      : 'btn-primary'
                }`}
              >
                {customAction.label}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Right: Wins + Audio */}
      <div className="flex items-center gap-1 lg:gap-2">
        <span className="text-gray-400 hidden lg:inline">Wins:</span>
        {/* Mobile: compact numeric */}
        <div className="flex lg:hidden items-center gap-1">
          <StarIcon className="w-5 h-5 text-gold" />
          <span className="font-bold text-sm">
            <AnimatedValue value={view.wins} />/{winsToVictory}
          </span>
        </div>
        {/* Desktop: full stars */}
        <div className="hidden lg:flex gap-1">
          {Array.from({ length: winsToVictory }).map((_, i) =>
            i < view.wins ? (
              <StarIcon key={i} className="w-5 h-5 text-gold" />
            ) : (
              <StarOutlineIcon key={i} className="w-5 h-5 text-gray-600" />
            ),
          )}
        </div>
        <AudioControls />
      </div>
    </div>
  );
}
