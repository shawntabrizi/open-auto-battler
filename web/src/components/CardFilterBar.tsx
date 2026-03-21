export type SortOption = 'cost' | 'name';

interface CardFilterBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
}

export function CardFilterBar({
  searchQuery,
  onSearchChange,
  sortBy,
  onSortChange,
}: CardFilterBarProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 relative">
        <input
          type="text"
          placeholder="Search cards..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="theme-input theme-panel w-full rounded-lg border border-base-700/70 bg-surface-dark/80 px-2 py-1.5 pr-7 text-xs text-base-100 placeholder:text-base-500 shadow-elevation-rest transition-colors focus:border-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-inset lg:px-3 lg:py-2 lg:text-sm"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-sm leading-none text-base-500 transition-colors hover:text-accent"
            aria-label="Clear search"
          >
            ✕
          </button>
        )}
      </div>
      <select
        value={sortBy}
        onChange={(e) => onSortChange(e.target.value as SortOption)}
        className="theme-input theme-panel rounded-lg border border-base-700/70 bg-surface-dark/80 px-2 py-1.5 text-xs text-base-100 shadow-elevation-rest transition-colors focus:border-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-inset lg:py-2 lg:text-sm"
      >
        <option value="cost">Sort: Mana Cost</option>
        <option value="name">Sort: Name</option>
      </select>
    </div>
  );
}
