import { useState, useMemo, type Ref } from 'react';
import { UnitCard } from './UnitCard';
import { CardFilterBar, type SortOption } from './CardFilterBar';
import type { CardView, BoardUnitView } from '../types';

interface CardGalleryProps {
  cards: (CardView | BoardUnitView)[];
  selectedId?: number | null;
  /** Per-item selection check — overrides selectedId when provided (useful for duplicates). */
  isSelected?: (card: CardView | BoardUnitView, index: number) => boolean;
  onSelect?: (card: CardView | BoardUnitView | null, index: number) => void;
  /** Make each rendered card a native button so keyboard users can tab and select cards. */
  focusableCards?: boolean;
  /** Controlled search/sort from parent (e.g. sandbox store). Omit to use internal state. */
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  sortBy?: SortOption;
  onSortChange?: (sort: SortOption) => void;
  /** Hide the filter bar */
  hideFilter?: boolean;
  /** Optional ref/label for the scrollable gallery region */
  scrollRegionRef?: Ref<HTMLDivElement>;
  scrollRegionLabel?: string;
  scrollRegionTabIndex?: number;
}

export function CardGallery({
  cards,
  selectedId,
  isSelected: isSelectedFn,
  onSelect,
  focusableCards = false,
  searchQuery: controlledSearch,
  onSearchChange,
  sortBy: controlledSort,
  onSortChange,
  hideFilter = false,
  scrollRegionRef,
  scrollRegionLabel,
  scrollRegionTabIndex,
}: CardGalleryProps) {
  // Internal state when not controlled
  const [internalSearch, setInternalSearch] = useState('');
  const [internalSort, setInternalSort] = useState<SortOption>('cost');

  const searchQuery = controlledSearch ?? internalSearch;
  const setSearchQuery = onSearchChange ?? setInternalSearch;
  const sortBy = controlledSort ?? internalSort;
  const setSortBy = onSortChange ?? setInternalSort;

  // Track original index through sort/filter so callbacks reference input array positions
  const sorted = useMemo(
    () =>
      cards
        .map((card, originalIndex) => ({ card, originalIndex }))
        .sort((a, b) =>
          sortBy === 'name'
            ? a.card.name.localeCompare(b.card.name)
            : a.card.play_cost - b.card.play_cost || a.card.name.localeCompare(b.card.name)
        ),
    [cards, sortBy]
  );

  const filtered = useMemo(() => {
    if (!searchQuery) return sorted;
    const q = searchQuery.toLowerCase();
    return sorted.filter((item) => JSON.stringify(item.card).toLowerCase().includes(q));
  }, [sorted, searchQuery]);

  return (
    <div className="flex flex-col h-full min-h-0">
      {!hideFilter && (
        <div className="flex-shrink-0 pb-2 lg:pb-3">
          <CardFilterBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            sortBy={sortBy}
            onSortChange={setSortBy}
          />
        </div>
      )}
      <div
        ref={scrollRegionRef}
        role={scrollRegionLabel ? 'region' : undefined}
        aria-label={scrollRegionLabel}
        tabIndex={scrollRegionTabIndex}
        className="flex-1 min-h-0 overflow-y-auto custom-scrollbar"
      >
        <div className="flex flex-wrap gap-2 lg:gap-3 justify-center pt-1 lg:pt-2 pb-4 lg:pb-12">
          {filtered.map(({ card, originalIndex }) => {
            const selected = isSelectedFn
              ? isSelectedFn(card, originalIndex)
              : selectedId === card.id;
            const handleSelect = () => onSelect?.(selected ? null : card, originalIndex);
            const cardElement = (
              <UnitCard
                card={card}
                showCost={true}
                showBurn={true}
                draggable={false}
                isSelected={selected}
                onClick={focusableCards ? undefined : handleSelect}
              />
            );

            return (
              <div
                key={`${card.id}-${originalIndex}`}
                className="w-[4.5rem] h-[6rem] md:w-[6rem] md:h-[8rem] lg:w-[7.5rem] lg:h-[10rem]"
              >
                {focusableCards ? (
                  <button
                    type="button"
                    aria-label={`${card.name}, cost ${card.play_cost}, attack ${card.attack}, health ${card.health}`}
                    aria-pressed={selected}
                    onClick={handleSelect}
                    className="block w-full h-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-300 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                  >
                    {cardElement}
                  </button>
                ) : (
                  cardElement
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
