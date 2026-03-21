import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useMenuStore } from '../store/menuStore';
import { useArenaStore } from '../store/arenaStore';
import { useGameStore } from '../store/gameStore';

const formatBalance = (raw: bigint, decimals = 12) =>
  (Number(raw) / Math.pow(10, decimals)).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });

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

/**
 * Standard top navigation bar.
 *
 * Layout: [← Back] .........[Title]......... [☰ Hamburger]
 *
 * - Back button: left-aligned (optional)
 * - Title: centered absolutely (optional)
 * - Hamburger: right-aligned, opens the global slide-out menu
 * - hasCardPanel: adds left margin to clear the card detail panel
 */
export function TopBar({
  backTo,
  backState,
  backLabel = 'Back',
  title,
  hasCardPanel = false,
}: TopBarProps) {
  const openMenu = useMenuStore((s) => s.open);
  const selectedAccount = useArenaStore((s) => s.selectedAccount);
  const isConnected = useArenaStore((s) => s.isConnected);
  const isLoggedIn = useArenaStore((s) => s.isLoggedIn);
  const showAddress = useGameStore((s) => s.showAddress);
  const showBalance = useGameStore((s) => s.showBalance);
  const getAccountBalance = useArenaStore((s) => s.getAccountBalance);
  const fundSelectedAccount = useArenaStore((s) => s.fundSelectedAccount);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [showFundPopup, setShowFundPopup] = useState(false);
  const [isFunding, setIsFunding] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchBalance = useCallback(async () => {
    if (!selectedAccount || !isConnected) {
      setBalance(null);
      return;
    }
    try {
      const bal = await getAccountBalance(selectedAccount.address);
      setBalance(bal);
    } catch {
      setBalance(null);
    }
  }, [selectedAccount, isConnected, getAccountBalance]);

  useEffect(() => {
    void fetchBalance();
  }, [fetchBalance]);

  // Show fund popup when logged in with zero balance
  useEffect(() => {
    if (isLoggedIn && balance !== null && balance === BigInt(0)) {
      setShowFundPopup(true);
    } else {
      setShowFundPopup(false);
    }
  }, [isLoggedIn, balance]);

  const handleFund = async () => {
    setIsFunding(true);
    try {
      await fundSelectedAccount();
      await fetchBalance();
    } finally {
      setIsFunding(false);
      setShowFundPopup(false);
    }
  };

  return (
    <div
      className={`relative flex items-center justify-between px-3 lg:px-6 h-12 lg:h-16 bg-base-950/90 border-b border-base-800/60 shrink-0 ${
        hasCardPanel ? 'ml-44 lg:ml-80' : ''
      }`}
    >
      {/* Left: Back button or signed-in info */}
      {backTo ? (
        <Link
          to={backTo}
          state={backState}
          className="theme-button theme-surface-button inline-flex items-center gap-1 px-2.5 py-1.5 lg:px-3 lg:py-2 rounded-lg border text-xs lg:text-sm shrink-0 z-10 transition-colors"
        >
          <span>&larr;</span>
          <span>{backLabel}</span>
        </Link>
      ) : selectedAccount && isLoggedIn ? (
        <span className="inline-flex items-center gap-1.5 lg:gap-2 text-xs lg:text-sm text-base-300 z-10 min-w-0">
          <span className="relative flex h-2 w-2 lg:h-2.5 lg:w-2.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-positive opacity-75"></span>
            <span className="relative inline-flex rounded-full h-full w-full bg-positive"></span>
          </span>
          <span className="flex flex-col leading-tight min-w-0">
            <span>
              Signed in as{' '}
              <span className="text-white font-medium">{selectedAccount.name || 'Unknown'}</span>
              {showBalance && balance !== null && (
                <span className="text-base-400"> ({formatBalance(balance)})</span>
              )}
            </span>
            {showAddress && (
              <span
                className="text-base-500 text-[9px] lg:text-xs font-mono break-all cursor-pointer hover:text-base-300 transition-colors"
                onClick={() => {
                  navigator.clipboard.writeText(selectedAccount.address);
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

      {/* Zero balance fund popup */}
      {showFundPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="theme-panel bg-base-900 border border-base-700 rounded-xl p-6 lg:p-8 max-w-md lg:max-w-lg mx-4 text-center shadow-xl">
            <h3 className="text-lg lg:text-xl font-heading font-bold text-white mb-1">
              Account Balance: 0
            </h3>
            <p className="text-sm text-white font-medium">{selectedAccount?.name || 'Unknown'}</p>
            <p className="text-[10px] lg:text-xs text-base-500 font-mono break-all mb-4">
              {selectedAccount?.address}
            </p>
            <p className="text-sm text-base-400 mb-5">
              Your account has zero balance. Fund it to start playing.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setShowFundPopup(false)}
                className="theme-button theme-surface-button px-4 py-2 rounded-lg border transition-colors text-sm"
              >
                Dismiss
              </button>
              <button
                onClick={handleFund}
                disabled={isFunding}
                className="theme-button btn-primary px-6 py-2 rounded-lg font-bold text-sm transition-colors disabled:opacity-50"
              >
                {isFunding ? 'Funding...' : 'Fund Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
