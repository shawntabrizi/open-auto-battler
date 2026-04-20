import { useState, useEffect } from 'react';

const NARROW_BREAKPOINT = '(max-width: 640px)';

/**
 * Returns true when the viewport width is at or below 640px.
 * This naturally detects portrait phone screens vs landscape/tablet/desktop.
 */
export function useIsNarrowScreen(): boolean {
  const [isNarrow, setIsNarrow] = useState(() => window.matchMedia(NARROW_BREAKPOINT).matches);

  useEffect(() => {
    const mql = window.matchMedia(NARROW_BREAKPOINT);
    const onChange = (e: MediaQueryListEvent) => setIsNarrow(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isNarrow;
}
