import { useBlockchainStore } from '../store/blockchainStore';
import { LoginPage } from './LoginPage';

/**
 * Wraps the app content and shows the LoginPage if the user is not logged in.
 * The hamburger menu is hidden while on the login screen.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const isLoggedIn = useBlockchainStore((s) => s.isLoggedIn);

  if (!isLoggedIn) {
    return <LoginPage />;
  }

  return <>{children}</>;
}
