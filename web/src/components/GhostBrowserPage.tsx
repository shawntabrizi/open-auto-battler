import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useInitGuard } from '../hooks';
import { useArenaStore } from '../store/arenaStore';
import type { BoardUnitView, CardView } from '../types';
import { blockchainCardToCardView } from '../utils/blockchainCards';
import { CardDetailPanel } from './CardDetailPanel';
import { TopBar } from './TopBar';
import { EmptySlot, UnitCard } from './UnitCard';
import { CARD_SIZES } from '../constants/cardSizes';

const ALL_FILTER = 'all';
const BOARD_SIZE = 5;

type GhostBoardUnitView = {
  cardId: number;
  permAttack: number;
  permHealth: number;
};

type GhostCatalogCard = CardView;

type ActiveGhostBoardView = {
  id: string;
  setId: number;
  round: number;
  wins: number;
  lives: number;
  poolIndex: number;
  owner: string;
  board: GhostBoardUnitView[];
};

type GhostBracketView = {
  key: string;
  round: number;
  wins: number;
  lives: number;
  ghosts: ActiveGhostBoardView[];
};

function shortAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function normalizeOwner(owner: unknown): string {
  if (typeof owner === 'string') return owner;
  if (owner && typeof owner === 'object' && 'toString' in owner) {
    const value = owner.toString();
    if (value) return value;
  }
  return String(owner);
}

function normalizeGhostBoard(ghost: any): GhostBoardUnitView[] {
  const board = ghost?.board ?? ghost;
  const rawUnits = Array.isArray(board) ? board : board?.units || [];

  return rawUnits.map((unit: any) => ({
    cardId:
      typeof unit.card_id === 'number' ? unit.card_id : Number(unit.card_id?.value ?? unit.card_id),
    permAttack:
      typeof unit.perm_attack === 'number' ? unit.perm_attack : Number(unit.perm_attack || 0),
    permHealth:
      typeof unit.perm_health === 'number' ? unit.perm_health : Number(unit.perm_health || 0),
  }));
}

function compareGhostBoards(a: ActiveGhostBoardView, b: ActiveGhostBoardView): number {
  return (
    a.round - b.round ||
    a.wins - b.wins ||
    b.lives - a.lives ||
    a.poolIndex - b.poolIndex ||
    a.owner.localeCompare(b.owner)
  );
}

function matchesFilter(value: number, filter: string): boolean {
  return filter === ALL_FILTER || value === Number(filter);
}

function describeOwner(owner: string, accounts: any[]): { label: string; address: string } {
  const knownAccount = accounts.find((account) => account.address === owner);
  if (!knownAccount) {
    return {
      label: shortAddress(owner),
      address: owner,
    };
  }

  return {
    label: knownAccount.source === 'dev' ? `${knownAccount.name} (dev)` : knownAccount.name,
    address: owner,
  };
}

function paddedBoard(board: GhostBoardUnitView[]): Array<GhostBoardUnitView | null> {
  return Array.from({ length: BOARD_SIZE }, (_, index) => board[index] ?? null);
}

function buildCatalogCard(card: any): GhostCatalogCard {
  return blockchainCardToCardView(card);
}

function buildGhostBoardUnitCard(
  unit: GhostBoardUnitView,
  cardLookup: Map<number, GhostCatalogCard>
): BoardUnitView {
  const baseCard = cardLookup.get(unit.cardId);
  const baseAttack = baseCard?.attack ?? 0;
  const baseHealth = baseCard?.health ?? 0;

  return {
    id: unit.cardId,
    name: baseCard?.name || `Card #${unit.cardId}`,
    attack: baseAttack + unit.permAttack,
    health: baseHealth + unit.permHealth,
    play_cost: baseCard?.play_cost ?? 0,
    burn_value: baseCard?.burn_value ?? 0,
    shop_abilities: baseCard?.shop_abilities || [],
    battle_abilities: baseCard?.battle_abilities || [],
  };
}

