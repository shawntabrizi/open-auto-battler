import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useMenuStore } from '../store/menuStore';
import { useContractStore } from '../store/contractStore';
import { useGameStore } from '../store/gameStore';

/** Three-line hamburger icon */
function MenuIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
    </svg>
  );
}

interface TopBarProps {
  /** Route to navigate back to. Omit to hide the back button. */
  backTo?: string;
  /** Router state passed with the back link */
  backState?: unknown;
  /** Label for the back button */
  backLabel?: string;
  /** Page title — centered in the bar. Omit to leave empty. */
  title?: string;
  /** Whether to offset for the card detail panel on the left */
  hasCardPanel?: boolean;
}

export function TopBar({
  backTo,
  backState,
  backLabel = 'Back',
  title,
  hasCardPanel = false,
}: TopBarProps) {
  const location = useLocation();
  const openMenu = useMenuStore((s) => s.open);
  const selectedAccount = useContractStore((s) => s.selectedAccount);
  const isConnected = useContractStore((s) => s.isConnected);
  const showAddress = useGameStore((s) => s.showAddress);
  const [copied, setCopied] = useState(false);

  // If the caller navigated here with returnTo state (e.g. from hamburger menu),
  // use that as the back destination instead of the hardcoded backTo prop.
  const returnTo =
    !backState &&
    location.state &&
    typeof location.state === 'object' &&
    'returnTo' in location.state &&
    typeof location.state.returnTo === 'string'
      ? (location.state.returnTo as string)
      : null;

  const effectiveBackTo = returnTo ?? backTo;
  const effectiveBackLabel = returnTo ? 'Back' : backLabel;

  return (
    <div
      className={`relative flex items-center justify-between px-3 lg:px-6 h-12 lg:h-16 bg-base-950/90 border-b border-base-800/60 shrink-0 ${
        hasCardPanel ? 'ml-44 lg:ml-80' : ''
      }`}
    >
      {/* Left: Back button or signed-in info */}
      {effectiveBackTo ? (
        <Link
          to={effectiveBackTo}
          state={returnTo ? undefined : backState}
          className="theme-button theme-surface-button inline-flex items-center gap-1 px-2.5 py-1.5 lg:px-3 lg:py-2 rounded-lg border text-xs lg:text-sm shrink-0 z-10 transition-colors"
        >
          <span>&larr;</span>
          <span>{effectiveBackLabel}</span>
        </Link>
      ) : selectedAccount && isConnected ? (
        <span className="inline-flex items-center gap-1.5 lg:gap-2 text-xs lg:text-sm text-base-300 z-10 min-w-0">
          <span className="relative flex h-2 w-2 lg:h-2.5 lg:w-2.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-positive opacity-75"></span>
            <span className="relative inline-flex rounded-full h-full w-full bg-positive"></span>
          </span>
          <span className="flex flex-col leading-tight min-w-0">
            <span>
              Signed in as{' '}
              <span className="text-white font-medium">{selectedAccount.name || 'Unknown'}</span>
            </span>
            {showAddress && (
              <span
                className="text-base-500 text-[9px] lg:text-xs font-mono break-all cursor-pointer hover:text-base-300 transition-colors"
                onClick={() => {
                  void navigator.clipboard.writeText(selectedAccount.address);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                title="Click to copy"
              >
                {copied ? 'Copied!' : selectedAccount.address}
              </span>
            )}
          </span>
        </span>
      ) : (
        <div />
      )}

      {/* Center: Title */}
      {title && (
        <h1 className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="theme-title-text text-sm lg:text-xl font-decorative font-bold tracking-wide text-transparent bg-clip-text truncate px-24 lg:px-32">
            {title}
          </span>
        </h1>
      )}

      {/* Right: Hamburger trigger */}
      <button
        onClick={openMenu}
        aria-label="Open menu"
        className="theme-button theme-surface-button p-2 rounded-lg border transition-colors shrink-0 z-10"
      >
        <MenuIcon className="w-4 h-4 lg:w-5 lg:h-5" />
      </button>
    </div>
  );
}
