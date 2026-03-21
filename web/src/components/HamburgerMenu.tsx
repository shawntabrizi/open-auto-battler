import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useArenaStore } from '../store/arenaStore';
import { useGameStore } from '../store/gameStore';
import { useMenuStore } from '../store/menuStore';
import { useSettingsStore } from '../store/settingsStore';
import { useShortcutHelpStore } from '../store/shortcutHelpStore';
import { useTutorialStore } from '../store/tutorialStore';
import { UI_LAYERS } from '../constants/uiLayers';
import { useFocusTrap } from '../hooks';
import { GAME_SHORTCUTS } from './GameKeyboardShortcuts';
import { GearIcon, CloseIcon } from './Icons';

/** Person icon for account */
function PersonIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
    </svg>
  );
}

/** Shopping bag icon */
function ShopIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1.003 1.003 0 0020 4H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z" />
    </svg>
  );
}

/** Logout / exit icon */
function LogoutIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
    </svg>
  );
}

/** Network / globe icon */
function NetworkIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
    </svg>
  );
}

/** Lightbulb icon for tutorial */
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

/** Home / return icon */
function HomeIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
    </svg>
  );
}

/** Warning / abandon icon */
function AbandonIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
    </svg>
  );
}

function CreatorIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
    </svg>
  );
}

// Routes that are considered "in-game" (shop/battle phase)
const GAME_ROUTES = ['/practice/game', '/arena/game', '/tournament/game', '/versus/game'];

function isGameRoute(pathname: string) {
  return GAME_ROUTES.includes(pathname);
}

const MENU_ITEMS = [
  { to: '/settings', icon: GearIcon, label: 'Settings' },
  { to: '/account', icon: PersonIcon, label: 'Account' },
  { to: '/network', icon: NetworkIcon, label: 'Network' },
  { to: '/marketplace', icon: ShopIcon, label: 'Marketplace' },
  { to: '/creator', icon: CreatorIcon, label: 'Creator Studio' },
] as const;

/**
 * Global hamburger menu button + slide-out panel.
 * Shows different items depending on context:
 * - Standard menu: Settings, Account, Network, Shop, Log Out
 * - In-game menu: Settings, Tutorial, Return to Menu, Abandon
 */
