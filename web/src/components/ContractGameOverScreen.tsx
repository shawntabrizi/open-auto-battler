import { useNavigate } from 'react-router-dom';
import { useContractStore } from '../store/contractStore';
import { useGameStore } from '../store/gameStore';
import { GameOverScreen } from './GameOverScreen';

/** Game over screen wired to the contract backend. */
export function ContractGameOverScreen() {
  const abandonGame = useContractStore((s) => s.abandonGame);
  const resetActiveSessionView = useGameStore((s) => s.resetActiveSessionView);
  const navigate = useNavigate();

  const handleNewRun = async () => {
    try {
      await abandonGame();
    } catch {}
    resetActiveSessionView();
    navigate('/contract/arena');
  };

  return (
    <GameOverScreen
      backTo="/contract"
      backLabel="Contract"
      onNewRun={handleNewRun}
    />
  );
}
