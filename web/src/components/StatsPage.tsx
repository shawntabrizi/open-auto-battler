import { useEffect, useState } from 'react';
import { useBlockchainStore } from '../store/blockchainStore';
import { useAchievementStore } from '../store/achievementStore';
import { PageHeader } from './PageHeader';

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
    <div className="bg-warm-900/60 border border-warm-700/40 rounded-xl p-3 lg:p-4 flex flex-col items-center text-center">
      <span className="text-xl lg:text-3xl mb-1 lg:mb-2">{icon}</span>
      <span className={`text-lg lg:text-2xl font-stat font-bold ${color}`}>{value}</span>
      <span className="text-[9px] lg:text-xs text-warm-500 mt-0.5 uppercase tracking-wider">
        {label}
      </span>
    </div>
  );
}

export function StatsPage() {
  const { api, selectedAccount } = useBlockchainStore();
  const { unlockedCardIds, isLoaded, fetchAchievements } = useAchievementStore();
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
          const entries = await api.query.AutoBattle.TournamentPlayerStats.getEntries();
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
            achievementCount: unlockedCardIds.size,
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
  }, [api, selectedAccount, unlockedCardIds]);

  return (
    <div className="fixed inset-0 bg-warm-950 text-white overflow-y-auto">
      <div className="w-full max-w-lg lg:max-w-2xl mx-auto p-3 lg:p-6">
        <PageHeader backTo="/history" backLabel="History" title="Stats" />

        {loading || !stats ? (
          <div className="text-center py-16 text-warm-500 text-sm">Loading stats...</div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 lg:gap-4">
            <StatCard icon="🎮" label="Transactions" value={stats.nonce} />
            <StatCard
              icon="💰"
              label="Balance"
              value={formatBalance(stats.freeBalance)}
              color="text-green-400"
            />
            <StatCard
              icon="⭐"
              label="Victory Achievements"
              value={stats.achievementCount}
              color="text-yellow-400"
            />
            <StatCard icon="🏟️" label="Tournament Games" value={stats.tournamentGames} />
            <StatCard
              icon="🏆"
              label="Tournament Wins"
              value={stats.tournamentWins}
              color="text-amber-400"
            />
            <StatCard
              icon="💎"
              label="Perfect Runs"
              value={stats.tournamentPerfectRuns}
              color="text-purple-400"
            />
          </div>
        )}
      </div>
    </div>
  );
}
