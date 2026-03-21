import { TopBar } from './TopBar';

/** Placeholder battle history page */
export function BattleHistoryPage() {
  return (
    <div className="app-shell fixed inset-0 text-white flex flex-col">
      <TopBar backTo="/history" backLabel="History" title="Battle History" />
      <div className="flex-1 overflow-y-auto">
        <div className="w-full max-w-sm lg:max-w-md mx-auto p-3 lg:p-4 lg:mt-[15vh]">
          <div className="theme-panel flex flex-col items-center justify-center py-16 lg:py-24 gap-4 rounded-2xl border border-warm-700 bg-warm-900/30">
            <span className="text-5xl lg:text-6xl opacity-30">⚔️</span>
            <h2 className="font-heading text-lg lg:text-xl text-warm-400 tracking-wide">
              Coming Soon
            </h2>
            <p className="text-warm-600 text-xs lg:text-sm text-center max-w-xs">
              Review past battles, replays, and match outcomes.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
