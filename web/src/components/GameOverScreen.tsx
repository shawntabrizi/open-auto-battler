import { useGameStore } from '../store/gameStore';

export function GameOverScreen() {
  const { view, newRun } = useGameStore();

  if (!view) return null;

  const isVictory = view.phase === 'victory';

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
            text-3xl lg:text-6xl font-bold mb-2 lg:mb-4
            ${isVictory ? 'text-green-400' : 'text-red-400'}
          `}
        >
          {isVictory ? '🏆 VICTORY! 🏆' : '💀 DEFEAT 💀'}
        </h1>

        {/* Message */}
        <p className="text-sm lg:text-xl text-gray-300 mb-4 lg:mb-8">
          {isVictory
            ? 'Congratulations! You have conquered all 10 rounds!'
            : 'Your forces have been overwhelmed. Try again!'}
        </p>

        {/* Stats */}
        <div className="flex justify-center gap-6 lg:gap-12 mb-4 lg:mb-8">
          <div className="text-center">
            <div className="text-2xl lg:text-4xl font-bold text-gold">{view.wins}</div>
            <div className="text-xs lg:text-base text-gray-400">Wins</div>
          </div>
          <div className="text-center">
            <div className="text-2xl lg:text-4xl font-bold text-gray-400">{view.round}</div>
            <div className="text-xs lg:text-base text-gray-400">Round</div>
          </div>
          <div className="text-center">
            <div className="text-2xl lg:text-4xl font-bold text-red-400">{view.lives}</div>
            <div className="text-xs lg:text-base text-gray-400">Lives Left</div>
          </div>
        </div>

        {/* New Run Button */}
        <button onClick={newRun} className="btn btn-primary text-base lg:text-xl px-8 lg:px-12 py-3 lg:py-4">
          New Run
        </button>
      </div>
    </div>
  );
}
