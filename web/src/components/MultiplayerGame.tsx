import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GameLayout } from './GameLayout';
import { MultiplayerManager } from './MultiplayerManager';
import { useVersusStore } from '../store/versusStore';

export function MultiplayerGame() {
  const navigate = useNavigate();
  const { status, conn } = useVersusStore();

  // Redirect to lobby if not connected
  useEffect(() => {
    if (!conn || status === 'disconnected') {
      void navigate('/versus/lobby');
    }
  }, [conn, status, navigate]);

  if (!conn || status === 'disconnected') {
    return null;
  }

  return (
    <>
      <MultiplayerManager />
      <GameLayout />
    </>
  );
}
