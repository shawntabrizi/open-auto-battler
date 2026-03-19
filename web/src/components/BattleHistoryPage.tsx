import { PageHeader } from './PageHeader';

/** Placeholder battle history page */
export function BattleHistoryPage() {
  return (
    <div className="fixed inset-0 bg-warm-950 text-white overflow-y-auto">
      <div className="w-full max-w-sm lg:max-w-md mx-auto p-3 lg:p-4 lg:mt-[15vh]">
        <PageHeader backTo="/history" backLabel="History" title="Battle History" />

        <div className="flex flex-col items-center justify-center py-16 lg:py-24 gap-4">
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
  );
}
