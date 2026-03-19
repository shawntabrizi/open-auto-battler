import { SetSelectionScreen } from './SetSelectionScreen';
import { SetPreviewOverlay } from './SetPreviewOverlay';

export function PracticeSelectPage() {
  return (
    <>
      <SetSelectionScreen backTo="/play" backLabel="Play" />
      <SetPreviewOverlay />
    </>
  );
}
