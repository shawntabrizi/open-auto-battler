import { Link } from 'react-router-dom';
import { useContractStore } from '../store/contractStore';
import { BadgeChip } from './BadgeChip';

/**
 * Ranked entry on the arena page: the start button, why a start was refused
 * (with the personhood bind action), and the badges of the last ranked run.
 */
export function RankedPanel({ setId, disabled }: { setId: number; disabled: boolean }) {
  const {
    startRankedGame,
    rankedBlock,
    eligibility,
    bindPersonhood,
    isBinding,
    bindError,
    selectedAccount,
    lastRunBadges,
    clearLastRunBadges,
  } = useContractStore();

  const canBind = eligibility?.kind === 'not-bound' && selectedAccount?.source === 'host';

  return (
    <div className="flex flex-col gap-3 w-full">
      {lastRunBadges && (
        <div className="theme-panel bg-base-900/50 border border-accent/30 rounded-xl p-3 text-left">
          <div className="text-xs font-bold text-accent uppercase tracking-wider mb-2">
            New badges
          </div>
          <div className="flex flex-col gap-2">
            {lastRunBadges.map((b) => (
              <BadgeChip
                key={`${b.badge}/${b.setId}`}
                badge={b.badge}
                setId={b.setId}
                pending={b.kind === 'pending'}
              />
            ))}
          </div>
          {lastRunBadges.some((b) => b.kind === 'pending') && (
            <p className="text-xs text-base-400 mt-2">
              A pending badge is earned but not minted yet. Claim it on the{' '}
              <Link to="/contract/badges" className="text-accent underline">
                Badges
              </Link>{' '}
              page.
            </p>
          )}
          <button
            onClick={clearLastRunBadges}
            className="text-xs text-base-500 hover:text-base-300 mt-2 transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      <button
        onClick={() => void startRankedGame(setId)}
        disabled={disabled}
        className="theme-button theme-surface-button w-full font-black py-3 lg:py-4 rounded-xl border text-sm lg:text-base transition-all disabled:opacity-50 uppercase tracking-wider"
      >
        Ranked
      </button>
      <p className="text-base-500 text-xs">
        Needs proof of personhood. Ranked runs go on the leaderboard and can earn badges.
      </p>

      {rankedBlock && (
        <div className="rounded-xl theme-error-panel border px-3 py-3 text-xs text-left flex flex-col gap-2">
          <p className="text-base-200">{rankedBlock}</p>
          {canBind && (
            <>
              <p className="text-base-400">
                Binding links this OAB account to your personhood alias in OAB. The host asks for a
                personhood proof, then you sign one transaction. An account can hold only one
                binding.
              </p>
              <button
                onClick={() => void bindPersonhood()}
                disabled={isBinding}
                className="theme-button btn-primary font-bold py-2 rounded-lg text-xs uppercase tracking-wider disabled:opacity-50"
              >
                {isBinding ? 'Binding...' : 'Bind personhood'}
              </button>
            </>
          )}
          {eligibility?.kind === 'not-bound' && selectedAccount?.source !== 'host' && (
            <p className="text-base-400">Binding needs a Polkadot host account.</p>
          )}
          {bindError && <p className="text-negative">{bindError}</p>}
        </div>
      )}
    </div>
  );
}
