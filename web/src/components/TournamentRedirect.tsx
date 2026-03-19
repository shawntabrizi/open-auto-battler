import { Navigate } from 'react-router-dom';
import { useArenaStore } from '../store/arenaStore';
import { useTournamentStore } from '../store/tournamentStore';

/** Smart redirect: routes to /tournament/lobby or /tournament/game based on state. */
export function TournamentRedirect() {
  const { isConnected } = useArenaStore();
  const { hasActiveTournamentGame } = useTournamentStore();

  if (!isConnected || !hasActiveTournamentGame) {
    return <Navigate to="/tournament/lobby" replace />;
  }

  return <Navigate to="/tournament/game" replace />;
}
