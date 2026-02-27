import { create } from 'zustand';
import { Binary } from 'polkadot-api';
import { useBlockchainStore } from './blockchainStore';
import { useGameStore } from './gameStore';
import { submitTx } from '../utils/tx';

interface TournamentInfo {
  id: number;
  config: {
    set_id: number;
    entry_fee: bigint;
    start_block: number;
    end_block: number;
    prize_config: {
      player_share: number;
      set_creator_share: number;
      card_creators_share: number;
    };
  };
  state: {
    total_pot: bigint;
    total_entries: number;
    total_perfect_runs: number;
  };
}

interface PlayerStats {
  perfect_runs: number;
  total_wins: number;
  total_games: number;
}

interface LeaderboardEntry {
  account: string;
  stats: PlayerStats;
}

interface TournamentStore {
  activeTournament: TournamentInfo | null;
  isLoadingTournament: boolean;
  hasActiveTournamentGame: boolean;
  playerStats: PlayerStats | null;
  allPlayerStats: LeaderboardEntry[];
  tournamentGameOver: boolean;
  lastGameWins: number;

  fetchActiveTournament: () => Promise<void>;
  fetchPlayerStats: () => Promise<void>;
  fetchAllPlayerStats: (tournamentId: number) => Promise<void>;
  joinTournament: (tournamentId: number) => Promise<void>;
  submitTournamentTurn: () => Promise<void>;
  abandonTournament: () => Promise<void>;
  refreshTournamentGameState: (force?: boolean) => Promise<void>;
  resetGameOver: () => void;
}

