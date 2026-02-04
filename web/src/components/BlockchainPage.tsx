import React, { useEffect, useState, useRef } from 'react';
import { useBlockchainStore } from '../store/blockchainStore';
import { useGameStore } from '../store/gameStore';
import { Arena } from './Arena';
import { Shop } from './Shop';
import { HUD } from './HUD';
import { BattleOverlay } from './BattleOverlay';
import { CardDetailPanel } from './CardDetailPanel';
import { BagOverlay } from './BagOverlay';
import { GameOverScreen } from './GameOverScreen';
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
    submitTurnOnChain,
    availableSets,
    fetchSets
  } = useBlockchainStore();

  const {
    init,
    engine,
    view,
    bag,
    cardSet,
    showBattleOverlay,
    endTurn,
    battleOutput,
    selection,
    showBag
  } = useGameStore();

  const [txLoading, setTxLoading] = useState(false);
  const [selectedSetId, setSelectedSetId] = useState(0);

  // Guards to prevent double-execution in React StrictMode
  const initCalled = useRef(false);
  const refreshCalled = useRef(false);

  useEffect(() => {
    if (initCalled.current) return;
    initCalled.current = true;
    init();
    if (isConnected) {
      fetchSets();
    }
  }, [init, isConnected, fetchSets]);

  // Sync chain state whenever engine or account changes
  useEffect(() => {
    if (!engine || !isConnected || !selectedAccount) return;
    if (refreshCalled.current) return;
    refreshCalled.current = true;
    refreshGameState();
  }, [engine, isConnected, selectedAccount, refreshGameState]);

  const handleStartGame = async () => {
    setTxLoading(true);
    try {
      await startGame(selectedSetId);
    } finally {
      setTxLoading(false);
    }
  };

  const handleSubmitTurn = async () => {
    setTxLoading(true);
    try {
      // 1. Locally end turn to generate the BattleOutput for playback
      endTurn();

      // 2. Submit the actions to the chain
      await submitTurnOnChain();
    } finally {
      setTxLoading(false);
    }
  };

  // Logic for CardDetailPanel
  const showCardPanel = view?.phase === 'shop' || (selection?.type === 'board') || showBag;
  const selectedCard =
    (view?.phase === 'shop' && selection?.type === 'hand' && view?.hand[selection!.index])
      ? view.hand[selection!.index]!
      : (selection?.type === 'bag' && bag?.[selection!.index])
        ? cardSet?.find(c => c.id === bag[selection!.index])
        : null;

  const selectedBoardUnit = selection?.type === 'board' && view?.board[selection!.index]
    ? view.board[selection!.index]!
    : null;

  const cardToShow = selectedCard || selectedBoardUnit;

  // Show game over screen
  if (view?.phase === 'victory' || view?.phase === 'defeat') {
    return <GameOverScreen />;
  }

  if (!isConnected) {
    return (
      <div className="min-h-screen min-h-svh bg-slate-900 flex flex-col items-center justify-center p-4 text-white">
        <h1 className="text-2xl lg:text-4xl font-black mb-6 lg:mb-8 italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-600">
          BLOCKCHAIN MODE
        </h1>
        <button
          onClick={connect}
          disabled={isConnecting}
          className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 px-6 lg:py-4 lg:px-8 rounded-full text-sm lg:text-base transition-all transform hover:scale-105 disabled:opacity-50"
        >
          {isConnecting ? 'CONNECTING...' : 'CONNECT WALLET'}
        </button>
        <Link to="/" className="mt-6 lg:mt-8 text-slate-400 hover:text-white underline text-sm">Back to Local Game</Link>
      </div>
    );
  }

  return (
    <div className="h-screen h-svh bg-board-bg text-slate-200 overflow-hidden font-sans selection:bg-yellow-500/30 flex flex-col">
      {/* Blockchain Header */}
      <div className="bg-slate-900/80 border-b border-white/5 px-2 lg:px-6 py-2 lg:py-3 flex items-center justify-between backdrop-blur-md z-50">
        <div className="flex items-center gap-2 lg:gap-4">
          <h2 className="font-bold text-yellow-500 text-xs lg:text-base">CHAIN</h2>
          <div className="flex items-center gap-1 lg:gap-2 px-1.5 lg:px-2 py-0.5 lg:py-1 bg-slate-800 rounded border border-white/5">
            <div className={`w-1.5 h-1.5 lg:w-2 lg:h-2 rounded-full ${blockNumber ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
            <span className="text-[8px] lg:text-[10px] font-mono text-slate-400">
              {blockNumber !== null ? `#${blockNumber.toLocaleString()}` : 'OFF'}
            </span>
          </div>
          <select
            value={selectedAccount?.address}
            onChange={(e) => selectAccount(accounts.find(a => a.address === e.target.value))}
            className="bg-slate-800 border border-white/10 rounded px-1.5 lg:px-2 py-0.5 lg:py-1 text-xs lg:text-sm outline-none focus:border-yellow-500/50 max-w-[100px] lg:max-w-none"
          >
            {accounts.map(acc => (
              <option key={acc.address} value={acc.address}>
                {acc.source === 'dev' ? '🛠️ ' : ''}{acc.name} ({acc.address.slice(0, 6)}...)
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 lg:gap-3">
          {!chainState && (
            <>
              <Link
                to="/blockchain/create-card"
                className="hidden lg:block text-yellow-500 border border-yellow-500/20 hover:bg-yellow-500/10 px-4 py-1.5 rounded text-sm transition-all"
              >
                Card Creator
              </Link>
              <Link
                to="/blockchain/create-set"
                className="hidden lg:block text-yellow-500 border border-yellow-500/20 hover:bg-yellow-500/10 px-4 py-1.5 rounded text-sm transition-all"
              >
                Set Creator
              </Link>
            </>
          )}
          {!chainState && (
            <button
              onClick={handleStartGame}
              disabled={txLoading}
              className="bg-green-600 hover:bg-green-500 text-white text-xs lg:text-sm font-bold py-1 lg:py-1.5 px-2 lg:px-4 rounded transition-colors disabled:opacity-50"
            >
              {txLoading ? '...' : 'NEW GAME'}
            </button>
          )}
          <Link to="/" className="text-[10px] lg:text-xs text-slate-500 hover:text-slate-300">Exit</Link>
        </div>
      </div>

      {!chainState ? (
        <div className="flex-1 flex items-center justify-center bg-slate-950 p-4">
          <div className="text-center bg-slate-900 p-4 lg:p-8 rounded-2xl lg:rounded-3xl border border-white/5 shadow-2xl w-full max-w-sm lg:max-w-none lg:w-auto">
            <h3 className="text-xl lg:text-2xl font-bold mb-4 lg:mb-6 text-white">Initialize New Session</h3>
            <p className="text-slate-500 mb-6 lg:mb-8 text-sm lg:text-base">Select a card set to play on the Substrate blockchain.</p>

            <div className="flex flex-col gap-3 lg:gap-4 max-w-xs mx-auto mb-6 lg:mb-8">
              <label className="text-xs font-bold text-slate-500 uppercase text-left ml-1">Select Card Set</label>
              <select
                value={selectedSetId}
                onChange={(e) => setSelectedSetId(parseInt(e.target.value))}
                className="bg-slate-800 border border-white/10 rounded-xl px-3 lg:px-4 py-2.5 lg:py-3 text-white outline-none focus:border-yellow-500/50 appearance-none cursor-pointer text-sm lg:text-base"
              >
                {availableSets.map(set => (
                  <option key={set.id} value={set.id}>
                    Set #{set.id} ({set.cards.length} Cards)
                  </option>
                ))}
              </select>
            </div>

            {/* Mobile: Show creator links */}
            <div className="flex gap-2 justify-center mb-6 lg:hidden">
              <Link
                to="/blockchain/create-card"
                className="text-yellow-500 border border-yellow-500/20 hover:bg-yellow-500/10 px-3 py-1.5 rounded text-xs transition-all"
              >
                Card Creator
              </Link>
              <Link
                to="/blockchain/create-set"
                className="text-yellow-500 border border-yellow-500/20 hover:bg-yellow-500/10 px-3 py-1.5 rounded text-xs transition-all"
              >
                Set Creator
              </Link>
            </div>

            <button
              onClick={handleStartGame}
              disabled={txLoading}
              className="bg-yellow-500 hover:bg-yellow-400 text-slate-950 font-black px-8 lg:px-12 py-3 lg:py-4 rounded-full text-sm lg:text-base transition-all transform hover:scale-105 disabled:opacity-50 shadow-lg shadow-yellow-500/20"
            >
              {txLoading ? 'TRANSACTING...' : 'START GAME ON-CHAIN'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 relative flex flex-col min-h-0">
          <HUD
            hideEndTurn={true}
            customAction={{
              label: txLoading ? 'Submitting...' : 'Commit',
              onClick: handleSubmitTurn,
              disabled: txLoading,
              variant: 'chain',
            }}
          />

          <div className={`flex-1 flex flex-col overflow-hidden relative ${showCardPanel ? 'ml-44 lg:ml-80' : ''}`}>
            <div className="flex-1 overflow-hidden relative">
              <Arena />
            </div>
            <div className="flex-shrink-0">
              <Shop />
            </div>
          </div>

          <CardDetailPanel card={cardToShow} isVisible={showCardPanel} topOffset="7rem" />
          <BagOverlay />
        </div>
      )}

      {showBattleOverlay && battleOutput && (
        <BattleOverlay />
      )}
    </div>
  );
};
