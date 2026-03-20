import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GameLayout } from './GameLayout';
import { VersusManager } from './VersusManager';
import { useVersusStore } from '../store/versusStore';

export function VersusGame() {
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
      <VersusManager />
      <GameLayout />
    </>
  );
}
