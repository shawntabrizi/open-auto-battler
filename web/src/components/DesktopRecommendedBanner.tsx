import { useState } from 'react';
import { useIsMobile } from '../hooks/useIsMobile';

const DISMISSED_KEY = 'oab-desktop-banner-dismissed';

export function DesktopRecommendedBanner() {
  const isMobile = useIsMobile();
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(DISMISSED_KEY) === '1'
  );

  if (!isMobile || dismissed) return null;

  return (
    <div className="bg-yellow-900/40 border-b border-yellow-700/40 px-3 py-2 flex items-center justify-between gap-3">
      <p className="text-yellow-200 text-xs lg:text-sm">
        This tool is designed for desktop. For the best experience, use a larger screen.
      </p>
      <button
        onClick={() => {
          sessionStorage.setItem(DISMISSED_KEY, '1');
          setDismissed(true);
        }}
        className="shrink-0 text-yellow-400 hover:text-yellow-200 text-xs font-bold"
      >
        Dismiss
      </button>
    </div>
  );
}
