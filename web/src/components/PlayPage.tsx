import { Link } from 'react-router-dom';
import { useBlockchainStore } from '../store/blockchainStore';
import { useTournamentStore } from '../store/tournamentStore';
import { PageHeader } from './PageHeader';

const formatBalance = (raw: bigint, decimals = 12) =>
  (Number(raw) / Math.pow(10, decimals)).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });

export function PlayPage() {
  const { isConnected, blockNumber } = useBlockchainStore();
  const { activeTournament } = useTournamentStore();

  return (
    <div className="fixed inset-0 bg-warm-950 text-white overflow-y-auto">
      <div className="w-full max-w-sm lg:max-w-md mx-auto p-3 lg:p-4 lg:mt-[10vh]">
        <PageHeader backTo="/" backLabel="Menu" title="Play" />

        <div className="flex flex-col gap-3 lg:gap-4">
          {/* Online Arena — primary mode */}
          <Link
            to={isConnected ? '/blockchain' : '/network'}
            className={`group block w-full p-5 lg:p-7 rounded-xl border-2 transition-all text-center ${
              isConnected
                ? 'border-amber-500/40 bg-gradient-to-br from-amber-500/10 to-orange-600/5 hover:border-amber-400 hover:shadow-[0_0_30px_rgba(245,158,11,0.15)] active:scale-[0.98]'
                : 'border-warm-700/50 bg-warm-900/30 hover:border-warm-600'
            }`}
          >
            <h2 className="font-heading text-2xl lg:text-3xl font-bold text-white tracking-wide">
              ONLINE ARENA
            </h2>
            <p className="text-warm-400 text-xs lg:text-sm mt-1">
              {isConnected ? 'Compete on the blockchain' : 'Requires blockchain connection'}
            </p>
            {isConnected && (
              <div className="mt-2 flex items-center justify-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[10px] text-warm-500 font-mono">
                  {blockNumber !== null ? `#${blockNumber.toLocaleString()}` : 'live'}
                </span>
              </div>
            )}
          </Link>

          {/* Tournament — shown when active */}
          {activeTournament && isConnected && (
            <Link
              to="/tournament"
              className="group block w-full p-3 lg:p-4 rounded-xl border border-purple-500/40 bg-gradient-to-br from-purple-500/10 to-pink-500/5 hover:border-purple-400 active:scale-[0.98] transition-all text-center"
            >
              <h2 className="font-heading text-base lg:text-lg font-bold text-white">
                TOURNAMENT LIVE
              </h2>
              <p className="text-purple-300 text-[10px] lg:text-sm">
                Entry: {formatBalance(activeTournament.config.entry_fee)} | Pool:{' '}
                {formatBalance(activeTournament.state.total_pot)}
              </p>
            </Link>
          )}

          {/* Secondary modes */}
          <div className="grid grid-cols-2 gap-3 lg:gap-4">
            <Link
              to={isConnected ? '/local' : '/network'}
              className={`group block p-4 lg:p-5 rounded-xl border transition-all text-center ${
                isConnected
                  ? 'border-warm-700 bg-warm-900/30 hover:border-warm-500 hover:bg-warm-800/40 active:scale-[0.98]'
                  : 'border-warm-700/50 bg-warm-900/30 hover:border-warm-600'
              }`}
            >
              <h3 className="font-heading text-base lg:text-lg font-bold text-white">OFFLINE</h3>
              <p className="text-warm-500 text-[10px] lg:text-xs mt-1">Single player</p>
            </Link>

            <Link
              to="/multiplayer"
              className="group block p-4 lg:p-5 rounded-xl border border-warm-700 bg-warm-900/30 hover:border-warm-500 hover:bg-warm-800/40 active:scale-[0.98] transition-all text-center"
            >
              <h3 className="font-heading text-base lg:text-lg font-bold text-white">
                PEER-TO-PEER
              </h3>
              <p className="text-warm-500 text-[10px] lg:text-xs mt-1">Direct connect</p>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
