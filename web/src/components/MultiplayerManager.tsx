import { useEffect, useRef } from 'react';
import { useMultiplayerStore } from '../store/multiplayerStore';
import { useGameStore } from '../store/gameStore';

const BATTLE_TIMER_SECONDS = 20;

export function MultiplayerManager() {
  const {
    conn,
    isHost,
    status,
    sendMessage,
    addLog,
    setOpponentReady,
    setOpponentBoard,
    isReady,
    opponentReady,
    opponentBoard,
    gameSeed,
    battleSeed,
    setGameSeed,
    setBattleSeed,
    setStatus,
    setIsReady,
    battleTimer,
    setBattleTimer,
  } = useMultiplayerStore();

  const { startMultiplayerGame, resolveMultiplayerBattle, view, engine } = useGameStore();

  // Guards to prevent double-execution in React StrictMode
  const hostGameStarted = useRef(false);
  const guestGameStarted = useRef(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Handle incoming messages
  useEffect(() => {
    if (!conn) return;

    const handleData = (data: any) => {
      if (!data || typeof data !== 'object') return;

      switch (data.type) {
        case 'HANDSHAKE':
          addLog(`Handshake: v${data.version}`);
          break;

        case 'START_GAME':
          // Seed and status are now handled by the store's data handler
          // The useEffect below will call startMultiplayerGame when engine is ready
          break;

        case 'END_TURN_READY':
          addLog(`Opponent is ready`);
          setOpponentReady(true);
          setOpponentBoard(data.board);
          break;
      }
    };

    conn.on('data', handleData);

    // Initial handshake
    sendMessage({ type: 'HANDSHAKE', version: '0.1.0' });

    return () => {
      conn.off('data', handleData);
    };
  }, [conn, addLog, sendMessage, setOpponentBoard, setOpponentReady]);

  // Host starts game when connected and engine is ready
  useEffect(() => {
    if (hostGameStarted.current) return;
    if (isHost && status === 'connected' && !gameSeed && engine) {
      hostGameStarted.current = true;
      addLog('Host: Starting game session...');
      // Generate three separate seeds:
      // - hostPlayerSeed: for host's bag/hand generation
      // - guestPlayerSeed: for guest's bag/hand generation
      // - sharedBattleSeed: shared seed for battle resolution
      const hostPlayerSeed = Math.floor(Math.random() * 1000000);
      const guestPlayerSeed = Math.floor(Math.random() * 1000000);
      const sharedBattleSeed = Math.floor(Math.random() * 1000000);

      const { lives } = useMultiplayerStore.getState();
      setGameSeed(hostPlayerSeed);
      setBattleSeed(sharedBattleSeed);
      startMultiplayerGame(hostPlayerSeed, lives);
      sendMessage({
        type: 'START_GAME',
        playerSeed: guestPlayerSeed,
        battleSeed: sharedBattleSeed,
        lives,
      });
      setStatus('in-game');
    }
  }, [
    isHost,
    status,
    gameSeed,
    engine,
    addLog,
    sendMessage,
    setBattleSeed,
    setGameSeed,
    setStatus,
    startMultiplayerGame,
  ]);

  // Guest starts game when they have a seed (possibly received while on /multiplayer) and engine is ready
  useEffect(() => {
    if (guestGameStarted.current) return;
    if (!isHost && gameSeed !== null && engine && status === 'in-game') {
      guestGameStarted.current = true;
      const { lives } = useMultiplayerStore.getState();
      addLog('Guest: Starting game with received seed...');
      startMultiplayerGame(gameSeed, lives);
    }
  }, [isHost, gameSeed, engine, status, addLog, startMultiplayerGame]);

  // Start timer when opponent is ready but we're not
  useEffect(() => {
    // Only start timer if opponent is ready, we're not ready, and we're in shop phase
    if (opponentReady && !isReady && view?.phase === 'shop') {
      // Start the countdown
      addLog(`Opponent is waiting! You have ${BATTLE_TIMER_SECONDS} seconds to submit.`);
      setBattleTimer(BATTLE_TIMER_SECONDS);

      timerRef.current = setInterval(() => {
        const currentTimer = useMultiplayerStore.getState().battleTimer;
        if (currentTimer !== null && currentTimer > 1) {
          setBattleTimer(currentTimer - 1);
        } else {
          // Timer expired - auto-submit
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          setBattleTimer(null);

          // Auto-submit the current board
          const board = engine?.get_board();
          addLog("Time's up! Auto-submitting your board.");
          setIsReady(true);
          sendMessage({ type: 'END_TURN_READY', board });
        }
      }, 1000);
    }

    // Clear timer if we become ready or opponent is no longer ready
    if (isReady || !opponentReady) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (battleTimer !== null) {
        setBattleTimer(null);
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [
    opponentReady,
    isReady,
    view?.phase,
    addLog,
    battleTimer,
    engine,
    sendMessage,
    setBattleTimer,
    setIsReady,
  ]);

  // Trigger battle when both ready
  useEffect(() => {
    if (isReady && opponentReady && opponentBoard && battleSeed !== null && view) {
      addLog('Both players ready! Resolving battle...');

      // Round-specific seed using the shared battle seed
      const roundSeed = battleSeed + view.round * 100;

      resolveMultiplayerBattle(opponentBoard, roundSeed);

      // Reset ready states for next round transition
      setIsReady(false);
      setOpponentReady(false);
      setOpponentBoard(null);
    }
  }, [
    isReady,
    opponentReady,
    opponentBoard,
    battleSeed,
    view,
    addLog,
    resolveMultiplayerBattle,
    setIsReady,
    setOpponentBoard,
    setOpponentReady,
  ]);

  return null;
}
