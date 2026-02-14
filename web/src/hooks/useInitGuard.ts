import { useEffect, useRef } from 'react';

/**
 * Hook to prevent double-execution of initialization in React StrictMode.
 *
 * @param callback - The initialization function to call once
 * @param deps - Dependencies array (like useEffect)
 */
export function useInitGuard(
  callback: () => void | Promise<void>,
  deps: React.DependencyList = []
): void {
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;
    void callback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
