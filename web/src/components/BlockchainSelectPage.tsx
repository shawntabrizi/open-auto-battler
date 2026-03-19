import { useArenaStore } from '../store/arenaStore';
import { SetSelectionScreen } from './SetSelectionScreen';
import { SetPreviewOverlay } from './SetPreviewOverlay';
import { RotatePrompt } from './RotatePrompt';
import { useNavigate } from 'react-router-dom';

export function BlockchainSelectPage() {
  const { startGame } = useArenaStore();
  const navigate = useNavigate();

  return (
    <>
      <SetSelectionScreen
        onStartGame={async (setId) => {
          await startGame(setId);
          navigate('/arena');
        }}
        backTo="/play"
        backLabel="Play"
      />
      <SetPreviewOverlay />
      <RotatePrompt />
    </>
  );
}
