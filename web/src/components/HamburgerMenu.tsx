import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useBlockchainStore } from '../store/blockchainStore';
import { GearIcon, CloseIcon } from './Icons';

/** Three-line hamburger icon */
function MenuIcon({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
    </svg>
  );
}

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

const MENU_ITEMS = [
  { to: '/settings', icon: GearIcon, label: 'Settings' },
  { to: '/account', icon: PersonIcon, label: 'Account' },
  { to: '/network', icon: NetworkIcon, label: 'Network' },
  { to: '/shop', icon: ShopIcon, label: 'Shop' },
] as const;

/**
 * Global hamburger menu button + slide-out panel.
 * Accessible from every page, inspired by SAP's "corner sandwich menu".
 */
export function HamburgerMenu() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const { isConnected, logout } = useBlockchainStore();

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Focus trap: return focus to button on close
  useEffect(() => {
    if (!open) {
      buttonRef.current?.focus();
    }
  }, [open]);

  const handleLogout = () => {
    logout();
    setOpen(false);
    navigate('/');
  };

  return (
    <>
      {/* Hamburger button — fixed top-right corner */}
      <button
        ref={buttonRef}
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="fixed top-3 right-3 lg:top-4 lg:right-4 z-[100] p-2 rounded-lg bg-warm-900/80 border border-warm-700/60 text-warm-400 hover:text-white hover:border-warm-500 transition-colors backdrop-blur-sm"
      >
        <MenuIcon className="w-5 h-5 lg:w-6 lg:h-6" />
      </button>

      {/* Backdrop + Panel */}
      {open && (
        <div className="fixed inset-0 z-[200]">
          {/* Dark backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={() => setOpen(false)}
          />

          {/* Slide-out panel from right */}
          <div
            ref={panelRef}
            className="absolute top-0 right-0 h-full w-72 lg:w-80 bg-warm-950 border-l border-warm-800 shadow-2xl flex flex-col animate-slide-in-right"
          >
            {/* Panel header */}
            <div className="flex items-center justify-between p-4 border-b border-warm-800">
              <span className="font-heading text-sm lg:text-base tracking-widest uppercase text-warm-300">
                Menu
              </span>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="p-1.5 rounded-lg text-warm-500 hover:text-white hover:bg-warm-800 transition-colors"
              >
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Menu items */}
            <nav className="flex-1 py-2">
              {MENU_ITEMS.map(({ to, icon: Icon, label }) => (
                <Link
                  key={to}
                  to={to}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-5 py-3.5 text-warm-300 hover:text-white hover:bg-warm-800/50 transition-colors group"
                >
                  <Icon className="w-5 h-5 text-warm-500 group-hover:text-warm-300 transition-colors" />
                  <span className="font-heading text-sm lg:text-base tracking-wide">{label}</span>
                </Link>
              ))}
            </nav>

            {/* Logout at bottom */}
            <div className="border-t border-warm-800 p-2">
              <button
                onClick={handleLogout}
                className="flex items-center gap-3 w-full px-5 py-3.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors group"
              >
                <LogoutIcon className="w-5 h-5 text-red-500/70 group-hover:text-red-400 transition-colors" />
                <span className="font-heading text-sm lg:text-base tracking-wide">Log Out</span>
                {isConnected && (
                  <span className="ml-auto text-[10px] text-warm-600">connected</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