export function HamburgerMenu() {
  const { isOpen: open } = useMenuStore();
  const setOpen = (v: boolean) =>
    v ? useMenuStore.getState().open() : useMenuStore.getState().close();
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { isConnected, logout, abandonGame, blockNumber } = useArenaStore();
  const { newRun } = useGameStore();
  const endpoint = useSettingsStore((s) => s.endpoint);
  const openTutorial = useTutorialStore((s) => s.open);
  const openShortcutHelp = useShortcutHelpStore((s) => s.open);

  const inGame = isGameRoute(location.pathname);
  const menuItemClassName =
    'theme-button theme-surface-button mx-2 flex items-center gap-3 rounded-xl border px-4 py-3 text-warm-200 transition-all hover:text-white';
  const dangerMenuItemClassName =
    'theme-button mx-2 flex items-center gap-3 rounded-xl border border-red-900/50 bg-red-950/20 px-4 py-3 text-red-400 transition-colors hover:border-red-700/70 hover:bg-red-900/30 hover:text-red-300';

  useFocusTrap({
    containerRef: panelRef,
    initialFocusSelector: '[data-menu-autofocus="true"]',
    isActive: open,
    onEscape: () => setOpen(false),
  });

  // Reset abandon confirm when panel closes
  useEffect(() => {
    if (!open) setShowAbandonConfirm(false);
  }, [open]);

  const handleLogout = () => {
    logout();
    setOpen(false);
    void navigate('/');
  };

  const handleReturnToMenu = () => {
    setOpen(false);
    void navigate('/');
  };

  const handleAbandon = async () => {
    try {
      if (location.pathname === '/arena/game' || location.pathname === '/tournament/game') {
        await abandonGame();
      } else {
        newRun();
      }
      setOpen(false);
      void navigate('/');
    } catch (err) {
      console.error('Abandon failed:', err);
    }
  };

  return (
    <>
      {/* Backdrop + Panel */}
      {open && (
        <div className="fixed inset-0" style={{ zIndex: UI_LAYERS.globalMenu }}>
          {/* Dark backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={() => setOpen(false)}
          />

          {/* Slide-out panel from right */}
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={inGame ? 'Game Menu' : 'Menu'}
            tabIndex={-1}
            className="theme-panel absolute top-0 right-0 flex h-full w-72 animate-slide-in-right flex-col border-l border-warm-700/70 bg-surface-mid/95 shadow-2xl backdrop-blur-md lg:w-80"
          >
            {/* Panel header */}
            <div className="flex items-center justify-between border-b border-warm-700/60 px-4 py-4">
              <span className="font-heading text-sm tracking-widest uppercase text-warm-200 lg:text-base">
                {inGame ? 'Game Menu' : 'Menu'}
              </span>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="theme-button theme-surface-button rounded-lg border p-1.5 transition-colors"
              >
                <CloseIcon className="theme-icon-muted w-5 h-5" />
              </button>
            </div>

            {inGame ? (
              <>
                {/* In-game menu items */}
                <nav className="flex-1 space-y-2 overflow-y-auto px-2 py-3">
                  <Link
                    to="/settings"
                    state={{ returnTo: location.pathname }}
                    data-menu-autofocus="true"
                    onClick={() => setOpen(false)}
                    className={menuItemClassName}
                  >
                    <GearIcon className="theme-icon-accent w-5 h-5 transition-colors" />
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
                    <TutorialIcon className="theme-icon-accent w-5 h-5 transition-colors" />
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
                    <KeyboardIcon className="theme-icon-accent w-5 h-5 transition-colors" />
                    <span className="font-button text-sm lg:text-base tracking-wide">
                      Keyboard Shortcuts
                    </span>
                  </button>

                  <button onClick={handleReturnToMenu} className={`${menuItemClassName} w-full`}>
                    <HomeIcon className="theme-icon-accent w-5 h-5 transition-colors" />
                    <span className="font-button text-sm lg:text-base tracking-wide">
                      Return to Menu
                    </span>
                  </button>
                </nav>

                {/* Abandon at bottom */}
                <div className="border-t border-warm-700/60 p-2">
                  {showAbandonConfirm ? (
                    <div className="theme-panel rounded-xl border border-red-900/40 bg-red-950/20 p-3 text-center">
                      <p className="text-warm-300 text-sm mb-3">
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
                          className="theme-button flex-1 rounded-lg border border-red-700 bg-red-900/50 px-3 py-2 text-sm font-bold text-red-300 transition-colors hover:bg-red-900/70"
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
                      <AbandonIcon className="theme-icon-defeat w-5 h-5 transition-colors" />
                      <span className="font-button text-sm lg:text-base tracking-wide">
                        Abandon
                      </span>
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* Standard menu items */}
                <nav className="flex-1 min-h-0 space-y-2 overflow-y-auto px-2 py-3">
                  {MENU_ITEMS.map(({ to, icon: Icon, label }) => (
                    <Link
                      key={to}
                      to={to}
                      data-menu-autofocus={to === MENU_ITEMS[0].to ? 'true' : undefined}
                      onClick={() => setOpen(false)}
                      className={menuItemClassName}
                    >
                      <Icon className="theme-icon-accent w-5 h-5 transition-colors" />
                      <span className="font-button text-sm lg:text-base tracking-wide">
                        {label}
                      </span>
                    </Link>
                  ))}
                </nav>

                {/* Network status */}
                {isConnected && (
                  <div className="border-t border-warm-700/60 px-4 py-3 shrink-0">
                    <div className="theme-panel rounded-xl border border-warm-700/50 bg-warm-900/30 px-4 py-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-full w-full bg-emerald-500"></span>
                        </span>
                        <span className="text-[10px] text-emerald-400 font-medium uppercase tracking-wider">
                          Connected
                        </span>
                      </div>
                      <div className="text-[10px] text-warm-500 font-mono truncate">{endpoint}</div>
                      {blockNumber != null && (
                        <div className="text-[10px] text-warm-500">
                          Block #{blockNumber.toLocaleString()}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Logout at bottom */}
                <div className="border-t border-warm-700/60 p-2 shrink-0">
                  <button onClick={handleLogout} className={`${dangerMenuItemClassName} w-full`}>
                    <LogoutIcon className="theme-icon-defeat w-5 h-5 transition-colors" />
                    <span className="font-button text-sm lg:text-base tracking-wide">Log Out</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
