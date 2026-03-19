import { Link } from 'react-router-dom';
import { useMenuStore } from '../store/menuStore';

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

  return (
    <div
      className={`relative flex items-center justify-between px-3 lg:px-6 h-12 lg:h-16 bg-warm-950/90 border-b border-warm-800/60 shrink-0 ${
        hasCardPanel ? 'ml-44 lg:ml-80' : ''
      }`}
    >
      {/* Left: Back button */}
      {backTo ? (
        <Link
          to={backTo}
          state={backState}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 lg:px-3 lg:py-2 rounded-lg bg-warm-900/80 border border-warm-700/60 text-warm-300 hover:text-white hover:border-warm-500 transition-colors text-xs lg:text-sm shrink-0 z-10"
        >
          <span>&larr;</span>
          <span>{backLabel}</span>
        </Link>
      ) : (
        <div />
      )}

      {/* Center: Title */}
      {title && (
        <h1 className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-sm lg:text-xl font-heading font-bold tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500 truncate px-24 lg:px-32">
            {title}
          </span>
        </h1>
      )}

      {/* Right: Hamburger trigger */}
      <button
        onClick={openMenu}
        aria-label="Open menu"
        className="p-2 rounded-lg bg-warm-900/80 border border-warm-700/60 text-warm-400 hover:text-white hover:border-warm-500 transition-colors shrink-0 z-10"
      >
        <MenuIcon className="w-4 h-4 lg:w-5 lg:h-5" />
      </button>
    </div>
  );
}
