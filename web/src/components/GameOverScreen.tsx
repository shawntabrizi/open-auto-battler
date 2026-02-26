import { useState, useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { TrophyIcon, SkullIcon } from './Icons';

export function GameOverScreen() {
  const { view, newRun, winsToVictory } = useGameStore();

  const [showStats, setShowStats] = useState(false);
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    setShowStats(false);
    setShowButton(false);
    const statsTimer = setTimeout(() => setShowStats(true), 400);
    const buttonTimer = setTimeout(() => setShowButton(true), 900);
    return () => {
      clearTimeout(statsTimer);
      clearTimeout(buttonTimer);
    };
  }, []);

  if (!view) return null;

  const isVictory = view.phase === 'victory';

  const stats = [
    { value: view.wins, label: 'Wins', color: 'text-gold' },
    { value: view.round, label: 'Round', color: 'text-warm-200' },
    { value: view.lives, label: 'Lives Left', color: 'text-red-400' },
  ];

  return (
    <div className="h-full flex items-center justify-center bg-board-bg p-4">
      <div
        className={`
          p-6 lg:p-12 rounded-xl lg:rounded-2xl text-center max-w-sm lg:max-w-none
          ${isVictory ? 'bg-green-900/30 border-2 border-green-500' : 'bg-red-900/30 border-2 border-red-500'}
        `}
      >
        {/* Title */}
        <h1
          className={`
            text-3xl lg:text-6xl font-bold mb-2 lg:mb-4 animate-scale-bounce
            ${isVictory ? 'text-green-400' : 'text-red-400'}
          `}
        >
          {isVictory ? (
            <span className="flex items-center justify-center gap-3">
              <TrophyIcon className="w-8 h-8 lg:w-12 lg:h-12 text-yellow-400" /> VICTORY!{' '}
              <TrophyIcon className="w-8 h-8 lg:w-12 lg:h-12 text-yellow-400" />
            </span>
          ) : (
            <span className="flex items-center justify-center gap-3">
              <SkullIcon className="w-8 h-8 lg:w-12 lg:h-12 text-red-400" /> DEFEAT{' '}
              <SkullIcon className="w-8 h-8 lg:w-12 lg:h-12 text-red-400" />
            </span>
          )}
        </h1>

        {/* Message */}
        <p className="text-sm lg:text-xl text-warm-200 mb-4 lg:mb-8">
          {isVictory
            ? `Congratulations! You won ${winsToVictory === 10 ? 'all 10 rounds' : 'the match'}!`
            : 'Your forces have been overwhelmed. Try again!'}
        </p>

        {/* Stats */}
        <div className={`flex justify-center gap-6 lg:gap-12 mb-4 lg:mb-8 transition-opacity duration-300 ${showStats ? 'opacity-100' : 'opacity-0'}`}>
          {stats.map((stat, i) => (
            <div
              key={stat.label}
              className={`text-center ${showStats ? 'animate-stat-count-up' : 'opacity-0'}`}
              style={{ animationDelay: `${i * 120}ms`, animationFillMode: 'both' }}
            >
              <div className={`text-2xl lg:text-4xl font-bold font-stat ${stat.color}`}>{stat.value}</div>
              <div className="text-xs lg:text-base text-warm-400">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* New Run Button */}
        <div className={`transition-all duration-500 ${showButton ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <button
            onClick={newRun}
            className="btn btn-primary text-base lg:text-xl px-8 lg:px-12 py-3 lg:py-4"
          >
            New Run
          </button>
        </div>
      </div>
    </div>
  );
}
