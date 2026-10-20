import { useGameStore } from '../store/gameStore';

/** Display name of a card set, from the engine's set metadata. */
export function useSetName(): (setId: number) => string {
  const setMetas = useGameStore((s) => s.setMetas);
  return (setId) => setMetas.find((m) => m.id === setId)?.name ?? `Set ${setId}`;
}
