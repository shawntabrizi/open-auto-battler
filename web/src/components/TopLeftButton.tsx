import { Link } from 'react-router-dom';

interface TopLeftButtonProps {
  /** Route to navigate to (renders as Link) */
  to?: string;
  /** Router state */
  state?: unknown;
  /** Click handler (renders as button) */
  onClick?: () => void;
  /** Button content — defaults to back arrow */
  children?: React.ReactNode;
  /** Additional classes */
  className?: string;
}

/**
 * Fixed top-left corner button, inspired by SAP's corner button pattern.
 * Used for "Back" navigation or contextual actions like "Save".
 * Positioned to mirror the hamburger menu in the top-right.
 */
export function TopLeftButton({
  to,
  state,
  onClick,
  children,
  className = '',
}: TopLeftButtonProps) {
  const baseClass = `fixed top-3 left-3 lg:top-4 lg:left-4 z-[90] px-3 py-1.5 lg:px-4 lg:py-2 rounded-lg bg-warm-900/80 border border-warm-700/60 text-warm-300 hover:text-white hover:border-warm-500 transition-colors backdrop-blur-sm font-heading text-xs lg:text-sm tracking-wide ${className}`;

  if (to) {
    return (
      <Link to={to} state={state} className={baseClass}>
        {children ?? <span>&larr;</span>}
      </Link>
    );
  }

  return (
    <button onClick={onClick} className={baseClass}>
      {children ?? <span>&larr;</span>}
    </button>
  );
}

/**
 * Convenience: fixed top-left back button with arrow and label.
 */
export function TopLeftBack({
  to,
  state,
  label = 'Back',
}: {
  to: string;
  state?: unknown;
  label?: string;
}) {
  return (
    <TopLeftButton to={to} state={state}>
      <span className="inline-flex items-center gap-1">
        <span>&larr;</span>
        <span>{label}</span>
      </span>
    </TopLeftButton>
  );
}
