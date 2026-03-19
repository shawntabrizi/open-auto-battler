import { CloseIcon } from './Icons';

interface TopRightCloseProps {
  onClick: () => void;
  label?: string;
}

/**
 * Fixed top-right close button, positioned just left of the hamburger menu.
 * Same size and style as the hamburger to form a consistent pair.
 */
export function TopRightClose({ onClick, label = 'Close' }: TopRightCloseProps) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="fixed top-3 right-14 lg:top-4 lg:right-16 z-[100] p-2 rounded-lg bg-warm-900/80 border border-warm-700/60 text-warm-400 hover:text-white hover:border-warm-500 transition-colors backdrop-blur-sm"
    >
      <CloseIcon className="w-5 h-5 lg:w-6 lg:h-6" />
    </button>
  );
}
