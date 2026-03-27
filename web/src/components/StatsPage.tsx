import { useEffect, useState } from 'react';
import { useArenaStore } from '../store/arenaStore';
import { useAchievementStore } from '../store/achievementStore';
import { TopBar } from './TopBar';

interface PlayerStats {
  nonce: number;
  freeBalance: bigint;
  achievementCount: number;
  tournamentGames: number;
  tournamentWins: number;
  tournamentPerfectRuns: number;
}

const formatBalance = (raw: bigint, decimals = 12) =>
  (Number(raw) / Math.pow(10, decimals)).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });

function StatCard({
  icon,
  label,
  value,
  color = 'text-white',
}: {
  icon: string;
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="theme-panel bg-base-900/60 border border-base-700/40 rounded-xl p-3 lg:p-4 flex flex-col items-center text-center">
      <span className="text-xl lg:text-3xl mb-1 lg:mb-2">{icon}</span>
      <span className={`text-lg lg:text-2xl font-stat font-bold ${color}`}>{value}</span>
      <span className="text-[9px] lg:text-xs text-base-500 mt-0.5 uppercase tracking-wider">
        {label}
      </span>
    </div>
  );
}

export function StatsPage() {
  const { api, selectedAccount } = useArenaStore();
  const { achievements, isLoaded, fetchAchievements } = useAchievementStore();
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (api && selectedAccount && !isLoaded) {
      void fetchAchievements(api, selectedAccount.address);
    }
  }, [api, selectedAccount, isLoaded, fetchAchievements]);

  useEffect(() => {
    if (!api || !selectedAccount) return;
    let cancelled = false;

    const fetchStats = async () => {
      setLoading(true);
      try {
        // Account info
        const acct = await api.query.System.Account.getValue(selectedAccount.address);
        const nonce = acct?.nonce ?? 0;
        const freeBalance = acct?.data?.free ?? BigInt(0);

        // Tournament stats — aggregate across all tournaments
        let tournamentGames = 0;
        let tournamentWins = 0;
        let tournamentPerfectRuns = 0;
        try {
          const entries = await api.query.OabTournament.TournamentPlayerStats.getEntries();
          for (const entry of entries) {
            if (entry.keyArgs[1] === selectedAccount.address) {
              tournamentGames += entry.value.total_games ?? 0;
              tournamentWins += entry.value.total_wins ?? 0;
              tournamentPerfectRuns += entry.value.perfect_runs ?? 0;
            }
          }
        } catch {
          // TournamentPlayerStats may not exist
        }

        if (!cancelled) {
          setStats({
            nonce,
            freeBalance,
            achievementCount: achievements.size,
            tournamentGames,
            tournamentWins,
            tournamentPerfectRuns,
          });
        }
      } catch (err) {
        console.error('Failed to fetch stats:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchStats();
    return () => {
      cancelled = true;
    };
  }, [api, selectedAccount, achievements]);

  return (
    <div className="app-shell fixed inset-0 text-white flex flex-col">
      <TopBar backTo="/history" backLabel="History" title="Stats" />
      <div className="flex-1 overflow-y-auto">
        <div className="w-full max-w-lg lg:max-w-2xl mx-auto p-3 lg:p-6">
          {loading || !stats ? (
            <div className="text-center py-16 text-base-500 text-sm">Loading stats...</div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 lg:gap-4">
              <StatCard icon="🎮" label="Transactions" value={stats.nonce} />
              <StatCard
                icon="💰"
                label="Balance"
                value={formatBalance(stats.freeBalance)}
                color="text-victory"
              />
              <StatCard
                icon="⭐"
                label="Victory Achievements"
                value={stats.achievementCount}
                color="text-accent"
              />
              <StatCard icon="🏟️" label="Tournament Games" value={stats.tournamentGames} />
              <StatCard
                icon="🏆"
                label="Tournament Wins"
                value={stats.tournamentWins}
                color="text-accent"
              />
              <StatCard
                icon="💎"
                label="Perfect Runs"
                value={stats.tournamentPerfectRuns}
                color="text-special"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
