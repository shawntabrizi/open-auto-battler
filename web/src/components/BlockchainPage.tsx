import React, { useEffect, useState } from 'react';
import { useBlockchainStore } from '../store/blockchainStore';
import { useGameStore } from '../store/gameStore';
import { Arena } from './Arena';
import { Shop } from './Shop';
import { HUD } from './HUD';
import { BattleOverlay } from './BattleOverlay';
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
    battleOutput
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
    <div className="min-h-screen bg-slate-950 text-slate-200 overflow-hidden font-sans selection:bg-yellow-500/30">
      {/* Blockchain Header */}
      <div className="bg-slate-900/80 border-b border-white/5 px-6 py-3 flex items-center justify-between backdrop-blur-md">
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
        <div className="flex-1 flex items-center justify-center h-[calc(100vh-64px)]">
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
        <main className="relative h-[calc(100vh-64px)] flex flex-col">
          <HUD />
          
          <div className="flex-1 flex flex-col overflow-hidden relative">
            <Arena />
            <div className="h-1/2 relative bg-slate-900/30 border-t border-white/5">
              <Shop />
            </div>
            
            {/* Override End Turn button for Blockchain */}
            <div className="absolute bottom-4 right-4 z-50">
               <button
                onClick={handleSubmitTurn}
                disabled={txLoading}
                className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-black py-4 px-12 rounded-xl shadow-2xl shadow-yellow-500/20 transform hover:scale-105 active:scale-95 transition-all flex flex-col items-center"
              >
                <span>{txLoading ? 'SUBMITTING...' : 'COMMIT TO CHAIN'}</span>
                <span className="text-[10px] opacity-70">Round {view?.round}</span>
              </button>
            </div>
          </div>
        </main>
      )}

      {showBattleOverlay && battleOutput && (
        <BattleOverlay />
      )}
    </div>
  );
};
