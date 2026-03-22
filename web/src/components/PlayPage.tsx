import { Link } from 'react-router-dom';
import { useArenaStore } from '../store/arenaStore';
import { useTournamentStore } from '../store/tournamentStore';
import { useTutorialStore } from '../store/tutorialStore';
import { TopBar } from './TopBar';
import { useThemeStore } from '../store/themeStore';

const formatBalance = (raw: bigint, decimals = 12) =>
  (Number(raw) / Math.pow(10, decimals)).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });

export function PlayPage() {
  const theme = useThemeStore((s) => s.activeTheme);
  const { isConnected, blockNumber } = useArenaStore();
  const { activeTournament } = useTournamentStore();
  const openTutorial = useTutorialStore((s) => s.open);

  return (
    <div className="app-shell fixed inset-0 text-white flex flex-col">
      <TopBar backTo="/" backLabel="Menu" title="Play" />
      <div className="flex-1 overflow-y-auto">
        <div className="w-full max-w-sm lg:max-w-md mx-auto p-3 lg:p-4 lg:mt-[10vh]">
          <div className="flex flex-col gap-3 lg:gap-4">
            {/* Online Arena — primary mode */}
            <Link
              to={isConnected ? '/arena' : '/network'}
              className={`theme-panel group block w-full p-5 lg:p-7 rounded-xl border-2 transition-all text-center ${
                isConnected
                  ? 'theme-cta-card active:scale-[0.98]'
                  : 'border-base-700/50 bg-base-900/30 hover:border-base-600'
              }`}
            >
              <div className="flex items-center justify-center gap-3 lg:gap-5">
                <img src={theme.assets.playIcon} alt="" className="h-16 lg:h-24 w-auto" />
                <div className="text-left">
                  <h2 className="font-button text-2xl lg:text-3xl font-bold text-white tracking-wide">
                    ONLINE ARENA
                  </h2>
                  <p className="theme-secondary-text mt-0.5 text-xs lg:text-sm">
                    {isConnected ? 'Compete on the blockchain' : 'Requires blockchain connection'}
                  </p>
                </div>
              </div>
              {isConnected && (
                <div className="mt-2 flex items-center justify-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-positive animate-pulse" />
                  <span className="text-[10px] text-base-500 font-mono">
                    {blockNumber !== null ? `#${blockNumber.toLocaleString()}` : 'live'}
                  </span>
                </div>
              )}
            </Link>

            {/* Tournament — shown when active */}
            {activeTournament && isConnected && (
              <Link
                to="/tournament"
                className="theme-panel group block w-full p-3 lg:p-4 rounded-xl border border-special/40 bg-gradient-to-br from-special/12 to-surface-dark/10 hover:border-special active:scale-[0.98] transition-all text-center"
              >
                <h2 className="font-button text-base lg:text-lg font-bold text-white">
                  TOURNAMENT LIVE
                </h2>
                <p className="text-special text-[10px] lg:text-sm">
                  Entry: {formatBalance(activeTournament.config.entry_fee)} | Pool:{' '}
                  {formatBalance(activeTournament.state.total_pot)}
                </p>
              </Link>
            )}

            {/* Secondary modes */}
            <div className="grid grid-cols-2 gap-3 lg:gap-4">
              <Link
                to={isConnected ? '/practice' : '/network'}
                className={`theme-panel group block p-4 lg:p-5 rounded-xl border transition-all text-center ${
                  isConnected
                    ? 'border-base-700 bg-base-900/30 hover:border-base-500 hover:bg-base-800/40 active:scale-[0.98]'
                    : 'border-base-700/50 bg-base-900/30 hover:border-base-600'
                }`}
              >
                <h3 className="font-button text-base lg:text-lg font-bold text-white">OFFLINE</h3>
                <p className="theme-secondary-text mt-1 text-[10px] lg:text-xs">Single player</p>
              </Link>

              <Link
                to="/versus"
                className="theme-panel group block p-4 lg:p-5 rounded-xl border border-base-700 bg-base-900/30 hover:border-base-500 hover:bg-base-800/40 active:scale-[0.98] transition-all text-center"
              >
                <h3 className="font-button text-base lg:text-lg font-bold text-white">
                  PEER-TO-PEER
                </h3>
                <p className="theme-secondary-text mt-1 text-[10px] lg:text-xs">Direct connect</p>
              </Link>
            </div>

            {/* Tutorial */}
            <button
              onClick={() => openTutorial('how-to-play')}
              className="theme-panel theme-button block w-full p-3 lg:p-4 rounded-xl border border-base-700/30 bg-base-900/20 hover:border-base-600 hover:bg-base-800/30 active:scale-[0.99] transition-all text-center"
            >
              <h3 className="font-button text-sm lg:text-base font-bold text-base-300">TUTORIAL</h3>
              <p className="theme-secondary-text mt-0.5 text-[10px] lg:text-xs">
                Learn how to play
              </p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
