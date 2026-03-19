import { useLocation } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { TopBar } from './TopBar';

// ── Settings Hub ──

export function SettingsPage() {
  const location = useLocation();
  const { showRawJson, toggleShowRawJson } = useGameStore();
  const returnTo =
    location.state &&
    typeof location.state === 'object' &&
    'returnTo' in location.state &&
    typeof location.state.returnTo === 'string'
      ? location.state.returnTo
      : null;

  return (
    <div className="fixed inset-0 bg-warm-950 text-white flex flex-col">
      <TopBar backTo={returnTo ?? '/'} backLabel={returnTo ? 'Game' : 'Menu'} title="Settings" />
      <div className="flex-1 overflow-y-auto">
        <div className="w-full max-w-sm lg:max-w-md mx-auto p-3 lg:p-4 lg:mt-[15vh]">
          {/* Options */}
          <div className="flex flex-col gap-3 lg:gap-4">
            {/* Debug section */}
            <div className="w-full p-4 lg:p-5 rounded-xl border border-warm-700 bg-warm-900/30">
              <div className="font-bold text-base lg:text-lg text-white mb-3">Debug</div>
              <button
                onClick={toggleShowRawJson}
                className="w-full flex items-center justify-between p-3 rounded-lg border border-warm-700 hover:border-warm-600 transition-colors"
              >
                <div className="text-left">
                  <div className="text-sm text-warm-200">Show Raw JSON</div>
                  <div className="text-[10px] lg:text-xs text-warm-500 mt-0.5">
                    Display raw card and game state data
                  </div>
                </div>
                <div
                  className={`w-10 h-5 rounded-full transition-colors relative ${
                    showRawJson ? 'bg-yellow-500' : 'bg-warm-700'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                      showRawJson ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
