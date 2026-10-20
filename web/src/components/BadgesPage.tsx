import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useContractStore } from '../store/contractStore';
import { useGameStore } from '../store/gameStore';
import { BadgeChip } from './BadgeChip';
import { TopBar } from './TopBar';

/** The player's achievement badges, with a claim action for pending ones. */
export function BadgesPage() {
  const { isConnected, badges, badgesError, loadBadges, claimBadges, isClaiming } =
    useContractStore();
  const { engine, initEngine } = useGameStore();

  useEffect(() => {
    if (!engine) void initEngine();
  }, [engine, initEngine]);

  useEffect(() => {
    if (isConnected && !badges) void loadBadges();
  }, [isConnected, badges, loadBadges]);

  if (!isConnected) return <Navigate to="/contract" replace />;

  const pending = badges?.filter((b) => b.token === null).length ?? 0;

  return (
    <div className="app-shell min-h-screen min-h-svh flex flex-col text-white">
      <TopBar backTo="/contract/arena" backLabel="Arena" title="Badges" />
      <div className="flex-1 overflow-y-auto flex flex-col items-center p-4 gap-4">
        <p className="text-base-400 text-xs lg:text-sm max-w-md text-center">
          A ranked run with 10 wins earns Victory; with no life lost it also earns Flawless. One of
          each per card set. Badges are soulbound NFTs.
        </p>

        {badgesError && (
          <p className="rounded-xl theme-error-panel border px-3 py-2 text-xs text-negative">
            {badgesError}
          </p>
        )}
        {!badges && !badgesError && <p className="text-base-400 text-sm">Loading…</p>}
        {badges && badges.length === 0 && (
          <p className="text-base-400 text-sm">No badges yet. Win a ranked run to earn one.</p>
        )}

        <div className="w-full max-w-md flex flex-col gap-2">
          {badges?.map((b) => (
            <BadgeChip
              key={`${b.badge}/${b.setId}`}
              badge={b.badge}
              setId={b.setId}
              pending={b.token === null}
            />
          ))}
        </div>

        {pending > 0 && (
          <div className="w-full max-w-md flex flex-col gap-2 text-center">
            <p className="text-xs text-base-400">
              {pending} badge{pending === 1 ? ' is' : 's are'} earned but not minted yet (the arena
              could not pay the NFT deposit at the time).
            </p>
            <button
              onClick={() => void claimBadges()}
              disabled={isClaiming}
              className="theme-button btn-primary w-full font-bold py-3 rounded-xl text-sm uppercase tracking-wider disabled:opacity-50"
            >
              {isClaiming ? 'Claiming...' : 'Claim'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
