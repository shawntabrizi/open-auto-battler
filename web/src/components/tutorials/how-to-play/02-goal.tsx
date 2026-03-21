export default function Goal() {
  return (
    <div className="text-center">
      <h2 className="text-2xl lg:text-3xl font-heading font-bold text-white mb-4 lg:mb-6">
        Your Mission
      </h2>
      <p className="text-warm-300 text-sm lg:text-lg leading-relaxed max-w-md mx-auto mb-2 lg:mb-3">
        Build a team of units strong enough to crush your opponents.
      </p>
      <p className="text-warm-300 text-sm lg:text-lg leading-relaxed max-w-md mx-auto mb-4 lg:mb-6 flex flex-wrap items-center justify-center gap-1">
        <span>Earn</span>
        <span className="text-gold font-bold">10 wins</span>
        <svg viewBox="0 0 24 24" fill="#facc15" className="w-5 h-5 lg:w-6 lg:h-6 inline-block">
          <path d="M12 2l2.94 6.34L22 9.27l-5.15 4.64L18.18 22 12 18.27 5.82 22l1.33-8.09L2 9.27l7.06-.93z" />
        </svg>
        <span>before you lose all</span>
        <span className="text-defeat-red font-bold">3 lives</span>
        <svg viewBox="0 0 24 24" fill="#ef4444" className="w-5 h-5 lg:w-6 lg:h-6 inline-block">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
        <span>!</span>
      </p>

      <div className="text-warm-400 text-xs lg:text-sm leading-relaxed max-w-md mx-auto space-y-1">
        <p>
          <span className="text-accent-emerald font-bold">Victory:</span> destroy all enemy units to earn a win.
        </p>
        <p>
          <span className="text-defeat-red font-bold">Defeat:</span> lose all your units and you lose a life.
        </p>
        <p>
          <span className="text-warm-300 font-bold">Draw:</span> both sides wiped out. No win, no life lost.
        </p>
      </div>
    </div>
  );
}
