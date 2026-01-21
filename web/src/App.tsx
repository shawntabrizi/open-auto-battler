import { useEffect } from 'react';
import { GameLayout } from './components/GameLayout';
import { useGameStore } from './store/gameStore';

function App() {
  const init = useGameStore((state) => state.init);

  useEffect(() => {
    init();
  }, [init]);

  return <GameLayout />;
}

export default App;
