import { useState, useMemo } from 'react';
import { UnitCard } from './UnitCard';
import { CardFilterBar, type SortOption } from './CardFilterBar';
import type { CardView, BoardUnitView } from '../types';

interface CardGalleryProps {
  cards: (CardView | BoardUnitView)[];
  selectedId?: number | null;
  onSelect?: (card: CardView | BoardUnitView | null) => void;
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

  const sorted = useMemo(
    () =>
      [...cards].sort((a, b) =>
        sortBy === 'name'
          ? a.name.localeCompare(b.name)
          : a.play_cost - b.play_cost || a.name.localeCompare(b.name)
      ),
    [cards, sortBy]
  );

  const filtered = useMemo(() => {
    if (!searchQuery) return sorted;
    const q = searchQuery.toLowerCase();
    return sorted.filter((card) => JSON.stringify(card).toLowerCase().includes(q));
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
        <div className="grid grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8 gap-1 md:gap-4 lg:gap-6 pb-4 lg:pb-12">
          {filtered.map((card, i) => (
            <div key={`${card.id}-${i}`} className="aspect-[3/4]">
              <UnitCard
                card={card}
                showCost={true}
                showBurn={true}
                draggable={false}
                isSelected={selectedId === card.id}
                onClick={() =>
                  onSelect?.(selectedId === card.id ? null : card)
                }
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
