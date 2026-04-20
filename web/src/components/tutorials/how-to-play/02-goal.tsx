import { StarIcon, LivesIcon } from '../../Icons';

export default function Goal() {
  return (
    <div className="text-center">
      <h2 className="text-2xl lg:text-3xl font-heading font-bold text-white mb-4 lg:mb-6">
        Your Mission
      </h2>
      <p className="text-base-300 text-sm lg:text-lg leading-relaxed max-w-md mx-auto mb-2 lg:mb-3">
        Build a team of units strong enough to crush your opponents.
      </p>
      <p className="text-base-300 text-sm lg:text-lg leading-relaxed max-w-md mx-auto mb-4 lg:mb-6 flex flex-wrap items-center justify-center gap-1">
        <span>Earn</span>
        <span className="text-accent font-bold">10 wins</span>
        <StarIcon className="w-5 h-5 lg:w-6 lg:h-6 inline-block text-accent" />
        <span>before you lose all</span>
        <span className="text-positive font-bold">3 lives</span>
        <LivesIcon className="w-5 h-5 lg:w-6 lg:h-6 inline-block text-positive" />
        <span>!</span>
      </p>

      <div className="text-base-400 text-xs lg:text-sm leading-relaxed max-w-md mx-auto space-y-1">
        <p>
          <span className="text-positive font-bold">Victory:</span> destroy all enemy units to earn
          a win.
        </p>
        <p>
          <span className="text-defeat font-bold">Defeat:</span> lose all your units and you lose a
          life.
        </p>
        <p>
          <span className="text-base-300 font-bold">Draw:</span> both sides wiped out. No win, no
          life lost.
        </p>
      </div>
    </div>
  );
}
