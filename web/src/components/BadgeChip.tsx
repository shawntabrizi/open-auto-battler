import { badgeName, BADGE_FLAWLESS } from '../contract/codec';
import { useSetName } from '../hooks/useSetName';
import { StarIcon, TrophyIcon } from './Icons';

/** One achievement badge: icon, name, set, and whether it is minted yet. */
export function BadgeChip({
  badge,
  setId,
  pending,
}: {
  badge: number;
  setId: number;
  pending: boolean;
}) {
  const setName = useSetName();
  const Icon = badge === BADGE_FLAWLESS ? StarIcon : TrophyIcon;
  return (
    <div className="theme-panel flex items-center gap-3 bg-base-900/50 border border-white/5 rounded-xl px-4 py-3">
      <Icon className={`w-6 h-6 shrink-0 ${pending ? 'text-base-500' : 'text-victory'}`} />
      <div className="flex-1 min-w-0 text-left">
        <div className="text-sm font-bold text-white">{badgeName(badge)}</div>
        <div className="text-xs text-base-400 truncate">{setName(setId)}</div>
      </div>
      {pending && (
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/15 text-accent">
          Pending
        </span>
      )}
    </div>
  );
}
