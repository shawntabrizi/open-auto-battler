import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useContractStore } from '../store/contractStore';
import { useMenuStore } from '../store/menuStore';
import { useShortcutHelpStore } from '../store/shortcutHelpStore';
import { useTutorialStore } from '../store/tutorialStore';
import { UI_LAYERS } from '../constants/uiLayers';
import { useFocusTrap } from '../hooks';
import { GAME_SHORTCUTS } from './GameKeyboardShortcuts';
import { GearIcon, CloseIcon } from './Icons';

function PaletteIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2C6.49 2 2 6.49 2 12s4.49 10 10 10c1.38 0 2.5-1.12 2.5-2.5 0-.61-.23-1.21-.64-1.67-.08-.1-.13-.21-.13-.33 0-.28.22-.5.5-.5H16c3.31 0 6-2.69 6-6 0-4.96-4.49-9-10-9zm5.5 11c-.83 0-1.5-.67-1.5-1.5S16.67 10 17.5 10s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
    </svg>
  );
}

function TutorialIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z" />
    </svg>
  );
}

function KeyboardIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M20 5H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V7a2 2 0 00-2-2zM8 9H6v2h2V9zm0 4H6v2h2v-2zm3-4H9v2h2V9zm0 4H9v2h2v-2zm3-4h-2v2h2V9zm0 4h-2v2h2v-2zm4 0h-3v2h3v-2zm0-4h-3v2h3V9z" />
    </svg>
  );
}

function HomeIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
    </svg>
  );
}

function AbandonIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
    </svg>
  );
}

const GAME_ROUTES = ['/contract/arena/game'];

function isGameRoute(pathname: string) {
  return GAME_ROUTES.includes(pathname);
}

const MENU_ITEMS = [
  { to: '/settings', icon: GearIcon, label: 'Settings' },
  { to: '/customize', icon: PaletteIcon, label: 'Customize' },
] as const;

/**
 * Global hamburger menu button + slide-out panel.
 * - Standard: Settings, Customize
 * - In-game: Settings, Tutorial, Keyboard Shortcuts, Return, Abandon
 */
