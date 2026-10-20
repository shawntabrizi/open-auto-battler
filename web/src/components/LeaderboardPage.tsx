import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useContractStore } from '../store/contractStore';
import { useGameStore } from '../store/gameStore';
import { shortAlias, type Hex, type LeaderboardEntry } from '../contract/codec';
import { TopBar } from './TopBar';

/** The contract keeps the top 100 per set; one read fits in the 16 KB buffer. */
const PAGE = 100;

interface BoardState {
  entries: LeaderboardEntry[];
  myRank: number;
  myBest: LeaderboardEntry | null;
}

const livesLeft = (n: number) => `${n} ${n === 1 ? 'life' : 'lives'} left`;

/** Ranked leaderboard per card set, with the player's own place when known. */
export function LeaderboardPage() {
  const { isConnected, backend, eligibility, rankedAlias, checkEligibility } = useContractStore();
  const { setMetas, engine, initEngine } = useGameStore();
  const [setId, setSetId] = useState(0);
  const [board, setBoard] = useState<BoardState | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The player's alias: from the active ranked game, else from the binding.
  const myAlias: Hex | null =
    rankedAlias ?? (eligibility?.kind === 'bound' ? eligibility.alias : null);

  useEffect(() => {
    if (!engine) void initEngine();
  }, [engine, initEngine]);

  useEffect(() => {
    if (isConnected && !eligibility) void checkEligibility();
  }, [isConnected, eligibility, checkEligibility]);

  useEffect(() => {
    if (!backend) return;
    let live = true;
    setBoard(null);
    setError(null);
    void (async () => {
      try {
        const entries = await backend.getLeaderboard(setId, 0, PAGE);
        const [myRank, myBest] = myAlias
          ? await Promise.all([
              backend.getPlayerRank(setId, myAlias),
              backend.getBestRun(setId, myAlias),
            ])
          : [0, null];
        if (live) setBoard({ entries, myRank, myBest });
      } catch (err) {
        if (live) setError(err instanceof Error ? err.message : 'Failed to load leaderboard');
      }
    })();
    return () => {
      live = false;
    };
  }, [backend, setId, myAlias]);

  if (!isConnected) return <Navigate to="/contract" replace />;

  const sets = setMetas.length > 0 ? setMetas : [{ id: 0, name: 'Set 0' }];
  const isMe = (alias: string) => myAlias !== null && alias.toLowerCase() === myAlias.toLowerCase();

  return (
    <div className="app-shell min-h-screen min-h-svh flex flex-col text-white">
      <TopBar backTo="/contract/arena" backLabel="Arena" title="Leaderboard" />
      <div className="flex-1 overflow-y-auto flex flex-col items-center p-4 gap-4">
        <div className="flex flex-wrap justify-center gap-2">
          {sets.map((s) => (
            <button
              key={s.id}
              onClick={() => setSetId(s.id)}
              className={`px-3 py-1.5 rounded-lg border text-xs lg:text-sm transition-colors ${
                s.id === setId
                  ? 'border-accent bg-accent/10 text-white'
                  : 'border-base-700 bg-base-900 text-base-400 hover:text-base-200'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>

        <div className="w-full max-w-lg text-center text-xs text-base-400">
          {myAlias ? (
            board?.myRank ? (
              <span>
                Your place: <span className="text-white font-bold">#{board.myRank}</span>
                {board.myBest &&
                  ` · best run ${board.myBest.wins} wins, ${livesLeft(board.myBest.lives)}`}
              </span>
            ) : board?.myBest ? (
              <span>
                Your best run: {board.myBest.wins} wins, {livesLeft(board.myBest.lives)} (not in the
                top {PAGE})
              </span>
            ) : (
              <span>You have no finished ranked run on this set yet.</span>
            )
          ) : (
            <span>Bind your personhood to see your own place. Players show as short aliases.</span>
          )}
        </div>

        {error && (
          <p className="rounded-xl theme-error-panel border px-3 py-2 text-xs text-negative">
            {error}
          </p>
        )}
        {!board && !error && <p className="text-base-400 text-sm">Loading…</p>}
        {board && board.entries.length === 0 && (
          <p className="text-base-400 text-sm">No ranked runs on this set yet.</p>
        )}
        {board && board.entries.length > 0 && (
          <table className="w-full max-w-lg text-xs lg:text-sm">
            <thead>
              <tr className="text-base-500 text-left">
                <th className="py-2 pr-2 font-normal">#</th>
                <th className="py-2 pr-2 font-normal">Player</th>
                <th className="py-2 pr-2 font-normal text-right">Wins</th>
                <th className="py-2 pr-2 font-normal text-right">Lives</th>
                <th className="py-2 font-normal text-right">Rounds</th>
              </tr>
            </thead>
            <tbody>
              {board.entries.map((e, i) => (
                <tr
                  key={e.alias}
                  className={`border-t border-base-800/60 ${isMe(e.alias) ? 'bg-accent/10' : ''}`}
                >
                  <td className="py-2 pr-2 text-base-400">{i + 1}</td>
                  <td className="py-2 pr-2 font-mono" title={e.alias}>
                    {shortAlias(e.alias)}
                    {isMe(e.alias) && <span className="ml-2 text-accent font-sans">You</span>}
                  </td>
                  <td className="py-2 pr-2 text-right font-bold">{e.wins}</td>
                  <td className="py-2 pr-2 text-right">{e.lives}</td>
                  <td className="py-2 text-right">{e.rounds}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
