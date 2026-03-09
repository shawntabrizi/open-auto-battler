import { Link } from 'react-router-dom';

interface PageHeaderProps {
  /** Route to navigate back to */
  backTo: string;
  /** Label for the back link (e.g., "Menu", "Settings") */
  backLabel?: string;
  /** Page title */
  title: string;
  /** Optional subtitle */
  subtitle?: string;
  /** Right-side content (action buttons, links, etc.) */
  right?: React.ReactNode;
  /** Title gradient colors - defaults to yellow-to-orange */
  titleGradient?: string;
  /** Use toolbar style (horizontal bar with border-bottom) vs stacked style */
  variant?: 'stacked' | 'toolbar';
}

/**
 * Consistent page header with back navigation.
 *
 * Two variants:
 * - `stacked` (default): Back link above title, for centered content pages
 * - `toolbar`: Horizontal bar, for tool/editor pages
 */
export function PageHeader({
  backTo,
  backLabel = 'Menu',
  title,
  subtitle,
  right,
  titleGradient,
  variant = 'stacked',
}: PageHeaderProps) {
  const backElement = (
    <Link
      to={backTo}
      className="inline-flex items-center gap-1 text-warm-400 hover:text-warm-200 transition-colors text-xs lg:text-sm shrink-0"
    >
      <span>&larr;</span>
      <span>{backLabel}</span>
    </Link>
  );

  if (variant === 'toolbar') {
    return (
      <div className="flex-shrink-0 bg-warm-900 border-b border-warm-700 px-3 lg:px-4 py-2 lg:py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {backElement}
          <h1
            className={`text-sm lg:text-lg font-bold truncate ${
              titleGradient
                ? `text-transparent bg-clip-text bg-gradient-to-r ${titleGradient}`
                : 'text-gold'
            }`}
          >
            {title}
          </h1>
        </div>
        {right && <div className="flex items-center gap-2 lg:gap-3 shrink-0">{right}</div>}
      </div>
    );
  }

  // Stacked variant
  return (
    <div className="mb-4 lg:mb-8">
      {backElement}
      <h1
        className={`text-xl lg:text-3xl font-black mt-1 ${
          titleGradient
            ? `text-transparent bg-clip-text bg-gradient-to-r ${titleGradient}`
            : 'text-white'
        }`}
      >
        {title}
      </h1>
      {subtitle && (
        <p className="text-warm-500 text-xs lg:text-sm mt-0.5">{subtitle}</p>
      )}
      {right && <div className="mt-2 flex items-center gap-3">{right}</div>}
    </div>
  );
}

/**
 * Standalone back link for use in custom layouts.
 */
export function BackLink({
  to,
  label = 'Menu',
}: {
  to: string;
  label?: string;
}) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1 text-warm-400 hover:text-warm-200 transition-colors text-xs lg:text-sm"
    >
      <span>&larr;</span>
      <span>{label}</span>
    </Link>
  );
}
