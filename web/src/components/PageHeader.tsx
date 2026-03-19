import { TopLeftBack } from './TopLeftButton';

/** Height spacer to clear the fixed top-left button */
const BACK_BUTTON_SPACER = 'pt-10 lg:pt-12';

interface PageHeaderProps {
  /** Route to navigate back to */
  backTo: string;
  /** Optional router state passed with the back link */
  backState?: unknown;
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
}

/**
 * Page header with a fixed top-left back button and page title.
 * The back button is positioned in the top-left corner (SAP-style).
 * Includes top padding to clear the fixed button.
 */
export function PageHeader({
  backTo,
  backState,
  backLabel = 'Menu',
  title,
  subtitle,
  right,
  titleGradient,
}: PageHeaderProps) {
  return (
    <>
      <TopLeftBack to={backTo} state={backState} label={backLabel} />
      <div className={`${BACK_BUTTON_SPACER} mb-4 lg:mb-8`}>
        <h1
          className={`text-xl lg:text-3xl font-black ${
            titleGradient
              ? `text-transparent bg-clip-text bg-gradient-to-r ${titleGradient}`
              : 'text-white'
          }`}
        >
          {title}
        </h1>
        {subtitle && <p className="text-warm-500 text-xs lg:text-sm mt-0.5">{subtitle}</p>}
        {right && <div className="mt-2 flex items-center gap-3">{right}</div>}
      </div>
    </>
  );
}

/**
 * Standalone back button for use in custom layouts.
 * Renders as a fixed top-left button (SAP-style).
 */
export function BackLink({
  to,
  state,
  label = 'Menu',
}: {
  to: string;
  state?: unknown;
  label?: string;
}) {
  return <TopLeftBack to={to} state={state} label={label} />;
}

/**
 * Spacer div to push content below the fixed back button.
 * Use this after BackLink in custom layouts.
 */
export function BackLinkSpacer() {
  return <div className={BACK_BUTTON_SPACER} />;
}
