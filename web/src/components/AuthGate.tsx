import { useEffect } from 'react';
import { useArenaStore } from '../store/arenaStore';
import { useCustomizationStore } from '../store/customizationStore';
import { useInitGuard } from '../hooks';
import { LoginPage } from './LoginPage';

/** Max time to wait for session restore before falling back to login */
const RESTORE_TIMEOUT_MS = 10_000;

/**
 * Wraps the app content and controls access:
 * - Shows a loading screen while restoring a previous login session
 * - Shows the LoginPage if the user is not logged in
 * - Shows the app content if logged in
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const isLoggedIn = useArenaStore((s) => s.isLoggedIn);
  const isRestoringSession = useArenaStore((s) => s.isRestoringSession);
  const connect = useArenaStore((s) => s.connect);
  const api = useArenaStore((s) => s.api);
  const selectedAccount = useArenaStore((s) => s.selectedAccount);
  const fetchUserNfts = useCustomizationStore((s) => s.fetchUserNfts);

  // Auto-connect when restoring a session
  useInitGuard(() => {
    if (isRestoringSession) {
      void connect();
    }
  }, [isRestoringSession, connect]);

  // Timeout: if restore takes too long, give up and show login
  useEffect(() => {
    if (!isRestoringSession) return;
    const timer = setTimeout(() => {
      if (useArenaStore.getState().isRestoringSession) {
        useArenaStore.setState({ isRestoringSession: false });
      }
    }, RESTORE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isRestoringSession]);

  // Auto-fetch owned NFTs on login
  useEffect(() => {
    if (isLoggedIn && api && selectedAccount) {
      void fetchUserNfts(api, selectedAccount.address);
    }
  }, [isLoggedIn, api, selectedAccount, fetchUserNfts]);

  if (isRestoringSession) {
    return (
      <div className="app-shell min-h-screen min-h-svh flex items-center justify-center">
        <div className="text-center">
          <h1 className="theme-title-text font-decorative text-2xl lg:text-4xl font-bold tracking-wide text-transparent bg-clip-text mb-3">
            OPEN AUTO BATTLER
          </h1>
          <p className="text-base-500 text-xs lg:text-sm animate-pulse">Connecting...</p>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return <LoginPage />;
  }

  return <>{children}</>;
}
