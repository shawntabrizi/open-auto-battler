import React, { useEffect, useState, useRef } from 'react';
import { useBlockchainStore } from '../store/blockchainStore';
import { useGameStore } from '../store/gameStore';
import { GameOverScreen } from './GameOverScreen';
import { GameShell } from './GameShell';
import { SetPreviewOverlay } from './SetPreviewOverlay';
import { RotatePrompt } from './RotatePrompt';
import { BackLink } from './PageHeader';
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
    availableSets,
    fetchSets,
    fetchCards,
    hydrateGameEngineFromChainData,
    connectionError,
    createLocalAccount,
    removeLocalAccount,
    fundSelectedAccount,
  } = useBlockchainStore();

  const { init, engine, view, previewSet } = useGameStore();

  const { submitTurnOnChain } = useBlockchainStore();

  const [txLoading, setTxLoading] = useState(false);
  const [selectedSetId, setSelectedSetId] = useState(0);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [fundingAccount, setFundingAccount] = useState(false);

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

  const handleStartGame = async () => {
    setTxLoading(true);
    try {
      await startGame(selectedSetId);
    } finally {
      setTxLoading(false);
    }
  };

  const handleCreateLocalAccount = async () => {
    const name = prompt('Enter a name for your new account:');
    if (!name) return;
    setCreatingAccount(true);
    try {
      await createLocalAccount(name);
    } finally {
      setCreatingAccount(false);
    }
  };

  const handleFundAccount = async () => {
    setFundingAccount(true);
    try {
      await fundSelectedAccount();
    } finally {
      setFundingAccount(false);
    }
  };

  const handleSubmitTurn = async () => {
    setTxLoading(true);
    try {
      // Submit actions to the chain — the blockchain resolves the battle
      // with its own seed and opponent selection. We do NOT run endTurn()
      // locally because the local engine uses a different seed/opponent,
      // producing a different (wrong) result.
      await submitTurnOnChain();
    } finally {
      setTxLoading(false);
    }
  };

  // Show game over screen
  if (view?.phase === 'victory' || view?.phase === 'defeat') {
    return <GameOverScreen />;
  }

  if (!isConnected) {
    return (
      <div className="min-h-screen min-h-svh bg-warm-900 flex flex-col p-4 text-white">
        <BackLink to="/" label="Menu" />
        <div className="flex-1 flex flex-col items-center justify-center">
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
            to="/settings/network"
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
      <div className="h-screen h-svh bg-board-bg text-warm-200 overflow-hidden font-sans selection:bg-yellow-500/30 flex flex-col p-4">
        <div className="flex items-center justify-between">
          <BackLink to="/" label="Menu" />
          <Link
            to="/blockchain/creator"
            className="inline-flex items-center gap-1 text-warm-400 hover:text-warm-200 transition-colors text-xs lg:text-sm"
          >
            Creator Hub &rarr;
          </Link>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center bg-warm-900 p-4 lg:p-8 rounded-2xl lg:rounded-3xl border border-white/5 shadow-2xl w-full max-w-sm lg:max-w-none lg:w-auto">
            <h3 className="text-xl lg:text-2xl font-bold mb-4 lg:mb-6 text-white">
              Initialize New Session
            </h3>

            {/* Connection Status & Account */}
            <div className="flex flex-col items-center gap-3 mb-6 lg:mb-8">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-warm-800 rounded-lg border border-white/5">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-xs font-mono text-warm-400">
                    {blockNumber !== null ? `#${blockNumber.toLocaleString()}` : 'Connected'}
                  </span>
                </div>
                <select
                  value={selectedAccount?.address}
                  onChange={(e) =>
                    selectAccount(accounts.find((a) => a.address === e.target.value))
                  }
                  className="bg-warm-800 border border-white/10 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-yellow-500/50"
                >
                  {accounts.map((acc) => (
                    <option key={acc.address} value={acc.address}>
                      {acc.source === 'dev' ? '[dev] ' : acc.source === 'local' ? '[local] ' : ''}
                      {acc.name} ({acc.address.slice(0, 6)}...)
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCreateLocalAccount}
                  disabled={creatingAccount}
                  className="text-xs px-3 py-1.5 bg-warm-800 hover:bg-warm-700 border border-white/10 hover:border-white/20 rounded-lg transition-all disabled:opacity-50"
                >
                  {creatingAccount ? 'Creating...' : '+ New Account'}
                </button>
                <button
                  onClick={handleFundAccount}
                  disabled={fundingAccount || !selectedAccount}
                  className="text-xs px-3 py-1.5 bg-warm-800 hover:bg-warm-700 border border-white/10 hover:border-white/20 rounded-lg transition-all disabled:opacity-50"
                >
                  {fundingAccount ? 'Funding...' : 'Fund Account'}
                </button>
                {selectedAccount?.source === 'local' && (
                  <button
                    onClick={() => {
                      if (
                        confirm(
                          `Remove local account "${selectedAccount.name}"? This cannot be undone.`
                        )
                      )
                        removeLocalAccount(selectedAccount.address);
                    }}
                    className="text-xs px-3 py-1.5 bg-red-900/30 hover:bg-red-900/50 border border-red-500/20 hover:border-red-500/40 text-red-300 rounded-lg transition-all"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-3 max-w-sm mx-auto mb-6 lg:mb-8">
              <label className="text-xs font-bold text-warm-500 uppercase text-left ml-1">
                Select Card Set
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={selectedSetId}
                  onChange={(e) => setSelectedSetId(Number(e.target.value))}
                  className="flex-1 bg-warm-800 border border-white/10 text-white text-sm rounded-lg px-4 py-3 focus:outline-none focus:border-yellow-500/50 cursor-pointer"
                >
                  {[...availableSets]
                    .sort((a, b) => a.id - b.id)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} (#{s.id}) &middot; {s.cards.length} cards
                      </option>
                    ))}
                </select>
                <button
                  onClick={() => previewSet(selectedSetId)}
                  className="px-3 py-3 text-xs font-bold border border-warm-600 text-warm-300 hover:text-white hover:border-warm-400 rounded-lg transition-all shrink-0"
                >
                  PREVIEW
                </button>
              </div>
            </div>

            <button
              onClick={handleStartGame}
              disabled={txLoading}
              className="bg-yellow-500 hover:bg-yellow-400 text-warm-950 font-black px-8 lg:px-12 py-3 lg:py-4 rounded-full text-sm lg:text-base transition-all transform hover:scale-105 disabled:opacity-50 shadow-lg shadow-yellow-500/20"
            >
              {txLoading ? 'TRANSACTING...' : 'START GAME ON-CHAIN'}
            </button>
          </div>
        </div>
        <SetPreviewOverlay />
        <RotatePrompt />
      </div>
    );
  }

  // Game is active - render the game shell with blockchain customizations
  return (
    <div className="h-screen h-svh bg-board-bg text-warm-200 overflow-hidden font-sans selection:bg-yellow-500/30 flex flex-col">
      <GameShell
        hideEndTurn={true}
        customAction={{
          label: txLoading ? 'Submitting...' : 'Commit',
          onClick: handleSubmitTurn,
          disabled: txLoading,
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
