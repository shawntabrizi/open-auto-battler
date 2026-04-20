/**
 * Pallet Backend — implements GameBackend using PAPI (Substrate pallets).
 *
 * This wraps the existing PAPI game operations (OabArena, OabCardRegistry)
 * behind the GameBackend interface. Connection and account management remain
 * in arenaStore since they're deeply coupled with Substrate-specific concepts
 * (extensions, sr25519, sudo, NFTs).
 */

import { Binary } from 'polkadot-api';
import type {
  GameBackend,
  TurnResult,
  GameStateRaw,
  CardData,
  SetData,
  GhostBoardUnit,
} from '../types';
import { submitTx } from '../../utils/tx';

// ── Ghost opponent helpers (moved from arenaStore) ───────────────────────────

function normalizeGhostBoard(ghost: any): GhostBoardUnit[] {
  const board = ghost?.board ?? ghost;
  const rawUnits = Array.isArray(board) ? board : board?.units || [];
  return rawUnits.map((unit: any) => ({
    card_id:
      typeof unit.card_id === 'number' ? unit.card_id : Number(unit.card_id?.value ?? unit.card_id),
    perm_attack:
      typeof unit.perm_attack === 'number' ? unit.perm_attack : Number(unit.perm_attack || 0),
    perm_health:
      typeof unit.perm_health === 'number' ? unit.perm_health : Number(unit.perm_health || 0),
  }));
}

function collectGhostCandidates(entries: any[], setId: number) {
  return entries
    .map((entry: any) => {
      const [entrySetId, round, wins, lives] = entry.keyArgs.map((value: any) => Number(value));
      const ghosts = Array.isArray(entry.value) ? entry.value : entry.value ? [entry.value] : [];
      return { setId: entrySetId, round, wins, lives, ghosts };
    })
    .filter((entry: any) => entry.setId === setId && entry.ghosts.length > 0);
}

function bracketDistance(
  candidate: { round: number; wins: number; lives: number },
  target: { round: number; wins: number; lives: number }
): number {
  return (
    Math.abs(candidate.round - target.round) * 100 +
    Math.abs(candidate.wins - target.wins) * 10 +
    Math.abs(candidate.lives - target.lives) * 5
  );
}

function deriveLocalBattleSeed(
  blockNumber: number | null,
  setId: number,
  round: number,
  wins: number,
  lives: number
): number {
  const seed = ((blockNumber ?? 1) ^ (setId << 16) ^ (round << 8) ^ (wins << 4) ^ lives) >>> 0;
  return seed === 0 ? 1 : seed;
}

function nextXorShift32(seed: number): number {
  let x = seed >>> 0;
  if (x === 0) x = 1;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x >>> 0;
}

// ── PalletBackend ────────────────────────────────────────────────────────────

/**
 * Create a pallet backend bound to live PAPI references.
 *
 * Takes getter functions so it always reads the latest client/api/account
 * from the arena store without stale closures.
 */