export const useTournamentStore = create<TournamentStore>((set, get) => ({
  activeTournament: null,
  isLoadingTournament: false,
  hasActiveTournamentGame: false,
  playerStats: null,
  allPlayerStats: [],
  tournamentGameOver: false,
  lastGameWins: 0,

  fetchActiveTournament: async () => {
    const { api } = useBlockchainStore.getState();
    if (!api) return;

    set({ isLoadingTournament: true });
    try {
      const nextId = await api.query.AutoBattle.NextTournamentId.getValue();
      const blockNumber = useBlockchainStore.getState().blockNumber ?? 0;

      // Scan backwards to find the most recent active or upcoming tournament
      for (let id = Number(nextId) - 1; id >= 0; id--) {
        const config = await api.query.AutoBattle.Tournaments.getValue(id);
        if (!config) continue;

        const startBlock = Number(config.start_block);
        const endBlock = Number(config.end_block);

        // Active if current block is within range
        if (blockNumber >= startBlock && blockNumber <= endBlock) {
          const state = await api.query.AutoBattle.TournamentStates.getValue(id);
          set({
            activeTournament: {
              id,
              config: {
                set_id: config.set_id,
                entry_fee: BigInt(config.entry_fee),
                start_block: startBlock,
                end_block: endBlock,
                prize_config: {
                  player_share: Number(config.prize_config.player_share),
                  set_creator_share: Number(config.prize_config.set_creator_share),
                  card_creators_share: Number(config.prize_config.card_creators_share),
                },
              },
              state: {
                total_pot: BigInt(state?.total_pot ?? 0),
                total_entries: Number(state?.total_entries ?? 0),
                total_perfect_runs: Number(state?.total_perfect_runs ?? 0),
              },
            },
            isLoadingTournament: false,
          });
          return;
        }
      }

      set({ activeTournament: null, isLoadingTournament: false });
    } catch (err) {
      console.error('Failed to fetch active tournament:', err);
      set({ isLoadingTournament: false });
    }
  },

  fetchPlayerStats: async () => {
    const { api, selectedAccount } = useBlockchainStore.getState();
    const { activeTournament } = get();
    if (!api || !selectedAccount || !activeTournament) return;

    try {
      const stats = await api.query.AutoBattle.TournamentPlayerStats.getValue(
        activeTournament.id,
        selectedAccount.address
      );
      set({
        playerStats: stats
          ? {
              perfect_runs: Number(stats.perfect_runs),
              total_wins: Number(stats.total_wins),
              total_games: Number(stats.total_games),
            }
          : null,
      });
    } catch (err) {
      console.error('Failed to fetch player stats:', err);
    }
  },

  fetchAllPlayerStats: async (tournamentId: number) => {
    const { api } = useBlockchainStore.getState();
    if (!api) return;

    try {
      const entries = await api.query.AutoBattle.TournamentPlayerStats.getEntries(tournamentId);
      const stats: LeaderboardEntry[] = entries
        .map((entry: any) => ({
          account: String(entry.keyArgs[1]),
          stats: {
            perfect_runs: Number(entry.value.perfect_runs),
            total_wins: Number(entry.value.total_wins),
            total_games: Number(entry.value.total_games),
          },
        }))
        .sort((a: LeaderboardEntry, b: LeaderboardEntry) => {
          if (b.stats.perfect_runs !== a.stats.perfect_runs)
            return b.stats.perfect_runs - a.stats.perfect_runs;
          return b.stats.total_wins - a.stats.total_wins;
        });

      set({ allPlayerStats: stats });
    } catch (err) {
      console.error('Failed to fetch all player stats:', err);
    }
  },

  refreshTournamentGameState: async (_force = false) => {
    const { api, client, selectedAccount, allCards } = useBlockchainStore.getState();
    if (!api || !selectedAccount) return;

    // Internal helper to wait for engine to be ready
    const waitForEngine = async (maxRetries = 10): Promise<any> => {
      for (let i = 0; i < maxRetries; i++) {
        const { engine } = useGameStore.getState();
        if (engine) return engine;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return null;
    };

    try {
      const game = await api.query.AutoBattle.ActiveTournamentGame.getValue(
        selectedAccount.address
      );

      if (game) {
        set({ hasActiveTournamentGame: true, tournamentGameOver: false });

        const engine = await waitForEngine();
        if (!engine) {
          console.warn('WASM engine timed out, skipping tournament game sync.');
          return;
        }

        // Inject all cards from blockchain into engine
        for (const card of allCards) {
          try {
            const shopAbilities = (card.data.shop_abilities || []).map(convertAbility);
            const battleAbilities = (card.data.battle_abilities || []).map(convertAbility);
            engine.add_card({
              id: card.id,
              name: card.metadata?.name || `Card #${card.id}`,
              stats: {
                attack: card.data.stats.attack,
                health: card.data.stats.health,
              },
              economy: {
                play_cost: card.data.economy.play_cost,
                pitch_value: card.data.economy.pitch_value,
              },
              base_statuses: toStatusMask(card.data.base_statuses),
              shop_abilities: shopAbilities,
              battle_abilities: battleAbilities,
            });
          } catch (e) {
            console.warn(`Failed to inject card ${card.id} into engine:`, e);
          }
        }

        // Fetch raw SCALE bytes
        const gameKey = await api.query.AutoBattle.ActiveTournamentGame.getKey(
          selectedAccount.address
        );
        const cardSetKey = await api.query.AutoBattle.CardSets.getKey(game.set_id);

        const gameRawHex = await client.rawQuery(gameKey);
        const cardSetRawHex = await client.rawQuery(cardSetKey);

        if (!gameRawHex || !cardSetRawHex) {
          throw new Error('Failed to fetch raw SCALE bytes from chain');
        }

        const gameRaw = Binary.fromHex(gameRawHex).asBytes();
        const cardSetRaw = Binary.fromHex(cardSetRawHex).asBytes();

        // Trim trailing 4 bytes (tournament_id: u32) from TournamentGameSession
        // to make it compatible with GameSession SCALE layout
        const trimmedGameRaw = gameRaw.slice(0, gameRaw.length - 4);

        engine.init_from_scale(trimmedGameRaw, cardSetRaw);

        const view = engine.get_view();
        const cardSet = engine.get_card_set();
        useGameStore.setState({ view, cardSet });

        console.log('Tournament game synced via SCALE bytes.');
      } else {
        set({ hasActiveTournamentGame: false });
        console.log('No active tournament game found.');
      }
    } catch (err) {
      console.error('Failed to refresh tournament game state:', err);
    }
  },

  joinTournament: async (tournamentId: number) => {
    const { api, selectedAccount } = useBlockchainStore.getState();
    if (!api || !selectedAccount) return;

    try {
      const tx = api.tx.AutoBattle.join_tournament({ tournament_id: tournamentId });
      await submitTx(tx, selectedAccount.polkadotSigner, 'AutoBattle.join_tournament');
      await get().refreshTournamentGameState(true);
    } catch (err) {
      console.error('Join tournament failed:', err);
    }
  },

  submitTournamentTurn: async () => {
    const { api, codecs, selectedAccount } = useBlockchainStore.getState();
    const { engine } = useGameStore.getState();
    if (!api || !codecs || !selectedAccount || !engine) return;

    try {
      // Capture player board before submitting
      const playerBoard = engine.get_board();

      // Get commit action from engine and decode via SCALE
      const actionRaw = engine.get_commit_action_scale();
      const action = codecs.tx.AutoBattle.submit_turn.dec(actionRaw);

      // Submit tournament turn
      const tx = api.tx.AutoBattle.submit_tournament_turn(action);
      const txResult = await submitTx(
        tx,
        selectedAccount.polkadotSigner,
        'AutoBattle.submit_tournament_turn'
      );

      // Extract BattleReported event
      const battleEvent = txResult.events.find(
        (e: any) => e.type === 'AutoBattle' && e.value?.type === 'BattleReported'
      );

      // Check for TournamentGameCompleted event
      const completedEvent = txResult.events.find(
        (e: any) => e.type === 'AutoBattle' && e.value?.type === 'TournamentGameCompleted'
      );

      if (battleEvent) {
        const { battle_seed, opponent_board } = battleEvent.value.value;

        const rawUnits = Array.isArray(opponent_board)
          ? opponent_board
          : opponent_board?.units || [];
        const opponentUnits = rawUnits.map((u: any) => ({
          card_id: typeof u.card_id === 'number' ? u.card_id : Number(u.card_id),
          perm_attack:
            typeof u.perm_attack === 'number' ? u.perm_attack : Number(u.perm_attack || 0),
          perm_health:
            typeof u.perm_health === 'number' ? u.perm_health : Number(u.perm_health || 0),
        }));

        const battleOutput = engine.resolve_battle_p2p(
          playerBoard,
          opponentUnits,
          BigInt(battle_seed)
        );

        if (completedEvent) {
          const wins = Number(completedEvent.value.value.wins);
          // Game is over — after battle animation, show tournament game over
          useGameStore.setState({
            battleOutput,
            showBattleOverlay: true,
            afterBattleCallback: () => {
              set({ hasActiveTournamentGame: false, tournamentGameOver: true, lastGameWins: wins });
              // Refresh stats
              get().fetchPlayerStats();
              get().fetchAllPlayerStats(get().activeTournament?.id ?? 0);
              // Refresh tournament state (pot, entries, etc.)
              get().fetchActiveTournament();
            },
          });
        } else {
          // Game continues — after battle animation, refresh tournament game state
          useGameStore.setState({
            battleOutput,
            showBattleOverlay: true,
            afterBattleCallback: () => get().refreshTournamentGameState(true),
          });
        }
      } else {
        console.warn('No BattleReported event found in tournament tx result');
        await get().refreshTournamentGameState(true);
      }
    } catch (err) {
      console.error('Submit tournament turn failed:', err);
    }
  },

  abandonTournament: async () => {
    const { api, selectedAccount } = useBlockchainStore.getState();
    if (!api || !selectedAccount) return;

    try {
      const tx = api.tx.AutoBattle.abandon_tournament({});
      await submitTx(tx, selectedAccount.polkadotSigner, 'AutoBattle.abandon_tournament');
      set({ hasActiveTournamentGame: false });
    } catch (err) {
      console.error('Abandon tournament failed:', err);
    }
  },

  resetGameOver: () => {
    set({ tournamentGameOver: false, lastGameWins: 0 });
    useGameStore.setState({
      view: null,
      cardSet: null,
      battleOutput: null,
      showBattleOverlay: false,
    });
  },
}));

// ── PAPI-to-serde conversion helpers (copied from blockchainStore) ──

function papiEnumStr(v: any): string {
  if (typeof v === 'string') return v;
  return v?.type ?? String(v);
}

function binaryToStr(v: any): string {
  if (typeof v === 'string') return v;
  return v?.asText?.() || '';
}

function toStatusMask(v: any): number[] {
  if (Array.isArray(v)) {
    return v.map((x) => Number(x) & 0xff);
  }
  if (typeof v === 'number') {
    const out = new Array(32).fill(0);
    out[0] = v & 0xff;
    out[1] = (v >> 8) & 0xff;
    return out;
  }
  if (v && typeof v === 'object') {
    if (Array.isArray(v.value)) {
      return v.value.map((x: any) => Number(x) & 0xff);
    }
    if (Array.isArray(v.asBytes)) {
      return v.asBytes.map((x: any) => Number(x) & 0xff);
    }
  }
  return new Array(32).fill(0);
}

function convertEffect(v: any): any {
  if (!v) return v;
  const result: any = { type: papiEnumStr(v) };
  const data = v.value;
  if (data && typeof data === 'object') {
    for (const [key, val] of Object.entries(data)) {
      if (key === 'target') {
        result[key] = convertTarget(val);
      } else if (key === 'card_id') {
        result[key] = typeof val === 'number' ? val : Number(val);
      } else if (key === 'status') {
        result[key] = papiEnumStr(val);
      } else {
        result[key] = val;
      }
    }
  }
  return result;
}

function convertTarget(v: any): any {
  if (!v) return v;
  const tag = papiEnumStr(v);
  const data = v.value;
  if (data && typeof data === 'object') {
    const converted: any = {};
    for (const [key, val] of Object.entries(data)) {
      if (
        ['scope', 'target_scope', 'stat', 'source_stat', 'target_stat', 'order', 'op'].includes(key)
      ) {
        converted[key] = papiEnumStr(val);
      } else {
        converted[key] = val;
      }
    }
    return { type: tag, data: converted };
  }
  return { type: tag };
}

function convertMatcher(v: any): any {
  if (!v) return v;
  const tag = papiEnumStr(v);
  const data = v.value;
  if (data && typeof data === 'object') {
    const converted: any = {};
    for (const [key, val] of Object.entries(data)) {
      if (
        ['scope', 'target_scope', 'stat', 'source_stat', 'target_stat', 'order', 'op'].includes(key)
      ) {
        converted[key] = papiEnumStr(val);
      } else {
        converted[key] = val;
      }
    }
    return { type: tag, data: converted };
  }
  return { type: tag };
}

function convertCondition(v: any): any {
  if (!v) return v;
  const tag = papiEnumStr(v);
  if (tag === 'Is') {
    return { type: 'Is', data: convertMatcher(v.value) };
  }
  if (tag === 'AnyOf') {
    return { type: 'AnyOf', data: (v.value || []).map(convertMatcher) };
  }
  return { type: tag };
}

function convertAbility(a: any): any {
  return {
    trigger: papiEnumStr(a.trigger),
    effect: convertEffect(a.effect),
    name: binaryToStr(a.name),
    description: binaryToStr(a.description),
    conditions: (a.conditions || []).map(convertCondition),
    max_triggers: a.max_triggers ?? null,
  };
}
