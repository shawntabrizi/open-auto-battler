import { TopBar } from './TopBar';

/** Placeholder marketplace page — to be built out later */
export function MarketplacePage() {
  return (
    <div className="app-shell fixed inset-0 text-white flex flex-col">
      <TopBar backTo="/" backLabel="Menu" title="Marketplace" />
      <div className="flex-1 overflow-y-auto">
        <div className="w-full max-w-sm lg:max-w-md mx-auto p-3 lg:p-4 lg:mt-[15vh]">
          <div className="theme-panel flex flex-col items-center justify-center py-16 lg:py-24 gap-4 rounded-2xl border border-warm-700 bg-warm-900/30">
            <div className="text-5xl lg:text-6xl opacity-30">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-16 h-16 lg:w-20 lg:h-20">
                <path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1.003 1.003 0 0020 4H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z" />
              </svg>
            </div>
            <h2 className="font-heading text-lg lg:text-xl text-warm-400 tracking-wide">
              Coming Soon
            </h2>
            <p className="text-warm-600 text-xs lg:text-sm text-center max-w-xs">
              Card packs, cosmetics, and more will be available here in a future update.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
