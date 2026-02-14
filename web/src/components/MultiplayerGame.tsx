import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GameLayout } from './GameLayout';
import { MultiplayerManager } from './MultiplayerManager';
import { useMultiplayerStore } from '../store/multiplayerStore';

export function MultiplayerGame() {
  const navigate = useNavigate();
  const { status, conn } = useMultiplayerStore();

  // Redirect to lobby if not connected
  useEffect(() => {
    if (!conn || status === 'disconnected') {
      void navigate('/multiplayer');
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
