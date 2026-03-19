import React, { useEffect, useRef } from 'react';
import { useArenaStore } from '../store/arenaStore';
import { useGameStore } from '../store/gameStore';
import { TopBar } from './TopBar';
import { useInitGuard } from '../hooks';
import { Link, Navigate } from 'react-router-dom';

/** Smart redirect: routes to /arena/select or /arena/game based on game state. */
export const BlockchainPage: React.FC = () => {
  const {
    isConnected,
    isConnecting,
    connect,
    chainState,
    selectedAccount,
    refreshGameState,
    fetchSets,
    fetchCards,
    hydrateGameEngineFromChainData,
    connectionError,
  } = useArenaStore();

  const { init, engine } = useGameStore();

  const refreshCalled = useRef(false);

  useInitGuard(() => {
    void init();
    if (isConnected) {
      void fetchSets();
      void fetchCards();
    }
  }, [fetchCards, fetchSets, init, isConnected]);

  useEffect(() => {
    if (!engine || !isConnected) return;
    hydrateGameEngineFromChainData();
  }, [engine, hydrateGameEngineFromChainData, isConnected]);

  useEffect(() => {
    if (!engine || !isConnected || !selectedAccount) return;
    if (refreshCalled.current) return;
    refreshCalled.current = true;
    void refreshGameState();
  }, [engine, isConnected, selectedAccount, refreshGameState]);

  if (!isConnected) {
    return (
      <div className="min-h-screen min-h-svh bg-warm-900 flex flex-col text-white">
        <TopBar backTo="/play" backLabel="Play" title="Online Arena" />
        <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center p-4">
          <h1 className="text-2xl lg:text-4xl font-black mb-6 lg:mb-8 italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-600">
            BLOCKCHAIN MODE
          </h1>
          <button
            onClick={() => void connect()}
            disabled={isConnecting}
            className="bg-yellow-500 hover:bg-yellow-400 text-warm-900 font-bold py-3 px-6 lg:py-4 lg:px-8 rounded-xl text-sm lg:text-base transition-all transform hover:scale-105 disabled:opacity-50"
          >
            {isConnecting ? 'CONNECTING...' : 'RETRY CONNECTION'}
          </button>
          <Link
            to="/network"
            className="mt-3 text-sm text-warm-400 hover:text-warm-200 transition-colors"
          >
            Network Settings
          </Link>
          {connectionError && (
            <p className="mt-3 max-w-md rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-center text-xs text-red-200">
              {connectionError}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (chainState) {
    return <Navigate to="/arena/game" replace />;
  }

  return <Navigate to="/arena/select" replace />;
};