export function GhostBrowserPage() {
  const {
    api,
    isConnected,
    isConnecting,
    connectionError,
    connect,
    fetchCards,
    fetchSets,
    allCards,
    availableSets,
    accounts,
    blockNumber,
  } = useArenaStore();

  const [selectedSetId, setSelectedSetId] = useState<number | null>(null);
  const [roundFilter, setRoundFilter] = useState(ALL_FILTER);
  const [winsFilter, setWinsFilter] = useState(ALL_FILTER);
  const [livesFilter, setLivesFilter] = useState(ALL_FILTER);
  const [ghosts, setGhosts] = useState<ActiveGhostBoardView[]>([]);
  const [isLoadingGhosts, setIsLoadingGhosts] = useState(false);
  const [ghostError, setGhostError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [detailCard, setDetailCard] = useState<BoardUnitView | null>(null);
  const [selectedCardKey, setSelectedCardKey] = useState<string | null>(null);

  useInitGuard(() => {
    if (isConnected) return;
    void connect();
  }, [connect, isConnected]);

  useEffect(() => {
    if (!isConnected) return;
    if (allCards.length === 0) {
      void fetchCards();
    }
    if (availableSets.length === 0) {
      void fetchSets();
    }
  }, [allCards.length, availableSets.length, fetchCards, fetchSets, isConnected]);

  const sortedSets = useMemo(() => [...availableSets].sort((a, b) => a.id - b.id), [availableSets]);

  useEffect(() => {
    if (sortedSets.length === 0) {
      setSelectedSetId(null);
      return;
    }

    if (selectedSetId !== null && sortedSets.some((set) => set.id === selectedSetId)) {
      return;
    }

    const preferredSetId = sortedSets.find((set) => set.id === 0)?.id ?? sortedSets[0].id;
    setSelectedSetId(preferredSetId);
  }, [selectedSetId, sortedSets]);

  useEffect(() => {
    setRoundFilter(ALL_FILTER);
    setWinsFilter(ALL_FILTER);
    setLivesFilter(ALL_FILTER);
    setDetailCard(null);
    setSelectedCardKey(null);
  }, [selectedSetId]);

  useEffect(() => {
    if (!isConnected || !api || selectedSetId === null) return;

    let cancelled = false;

    const loadGhosts = async () => {
      setIsLoadingGhosts(true);
      setGhostError(null);
      setGhosts([]);

      try {
        let entries: any[] = [];
        try {
          entries = await api.query.AutoBattle.GhostOpponents.getEntries(selectedSetId);
        } catch {
          entries = await api.query.AutoBattle.GhostOpponents.getEntries();
        }

        if (cancelled) return;

        const nextGhosts = entries
          .flatMap((entry: any) => {
            const [entrySetId, round, wins, lives] = entry.keyArgs.map((value: any) =>
              Number(value)
            );

            if (entrySetId !== selectedSetId) {
              return [];
            }

            const pool = Array.isArray(entry.value)
              ? entry.value
              : entry.value
                ? [entry.value]
                : [];

            return pool
              .map((ghost: any, poolIndex: number) => {
                const owner = normalizeOwner(ghost?.owner);
                const board = normalizeGhostBoard(ghost);

                return {
                  id: `${entrySetId}-${round}-${wins}-${lives}-${poolIndex}-${owner}`,
                  setId: entrySetId,
                  round,
                  wins,
                  lives,
                  poolIndex,
                  owner,
                  board,
                };
              })
              .filter((ghost: ActiveGhostBoardView) => ghost.board.length > 0);
          })
          .sort(compareGhostBoards);

        setGhosts(nextGhosts);
      } catch (error) {
        console.error('Failed to load active ghost opponents:', error);
        if (!cancelled) {
          setGhosts([]);
          setGhostError('Failed to load active ghost opponents from the blockchain.');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingGhosts(false);
        }
      }
    };

    void loadGhosts();

    return () => {
      cancelled = true;
    };
  }, [api, isConnected, refreshNonce, selectedSetId]);

  const cardLookup = useMemo(() => {
    return new Map(allCards.map((card) => [card.id, buildCatalogCard(card)]));
  }, [allCards]);

  const selectedSet = useMemo(
    () => sortedSets.find((set) => set.id === selectedSetId) ?? null,
    [selectedSetId, sortedSets]
  );

  const filterOptions = useMemo(() => {
    const rounds = [...new Set(ghosts.map((ghost) => ghost.round))].sort((a, b) => a - b);
    const wins = [...new Set(ghosts.map((ghost) => ghost.wins))].sort((a, b) => a - b);
    const lives = [...new Set(ghosts.map((ghost) => ghost.lives))].sort((a, b) => b - a);
    return { rounds, wins, lives };
  }, [ghosts]);

  const filteredGhosts = useMemo(() => {
    return ghosts.filter(
      (ghost) =>
        matchesFilter(ghost.round, roundFilter) &&
        matchesFilter(ghost.wins, winsFilter) &&
        matchesFilter(ghost.lives, livesFilter)
    );
  }, [ghosts, livesFilter, roundFilter, winsFilter]);

  const bracketGroups = useMemo(() => {
    const groups = new Map<string, GhostBracketView>();

    for (const ghost of filteredGhosts) {
      const key = `${ghost.round}-${ghost.wins}-${ghost.lives}`;
      const existing = groups.get(key);

      if (existing) {
        existing.ghosts.push(ghost);
        continue;
      }

      groups.set(key, {
        key,
        round: ghost.round,
        wins: ghost.wins,
        lives: ghost.lives,
        ghosts: [ghost],
      });
    }

    return [...groups.values()].sort(
      (a, b) => a.round - b.round || a.wins - b.wins || b.lives - a.lives
    );
  }, [filteredGhosts]);

  const totalBracketCount = useMemo(
    () => new Set(ghosts.map((ghost) => `${ghost.round}-${ghost.wins}-${ghost.lives}`)).size,
    [ghosts]
  );

  if (!isConnected) {
    return (
      <div className="app-shell min-h-screen min-h-svh text-white flex flex-col">
        <TopBar backTo="/history" backLabel="History" title="Ghost Browser" />
        <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center p-4">
          <div className="theme-panel w-full max-w-md rounded-3xl border border-base-800 bg-base-900/70 p-6 lg:p-8 text-center">
            <div className="text-[10px] lg:text-xs font-heading tracking-[0.35em] text-base-500 uppercase">
              Ghost Opponents
            </div>
            <h1 className="theme-title-text mt-2 text-2xl lg:text-4xl font-black tracking-tight text-transparent bg-clip-text">
              Blockchain Required
            </h1>
            <p className="mt-3 text-sm lg:text-base text-base-300">
              This view reads the active ghost pool directly from the blockchain.
            </p>
            {connectionError && (
              <p className="mt-3 rounded-xl theme-error-panel border px-3 py-2 text-xs text-defeat">
                {connectionError}
              </p>
            )}
            <div className="mt-5 flex flex-col gap-3">
              <button
                onClick={() => void connect()}
                disabled={isConnecting}
                className="theme-button btn-primary rounded-xl px-4 py-3 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:bg-base-700 disabled:text-base-400"
              >
                {isConnecting ? 'CONNECTING...' : 'RETRY CONNECTION'}
              </button>
              <Link
                to="/network"
                className="theme-button theme-surface-button rounded-xl border px-4 py-3 text-sm font-bold transition-colors"
              >
                NETWORK SETTINGS
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell h-screen h-svh text-white overflow-hidden flex flex-col">
      <TopBar backTo="/history" backLabel="History" title="Ghost Browser" hasCardPanel />

      <CardDetailPanel card={detailCard} isVisible={true} mode={{ type: 'readOnly' }} />

      <div className="flex-1 min-h-0 ml-44 lg:ml-80">
        <div className="h-full overflow-y-auto">
          <div className="sticky top-0 z-20 border-b border-base-900/80 bg-surface-dark/95 backdrop-blur-sm">
            <div className="flex items-center justify-end px-2 pt-2 lg:px-4 lg:pt-3">
              <button
                onClick={() => setRefreshNonce((value) => value + 1)}
                disabled={isLoadingGhosts || selectedSetId === null}
                className="theme-button theme-surface-button rounded-lg border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.18em] transition-colors disabled:cursor-not-allowed disabled:border-base-800 disabled:text-base-600 lg:px-3 lg:py-1.5 lg:text-xs"
              >
                {isLoadingGhosts ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>

            <div className="px-2 pb-2 lg:px-4 lg:pb-3">
              <div className="theme-panel rounded-2xl border border-base-800 bg-base-900/40 p-2 lg:p-3">
                <div className="flex flex-wrap items-center gap-1.5 text-[9px] text-base-400 uppercase tracking-[0.18em] lg:gap-2 lg:text-[11px] lg:tracking-[0.25em]">
                  <span>Live Ghost Pool</span>
                  <span className="text-base-700">•</span>
                  <span>
                    {blockNumber !== null ? `Block #${blockNumber.toLocaleString()}` : 'Connected'}
                  </span>
                  {selectedSet && (
                    <>
                      <span className="text-base-700">•</span>
                      <span>
                        {selectedSet.name} (
                        {Array.isArray(selectedSet.cards) ? selectedSet.cards.length : 0} cards)
                      </span>
                    </>
                  )}
                </div>

                <div className="mt-2 grid grid-cols-4 gap-1 lg:mt-3 lg:gap-2">
                  <label className="flex min-w-0 flex-col gap-1 lg:gap-2">
                    <span className="text-[8px] font-bold uppercase tracking-[0.16em] text-base-500 lg:text-[11px] lg:tracking-[0.2em]">
                      <span className="lg:hidden">Set</span>
                      <span className="hidden lg:inline">Set</span>
                    </span>
                    <select
                      value={selectedSetId ?? ''}
                      onChange={(event) => setSelectedSetId(Number(event.target.value))}
                      disabled={sortedSets.length === 0}
                      className="theme-input min-w-0 rounded-lg border border-base-700 bg-base-950/70 px-1.5 py-1.5 text-[9px] leading-tight text-white outline-none transition-colors focus:border-accent/50 disabled:cursor-not-allowed disabled:text-base-600 lg:rounded-xl lg:px-3 lg:py-2.5 lg:text-sm"
                    >
                      {sortedSets.length === 0 ? (
                        <option value="">No sets available</option>
                      ) : (
                        sortedSets.map((set) => (
                          <option key={set.id} value={set.id}>
                            {set.name} (#{set.id})
                          </option>
                        ))
                      )}
                    </select>
                  </label>

                  <label className="flex min-w-0 flex-col gap-1 lg:gap-2">
                    <span className="text-[8px] font-bold uppercase tracking-[0.16em] text-base-500 lg:text-[11px] lg:tracking-[0.2em]">
                      Round
                    </span>
                    <select
                      value={roundFilter}
                      onChange={(event) => setRoundFilter(event.target.value)}
                      className="theme-input min-w-0 rounded-lg border border-base-700 bg-base-950/70 px-1.5 py-1.5 text-[9px] leading-tight text-white outline-none transition-colors focus:border-accent/50 lg:rounded-xl lg:px-3 lg:py-2.5 lg:text-sm"
                    >
                      <option value={ALL_FILTER}>All rounds</option>
                      {filterOptions.rounds.map((round) => (
                        <option key={round} value={round}>
                          Round {round}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex min-w-0 flex-col gap-1 lg:gap-2">
                    <span className="text-[8px] font-bold uppercase tracking-[0.16em] text-base-500 lg:text-[11px] lg:tracking-[0.2em]">
                      Wins
                    </span>
                    <select
                      value={winsFilter}
                      onChange={(event) => setWinsFilter(event.target.value)}
                      className="theme-input min-w-0 rounded-lg border border-base-700 bg-base-950/70 px-1.5 py-1.5 text-[9px] leading-tight text-white outline-none transition-colors focus:border-accent/50 lg:rounded-xl lg:px-3 lg:py-2.5 lg:text-sm"
                    >
                      <option value={ALL_FILTER}>All wins</option>
                      {filterOptions.wins.map((wins) => (
                        <option key={wins} value={wins}>
                          {wins} wins
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex min-w-0 flex-col gap-1 lg:gap-2">
                    <span className="text-[8px] font-bold uppercase tracking-[0.16em] text-base-500 lg:text-[11px] lg:tracking-[0.2em]">
                      Lives
                    </span>
                    <select
                      value={livesFilter}
                      onChange={(event) => setLivesFilter(event.target.value)}
                      className="theme-input min-w-0 rounded-lg border border-base-700 bg-base-950/70 px-1.5 py-1.5 text-[9px] leading-tight text-white outline-none transition-colors focus:border-accent/50 lg:rounded-xl lg:px-3 lg:py-2.5 lg:text-sm"
                    >
                      <option value={ALL_FILTER}>All lives</option>
                      {filterOptions.lives.map((lives) => (
                        <option key={lives} value={lives}>
                          {lives} lives
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-1 text-[9px] text-base-300 lg:mt-3 lg:gap-2 lg:text-xs">
                  <span className="rounded-full border border-base-700 bg-base-950/70 px-2 py-1 lg:px-3 lg:py-1.5">
                    {filteredGhosts.length} shown
                  </span>
                  <span className="rounded-full border border-base-700 bg-base-950/70 px-2 py-1 lg:px-3 lg:py-1.5">
                    {bracketGroups.length} brackets
                  </span>
                  <span className="hidden sm:inline-flex rounded-full border border-base-700 bg-base-950/70 px-2 py-1 lg:px-3 lg:py-1.5">
                    {ghosts.length} in set
                  </span>
                  <span className="hidden lg:inline-flex rounded-full border border-base-700 bg-base-950/70 px-3 py-1.5">
                    {totalBracketCount} set brackets
                  </span>
                  <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-1 text-accent lg:px-3 lg:py-1.5">
                    Inspect left
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="w-full max-w-none lg:max-w-6xl mx-auto p-2 lg:p-4 pb-6">
            {ghostError && (
              <div className="rounded-2xl theme-error-panel border px-4 py-3 text-sm text-defeat">
                {ghostError}
              </div>
            )}

            {!ghostError && sortedSets.length === 0 && (
              <div className="theme-panel rounded-2xl border border-base-800 bg-base-900/40 px-4 py-10 text-center">
                <div className="text-sm font-bold text-white">No blockchain sets found</div>
                <p className="mt-2 text-sm text-base-400">
                  Create or sync a set on-chain before browsing active ghosts.
                </p>
              </div>
            )}

            {!ghostError && sortedSets.length > 0 && isLoadingGhosts && ghosts.length === 0 && (
              <div className="theme-panel rounded-2xl border border-base-800 bg-base-900/40 px-4 py-10 text-center text-base-400">
                Loading active ghost opponents...
              </div>
            )}

            {!ghostError &&
              sortedSets.length > 0 &&
              !isLoadingGhosts &&
              bracketGroups.length === 0 &&
              selectedSetId !== null && (
                <div className="theme-panel rounded-2xl border border-base-800 bg-base-900/40 px-4 py-10 text-center">
                  <div className="text-sm font-bold text-white">
                    No active ghosts match these filters
                  </div>
                  <p className="mt-2 text-sm text-base-400">
                    Set #{selectedSetId} has no active ghost boards for the current round, wins, and
                    lives filter combination.
                  </p>
                </div>
              )}

            <div className="mt-3 flex flex-col gap-3 pb-6 lg:mt-4 lg:gap-4">
              {bracketGroups.map((group) => (
                <section
                  key={group.key}
                  className="theme-panel rounded-2xl border border-base-800 bg-gradient-to-br from-base-900/70 to-base-950/70 p-2.5 lg:rounded-3xl lg:p-5"
                >
                  <div className="flex flex-col gap-2.5 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="text-[10px] font-heading uppercase tracking-[0.35em] text-base-500">
                        Matchmaking Bracket
                      </div>
                      <h2 className="mt-1 text-lg lg:text-2xl font-black text-white">
                        Round {group.round}
                      </h2>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full border border-positive/30 bg-positive/10 px-3 py-1 text-xs font-bold text-positive">
                        {group.wins} wins
                      </span>
                      <span className="rounded-full border border-defeat/30 bg-defeat/10 px-3 py-1 text-xs font-bold text-defeat">
                        {group.lives} lives
                      </span>
                      <span className="rounded-full border border-base-700 bg-base-950/60 px-3 py-1 text-xs font-bold text-base-300">
                        {group.ghosts.length} active boards
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3">
                    {group.ghosts.map((ghost) => {
                      const owner = describeOwner(ghost.owner, accounts);

                      return (
                        <article
                          key={ghost.id}
                          className="theme-panel rounded-2xl border border-white/5 bg-base-950/60 p-2 lg:p-4"
                        >
                          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0">
                              <div className="text-[10px] font-heading uppercase tracking-[0.3em] text-base-500">
                                Pool Slot {ghost.poolIndex + 1}
                              </div>
                              <div className="mt-1 text-sm lg:text-base font-bold text-white">
                                {owner.label}
                              </div>
                              <div className="mt-1 break-all font-mono text-[11px] text-base-500">
                                {owner.address}
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2 text-xs">
                              <span className="rounded-full border border-base-700 bg-base-900/70 px-3 py-1 text-base-300">
                                Set #{ghost.setId}
                              </span>
                              <span className="rounded-full border border-base-700 bg-base-900/70 px-3 py-1 text-base-300">
                                Round {ghost.round}
                              </span>
                              <span className="rounded-full border border-base-700 bg-base-900/70 px-3 py-1 text-base-300">
                                {ghost.wins} wins / {ghost.lives} lives
                              </span>
                            </div>
                          </div>

                          <div
                            className="mt-2.5 overflow-x-auto pb-2 lg:mt-4"
                            style={{ WebkitOverflowScrolling: 'touch' }}
                          >
                            <div className="flex min-w-max gap-2 lg:gap-3 snap-x snap-mandatory">
                              {paddedBoard(ghost.board).map((unit, index) => {
                                if (!unit) {
                                  return (
                                    <div
                                      key={`${ghost.id}-empty-${index}`}
                                      className="shrink-0 snap-start"
                                    >
                                      <div className={CARD_SIZES.compact.tw}>
                                        <EmptySlot
                                          sizeVariant="compact"
                                          label={`Slot ${index + 1}`}
                                        />
                                      </div>
                                    </div>
                                  );
                                }

                                const boardCard = buildGhostBoardUnitCard(unit, cardLookup);
                                const cardKey = `${ghost.id}-${index}-${unit.cardId}`;

                                return (
                                  <div key={cardKey} className="shrink-0 snap-start">
                                    <div className={CARD_SIZES.compact.tw}>
                                      <UnitCard
                                        card={boardCard}
                                        sizeVariant="compact"
                                        showCost={true}
                                        showBurn={true}
                                        draggable={false}
                                        isSelected={selectedCardKey === cardKey}
                                        onClick={() => {
                                          setDetailCard(boardCard);
                                          setSelectedCardKey(cardKey);
                                        }}
                                      />
                                    </div>
                                    <div className="mt-2 w-20 lg:w-28 rounded-xl border border-base-800 bg-base-900/70 px-2 py-1.5 text-center text-[10px] lg:text-[11px] text-base-300">
                                      <div className="font-bold text-white">
                                        {boardCard.attack}/{boardCard.health}
                                      </div>
                                      <div className="mt-0.5 text-base-500">
                                        {unit.permAttack >= 0 ? '+' : ''}
                                        {unit.permAttack} ATK, {unit.permHealth >= 0 ? '+' : ''}
                                        {unit.permHealth} HP
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
