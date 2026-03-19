import React, { useEffect, useRef } from 'react';
import { useIsSubmitting } from '../store/txStore';
import { useBlockchainStore } from '../store/blockchainStore';
import { useGameStore } from '../store/gameStore';
import { GameOverScreen } from './GameOverScreen';
import { GameShell } from './GameShell';
import { SetPreviewOverlay } from './SetPreviewOverlay';
import { SetSelectionScreen } from './SetSelectionScreen';
import { RotatePrompt } from './RotatePrompt';
import { TopBar } from './TopBar';
import { useInitGuard } from '../hooks';
import { Link } from 'react-router-dom';

export const BlockchainPage: React.FC = () => {
  const {
    isConnected,
    isConnecting,
    connect,
    accounts,
    selectedAccount,
    selectAccount,
    chainState,
    blockNumber,
    startGame,
    refreshGameState,
    fetchSets,
    fetchCards,
    hydrateGameEngineFromChainData,
    connectionError,
  } = useBlockchainStore();

  const { init, engine, view } = useGameStore();

  const { submitTurnOnChain } = useBlockchainStore();

  const isSubmitting = useIsSubmitting();

  // Guard for refresh to prevent double-call
  const refreshCalled = useRef(false);

  // Initialize WASM engine and fetch sets
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

  // Sync chain state whenever engine or account changes
  useEffect(() => {
    if (!engine || !isConnected || !selectedAccount) return;
    if (refreshCalled.current) return;
    refreshCalled.current = true;
    void refreshGameState();
  }, [engine, isConnected, selectedAccount, refreshGameState]);

  const handleSubmitTurn = async () => {
    // Submit actions to the chain — the blockchain resolves the battle
    // with its own seed and opponent selection. We do NOT run endTurn()
    // locally because the local engine uses a different seed/opponent,
    // producing a different (wrong) result.
    await submitTurnOnChain();
  };

  // Show game over screen
  if (view?.phase === 'completed') {
    return <GameOverScreen />;
  }

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

  if (!chainState) {
    return (
      <>
        <SetSelectionScreen
          onStartGame={async (setId) => {
            await startGame(setId);
          }}
          backTo="/play"
          backLabel="Play"
        />
        <SetPreviewOverlay />
        <RotatePrompt />
      </>
    );
  }

  // Game is active - render the game shell with blockchain customizations
  return (
    <div className="h-screen h-svh bg-board-bg text-warm-200 overflow-hidden font-sans selection:bg-yellow-500/30 flex flex-col">
      <GameShell
        hideEndTurn={true}
        customAction={{
          label: 'Commit',
          onClick: handleSubmitTurn,
          disabled: isSubmitting,
          variant: 'chain',
        }}
        blockchainMode={true}
        blockNumber={blockNumber}
        accounts={accounts}
        selectedAccount={selectedAccount}
        onSelectAccount={selectAccount}
      />

      <RotatePrompt />
    </div>
  );
};
