import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useContractStore } from '../store/contractStore';
import { useGameStore } from '../store/gameStore';
import { GameOverScreen } from './GameOverScreen';

/** Game over screen wired to the contract backend. */
export function ContractGameOverScreen() {
  const endGame = useContractStore((s) => s.endGame);
  const resetActiveSessionView = useGameStore((s) => s.resetActiveSessionView);
  const navigate = useNavigate();

  const handleNewRun = async () => {
    try {
      await endGame();
      resetActiveSessionView();
      navigate('/contract/arena');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to finalize contract run');
    }
  };

  return <GameOverScreen backTo="/contract" backLabel="Contract" onNewRun={handleNewRun} />;
}
