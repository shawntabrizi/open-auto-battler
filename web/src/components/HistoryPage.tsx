import { Link } from 'react-router-dom';
import { PageHeader } from './PageHeader';

const HISTORY_ITEMS = [
  {
    to: '/history/achievements',
    icon: '🏆',
    label: 'Achievements',
    description: 'Track your progress',
  },
  {
    to: '/history/stats',
    icon: '📊',
    label: 'Stats',
    description: 'Matches, wins & more',
  },
  {
    to: '/history/battles',
    icon: '⚔️',
    label: 'Battle History',
    description: 'Review past battles',
  },
  {
    to: '/history/ghosts',
    icon: '👻',
    label: 'Ghost Opponents',
    description: 'Saved battle ghosts',
  },
];

export function HistoryPage() {
  return (
    <div className="fixed inset-0 bg-warm-950 text-white overflow-y-auto">
      <div className="w-full max-w-sm lg:max-w-md mx-auto p-3 lg:p-4 lg:mt-[10vh]">
        <PageHeader backTo="/" backLabel="Menu" title="History" />

        <div className="flex flex-col gap-2.5 lg:gap-4">
          {HISTORY_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="flex items-center gap-3 lg:gap-4 p-3 lg:p-4 rounded-xl border border-warm-700 bg-warm-900/30 hover:border-warm-500 transition-all group"
            >
              <span className="text-2xl lg:text-3xl">{item.icon}</span>
              <div>
                <div className="font-heading text-sm lg:text-base font-bold text-warm-200 group-hover:text-yellow-400 transition-colors">
                  {item.label}
                </div>
                <div className="text-warm-500 text-[10px] lg:text-xs">{item.description}</div>
              </div>
              <span className="text-warm-600 text-lg ml-auto">&rarr;</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
