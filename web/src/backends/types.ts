/**
 * GameBackend — shared interface for blockchain backends.
 *
 * Both the Substrate pallet backend and the PolkaVM contract backend
 * implement this interface. The arena store delegates all chain
 * interactions through it, keeping blockchain-specific code isolated.
 */

// ── Shared result types ──────────────────────────────────────────────────────

export interface TurnResult {
  /** Deterministic seed used for the battle (needed for local replay). */
  battleSeed: bigint;
  /** The opponent board that was fought. */
  opponentBoard: GhostBoardUnit[];
  /** Battle outcome. */
  result: 'Victory' | 'Defeat' | 'Draw';
  /** Player's wins after this turn. */
  wins: number;
  /** Player's lives after this turn. */
  lives: number;
  /** The round that was just completed. */
  round: number;
}

export interface GhostBoardUnit {
  card_id: number;
  perm_attack: number;
  perm_health: number;
}

export interface GameStateRaw {
  /** SCALE-encoded game state bytes (fed to engine.init_from_scale). */
  stateBytes: Uint8Array;
  /** SCALE-encoded card set bytes. */
  cardSetBytes: Uint8Array;
  /** Active card set ID, when the backend can determine it. */
  setId?: number;
}

export interface CardData {
  id: number;
  name: string;
  emoji: string;
  stats: { attack: number; health: number };
  economy: { play_cost: number; burn_value: number };
  shop_abilities: any[];
  battle_abilities: any[];
}

export interface SetData {
  id: number;
  name: string;
  cards: { card_id: number; rarity: number }[];
}

export interface Account {
  /** Display name. */
  name: string;
  /** Address in the backend's native format (SS58 or 0x hex). */
  address: string;
  /** Opaque signer object (backend-specific). */
  signer: any;
  /** Source: 'extension' | 'local' | 'dev' | 'host'. */
  source: string;
}

// ── Backend interface ────────────────────────────────────────────────────────

export interface GameBackend {
  /** Human-readable backend name (e.g. "Substrate Pallet", "PolkaVM Contract"). */
  readonly name: string;

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /** Connect to the chain / RPC endpoint. */
  connect(): Promise<void>;
  /** Disconnect and release resources. */
  disconnect(): void;
  /** Whether the backend is currently connected. */
  readonly isConnected: boolean;

  // ── Accounts ───────────────────────────────────────────────────────────────

  /** Discover available accounts (extensions, dev accounts, etc.). */
  getAccounts(): Promise<Account[]>;
  /** The currently selected account, or null. */
  readonly selectedAccount: Account | null;
  /** Select an account for signing. */
  selectAccount(account: Account): void;

  // ── Arena game ─────────────────────────────────────────────────────────────

  /** Start a new arena game with the given card set. */
  startGame(setId: number): Promise<{ seed: bigint }>;

  /**
   * Submit a turn: shop actions + enemy board → battle resolution.
   *
   * @param actionScale SCALE-encoded CommitTurnAction (from engine.get_commit_action_scale())
   * @param enemyBoard  SCALE-encoded Vec<CombatUnit> (the opponent to fight)
   * @returns Turn result with battle seed for local replay.
   */
  submitTurn(actionScale: Uint8Array, enemyBoard: Uint8Array): Promise<TurnResult>;

  /**
   * Fetch the current game state as raw SCALE bytes.
   * Returns null if no active game.
   */
  getGameState(): Promise<GameStateRaw | null>;

  /** Finalize a completed game (pallet: end_game, contract: no-op). */
  endGame(): Promise<void>;

  /** Abandon the current game. */
  abandonGame(): Promise<void>;

  // ── Card data ──────────────────────────────────────────────────────────────

  /** Fetch all available card definitions. */
  getCards(): Promise<CardData[]>;

  /** Fetch all available card sets. */
  getSets(): Promise<SetData[]>;

  /**
   * Find a ghost opponent for the given bracket.
   * Returns null if none available (contract backend may always return null).
   */
  getGhostOpponent(
    setId: number,
    round: number,
    wins: number,
    lives: number
  ): Promise<{ board: GhostBoardUnit[]; seed: bigint } | null>;
}
