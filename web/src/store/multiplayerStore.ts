import { create } from 'zustand';
import Peer, { DataConnection } from 'peerjs';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'in-game';

export interface LogEntry {
  timestamp: number;
  message: string;
}

interface MultiplayerState {
  peer: Peer | null;
  conn: DataConnection | null;
  myPeerId: string | null;
  opponentPeerId: string | null;
  isHost: boolean;
  status: ConnectionStatus;
  logs: LogEntry[];
  
  // Game Sync State
  opponentBoard: any | null;
  isReady: boolean;
  opponentReady: boolean;
  gameSeed: number | null;        // Player's own seed for bag/hand generation
  battleSeed: number | null;      // Shared seed for battle resolution
  battleTimer: number | null;     // Countdown seconds when opponent is waiting
  lives: number;                  // Number of lives for P2P game

  // Actions
  initializePeer: () => Promise<string>;
  connectToPeer: (peerId: string) => void;
  sendMessage: (data: any) => void;
  addLog: (message: string) => void;
  reset: () => void;
  setConnection: (conn: DataConnection) => void;
  setIsHost: (isHost: boolean) => void;

  setOpponentReady: (ready: boolean) => void;
  setOpponentBoard: (board: any) => void;
  setIsReady: (ready: boolean) => void;
  setGameSeed: (seed: number) => void;
  setBattleSeed: (seed: number) => void;
  setStatus: (status: ConnectionStatus) => void;
  setBattleTimer: (seconds: number | null) => void;
  setLives: (lives: number) => void;
}

export const useMultiplayerStore = create<MultiplayerState>((set, get) => ({
  peer: null,
  conn: null,
  myPeerId: null,
  opponentPeerId: null,
  isHost: false,
  status: 'disconnected',
  logs: [],
  
  opponentBoard: null,
  isReady: false,
  opponentReady: false,
  gameSeed: null,
  battleSeed: null,
  battleTimer: null,
  lives: 3,

  initializePeer: async () => {
    const existingPeer = get().peer;
    if (existingPeer) {
      existingPeer.destroy();
    }

    return new Promise((resolve, reject) => {
      const peer = new Peer({
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
          ]
        }
      });

      peer.on('open', (id) => {
        set({ peer, myPeerId: id, logs: [...get().logs, { timestamp: Date.now(), message: `Peer initialized with ID: ${id}` }] });
        resolve(id);
      });

      peer.on('error', (err) => {
        set({ logs: [...get().logs, { timestamp: Date.now(), message: `Peer error: ${err.message}` }] });
        reject(err);
      });
      
      peer.on('connection', (conn) => {
          set({ logs: [...get().logs, { timestamp: Date.now(), message: `Incoming connection from ${conn.peer}` }], isHost: true });
          get().setConnection(conn);
      });
    });
  },

  connectToPeer: (peerId: string) => {
    const peer = get().peer;
    if (!peer) {
        get().addLog("Cannot connect: Peer not initialized");
        return;
    }
    
    set({ status: 'connecting', isHost: false, logs: [...get().logs, { timestamp: Date.now(), message: `Connecting to ${peerId}...` }] });
    
    const conn = peer.connect(peerId);
    get().setConnection(conn);
  },

  setConnection: (conn: DataConnection) => {
      conn.on('open', () => {
          set({ 
              conn, 
              status: 'connected', 
              opponentPeerId: conn.peer,
              logs: [...get().logs, { timestamp: Date.now(), message: `Connected to ${conn.peer}` }] 
          });
      });

      conn.on('data', (data: any) => {
           // Handle START_GAME here to capture seeds even if MultiplayerManager hasn't mounted
           if (data && typeof data === 'object' && data.type === 'START_GAME') {
               get().addLog(`Received START_GAME with playerSeed ${data.playerSeed}, battleSeed ${data.battleSeed}, lives ${data.lives ?? 3}`);
               set({ gameSeed: data.playerSeed, battleSeed: data.battleSeed, lives: data.lives ?? 3, status: 'in-game' });
           }
           // Other messages are handled by MultiplayerManager
      });

      conn.on('close', () => {
          set({ 
              conn: null, 
              status: 'disconnected', 
              opponentPeerId: null,
              isReady: false,
              opponentReady: false,
              logs: [...get().logs, { timestamp: Date.now(), message: `Connection closed` }] 
          });
      });
      
      conn.on('error', (err) => {
           set({ logs: [...get().logs, { timestamp: Date.now(), message: `Connection error: ${err.message}` }] });
      });
  },

  sendMessage: (data: any) => {
    const { conn } = get();
    if (conn && conn.open) {
      conn.send(data);
    } else {
        get().addLog("Cannot send message: Connection not open");
    }
  },

  addLog: (message: string) => {
    set({ logs: [...get().logs, { timestamp: Date.now(), message }] });
  },
  
  setIsHost: (isHost: boolean) => {
      set({ isHost });
  },
  
  setOpponentReady: (ready: boolean) => set({ opponentReady: ready }),
  setOpponentBoard: (board: any) => set({ opponentBoard: board }),
  setIsReady: (ready: boolean) => set({ isReady: ready }),
  setGameSeed: (seed: number) => set({ gameSeed: seed }),
  setBattleSeed: (seed: number) => set({ battleSeed: seed }),
  setStatus: (status: ConnectionStatus) => set({ status }),
  setBattleTimer: (seconds: number | null) => set({ battleTimer: seconds }),
  setLives: (lives: number) => set({ lives }),

  reset: () => {
      const { peer } = get();
      if (peer) peer.destroy();
      set({
          peer: null,
          conn: null,
          myPeerId: null,
          opponentPeerId: null,
          isHost: false,
          status: 'disconnected',
          logs: [],
          opponentBoard: null,
          isReady: false,
          opponentReady: false,
          gameSeed: null,
          battleSeed: null,
          battleTimer: null,
          lives: 3
      });
  }
}));
