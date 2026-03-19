import { Navigate } from 'react-router-dom';
import { useVersusStore } from '../store/versusStore';

/** Smart redirect: routes to /versus/lobby or /versus/game based on connection state. */
export function VersusRedirect() {
  const { status, conn } = useVersusStore();

  if (conn && (status === 'connected' || status === 'in-game')) {
    return <Navigate to="/versus/game" replace />;
  }

  return <Navigate to="/versus/lobby" replace />;
}
