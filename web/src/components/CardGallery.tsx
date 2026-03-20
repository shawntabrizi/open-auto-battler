import { useState, useMemo } from 'react';
import { UnitCard } from './UnitCard';
import { CardFilterBar, type SortOption } from './CardFilterBar';
import type { CardView, BoardUnitView } from '../types';

interface CardGalleryProps {
  cards: (CardView | BoardUnitView)[];
  selectedId?: number | null;
  /** Per-item selection check — overrides selectedId when provided (useful for duplicates). */
  isSelected?: (card: CardView | BoardUnitView, index: number) => boolean;
  onSelect?: (card: CardView | BoardUnitView | null, index: number) => void;
  /** Controlled search/sort from parent (e.g. sandbox store). Omit to use internal state. */
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  sortBy?: SortOption;
  onSortChange?: (sort: SortOption) => void;
  /** Hide the filter bar */
  hideFilter?: boolean;
}

export function CardGallery({
  cards,
  selectedId,
  isSelected: isSelectedFn,
  onSelect,
  searchQuery: controlledSearch,
  onSearchChange,
  sortBy: controlledSort,
  onSortChange,
  hideFilter = false,
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
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
        <div className="flex flex-wrap gap-2 lg:gap-3 justify-center pt-1 lg:pt-2 pb-4 lg:pb-12">
          {filtered.map(({ card, originalIndex }) => {
            const selected = isSelectedFn ? isSelectedFn(card, originalIndex) : selectedId === card.id;
            return (
              <div key={`${card.id}-${originalIndex}`} className="w-[4.5rem] h-[6rem] md:w-[6rem] md:h-[8rem] lg:w-[7.5rem] lg:h-[10rem]">
                <UnitCard
                  card={card}
                  showCost={true}
                  showBurn={true}
                  draggable={false}
                  isSelected={selected}
                  onClick={() => onSelect?.(selected ? null : card, originalIndex)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
