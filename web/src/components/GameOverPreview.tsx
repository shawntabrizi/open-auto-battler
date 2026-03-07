import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { GameOverScreen } from './GameOverScreen';
import type { GameView } from '../types';

const MOCK_VIEW: GameView = {
  hand: [],
  board: [null, null, null, null, null],
  mana: 0,
  mana_limit: 10,
  round: 8,
  lives: 1,
  wins: 7,
  phase: 'defeat',
  bag_count: 0,
  can_afford: [],
  can_undo: false,
};

export function GameOverPreview() {
  const [searchParams] = useSearchParams();
  const phase = searchParams.get('phase') === 'victory' ? 'victory' : 'defeat';

  useEffect(() => {
    const view: GameView = {
      ...MOCK_VIEW,
      phase,
      wins: phase === 'victory' ? 10 : 7,
      lives: phase === 'victory' ? 2 : 0,
      round: phase === 'victory' ? 10 : 8,
    };

    useGameStore.setState({
      view,
      winsToVictory: 10,
      newRun: () => {
        // no-op in preview
      },
    });
  }, [phase]);

  return (
    <div className="h-screen h-svh">
      <GameOverScreen />
    </div>
  );
}
