import { useLocation } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { useThemeStore } from '../store/themeStore';
import { THEME_OPTIONS } from '../theme/themes';
import { TopBar } from './TopBar';

// ── Settings Hub ──

export function SettingsPage() {
  const location = useLocation();
  const selectedThemeId = useThemeStore((state) => state.selectedThemeId);
  const setTheme = useThemeStore((state) => state.setTheme);
  const {
    showRawJson,
    toggleShowRawJson,
    showCardNames,
    toggleShowCardNames,
    showGameCardDetailsPanel,
    toggleShowGameCardDetailsPanel,
    showBoardHelper,
    toggleShowBoardHelper,
    showAddress,
    toggleShowAddress,
    showBalance,
    toggleShowBalance,
    defaultBattleSpeed,
    setDefaultBattleSpeed,
    reducedAnimations,
    toggleReducedAnimations,
  } = useGameStore();
  const returnTo =
    location.state &&
    typeof location.state === 'object' &&
    'returnTo' in location.state &&
    typeof location.state.returnTo === 'string'
      ? location.state.returnTo
      : null;

  return (
    <div className="app-shell fixed inset-0 text-white flex flex-col">
      <TopBar backTo={returnTo ?? '/'} backLabel={returnTo ? 'Game' : 'Menu'} title="Settings" />
      <div className="flex-1 overflow-y-auto">
        <div className="w-full max-w-sm lg:max-w-md mx-auto p-3 lg:p-4 lg:mt-[4vh]">
          {/* Options */}
          <div className="flex flex-col gap-3 lg:gap-4">
            {/* Display section */}
            <div className="theme-panel w-full p-4 lg:p-5 rounded-xl border border-base-700 bg-base-900/30">
              <div className="font-bold text-base lg:text-lg text-white mb-3">Display</div>
              <div className="theme-panel p-3 rounded-lg border border-base-700 mb-2">
                <div className="text-left mb-2">
                  <div className="text-sm text-base-200">Theme</div>
                  <div className="text-[10px] lg:text-xs text-base-500 mt-0.5">
                    Switch between the built-in warm, cyberpunk, and pastel themes.
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {THEME_OPTIONS.map((theme) => (
                    <button
                      key={theme.id}
                      onClick={() => setTheme(theme.id)}
                      aria-pressed={selectedThemeId === theme.id}
                      className={`theme-button px-2 py-2 text-xs lg:text-sm font-medium rounded-md transition-colors border ${
                        selectedThemeId === theme.id
                          ? 'theme-selected-button'
                          : 'bg-base-800 text-base-300 border-base-700 hover:bg-base-700'
                      }`}
                    >
                      {theme.label}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={toggleShowCardNames}
                className="theme-button w-full flex items-start justify-between gap-3 p-3 rounded-lg border border-base-700 hover:border-base-600 transition-colors"
              >
                <div className="flex-1 min-w-0 text-left">
                  <div className="text-sm text-base-200">Show Card Names</div>
                  <div className="text-[10px] lg:text-xs text-base-500 mt-0.5">
                    Display card names on unit cards
                  </div>
                </div>
                <div
                  className={`w-10 h-5 shrink-0 rounded-full transition-colors relative ${
                    showCardNames ? 'theme-toggle-active' : 'bg-base-700'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                      showCardNames ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </div>
              </button>
              <button
                onClick={toggleShowGameCardDetailsPanel}
                className="theme-button w-full flex items-start justify-between gap-3 p-3 rounded-lg border border-base-700 hover:border-base-600 transition-colors mt-2"
              >
                <div className="flex-1 min-w-0 text-left">
                  <div className="text-sm text-base-200">Show Game Card Details Panel</div>
                  <div className="text-[10px] lg:text-xs text-base-500 mt-0.5">
                    Keep the pinned card details sidebar visible during games. Use I to inspect
                    cards when it is hidden.
                  </div>
                </div>
                <div
                  className={`w-10 h-5 shrink-0 rounded-full transition-colors relative ${
                    showGameCardDetailsPanel ? 'theme-toggle-active' : 'bg-base-700'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                      showGameCardDetailsPanel ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </div>
              </button>
              <button
                onClick={toggleShowBoardHelper}
                className="theme-button w-full flex items-start justify-between gap-3 p-3 rounded-lg border border-base-700 hover:border-base-600 transition-colors mt-2"
              >
                <div className="flex-1 min-w-0 text-left">
                  <div className="text-sm text-base-200">Show Board Helper</div>
                  <div className="text-[10px] lg:text-xs text-base-500 mt-0.5">
                    Show the in-game board action hint above the battlefield.
                  </div>
                </div>
                <div
                  className={`w-10 h-5 shrink-0 rounded-full transition-colors relative ${
                    showBoardHelper ? 'theme-toggle-active' : 'bg-base-700'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                      showBoardHelper ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </div>
              </button>
              <button
                onClick={toggleShowAddress}
                className="theme-button w-full flex items-start justify-between gap-3 p-3 rounded-lg border border-base-700 hover:border-base-600 transition-colors mt-2"
              >
                <div className="flex-1 min-w-0 text-left">
                  <div className="text-sm text-base-200">Show Address</div>
                  <div className="text-[10px] lg:text-xs text-base-500 mt-0.5">
                    Display wallet address in the top bar
                  </div>
                </div>
                <div
                  className={`w-10 h-5 shrink-0 rounded-full transition-colors relative ${
                    showAddress ? 'theme-toggle-active' : 'bg-base-700'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                      showAddress ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </div>
              </button>
              <button
                onClick={toggleShowBalance}
                className="theme-button w-full flex items-start justify-between gap-3 p-3 rounded-lg border border-base-700 hover:border-base-600 transition-colors mt-2"
              >
                <div className="flex-1 min-w-0 text-left">
                  <div className="text-sm text-base-200">Show Balance</div>
                  <div className="text-[10px] lg:text-xs text-base-500 mt-0.5">
                    Display account balance in the top bar
                  </div>
                </div>
                <div
                  className={`w-10 h-5 shrink-0 rounded-full transition-colors relative ${
                    showBalance ? 'theme-toggle-active' : 'bg-base-700'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                      showBalance ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </div>
              </button>
            </div>

            {/* Battle section */}
            <div className="theme-panel w-full p-4 lg:p-5 rounded-xl border border-base-700 bg-base-900/30">
              <div className="font-bold text-base lg:text-lg text-white mb-3">Battle</div>
              {/* Default battle speed */}
              <div className="theme-panel p-3 rounded-lg border border-base-700">
                <div className="text-left mb-2">
                  <div className="text-sm text-base-200">Default Battle Speed</div>
                  <div className="text-[10px] lg:text-xs text-base-500 mt-0.5">
                    Starting playback speed for battles
                  </div>
                </div>
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4, 5].map((speed) => (
                    <button
                      key={speed}
                      onClick={() => setDefaultBattleSpeed(speed)}
                      className={`theme-button flex-1 px-2 py-1.5 text-xs lg:text-sm font-medium rounded-md transition-colors ${
                        defaultBattleSpeed === speed
                          ? 'theme-selected-button'
                          : 'bg-base-800 text-base-300 hover:bg-base-700'
                      }`}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>
              </div>
              {/* Reduced animations */}
              <button
                onClick={toggleReducedAnimations}
                className="theme-button w-full flex items-start justify-between gap-3 p-3 rounded-lg border border-base-700 hover:border-base-600 transition-colors mt-2"
              >
                <div className="flex-1 min-w-0 text-left">
                  <div className="text-sm text-base-200">Reduced Animations</div>
                  <div className="text-[10px] lg:text-xs text-base-500 mt-0.5">
                    Disable clash bumps and screen shake
                  </div>
                </div>
                <div
                  className={`w-10 h-5 shrink-0 rounded-full transition-colors relative ${
                    reducedAnimations ? 'theme-toggle-active' : 'bg-base-700'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                      reducedAnimations ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </div>
              </button>
            </div>

            {/* Debug section */}
            <div className="theme-panel w-full p-4 lg:p-5 rounded-xl border border-base-700 bg-base-900/30">
              <div className="font-bold text-base lg:text-lg text-white mb-3">Debug</div>
              <button
                onClick={toggleShowRawJson}
                className="theme-button w-full flex items-start justify-between gap-3 p-3 rounded-lg border border-base-700 hover:border-base-600 transition-colors"
              >
                <div className="flex-1 min-w-0 text-left">
                  <div className="text-sm text-base-200">Show Raw JSON</div>
                  <div className="text-[10px] lg:text-xs text-base-500 mt-0.5">
                    Display raw card and game state data
                  </div>
                </div>
                <div
                  className={`w-10 h-5 shrink-0 rounded-full transition-colors relative ${
                    showRawJson ? 'theme-toggle-active' : 'bg-base-700'
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