export function createPalletBackend(deps: {
  getApi: () => any;
  getClient: () => any;
  getCodecs: () => any;
  getSelectedAccount: () => any;
  getBlockNumber: () => number | null;
}): GameBackend {
  const { getApi, getClient, getCodecs, getSelectedAccount, getBlockNumber } = deps;

  function requireApi() {
    const api = getApi();
    if (!api) throw new Error('Not connected to blockchain');
    return api;
  }

  function requireAccount() {
    const account = getSelectedAccount();
    if (!account) throw new Error('No account selected');
    return account;
  }

  const backend: GameBackend = {
    name: 'Substrate Pallet',

    // Lifecycle managed by arenaStore — these are no-ops here
    async connect() {},
    disconnect() {},
    get isConnected() {
      return !!getApi();
    },

    // Account management handled by arenaStore
    async getAccounts() {
      return [];
    },
    get selectedAccount() {
      return getSelectedAccount();
    },
    selectAccount() {},

    // ── Arena game ─────────────────────────────────────────────────────

    async startGame(setId: number): Promise<{ seed: bigint }> {
      const api = requireApi();
      const account = requireAccount();
      const tx = api.tx.OabArena.start_game({ set_id: setId });
      await submitTx(tx, account.polkadotSigner, `OabArena.start_game(set_id=${setId})`);
      // The pallet doesn't return the seed directly — it's in the event.
      // For now return 0; the caller will refreshGameState to get the full state.
      return { seed: 0n };
    },

    async submitTurn(actionScale: Uint8Array, _enemyBoard: Uint8Array): Promise<TurnResult> {
      const api = requireApi();
      const codecs = getCodecs();
      const account = requireAccount();

      // Decode SCALE action via PAPI codecs
      const action = codecs.tx.OabArena.submit_turn.dec(actionScale);
      const tx = api.tx.OabArena.submit_turn(action);
      const txResult = await submitTx(tx, account.polkadotSigner, 'OabArena.submit_turn');

      // Extract BattleReported event
      const battleEvent = txResult.events?.find(
        (e: any) => e.type === 'OabArena' && e.value?.type === 'BattleReported'
      );

      if (!battleEvent) {
        throw new Error('No BattleReported event found in transaction result');
      }

      const { battle_seed, opponent_board, result: chainResult } = (battleEvent.value as any).value;

      const opponentBoard = normalizeGhostBoard(opponent_board);
      const resultStr =
        typeof chainResult === 'string' ? chainResult : (chainResult?.type ?? String(chainResult));

      return {
        battleSeed: BigInt(battle_seed),
        opponentBoard,
        result: resultStr as TurnResult['result'],
        wins: 0, // Caller reads from refreshed state
        lives: 0,
        round: 0,
      };
    },

    async getGameState(): Promise<GameStateRaw | null> {
      const api = requireApi();
      const client = getClient();
      const account = requireAccount();

      const game = await api.query.OabArena.ActiveGame.getValue(account.address);
      if (!game) return null;

      // Fetch raw SCALE bytes
      const gameKey = await api.query.OabArena.ActiveGame.getKey(account.address);
      const cardSetKey = await api.query.OabCardRegistry.CardSets.getKey(game.set_id);

      const gameRawHex = await client.rawQuery(gameKey);
      const cardSetRawHex = await client.rawQuery(cardSetKey);

      if (!gameRawHex || !cardSetRawHex) {
        throw new Error('Failed to fetch raw SCALE bytes from chain');
      }

      return {
        stateBytes: Binary.fromHex(gameRawHex).asBytes(),
        cardSetBytes: Binary.fromHex(cardSetRawHex).asBytes(),
      };
    },

    async endGame(): Promise<void> {
      const api = requireApi();
      const account = requireAccount();
      const tx = api.tx.OabArena.end_game({});
      await submitTx(tx, account.polkadotSigner, 'Saving Results');
    },

    async abandonGame(): Promise<void> {
      const api = requireApi();
      const account = requireAccount();
      const tx = api.tx.OabArena.abandon_game({});
      await submitTx(tx, account.polkadotSigner, 'OabArena.abandon_game');
    },

    // ── Card data ──────────────────────────────────────────────────────

    async getCards(): Promise<CardData[]> {
      const api = requireApi();
      const cardEntries = await api.query.OabCardRegistry.UserCards.getEntries();
      const metadataEntries = await api.query.OabCardRegistry.CardMetadataStore.getEntries();

      const metadataMap = new Map();
      metadataEntries.forEach((entry: any) => {
        const meta = entry.value.metadata;
        metadataMap.set(entry.keyArgs[0], {
          name: meta.name.asText(),
          emoji: meta.emoji.asText(),
          description: meta.description.asText(),
          creator: entry.value.creator,
        });
      });

      return cardEntries.map((entry: any) => {
        const id = Number(entry.keyArgs[0]);
        const metadata = metadataMap.get(id);
        return {
          id,
          data: entry.value,
          metadata: metadata || { name: `Card #${id}`, emoji: '❓', description: '' },
          creator: metadata?.creator,
        };
      });
    },

    async getSets(): Promise<SetData[]> {
      const api = requireApi();
      const setEntries = await api.query.OabCardRegistry.CardSets.getEntries();

      let metadataMap = new Map<number, string>();
      try {
        const metaEntries = await api.query.OabCardRegistry.CardSetMetadataStore.getEntries();
        metaEntries.forEach((entry: any) => {
          metadataMap.set(Number(entry.keyArgs[0]), entry.value.name.asText());
        });
      } catch {}

      return setEntries.map((entry: any) => {
        const id = Number(entry.keyArgs[0]);
        return {
          id,
          cards: entry.value,
          name: metadataMap.get(id) || `Set #${id}`,
        };
      });
    },

    async getGhostOpponent(setId, round, wins, lives) {
      const api = requireApi();
      const blockNumber = getBlockNumber();
      const targetBracket = { round, wins, lives };

      let poolEntries: any[] = [];
      try {
        poolEntries = await api.query.OabArena.GhostOpponents.getEntries(setId);
      } catch {
        poolEntries = await api.query.OabArena.GhostOpponents.getEntries();
      }

      let candidates = collectGhostCandidates(poolEntries, setId);

      if (candidates.length === 0) {
        try {
          let archiveEntries: any[] = [];
          try {
            archiveEntries = await api.query.OabArena.GhostArchive.getEntries(setId);
          } catch {
            archiveEntries = await api.query.OabArena.GhostArchive.getEntries();
          }
          candidates = collectGhostCandidates(archiveEntries, setId);
        } catch {}
      }

      const selectedBracket = [...candidates].sort(
        (a, b) => bracketDistance(a, targetBracket) - bracketDistance(b, targetBracket)
      )[0];

      if (!selectedBracket) return null;

      const seed = deriveLocalBattleSeed(blockNumber, setId, round, wins, lives);
      const index = nextXorShift32(seed) % selectedBracket.ghosts.length;
      const board = normalizeGhostBoard(selectedBracket.ghosts[index]);

      if (board.length === 0) return null;

      return { board, seed: BigInt(seed) };
    },
  };

  return backend;
}
