import { Link } from 'react-router-dom';
import { useBlockchainStore } from '../store/blockchainStore';
import { RotatePrompt } from './RotatePrompt';
import { useInitGuard } from '../hooks';

export function HomePage() {
  const { blockNumber, connect, isConnecting, isConnected } = useBlockchainStore();

  // Try to connect to blockchain on mount to check availability
  useInitGuard(() => {
    if (isConnected) return;
    // Silently try to connect - if it fails, blockNumber stays null
    connect().catch(() => {
      // Blockchain not available - that's okay
    });
  }, [connect, isConnected]);

  const isBlockchainAvailable = blockNumber !== null;
  const isChecking = isConnecting && !isConnected;

  return (
    <div className="min-h-screen min-h-svh bg-slate-950 flex flex-col items-center justify-center p-3 lg:p-4 text-white overflow-hidden">
      {/* Mobile Landscape Layout */}
      <div className="flex flex-col lg:flex-col items-center justify-center w-full max-w-sm lg:max-w-md">
        {/* Logo/Title */}
        <div className="mb-4 lg:mb-12 text-center">
          <h1 className="text-3xl lg:text-6xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 mb-1 lg:mb-2">
            MANALIMIT
          </h1>
          <p className="text-slate-500 text-xs lg:text-base">Auto-Battler Card Game</p>
        </div>

        {/* Main Options */}
        <div className="flex flex-col gap-2 lg:gap-4 w-full">
          {/* Play Online - Primary */}
          <Link
            to={isBlockchainAvailable ? "/blockchain" : "#"}
            onClick={(e) => !isBlockchainAvailable && e.preventDefault()}
            className={`relative group block w-full p-4 lg:p-8 rounded-xl lg:rounded-2xl border-2 transition-all text-center ${
              isBlockchainAvailable
                ? 'bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border-yellow-500/50 hover:border-yellow-400 active:scale-[0.98] cursor-pointer'
                : 'bg-slate-900/50 border-slate-700 cursor-not-allowed opacity-60'
            }`}
          >
            <div className="flex items-center justify-center gap-3 lg:flex-col lg:gap-2">
              <div className="text-2xl lg:text-3xl">🌐</div>
              <div className="text-left lg:text-center">
                <h2 className="text-lg lg:text-2xl font-bold text-white">Play Online</h2>
                <p className="text-slate-400 text-xs lg:text-sm">
                  {isChecking
                    ? 'Checking connection...'
                    : isBlockchainAvailable
                      ? 'Substrate blockchain'
                      : 'Blockchain unavailable'}
                </p>
              </div>
            </div>

            {/* Connection status indicator */}
            <div className="absolute top-2 right-2 lg:top-3 lg:right-3 flex items-center gap-1">
              <div className={`w-1.5 h-1.5 lg:w-2 lg:h-2 rounded-full ${
                isChecking ? 'bg-yellow-500 animate-pulse' : isBlockchainAvailable ? 'bg-green-500 animate-pulse' : 'bg-red-500'
              }`} />
              <span className="text-[8px] lg:text-[10px] text-slate-500 font-mono">
                {isChecking ? '...' : isBlockchainAvailable ? `#${blockNumber?.toLocaleString()}` : 'offline'}
              </span>
            </div>
          </Link>

          {/* Play Locally - Secondary */}
          <Link
            to="/local"
            className="block w-full p-3 lg:p-6 rounded-xl border border-slate-700 bg-slate-900/30 hover:bg-slate-800/50 hover:border-slate-600 active:scale-[0.98] transition-all text-center"
          >
            <div className="flex items-center justify-center gap-3 lg:flex-col lg:gap-1">
              <div className="text-xl lg:text-2xl">💻</div>
              <div className="text-left lg:text-center">
                <h2 className="text-base lg:text-xl font-bold text-slate-300">Play Locally</h2>
                <p className="text-slate-500 text-[10px] lg:text-sm">Single player, no blockchain</p>
              </div>
            </div>
          </Link>
        </div>

        {/* Footer Links */}
        <div className="mt-4 lg:mt-12 flex gap-3 lg:gap-4 text-[10px] lg:text-xs text-slate-600">
          <Link to="/sandbox" className="hover:text-slate-400 active:text-slate-300 transition-colors">Sandbox</Link>
          <span>•</span>
          <Link to="/multiplayer" className="hover:text-slate-400 active:text-slate-300 transition-colors">P2P Multiplayer</Link>
          <span>•</span>
          <Link to="/presentations" className="hover:text-slate-400 active:text-slate-300 transition-colors">Presentations</Link>
        </div>
      </div>

      <RotatePrompt />
    </div>
  );
}
