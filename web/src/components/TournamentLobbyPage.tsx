import React, { useEffect, useState, useRef } from 'react';
import { useIsSubmitting } from '../store/txStore';
import { useArenaStore, getDevAccounts } from '../store/arenaStore';
import { useTournamentStore } from '../store/tournamentStore';
import { useGameStore } from '../store/gameStore';
import { Link, useNavigate } from 'react-router-dom';
import { TopBar } from './TopBar';
import { useInitGuard } from '../hooks';
import { submitTx } from '../utils/tx';

const formatBalance = (raw: bigint, decimals = 12) =>
  (Number(raw) / Math.pow(10, decimals)).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });

const formatPerbill = (value: number) => {
  const pct = value / 10_000_000;
  return `${pct.toFixed(pct % 1 === 0 ? 0 : 1)}%`;
};

export function TournamentLobbyPage() {
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
    fetchCards,
    hydrateGameEngineFromChainData,
    connectionError,
  } = useArenaStore();

  const { init, engine } = useGameStore();
  const navigate = useNavigate();

  const {
    activeTournament,
    isLoadingTournament,
    playerStats,
    allPlayerStats,
    tournamentGameOver,
    lastGameWins,
    fetchActiveTournament,
    fetchPlayerStats,
    fetchAllPlayerStats,
    joinTournament,
    resetGameOver,
  } = useTournamentStore();

  const isSubmitting = useIsSubmitting();
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
    if (!isConnected) return;
    void fetchActiveTournament();
  }, [isConnected, fetchActiveTournament]);

  useEffect(() => {
    if (!activeTournament || !selectedAccount) return;
    void fetchPlayerStats();
    void fetchAllPlayerStats(activeTournament.id);
  }, [activeTournament, selectedAccount, fetchPlayerStats, fetchAllPlayerStats]);

  const handleJoinTournament = async () => {
    if (!activeTournament) return;
    await joinTournament(activeTournament.id);
    navigate('/tournament/game');
  };

  const handlePlayAgain = async () => {
    if (!activeTournament) return;
    resetGameOver();
    await joinTournament(activeTournament.id);
    navigate('/tournament/game');
  };

  const handleBackToLobby = () => {
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
      <div className="app-shell min-h-screen min-h-svh flex flex-col text-white">
        <TopBar backTo="/play" backLabel="Play" title="Tournament" />
        <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center p-4">
          <div
            className={`theme-panel p-6 lg:p-12 rounded-xl lg:rounded-2xl text-center max-w-sm lg:max-w-none ${
              isPerfect
                ? 'bg-victory/10 border-2 border-victory'
                : 'bg-defeat/10 border-2 border-defeat'
            }`}
          >
            <h1
              className={`text-3xl lg:text-5xl font-bold mb-2 lg:mb-4 ${
                isPerfect ? 'text-victory' : 'text-defeat'
              }`}
            >
              {isPerfect ? 'PERFECT RUN!' : 'RUN OVER'}
            </h1>
            <p className="text-sm lg:text-xl text-base-300 mb-4 lg:mb-8">
              {isPerfect
                ? 'Amazing! You achieved a perfect 10-win run in the tournament!'
                : `You finished with ${lastGameWins} win${lastGameWins !== 1 ? 's' : ''}.`}
            </p>

            <div className="flex justify-center gap-6 lg:gap-12 mb-6 lg:mb-8">
              <div className="text-center">
                <div className="text-2xl lg:text-4xl font-bold text-accent">{lastGameWins}</div>
                <div className="text-xs lg:text-base text-base-400">Wins</div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {activeTournament && (
                <button
                  onClick={handlePlayAgain}
                  disabled={isSubmitting}
                  className="theme-button btn-primary font-bold py-3 px-8 rounded-xl text-sm transition-all transform hover:scale-105 disabled:opacity-50"
                >
                  PLAY AGAIN
                </button>
              )}
              <button
                onClick={handleBackToLobby}
                className="text-base-400 hover:text-base-200 text-sm transition-colors"
              >
                &larr; Back to Tournament
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Not Connected ──
  if (!isConnected) {
    return (
      <div className="app-shell min-h-screen min-h-svh flex flex-col text-white">
        <TopBar backTo="/play" backLabel="Play" title="Tournament" />
        <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center p-4">
          <h1 className="theme-title-text text-2xl lg:text-4xl font-black mb-6 lg:mb-8 italic tracking-tighter text-transparent bg-clip-text">
            TOURNAMENT
          </h1>
          <button
            onClick={() => void connect()}
            disabled={isConnecting}
            className="theme-button btn-primary font-bold py-3 px-6 lg:py-4 lg:px-8 rounded-xl text-sm lg:text-base transition-all transform hover:scale-105 disabled:opacity-50"
          >
            {isConnecting ? 'CONNECTING...' : 'RETRY CONNECTION'}
          </button>
          <Link
            to="/network"
            className="mt-3 text-sm text-base-400 hover:text-base-200 transition-colors"
          >
            Network Settings
          </Link>
          {connectionError && (
            <p className="mt-3 max-w-md rounded-xl theme-error-panel border px-3 py-2 text-center text-xs text-negative">
              {connectionError}
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Tournament Details Screen ──
  const setName =
    availableSets.find((s) => s.id === activeTournament?.config.set_id)?.name ||
    `Set #${activeTournament?.config.set_id ?? '?'}`;

  return (
    <div className="h-screen h-svh bg-board-bg text-base-200 overflow-hidden font-sans flex flex-col">
      <TopBar backTo="/play" backLabel="Play" title="Tournament" />
      <div className="flex-1 flex items-center justify-center overflow-y-auto p-4">
        <div className="theme-panel text-center bg-base-900 p-3 lg:p-6 rounded-xl lg:rounded-2xl border border-white/5 shadow-2xl w-full max-w-sm lg:max-w-lg">
          <h3 className="theme-title-text text-lg lg:text-2xl font-black mb-1 italic tracking-tighter text-transparent bg-clip-text">
            TOURNAMENT
          </h3>

          <div className="flex items-center justify-center gap-2 lg:gap-3 mb-2 lg:mb-6">
            <div className="flex items-center gap-1.5 lg:gap-2 px-2 lg:px-3 py-1 lg:py-1.5 bg-base-800 rounded lg:rounded-lg border border-white/5">
              <div className="w-1.5 h-1.5 lg:w-2 lg:h-2 rounded-full bg-positive animate-pulse" />
              <span className="text-[10px] lg:text-xs font-mono text-base-400">
                {blockNumber !== null ? `#${blockNumber.toLocaleString()}` : 'Connected'}
              </span>
            </div>
            <select
              value={selectedAccount?.address}
              onChange={(e) =>
                selectAccount(accounts.find((a: any) => a.address === e.target.value))
              }
              className="theme-input bg-base-800 border border-white/10 rounded lg:rounded-lg px-1.5 lg:px-2 py-1 lg:py-1.5 text-[10px] lg:text-xs outline-none focus:border-accent/50"
            >
              {accounts.map((acc: any) => (
                <option key={acc.address} value={acc.address}>
                  {acc.source === 'dev' ? '🛠️ ' : ''}
                  {acc.name} ({acc.address.slice(0, 6)}...)
                </option>
              ))}
            </select>
          </div>

          {isLoadingTournament ? (
            <p className="text-base-400 text-sm">Loading tournament...</p>
          ) : !activeTournament ? (
            <CreateTestTournament
              onCreated={() => {
                refreshCalled.current = false;
                void fetchActiveTournament();
              }}
            />
          ) : (
            <>
              <div className="flex items-center justify-center gap-2 mb-2 lg:mb-4">
                <span className="text-xs lg:text-sm text-base-300">
                  Card Set: <span className="font-bold text-white">{setName}</span>
                </span>
                <button
                  onClick={() => navigate(`/sets/${activeTournament.config.set_id}`)}
                  className="theme-button theme-surface-button px-1.5 lg:px-2 py-0.5 lg:py-1 text-[9px] lg:text-[10px] font-bold border rounded transition-all"
                >
                  PREVIEW
                </button>
              </div>

              <div className="grid grid-cols-4 lg:grid-cols-2 gap-1.5 lg:gap-3 mb-2 lg:mb-4 text-center lg:text-left">
                <div className="bg-base-800/50 rounded lg:rounded-lg px-2 py-1.5 lg:p-3 border border-white/5">
                  <div className="text-[8px] lg:text-[10px] text-base-500 uppercase font-bold lg:mb-1">
                    Fee
                  </div>
                  <div className="text-xs lg:text-sm font-bold text-white">
                    {formatBalance(activeTournament.config.entry_fee)}
                  </div>
                </div>
                <div className="theme-panel bg-base-800/50 rounded lg:rounded-lg px-2 py-1.5 lg:p-3 border border-white/5">
                  <div className="text-[8px] lg:text-[10px] text-base-500 uppercase font-bold lg:mb-1">
                    Pool
                  </div>
                  <div className="text-xs lg:text-sm font-bold text-special">
                    {formatBalance(activeTournament.state.total_pot)}
                  </div>
                </div>
                <div className="bg-base-800/50 rounded lg:rounded-lg px-2 py-1.5 lg:p-3 border border-white/5">
                  <div className="text-[8px] lg:text-[10px] text-base-500 uppercase font-bold lg:mb-1">
                    Entries
                  </div>
                  <div className="text-xs lg:text-sm font-bold text-white">
                    {activeTournament.state.total_entries}
                  </div>
                </div>
                <div className="bg-base-800/50 rounded lg:rounded-lg px-2 py-1.5 lg:p-3 border border-white/5">
                  <div className="text-[8px] lg:text-[10px] text-base-500 uppercase font-bold lg:mb-1">
                    Perfect
                  </div>
                  <div className="text-xs lg:text-sm font-bold text-victory">
                    {activeTournament.state.total_perfect_runs}
                  </div>
                </div>
              </div>

              <div className="bg-base-800/50 rounded lg:rounded-lg p-2 lg:p-3 border border-white/5 mb-2 lg:mb-4 text-left">
                <div className="text-[8px] lg:text-[10px] text-base-500 uppercase font-bold mb-1 lg:mb-2">
                  Prize Distribution
                </div>
                <div className="flex gap-2 lg:gap-4 text-[10px] lg:text-xs">
                  <div>
                    <span className="text-base-400">Players: </span>
                    <span className="text-white font-bold">
                      {formatPerbill(activeTournament.config.prize_config.player_share)}
                    </span>
                  </div>
                  <div>
                    <span className="text-base-400">Set Creator: </span>
                    <span className="text-white font-bold">
                      {formatPerbill(activeTournament.config.prize_config.set_creator_share)}
                    </span>
                  </div>
                  <div>
                    <span className="text-base-400">Card Creators: </span>
                    <span className="text-white font-bold">
                      {formatPerbill(activeTournament.config.prize_config.card_creators_share)}
                    </span>
                  </div>
                </div>
              </div>

              {playerStats && playerStats.total_games > 0 && (
                <div className="theme-panel bg-special/10 rounded lg:rounded-lg p-2 lg:p-3 border border-special/20 mb-2 lg:mb-4 text-left">
                  <div className="text-[8px] lg:text-[10px] text-special uppercase font-bold mb-1 lg:mb-2">
                    Your Stats
                  </div>
                  <div className="flex gap-2 lg:gap-4 text-[10px] lg:text-xs">
                    <div>
                      <span className="text-base-400">Games: </span>
                      <span className="text-white font-bold">{playerStats.total_games}</span>
                    </div>
                    <div>
                      <span className="text-base-400">Wins: </span>
                      <span className="text-white font-bold">{playerStats.total_wins}</span>
                    </div>
                    <div>
                      <span className="text-base-400">Perfect Runs: </span>
                      <span className="text-victory font-bold">{playerStats.perfect_runs}</span>
                    </div>
                  </div>
                </div>
              )}

              {allPlayerStats.length > 0 && (
                <div className="bg-base-800/50 rounded lg:rounded-lg p-2 lg:p-3 border border-white/5 mb-2 lg:mb-4 text-left">
                  <div className="text-[8px] lg:text-[10px] text-base-500 uppercase font-bold mb-1 lg:mb-2">
                    Leaderboard
                  </div>
                  <table className="w-full text-[10px] lg:text-xs">
                    <thead>
                      <tr className="text-base-500">
                        <th className="text-left pb-0.5 lg:pb-1">#</th>
                        <th className="text-left pb-0.5 lg:pb-1">Player</th>
                        <th className="text-right pb-0.5 lg:pb-1">
                          <span className="hidden lg:inline">Games</span>
                          <span className="lg:hidden">G</span>
                        </th>
                        <th className="text-right pb-0.5 lg:pb-1">
                          <span className="hidden lg:inline">Wins</span>
                          <span className="lg:hidden">W</span>
                        </th>
                        <th className="text-right pb-0.5 lg:pb-1">
                          <span className="hidden lg:inline">Perfect</span>
                          <span className="lg:hidden">P</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {allPlayerStats.slice(0, 10).map((entry, i) => (
                        <tr
                          key={entry.account}
                          className={
                            entry.account === selectedAccount?.address
                              ? 'text-special'
                              : 'text-base-300'
                          }
                        >
                          <td className="py-px lg:py-0.5">{i + 1}</td>
                          <td className="py-px lg:py-0.5 font-mono">
                            {entry.account.slice(0, 6)}...{entry.account.slice(-4)}
                          </td>
                          <td className="text-right py-px lg:py-0.5">{entry.stats.total_games}</td>
                          <td className="text-right py-px lg:py-0.5">{entry.stats.total_wins}</td>
                          <td className="text-right py-px lg:py-0.5 text-victory">
                            {entry.stats.perfect_runs}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <button
                onClick={handleJoinTournament}
                disabled={isSubmitting}
                className="theme-button btn-primary font-black px-6 lg:px-12 py-2.5 lg:py-4 rounded-full text-xs lg:text-base transition-all transform hover:scale-105 disabled:opacity-50"
              >
                JOIN TOURNAMENT
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Dev helper: create a test tournament via sudo ──

const CreateTestTournament: React.FC<{ onCreated: () => void }> = ({ onCreated }) => {
  const { api, blockNumber, availableSets } = useArenaStore();
  const isSubmittingTx = useIsSubmitting();
  const [selectedSetId, setSelectedSetId] = useState(0);

  const alice = getDevAccounts()[0];

  useEffect(() => {
    if (availableSets.length > 0 && selectedSetId === 0) {
      setSelectedSetId(availableSets[0].id);
    }
  }, [availableSets, selectedSetId]);

  const handleCreate = async () => {
    if (!api || !alice || !blockNumber) return;
    try {
      const startBlock = blockNumber + 1;
      const endBlock = blockNumber + 1000;
      const entryFee = BigInt(1_000_000_000_000);

      const innerCall = api.tx.AutoBattle.create_tournament({
        set_id: selectedSetId,
        entry_fee: entryFee,
        start_block: startBlock,
        end_block: endBlock,
        prize_config: {
          player_share: 700_000_000,
          set_creator_share: 200_000_000,
          card_creators_share: 100_000_000,
        },
      });

      const tx = api.tx.Sudo.sudo({ call: innerCall.decodedCall });
      await submitTx(tx, alice.polkadotSigner, 'Sudo.sudo(create_tournament)');
      onCreated();
    } catch (err) {
      console.error('Create test tournament failed:', err);
    }
  };

  return (
    <div className="text-center">
      <p className="text-base-400 text-sm mb-4">No active tournament found.</p>
      <div className="bg-base-800/50 rounded-lg p-4 border border-white/5 mb-4 text-left">
        <div className="text-[10px] text-base-500 uppercase font-bold mb-3">
          Create Test Tournament (Sudo)
        </div>
        <div className="flex items-center gap-2 mb-3">
          <label className="text-xs text-base-400 shrink-0">Card Set:</label>
          <select
            value={selectedSetId}
            onChange={(e) => setSelectedSetId(Number(e.target.value))}
            className="theme-input flex-1 bg-base-700 border border-white/10 text-white text-xs rounded px-2 py-1.5 outline-none"
          >
            {[...availableSets]
              .sort((a, b) => a.id - b.id)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} (#{s.id})
                </option>
              ))}
          </select>
        </div>
        <div className="text-[10px] text-base-500 mb-3">
          Entry: 1 unit | Duration: 1000 blocks | Prize: 70/20/10
        </div>
        <button
          onClick={handleCreate}
          disabled={isSubmittingTx || !alice}
          className="theme-button btn-primary w-full font-bold py-2 px-4 rounded text-xs transition-all disabled:opacity-50"
        >
          CREATE TOURNAMENT
        </button>
      </div>
    </div>
  );
};
