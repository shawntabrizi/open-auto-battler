import { PageHeader } from './PageHeader';

/** Placeholder history page — to be built out later */
export function HistoryPage() {
  return (
    <div className="fixed inset-0 bg-warm-950 text-white overflow-y-auto">
      <div className="w-full max-w-sm lg:max-w-md mx-auto p-3 lg:p-4 lg:mt-[15vh]">
        <PageHeader backTo="/" backLabel="Menu" title="History" />

        <div className="flex flex-col items-center justify-center py-16 lg:py-24 gap-4">
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-16 h-16 lg:w-20 lg:h-20 text-warm-700"
          >
            <path d="M13 3a9 9 0 00-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0013 21a9 9 0 000-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z" />
          </svg>
          <h2 className="font-heading text-lg lg:text-xl text-warm-400 tracking-wide">
            Coming Soon
          </h2>
          <p className="text-warm-600 text-xs lg:text-sm text-center max-w-xs">
            Achievements, replays, stats, and hall of fame.
          </p>
        </div>
      </div>
    </div>
  );
}
