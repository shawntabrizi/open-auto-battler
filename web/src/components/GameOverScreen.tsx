import { useState, useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { useArenaStore } from '../store/arenaStore';
import { useIsSubmitting } from '../store/txStore';
import { TrophyIcon, SkullIcon, StarIcon, HeartIcon, HourglassIcon } from './Icons';
import { TopBar } from './TopBar';

export function GameOverScreen() {
  const { view, newRun, winsToVictory } = useGameStore();
  const { chainState, endGame } = useArenaStore();
  const isSubmitting = useIsSubmitting();

  const [showTitle, setShowTitle] = useState(false);
  const [showSubtitle, setShowSubtitle] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showPips, setShowPips] = useState(false);
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    setShowTitle(false);
    setShowSubtitle(false);
    setShowStats(false);
    setShowPips(false);
    setShowButton(false);

    const timers = [
      setTimeout(() => setShowTitle(true), 100),
      setTimeout(() => setShowSubtitle(true), 400),
      setTimeout(() => setShowStats(true), 700),
      setTimeout(() => setShowPips(true), 1000),
      setTimeout(() => setShowButton(true), 1300),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  if (!view) return null;

  const isVictory = view.wins >= (winsToVictory || 10);

  const stats = [
    {
      value: view.wins,
      label: 'Wins',
      color: 'theme-icon-accent',
      icon: <StarIcon className="theme-icon-accent w-4 h-4 lg:w-5 lg:h-5" />,
    },
    {
      value: view.round,
      label: 'Round',
      color: 'text-warm-200',
      icon: <HourglassIcon className="theme-icon-muted w-4 h-4 lg:w-5 lg:h-5" />,
    },
    {
      value: view.lives,
      label: 'Lives Left',
      color: 'theme-icon-health',
      icon: <HeartIcon className="theme-icon-health w-4 h-4 lg:w-5 lg:h-5" />,
    },
  ];

  // Build pip data: wins and losses for each round played
  const totalRounds = winsToVictory || 10;
  const roundsPlayed = view.round;
  const pips: ('win' | 'loss' | 'unplayed')[] = [];
  const losses = roundsPlayed - view.wins;
  for (let i = 0; i < totalRounds; i++) {
    if (i < view.wins) pips.push('win');
    else if (i < view.wins + losses) pips.push('loss');
    else pips.push('unplayed');
  }

  return (
    <div className="h-full flex flex-col relative overflow-hidden">
      <TopBar backTo="/" backLabel="Menu" />
      <div className="flex-1 flex items-center justify-center relative">
        {/* Background */}
        <div className="absolute inset-0 bg-board-bg" />

        {/* Atmospheric overlay */}
        <div
          className={`game-over-atmosphere ${
            isVictory ? 'game-over-atmosphere-victory' : 'game-over-atmosphere-defeat'
          } animate-vignette-creep`}
        />

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center gap-3 lg:gap-6 p-4 lg:p-6 max-w-md lg:max-w-lg w-full">
          {/* Title with glow */}
          <div className="relative">
            {showTitle && (
              <div
                className={`game-over-title-glow ${
                  isVictory ? 'game-over-title-glow-victory' : 'game-over-title-glow-defeat'
                }`}
              />
            )}
            <h1
              className={`relative text-2xl lg:text-7xl font-title font-bold tracking-wider uppercase ${
                showTitle ? 'animate-result-slam' : 'opacity-0'
              } ${isVictory ? 'text-green-300' : 'text-red-300'}`}
              style={{
                textShadow: isVictory
                  ? '0 2px 12px rgba(74, 140, 58, 0.5), 0 0 40px rgba(74, 140, 58, 0.2)'
                  : '0 2px 12px rgba(168, 58, 42, 0.5), 0 0 40px rgba(168, 58, 42, 0.2)',
              }}
            >
              <span className="flex items-center justify-center gap-3 lg:gap-5">
                {isVictory ? (
                  <>
                    <TrophyIcon className="theme-icon-victory w-8 h-8 lg:w-12 lg:h-12" />
                    Victory
                    <TrophyIcon className="theme-icon-victory w-8 h-8 lg:w-12 lg:h-12" />
                  </>
                ) : (
                  <>
                    <SkullIcon className="theme-icon-defeat w-8 h-8 lg:w-12 lg:h-12" />
                    Defeat
                    <SkullIcon className="theme-icon-defeat w-8 h-8 lg:w-12 lg:h-12" />
                  </>
                )}
              </span>
            </h1>
          </div>

          {/* Subtitle */}
          <p
            className={`text-sm lg:text-lg font-body ${
              showSubtitle ? 'animate-stagger-fade-in' : 'opacity-0'
            } ${isVictory ? 'text-warm-200' : 'text-warm-300/80'}`}
            style={{ animationDelay: '100ms', animationFillMode: 'both' }}
          >
            {isVictory ? 'Your army is undefeated!' : 'Your forces have fallen...'}
          </p>

          {/* Stats panel */}
          <div
            className={`w-full bg-black/40 border border-warm-700/50 rounded-xl px-3 lg:px-8 py-3 lg:py-6 ${
              showStats ? 'animate-stagger-fade-in' : 'opacity-0'
            }`}
            style={{ animationDelay: '150ms', animationFillMode: 'both' }}
          >
            <div className="flex justify-around items-center">
              {stats.map((stat, i) => (
                <div key={stat.label} className="flex flex-col items-center gap-1.5">
                  <div className="flex items-center gap-1.5">
                    {stat.icon}
                    <span className="text-[0.6rem] lg:text-xs text-warm-400 uppercase tracking-wider font-heading">
                      {stat.label}
                    </span>
                  </div>
                  <div
                    className={`text-xl lg:text-4xl font-bold font-stat ${stat.color} ${
                      showStats ? 'animate-stat-count-up' : 'opacity-0'
                    }`}
                    style={{ animationDelay: `${300 + i * 200}ms`, animationFillMode: 'both' }}
                  >
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Win/loss pip bar */}
          <div
            className={`flex items-center gap-1.5 lg:gap-2 ${
              showPips ? 'opacity-100' : 'opacity-0'
            } transition-opacity duration-300`}
          >
            {pips.map((pip, i) => (
              <div
                key={i}
                className={`run-pip ${
                  pip === 'win' ? 'run-pip-win' : pip === 'loss' ? 'run-pip-loss' : ''
                } ${showPips && pip !== 'unplayed' ? 'animate-pip-fill' : ''}`}
                style={
                  showPips && pip !== 'unplayed'
                    ? { animationDelay: `${i * 80}ms`, animationFillMode: 'both' }
                    : undefined
                }
              />
            ))}
          </div>

          {/* Actions */}
          <div
            className={`flex flex-col items-center gap-3 transition-all duration-500 ${
              showButton ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            <button
              onClick={async () => {
                if (chainState) {
                  await endGame();
                }
                newRun();
              }}
              disabled={isSubmitting}
              className="battle-btn font-button font-bold text-sm lg:text-xl px-8 lg:px-14 py-2.5 lg:py-4 rounded-xl tracking-wider uppercase disabled:opacity-50 disabled:cursor-not-allowed"
            >
              New Run
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