export function HamburgerMenu() {
  const { isOpen: open } = useMenuStore();
  const setOpen = (v: boolean) =>
    v ? useMenuStore.getState().open() : useMenuStore.getState().close();
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { isConnected, abandonGame } = useContractStore();
  const openTutorial = useTutorialStore((s) => s.open);
  const openShortcutHelp = useShortcutHelpStore((s) => s.open);

  const inGame = isGameRoute(location.pathname);
  const menuItemClassName =
    'theme-button theme-surface-button mx-2 flex items-center gap-3 rounded-xl border px-4 py-3 text-base-200 transition-all hover:text-white';
  const dangerMenuItemClassName =
    'theme-button theme-danger-button mx-2 flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors';

  useFocusTrap({
    containerRef: panelRef,
    initialFocusSelector: '[data-menu-autofocus="true"]',
    isActive: open,
    onEscape: () => setOpen(false),
  });

  useEffect(() => {
    if (!open) setShowAbandonConfirm(false);
  }, [open]);

  const handleReturnToMenu = () => {
    setOpen(false);
    void navigate('/contract');
  };

  const handleAbandon = async () => {
    try {
      await abandonGame();
      setOpen(false);
      void navigate('/contract');
    } catch (err) {
      console.error('Abandon failed:', err);
    }
  };

  return (
    <>
      {open && (
        <div className="fixed inset-0" style={{ zIndex: UI_LAYERS.globalMenu }}>
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={() => setOpen(false)}
          />

          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={inGame ? 'Game Menu' : 'Menu'}
            tabIndex={-1}
            className="theme-panel absolute top-0 right-0 flex h-full w-72 animate-slide-in-right flex-col border-l border-base-700/70 bg-surface-mid/95 shadow-2xl backdrop-blur-md lg:w-80"
          >
            <div className="flex items-center justify-between border-b border-base-700/60 px-4 py-4">
              <Link
                to="/contract"
                onClick={() => setOpen(false)}
                className="font-heading text-sm tracking-widest uppercase text-base-200 hover:text-white transition-colors lg:text-base"
              >
                {inGame ? 'Game Menu' : 'Menu'}
              </Link>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="theme-button theme-surface-button rounded-lg border p-1.5 transition-colors"
              >
                <CloseIcon className="text-base-300 w-5 h-5" />
              </button>
            </div>

            {inGame ? (
              <>
                <nav className="flex-1 space-y-2 overflow-y-auto px-2 py-3">
                  <Link
                    to="/settings"
                    state={{ returnTo: location.pathname }}
                    data-menu-autofocus="true"
                    onClick={() => setOpen(false)}
                    className={`${menuItemClassName} w-full`}
                  >
                    <GearIcon className="text-accent w-5 h-5 transition-colors" />
                    <span className="font-button text-sm lg:text-base tracking-wide">Settings</span>
                  </Link>

                  <button
                    onClick={() => {
                      setOpen(false);
                      openTutorial('how-to-play');
                    }}
                    title={`Tutorial (${GAME_SHORTCUTS.tutorial})`}
                    aria-keyshortcuts={GAME_SHORTCUTS.tutorial}
                    className={`${menuItemClassName} w-full`}
                  >
                    <TutorialIcon className="text-accent w-5 h-5 transition-colors" />
                    <span className="font-button text-sm lg:text-base tracking-wide">Tutorial</span>
                  </button>

                  <button
                    onClick={() => {
                      setOpen(false);
                      openShortcutHelp();
                    }}
                    title={`Keyboard shortcuts (${GAME_SHORTCUTS.help})`}
                    aria-keyshortcuts={GAME_SHORTCUTS.help}
                    className={`${menuItemClassName} w-full`}
                  >
                    <KeyboardIcon className="text-accent w-5 h-5 transition-colors" />
                    <span className="font-button text-sm lg:text-base tracking-wide">
                      Keyboard Shortcuts
                    </span>
                  </button>

                  <button onClick={handleReturnToMenu} className={`${menuItemClassName} w-full`}>
                    <HomeIcon className="text-accent w-5 h-5 transition-colors" />
                    <span className="font-button text-sm lg:text-base tracking-wide">
                      Return to Menu
                    </span>
                  </button>
                </nav>

                <div className="border-t border-base-700/60 p-2">
                  {showAbandonConfirm ? (
                    <div className="theme-panel theme-error-panel rounded-xl border p-3 text-center">
                      <p className="text-base-300 text-sm mb-3">
                        Abandon this run? All progress will be lost.
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setShowAbandonConfirm(false)}
                          className="theme-button theme-surface-button flex-1 rounded-lg border px-3 py-2 text-sm font-bold transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => void handleAbandon()}
                          className="theme-button theme-danger-solid flex-1 rounded-lg border px-3 py-2 text-sm font-bold transition-colors"
                        >
                          Abandon
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowAbandonConfirm(true)}
                      className={`${dangerMenuItemClassName} w-full`}
                    >
                      <AbandonIcon className="text-negative w-5 h-5 transition-colors" />
                      <span className="font-button text-sm lg:text-base tracking-wide">
                        Abandon
                      </span>
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <nav className="flex-1 min-h-0 space-y-2 overflow-y-auto px-2 py-3">
                  {MENU_ITEMS.map(({ to, icon: Icon, label }) => (
                    <Link
                      key={to}
                      to={to}
                      state={{ returnTo: location.pathname }}
                      data-menu-autofocus={to === MENU_ITEMS[0].to ? 'true' : undefined}
                      onClick={() => setOpen(false)}
                      className={menuItemClassName}
                    >
                      <Icon className="text-accent w-5 h-5 transition-colors" />
                      <span className="font-button text-sm lg:text-base tracking-wide">
                        {label}
                      </span>
                    </Link>
                  ))}
                </nav>

                {isConnected && (
                  <div className="border-t border-base-700/60 px-4 py-3 shrink-0">
                    <div className="theme-panel rounded-xl border border-base-700/50 bg-base-900/30 px-4 py-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-positive opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-full w-full bg-positive"></span>
                        </span>
                        <span className="text-[10px] text-positive font-medium uppercase tracking-wider">
                          Connected
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
