import React, { useEffect, useState } from 'react';
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
    submitTurnOnChain
  } = useBlockchainStore();

  const { 
    init, 
    view, 
    showBattleOverlay,
    endTurn,
    battleOutput,
    selection,
    showBag
  } = useGameStore();

  const [txLoading, setTxLoading] = useState(false);

  useEffect(() => {
    init();
  }, [init]);

  const handleStartGame = async () => {
    setTxLoading(true);
    try {
      await startGame();
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
      : (selection?.type === 'bag' && view?.bag[selection!.index])
        ? view.bag[selection!.index]
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
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 text-white">
        <h1 className="text-4xl font-black mb-8 italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-600">
          BLOCKCHAIN MODE
        </h1>
        <button
          onClick={connect}
          disabled={isConnecting}
          className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-4 px-8 rounded-full transition-all transform hover:scale-105 disabled:opacity-50"
        >
          {isConnecting ? 'CONNECTING...' : 'CONNECT WALLET'}
        </button>
        <Link to="/" className="mt-8 text-slate-400 hover:text-white underline">Back to Local Game</Link>
      </div>
    );
  }

  return (
    <div className="h-screen bg-board-bg text-slate-200 overflow-hidden font-sans selection:bg-yellow-500/30 flex flex-col">
      {/* Blockchain Header */}
      <div className="bg-slate-900/80 border-b border-white/5 px-6 py-3 flex items-center justify-between backdrop-blur-md z-50">
        <div className="flex items-center gap-4">
          <h2 className="font-bold text-yellow-500">CHAIN MODE</h2>
          <div className="flex items-center gap-2 px-2 py-1 bg-slate-800 rounded border border-white/5">
            <div className={`w-2 h-2 rounded-full ${blockNumber ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
            <span className="text-[10px] font-mono text-slate-400">
              {blockNumber !== null ? `#${blockNumber.toLocaleString()}` : 'DISCONNECTED'}
            </span>
          </div>
          <select 
            value={selectedAccount?.address} 
            onChange={(e) => selectAccount(accounts.find(a => a.address === e.target.value))}
            className="bg-slate-800 border border-white/10 rounded px-2 py-1 text-sm outline-none focus:border-yellow-500/50"
          >
            {accounts.map(acc => (
              <option key={acc.address} value={acc.address}>
                {acc.source === 'dev' ? '🛠️ ' : ''}{acc.name} ({acc.address.slice(0, 6)}...)
              </option>
            ))}
          </select>
        </div>
        
        <div className="flex items-center gap-3">
          {!chainState && (
            <button
              onClick={handleStartGame}
              disabled={txLoading}
              className="bg-green-600 hover:bg-green-500 text-white text-sm font-bold py-1.5 px-4 rounded transition-colors disabled:opacity-50"
            >
              {txLoading ? 'TRANSACTING...' : 'START NEW GAME'}
            </button>
          )}
          <Link to="/" className="text-xs text-slate-500 hover:text-slate-300">Exit</Link>
        </div>
      </div>

      {!chainState ? (
        <div className="flex-1 flex items-center justify-center bg-slate-950">
          <div className="text-center">
            <p className="text-slate-500 mb-4">No active game found for this account.</p>
            <button
              onClick={handleStartGame}
              className="text-yellow-500 border border-yellow-500/20 hover:bg-yellow-500/10 px-6 py-2 rounded-full transition-all"
            >
              Initialize Game on Substrate
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 relative flex flex-col min-h-0">
          <HUD hideEndTurn={true} />
          
          {/* Commit to Chain button - Placed in the HUD center area via absolute positioning */}
          {view?.phase === 'shop' && (
            <div className="absolute top-0 left-1/2 -translate-x-1/2 h-16 flex items-center z-[60] ml-32">
               <button
                onClick={handleSubmitTurn}
                disabled={txLoading}
                className={`px-8 py-2 rounded-lg font-black text-slate-900 shadow-lg transform transition-all active:scale-95 flex flex-col items-center border-b-4 ${
                  txLoading 
                    ? 'bg-slate-600 border-slate-800 cursor-not-allowed' 
                    : 'bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-300 hover:to-orange-400 border-orange-700 hover:translate-y-[-2px]'
                }`}
              >
                <span className="text-sm leading-tight">{txLoading ? 'SUBMITTING...' : 'COMMIT TO CHAIN'}</span>
                <span className="text-[9px] opacity-70 font-mono tracking-widest uppercase">GENESIS BLOCK</span>
              </button>
            </div>
          )}

          <div className={`flex-1 flex flex-col overflow-hidden relative ${showCardPanel ? 'ml-80' : ''}`}>
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
