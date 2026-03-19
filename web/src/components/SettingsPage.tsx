import { Link, useLocation } from 'react-router-dom';
import { PageHeader } from './PageHeader';

// ── Settings Hub ──

export function SettingsPage() {
  const location = useLocation();
  const returnTo =
    location.state &&
    typeof location.state === 'object' &&
    'returnTo' in location.state &&
    typeof location.state.returnTo === 'string'
      ? location.state.returnTo
      : null;

  return (
    <div className="fixed inset-0 bg-warm-950 text-white overflow-y-auto">
      <div className="w-full max-w-sm lg:max-w-md mx-auto p-3 lg:p-4 lg:mt-[15vh]">
        <PageHeader
          backTo={returnTo ?? '/'}
          backLabel={returnTo ? 'Game' : 'Menu'}
          title="Settings"
        />

        {/* Options */}
        <div className="flex flex-col gap-3 lg:gap-4">
          <Link
            to="/customize"
            state={location.state}
            className="w-full text-left p-4 lg:p-5 rounded-xl border border-warm-700 bg-warm-900/30 hover:border-warm-600 transition-all group"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-bold text-base lg:text-lg text-white group-hover:text-yellow-400 transition-colors">
                  Customize
                </div>
                <div className="text-warm-500 text-xs lg:text-sm mt-0.5">
                  Card art, backgrounds &amp; avatars
                </div>
              </div>
              <span className="text-warm-600 text-lg">&rarr;</span>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
