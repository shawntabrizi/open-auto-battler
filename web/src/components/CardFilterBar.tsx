export type SortOption = 'cost' | 'name';

interface CardFilterBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
}

export function CardFilterBar({ searchQuery, onSearchChange, sortBy, onSortChange }: CardFilterBarProps) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        placeholder="Search cards..."
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        className="flex-1 px-2 lg:px-3 py-1.5 lg:py-2 bg-warm-800 border border-warm-600 rounded text-white placeholder-warm-400 text-xs lg:text-sm focus:outline-none focus:border-blue-500"
      />
      <select
        value={sortBy}
        onChange={(e) => onSortChange(e.target.value as SortOption)}
        className="px-2 py-1.5 lg:py-2 bg-warm-800 border border-warm-600 rounded text-white text-xs lg:text-sm focus:outline-none focus:border-blue-500"
      >
        <option value="cost">Sort: Mana Cost</option>
        <option value="name">Sort: Name</option>
      </select>
    </div>
  );
}
