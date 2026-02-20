import React, { useEffect, useState, useRef } from 'react';
import { useBlockchainStore } from '../store/blockchainStore';
import { useTournamentStore } from '../store/tournamentStore';
import { useGameStore } from '../store/gameStore';
import { GameShell } from './GameShell';
import { SetPreviewOverlay } from './SetPreviewOverlay';
import { RotatePrompt } from './RotatePrompt';
import { useInitGuard } from '../hooks';
import { Link } from 'react-router-dom';
import { submitTx } from '../utils/tx';

const formatBalance = (raw: bigint, decimals = 12) =>
  (Number(raw) / Math.pow(10, decimals)).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });

const formatPerbill = (value: number) => {
  const pct = (value / 10_000_000);
  return `${pct.toFixed(pct % 1 === 0 ? 0 : 1)}%`;
};

export const TournamentPage: React.FC = () => {
  const {
    isConnected,
    isConnecting,
    connect,
    accounts,
    selectedAccount,
    selectAccount,
    blockNumber,
    availableSets,
    fetchSets,
  } = useBlockchainStore();

  const { init, engine, view, previewSet } = useGameStore();

  const {
    activeTournament,
    isLoadingTournament,
    hasActiveTournamentGame,
    playerStats,
    allPlayerStats,
    tournamentGameOver,
    lastGameWins,
    fetchActiveTournament,
    fetchPlayerStats,
    fetchAllPlayerStats,
    joinTournament,
    submitTournamentTurn,
    refreshTournamentGameState,
    resetGameOver,
  } = useTournamentStore();

  const [txLoading, setTxLoading] = useState(false);
  const refreshCalled = useRef(false);

  // Initialize WASM engine
  useInitGuard(() => {
    void init();
    if (isConnected) {
      void fetchSets();
    }
  }, [init, isConnected, fetchSets]);

  // Fetch tournament data when connected
  useEffect(() => {
    if (!isConnected) return;
    void fetchActiveTournament();
  }, [isConnected, fetchActiveTournament]);

  // Fetch player stats and leaderboard when tournament is loaded
  useEffect(() => {
    if (!activeTournament || !selectedAccount) return;
    void fetchPlayerStats();
    void fetchAllPlayerStats(activeTournament.id);
  }, [activeTournament, selectedAccount, fetchPlayerStats, fetchAllPlayerStats]);

  // Sync tournament game state when engine is ready
  useEffect(() => {
    if (!engine || !isConnected || !selectedAccount) return;
    if (refreshCalled.current) return;
    refreshCalled.current = true;
    void refreshTournamentGameState();
  }, [engine, isConnected, selectedAccount, refreshTournamentGameState]);

  const handleJoinTournament = async () => {
    if (!activeTournament) return;
    setTxLoading(true);
    try {
      await joinTournament(activeTournament.id);
    } finally {
      setTxLoading(false);
    }
  };

  const handleSubmitTournamentTurn = async () => {
    setTxLoading(true);
    try {
      await submitTournamentTurn();
    } finally {
      setTxLoading(false);
    }
  };

  const handlePlayAgain = async () => {
    if (!activeTournament) return;
    resetGameOver();
    setTxLoading(true);
    try {
      await joinTournament(activeTournament.id);
    } finally {
      setTxLoading(false);
    }
  };

  const handleBackToTournament = () => {
    resetGameOver();
    refreshCalled.current = false;
    void fetchActiveTournament();
    void fetchPlayerStats();
    if (activeTournament) void fetchAllPlayerStats(activeTournament.id);
  };

  // ── Tournament Game Over Screen ──
  if (tournamentGameOver) {
    const isPerfect = lastGameWins >= 10;
    return (
      <div className="min-h-screen min-h-svh bg-slate-900 flex flex-col items-center justify-center p-4 text-white">
        <div
          className={`p-6 lg:p-12 rounded-xl lg:rounded-2xl text-center max-w-sm lg:max-w-none ${
            isPerfect
              ? 'bg-green-900/30 border-2 border-green-500'
              : 'bg-red-900/30 border-2 border-red-500'
          }`}
        >
          <h1
            className={`text-3xl lg:text-5xl font-bold mb-2 lg:mb-4 ${
              isPerfect ? 'text-green-400' : 'text-red-400'
            }`}
          >
            {isPerfect ? 'PERFECT RUN!' : 'RUN OVER'}
          </h1>
          <p className="text-sm lg:text-xl text-gray-300 mb-4 lg:mb-8">
            {isPerfect
              ? 'Amazing! You achieved a perfect 10-win run in the tournament!'
              : `You finished with ${lastGameWins} win${lastGameWins !== 1 ? 's' : ''}.`}
          </p>

          <div className="flex justify-center gap-6 lg:gap-12 mb-6 lg:mb-8">
            <div className="text-center">
              <div className="text-2xl lg:text-4xl font-bold text-gold">{lastGameWins}</div>
              <div className="text-xs lg:text-base text-gray-400">Wins</div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {activeTournament && (
              <button
                onClick={handlePlayAgain}
                disabled={txLoading}
                className="bg-purple-500 hover:bg-purple-400 text-white font-bold py-3 px-8 rounded-full text-sm transition-all transform hover:scale-105 disabled:opacity-50"
              >
                {txLoading ? 'JOINING...' : 'PLAY AGAIN'}
              </button>
            )}
            <button
              onClick={handleBackToTournament}
              className="text-slate-400 hover:text-white underline text-sm"
            >
              Back to Tournament
            </button>
          </div>
        </div>
        <RotatePrompt />
      </div>
    );
  }

  // ── Game Over from view (victory/defeat while playing) ──
  if (view?.phase === 'victory' || view?.phase === 'defeat') {
    // This shouldn't normally happen since we handle game over via TournamentGameCompleted event,
    // but handle it gracefully
    const isVictory = view.phase === 'victory';
    return (
      <div className="min-h-screen min-h-svh bg-slate-900 flex flex-col items-center justify-center p-4 text-white">
        <div
          className={`p-6 lg:p-12 rounded-xl lg:rounded-2xl text-center max-w-sm ${
            isVictory
              ? 'bg-green-900/30 border-2 border-green-500'
              : 'bg-red-900/30 border-2 border-red-500'
          }`}
        >
          <h1 className={`text-3xl font-bold mb-4 ${isVictory ? 'text-green-400' : 'text-red-400'}`}>
            {isVictory ? 'PERFECT RUN!' : 'RUN OVER'}
          </h1>
          <div className="flex flex-col gap-3">
            {activeTournament && (
              <button
                onClick={handlePlayAgain}
                disabled={txLoading}
                className="bg-purple-500 hover:bg-purple-400 text-white font-bold py-3 px-8 rounded-full text-sm transition-all disabled:opacity-50"
              >
                {txLoading ? 'JOINING...' : 'PLAY AGAIN'}
              </button>
            )}
            <button onClick={handleBackToTournament} className="text-slate-400 hover:text-white underline text-sm">
              Back to Tournament
            </button>
          </div>
        </div>
        <RotatePrompt />
      </div>
    );
  }

  // ── Not Connected ──
  if (!isConnected) {
    return (
      <div className="min-h-screen min-h-svh bg-slate-900 flex flex-col items-center justify-center p-4 text-white">
        <h1 className="text-2xl lg:text-4xl font-black mb-6 lg:mb-8 italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
          TOURNAMENT
        </h1>
        <button
          onClick={connect}
          disabled={isConnecting}
          className="bg-purple-500 hover:bg-purple-400 text-white font-bold py-3 px-6 lg:py-4 lg:px-8 rounded-full text-sm lg:text-base transition-all transform hover:scale-105 disabled:opacity-50"
        >
          {isConnecting ? 'CONNECTING...' : 'CONNECT WALLET'}
        </button>
        <Link to="/" className="mt-6 lg:mt-8 text-slate-400 hover:text-white underline text-sm">
          Back to Menu
        </Link>
      </div>
    );
  }

  // ── Active Tournament Game ──
  if (hasActiveTournamentGame && view) {
    return (
      <div className="h-screen h-svh bg-board-bg text-slate-200 overflow-hidden font-sans selection:bg-purple-500/30 flex flex-col">
        <GameShell
          hideEndTurn={true}
          customAction={{
            label: txLoading ? 'Submitting...' : 'Commit',
            onClick: handleSubmitTournamentTurn,
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
  }

  // ── Tournament Details Screen ──
  const setName = availableSets.find((s) => s.id === activeTournament?.config.set_id)?.name
    || `Set #${activeTournament?.config.set_id ?? '?'}`;

  return (
    <div className="h-screen h-svh bg-board-bg text-slate-200 overflow-hidden font-sans flex flex-col">
      <div className="flex-1 flex items-center justify-center bg-slate-950 p-4 overflow-y-auto">
        <div className="text-center bg-slate-900 p-3 lg:p-6 rounded-xl lg:rounded-2xl border border-white/5 shadow-2xl w-full max-w-sm lg:max-w-lg">
          {/* Header */}
          <h3 className="text-lg lg:text-2xl font-black mb-1 italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
            TOURNAMENT
          </h3>

          {/* Connection Status & Account */}
          <div className="flex items-center justify-center gap-2 lg:gap-3 mb-2 lg:mb-6">
            <div className="flex items-center gap-1.5 lg:gap-2 px-2 lg:px-3 py-1 lg:py-1.5 bg-slate-800 rounded lg:rounded-lg border border-white/5">
              <div
                className={`w-1.5 h-1.5 lg:w-2 lg:h-2 rounded-full ${blockNumber !== null ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}
              />
              <span className="text-[10px] lg:text-xs font-mono text-slate-400">
                {blockNumber !== null ? `#${blockNumber.toLocaleString()}` : 'Offline'}
              </span>
            </div>
            <select
              value={selectedAccount?.address}
              onChange={(e) => selectAccount(accounts.find((a) => a.address === e.target.value))}
              className="bg-slate-800 border border-white/10 rounded lg:rounded-lg px-1.5 lg:px-2 py-1 lg:py-1.5 text-[10px] lg:text-xs outline-none focus:border-purple-500/50"
            >
              {accounts.map((acc) => (
                <option key={acc.address} value={acc.address}>
                  {acc.source === 'dev' ? '🛠️ ' : ''}
                  {acc.name} ({acc.address.slice(0, 6)}...)
                </option>
              ))}
            </select>
          </div>

          {isLoadingTournament ? (
            <p className="text-slate-400 text-sm">Loading tournament...</p>
          ) : !activeTournament ? (
            <CreateTestTournament
              onCreated={() => {
                refreshCalled.current = false;
                void fetchActiveTournament();
              }}
            />
          ) : (
            <>
              {/* Card Set */}
              <div className="flex items-center justify-center gap-2 mb-2 lg:mb-4">
                <span className="text-xs lg:text-sm text-slate-300">
                  Card Set: <span className="font-bold text-white">{setName}</span>
                </span>
                <button
                  onClick={() => previewSet(activeTournament.config.set_id)}
                  className="px-1.5 lg:px-2 py-0.5 lg:py-1 text-[9px] lg:text-[10px] font-bold border border-slate-600 text-slate-300 hover:text-white hover:border-slate-400 rounded transition-all"
                >
                  PREVIEW
                </button>
              </div>

              {/* Info Grid */}
              <div className="grid grid-cols-4 lg:grid-cols-2 gap-1.5 lg:gap-3 mb-2 lg:mb-4 text-center lg:text-left">
                <div className="bg-slate-800/50 rounded lg:rounded-lg px-2 py-1.5 lg:p-3 border border-white/5">
                  <div className="text-[8px] lg:text-[10px] text-slate-500 uppercase font-bold lg:mb-1">Fee</div>
                  <div className="text-xs lg:text-sm font-bold text-white">
                    {formatBalance(activeTournament.config.entry_fee)}
                  </div>
                </div>
                <div className="bg-slate-800/50 rounded lg:rounded-lg px-2 py-1.5 lg:p-3 border border-white/5">
                  <div className="text-[8px] lg:text-[10px] text-slate-500 uppercase font-bold lg:mb-1">Pool</div>
                  <div className="text-xs lg:text-sm font-bold text-purple-300">
                    {formatBalance(activeTournament.state.total_pot)}
                  </div>
                </div>
                <div className="bg-slate-800/50 rounded lg:rounded-lg px-2 py-1.5 lg:p-3 border border-white/5">
                  <div className="text-[8px] lg:text-[10px] text-slate-500 uppercase font-bold lg:mb-1">Entries</div>
                  <div className="text-xs lg:text-sm font-bold text-white">
                    {activeTournament.state.total_entries}
                  </div>
                </div>
                <div className="bg-slate-800/50 rounded lg:rounded-lg px-2 py-1.5 lg:p-3 border border-white/5">
                  <div className="text-[8px] lg:text-[10px] text-slate-500 uppercase font-bold lg:mb-1">Perfect</div>
                  <div className="text-xs lg:text-sm font-bold text-green-400">
                    {activeTournament.state.total_perfect_runs}
                  </div>
                </div>
              </div>

              {/* Prize Distribution */}
              <div className="bg-slate-800/50 rounded lg:rounded-lg p-2 lg:p-3 border border-white/5 mb-2 lg:mb-4 text-left">
                <div className="text-[8px] lg:text-[10px] text-slate-500 uppercase font-bold mb-1 lg:mb-2">Prize Distribution</div>
                <div className="flex gap-2 lg:gap-4 text-[10px] lg:text-xs">
                  <div>
                    <span className="text-slate-400">Players: </span>
                    <span className="text-white font-bold">{formatPerbill(activeTournament.config.prize_config.player_share)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Set Creator: </span>
                    <span className="text-white font-bold">{formatPerbill(activeTournament.config.prize_config.set_creator_share)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Card Creators: </span>
                    <span className="text-white font-bold">{formatPerbill(activeTournament.config.prize_config.card_creators_share)}</span>
                  </div>
                </div>
              </div>

              {/* Your Stats */}
              {playerStats && playerStats.total_games > 0 && (
                <div className="bg-purple-900/20 rounded lg:rounded-lg p-2 lg:p-3 border border-purple-500/20 mb-2 lg:mb-4 text-left">
                  <div className="text-[8px] lg:text-[10px] text-purple-400 uppercase font-bold mb-1 lg:mb-2">Your Stats</div>
                  <div className="flex gap-2 lg:gap-4 text-[10px] lg:text-xs">
                    <div>
                      <span className="text-slate-400">Games: </span>
                      <span className="text-white font-bold">{playerStats.total_games}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">Wins: </span>
                      <span className="text-white font-bold">{playerStats.total_wins}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">Perfect Runs: </span>
                      <span className="text-green-400 font-bold">{playerStats.perfect_runs}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Leaderboard */}
              {allPlayerStats.length > 0 && (
                <div className="bg-slate-800/50 rounded lg:rounded-lg p-2 lg:p-3 border border-white/5 mb-2 lg:mb-4 text-left">
                  <div className="text-[8px] lg:text-[10px] text-slate-500 uppercase font-bold mb-1 lg:mb-2">Leaderboard</div>
                  <table className="w-full text-[10px] lg:text-xs">
                    <thead>
                      <tr className="text-slate-500">
                        <th className="text-left pb-0.5 lg:pb-1">#</th>
                        <th className="text-left pb-0.5 lg:pb-1">Player</th>
                        <th className="text-right pb-0.5 lg:pb-1"><span className="hidden lg:inline">Games</span><span className="lg:hidden">G</span></th>
                        <th className="text-right pb-0.5 lg:pb-1"><span className="hidden lg:inline">Wins</span><span className="lg:hidden">W</span></th>
                        <th className="text-right pb-0.5 lg:pb-1"><span className="hidden lg:inline">Perfect</span><span className="lg:hidden">P</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {allPlayerStats.slice(0, 10).map((entry, i) => (
                        <tr
                          key={entry.account}
                          className={
                            entry.account === selectedAccount?.address
                              ? 'text-purple-300'
                              : 'text-slate-300'
                          }
                        >
                          <td className="py-px lg:py-0.5">{i + 1}</td>
                          <td className="py-px lg:py-0.5 font-mono">
                            {entry.account.slice(0, 6)}...{entry.account.slice(-4)}
                          </td>
                          <td className="text-right py-px lg:py-0.5">{entry.stats.total_games}</td>
                          <td className="text-right py-px lg:py-0.5">{entry.stats.total_wins}</td>
                          <td className="text-right py-px lg:py-0.5 text-green-400">
                            {entry.stats.perfect_runs}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Join Button */}
              <button
                onClick={handleJoinTournament}
                disabled={txLoading}
                className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white font-black px-6 lg:px-12 py-2.5 lg:py-4 rounded-full text-xs lg:text-base transition-all transform hover:scale-105 disabled:opacity-50 shadow-lg shadow-purple-500/20"
              >
                {txLoading ? 'JOINING...' : 'JOIN TOURNAMENT'}
              </button>

              <div className="mt-2 lg:mt-4">
                <Link to="/" className="text-slate-500 hover:text-slate-300 text-[10px] lg:text-xs">
                  Back to Menu
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
      <SetPreviewOverlay />
      <RotatePrompt />
    </div>
  );
};

// ── Dev helper: create a test tournament via sudo ──

const CreateTestTournament: React.FC<{ onCreated: () => void }> = ({ onCreated }) => {
  const { api, selectedAccount, blockNumber, availableSets } = useBlockchainStore();
  const [selectedSetId, setSelectedSetId] = useState(0);
  const [loading, setLoading] = useState(false);

  // Default to first available set
  useEffect(() => {
    if (availableSets.length > 0 && selectedSetId === 0) {
      setSelectedSetId(availableSets[0].id);
    }
  }, [availableSets, selectedSetId]);

  const handleCreate = async () => {
    if (!api || !selectedAccount || !blockNumber) return;
    setLoading(true);
    try {
      const startBlock = blockNumber + 1;
      const endBlock = blockNumber + 1000;
      const entryFee = BigInt(1_000_000_000_000); // 1 unit

      // Build the inner create_tournament call
      const innerCall = api.tx.AutoBattle.create_tournament({
        set_id: selectedSetId,
        entry_fee: entryFee,
        start_block: startBlock,
        end_block: endBlock,
        prize_config: {
          player_share: 700_000_000, // 70%
          set_creator_share: 200_000_000, // 20%
          card_creators_share: 100_000_000, // 10%
        },
      });

      // Wrap in sudo
      const tx = api.tx.Sudo.sudo({ call: innerCall.decodedCall });
      await submitTx(tx, selectedAccount.polkadotSigner, 'Sudo.sudo(create_tournament)');
      onCreated();
    } catch (err) {
      console.error('Create test tournament failed:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="text-center">
      <p className="text-slate-400 text-sm mb-4">No active tournament found.</p>

      <div className="bg-slate-800/50 rounded-lg p-4 border border-white/5 mb-4 text-left">
        <div className="text-[10px] text-slate-500 uppercase font-bold mb-3">Create Test Tournament (Sudo)</div>
        <div className="flex items-center gap-2 mb-3">
          <label className="text-xs text-slate-400 shrink-0">Card Set:</label>
          <select
            value={selectedSetId}
            onChange={(e) => setSelectedSetId(Number(e.target.value))}
            className="flex-1 bg-slate-700 border border-white/10 text-white text-xs rounded px-2 py-1.5 outline-none"
          >
            {[...availableSets].sort((a, b) => a.id - b.id).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} (#{s.id})
              </option>
            ))}
          </select>
        </div>
        <div className="text-[10px] text-slate-500 mb-3">
          Entry: 1 unit | Duration: 1000 blocks | Prize: 70/20/10
        </div>
        <button
          onClick={handleCreate}
          disabled={loading || !selectedAccount}
          className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 px-4 rounded text-xs transition-all disabled:opacity-50"
        >
          {loading ? 'CREATING...' : 'CREATE TOURNAMENT'}
        </button>
      </div>

      <Link to="/" className="text-slate-500 hover:text-slate-300 text-xs underline">
        Back to Menu
      </Link>
    </div>
  );
};
