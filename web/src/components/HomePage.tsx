import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useBlockchainStore } from '../store/blockchainStore';
import { useTournamentStore } from '../store/tournamentStore';
import { RotatePrompt } from './RotatePrompt';
import { ParticleBackground } from './ParticleBackground';
import { useInitGuard } from '../hooks';

const formatBalance = (raw: bigint, decimals = 12) =>
  (Number(raw) / Math.pow(10, decimals)).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });

export function HomePage() {
  const { blockNumber, connect, isConnecting, isConnected, connectionError } = useBlockchainStore();
  const { activeTournament, fetchActiveTournament } = useTournamentStore();

  useInitGuard(() => {
    if (isConnected) return;
    void connect();
  }, [connect, isConnected]);

  const isBlockchainAvailable = isConnected;
  const isChecking = isConnecting && !isConnected;
  const localRoute = isBlockchainAvailable ? '/local' : '/settings/network';
  const onlineRoute = isBlockchainAvailable ? '/blockchain' : '/settings/network';

  useEffect(() => {
    if (isBlockchainAvailable) {
      void fetchActiveTournament();
    }
  }, [isBlockchainAvailable, fetchActiveTournament]);

  return (
    <div className="min-h-screen min-h-svh bg-surface-dark flex flex-col items-center justify-center p-3 lg:p-4 text-white overflow-hidden relative">
      {/* Atmospheric background */}
      <div
        className="absolute inset-0 z-0"
        style={{
          background:
            'radial-gradient(ellipse at 50% 30%, rgba(196, 138, 42, 0.08), transparent 60%), radial-gradient(ellipse at 20% 80%, rgba(184, 92, 74, 0.06), transparent 50%), radial-gradient(ellipse at 80% 70%, rgba(91, 143, 170, 0.05), transparent 50%)',
        }}
      />
      <ParticleBackground />

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center justify-center w-full max-w-sm lg:max-w-md">
        {/* Title */}
        <div
          className="mb-6 lg:mb-10 text-center opacity-0 animate-stagger-fade-in stagger-1"
          style={{ animationFillMode: 'forwards' }}
        >
          <h1 className="font-title text-3xl lg:text-5xl font-bold tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-amber-400 to-orange-500 mb-1 lg:mb-2">
            OPEN AUTO BATTLER
          </h1>
          <p className="font-heading text-warm-400 text-xs lg:text-sm tracking-widest uppercase">
            Roguelike Deck-Building Auto-Battler
          </p>
        </div>

        {/* Main Options */}
        <div className="flex flex-col gap-3 lg:gap-4 w-full">
          {/* PLAY - Primary CTA */}
          <Link
            to={localRoute}
            className={`opacity-0 animate-stagger-fade-in stagger-2 group block w-full p-4 lg:p-6 rounded-xl border-2 transition-all text-center ${
              isBlockchainAvailable
                ? 'border-amber-500/40 bg-gradient-to-br from-amber-500/10 to-orange-600/5 hover:border-amber-400 hover:shadow-[0_0_30px_rgba(245,158,11,0.15)] active:scale-[0.98]'
                : 'border-warm-700/50 bg-warm-900/30 hover:border-warm-600'
            }`}
            style={{ animationFillMode: 'forwards' }}
          >
            <h2 className="font-heading text-2xl lg:text-3xl font-bold text-white tracking-wide">
              PLAY
            </h2>
            <p className="text-warm-400 text-xs lg:text-sm mt-1">
              {isBlockchainAvailable
                ? 'Single player, no transactions'
                : 'Requires blockchain connection'}
            </p>
          </Link>

          {/* PLAY ONLINE */}
          <Link
            to={onlineRoute}
            className={`opacity-0 animate-stagger-fade-in stagger-3 relative group block w-full p-3 lg:p-5 rounded-xl border transition-all text-center ${
              isBlockchainAvailable
                ? 'border-accent-violet/40 bg-gradient-to-br from-accent-violet/10 to-purple-900/5 hover:border-accent-violet hover:shadow-[0_0_20px_rgba(139,92,246,0.12)] active:scale-[0.98] cursor-pointer'
                : 'border-warm-700/50 bg-warm-900/30 hover:border-warm-600'
            }`}
            style={{ animationFillMode: 'forwards' }}
          >
            <div className="flex items-center justify-center gap-3 lg:flex-col lg:gap-1">
              <div className="text-left lg:text-center">
                <h2 className="font-heading text-lg lg:text-xl font-bold text-white">
                  PLAY ONLINE
                </h2>
                <p className="text-warm-400 text-[10px] lg:text-sm">
                  {isChecking
                    ? 'Connecting to blockchain...'
                    : isBlockchainAvailable
                      ? 'Substrate blockchain'
                      : 'Open network settings'}
                </p>
              </div>
            </div>

            {/* Connection status dot */}
            <div className="absolute top-2 right-2 lg:top-3 lg:right-3 flex items-center gap-1">
              <div
                className={`w-1.5 h-1.5 lg:w-2 lg:h-2 rounded-full ${
                  isChecking
                    ? 'bg-yellow-500 animate-pulse'
                    : isBlockchainAvailable
                      ? 'bg-green-500 animate-pulse'
                      : 'bg-red-500'
                }`}
              />
              <span className="text-[8px] lg:text-[10px] text-warm-500 font-mono">
                {isChecking
                  ? '...'
                  : isBlockchainAvailable
                    ? blockNumber !== null
                      ? `#${blockNumber.toLocaleString()}`
                      : 'live'
                    : 'offline'}
              </span>
            </div>
          </Link>

          {!isBlockchainAvailable && !isChecking && (
            <Link
              to="/settings/network"
              className="opacity-0 animate-stagger-fade-in stagger-4 block w-full rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-center text-xs lg:text-sm text-red-100"
              style={{ animationFillMode: 'forwards' }}
            >
              Adjust network settings to connect to a blockchain node.
              {connectionError ? ` ${connectionError}` : ''}
            </Link>
          )}

          {/* Tournament */}
          {activeTournament && isBlockchainAvailable && (
            <Link
              to="/tournament"
              className="opacity-0 animate-stagger-fade-in stagger-5 relative group block w-full p-3 lg:p-4 rounded-xl border border-purple-500/40 bg-gradient-to-br from-purple-500/10 to-pink-500/5 hover:border-purple-400 active:scale-[0.98] transition-all text-center"
              style={{ animationFillMode: 'forwards' }}
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
        </div>

        {/* Secondary Links */}
        <div
          className="mt-6 lg:mt-10 flex flex-wrap justify-center gap-2 lg:gap-3 opacity-0 animate-stagger-fade-in stagger-6"
          style={{ animationFillMode: 'forwards' }}
        >
          {[
            { to: '/sandbox', label: 'Sandbox' },
            { to: '/multiplayer', label: 'P2P' },
            { to: '/blockchain/ghosts', label: 'Ghosts' },
            { to: '/presentations', label: 'Presentations' },
            { to: '/settings', label: 'Settings' },
          ].map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="px-3 py-1.5 lg:px-4 lg:py-2 rounded-lg border border-warm-800/60 text-warm-400 hover:text-warm-200 hover:border-warm-600 transition-colors font-heading tracking-wider uppercase text-[10px] lg:text-xs"
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Version */}
        <div
          className="mt-4 text-[9px] lg:text-[10px] text-warm-600 font-mono opacity-0 animate-stagger-fade-in stagger-7"
          style={{ animationFillMode: 'forwards' }}
        >
          v0.1.0
        </div>
      </div>

      <RotatePrompt />
    </div>
  );
}
