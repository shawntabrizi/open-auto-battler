import { Link } from 'react-router-dom';
import { TopBar } from './TopBar';
import { useThemeStore } from '../store/themeStore';
import { getTheme } from '../theme/themes';

const MENU_BUTTONS = [
  {
    to: '/sets',
    label: 'Sets',
    description: 'Browse & select card sets',
    gradient: 'from-gold/10 to-surface-dark/10',
    border: 'border-gold/40 hover:border-gold hover:shadow-elevation-hover',
  },
  {
    to: '/cards',
    label: 'Cards',
    description: 'Card Sandbox',
    gradient: 'from-accent-violet/10 to-surface-dark/10',
    border: 'border-accent-violet/40 hover:border-accent-violet hover:shadow-elevation-hover',
  },
  {
    to: '/customize',
    label: 'Customize',
    description: 'Art, backgrounds & avatars',
    gradient: 'from-accent-emerald/10 to-surface-dark/10',
    border: 'border-accent-emerald/40 hover:border-accent-emerald hover:shadow-elevation-hover',
  },
  {
    to: '/history',
    label: 'History',
    description: 'Achievements & stats',
    gradient: 'from-mana-blue/10 to-surface-dark/10',
    border: 'border-mana-blue/40 hover:border-mana-blue hover:shadow-elevation-hover',
  },
];

export function HomePage() {
  const theme = getTheme(useThemeStore((s) => s.selectedThemeId));
  return (
    <div className="app-shell min-h-screen min-h-svh flex flex-col text-white overflow-hidden relative">
      <TopBar />
      {/* Main content */}
      <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center p-3 lg:p-4">
        <div className="relative z-10 flex flex-col items-center justify-center w-full max-w-sm lg:max-w-md">
          {/* Title */}
          <div
            className="mb-6 lg:mb-10 text-center opacity-0 animate-stagger-fade-in stagger-1"
            style={{ animationFillMode: 'forwards' }}
          >
            <h1 className="theme-title-text font-decorative text-3xl lg:text-5xl font-bold tracking-wide text-transparent bg-clip-text mb-1 lg:mb-2">
              OPEN AUTO BATTLER
            </h1>
            <p className="theme-hero-subtitle font-heading text-xs lg:text-sm tracking-widest uppercase">
              Roguelike Deck-Building Auto-Battler
            </p>
          </div>

          {/* Menu buttons */}
          <div className="flex flex-col gap-2.5 lg:gap-4 w-full">
            {/* Play — primary CTA, larger */}
            <Link
              to="/play"
              className="theme-panel theme-cta-card opacity-0 animate-stagger-fade-in stagger-2 group block w-full p-5 lg:p-7 rounded-xl border-2 transition-all active:scale-[0.98] text-center"
              style={{ animationFillMode: 'forwards' }}
            >
              <div className="flex items-center justify-center gap-3 lg:gap-5">
                <img src={theme.assets.playIcon} alt="" className="h-16 lg:h-24 w-auto" />
                <div className="text-left">
                  <h2 className="font-button text-2xl lg:text-3xl font-bold text-white tracking-wide">
                    PLAY
                  </h2>
                  <p className="theme-secondary-text mt-0.5 text-[10px] lg:text-sm">
                    Online Arena, Offline, Peer-to-Peer
                  </p>
                </div>
              </div>
            </Link>

            {/* Secondary menu row */}
            <div className="grid grid-cols-2 gap-2.5 lg:gap-4">
              {/* stagger-3 | stagger-4 | stagger-5 | stagger-6 */}
              {MENU_BUTTONS.map((btn, i) => (
                <Link
                  key={btn.to}
                  to={btn.to}
                  className={`theme-panel opacity-0 animate-stagger-fade-in ${['stagger-3', 'stagger-4', 'stagger-5', 'stagger-6'][i]} group block p-3 lg:p-4 rounded-xl border transition-all active:scale-[0.98] text-center bg-gradient-to-br ${btn.gradient} ${btn.border}`}
                  style={{ animationFillMode: 'forwards' }}
                >
                  <h3 className="font-button text-sm lg:text-base font-bold text-white tracking-wide">
                    {btn.label}
                  </h3>
                  <p className="theme-secondary-text text-[8px] lg:text-xs mt-0.5 leading-tight">
                    {btn.description}
                  </p>
                </Link>
              ))}
            </div>
          </div>

          {/* Version */}
          <div
            className="mt-6 lg:mt-10 text-[9px] lg:text-[10px] text-base-600 font-mono opacity-0 animate-stagger-fade-in stagger-7"
            style={{ animationFillMode: 'forwards' }}
          >
            v0.1.0
          </div>
        </div>
      </div>
    </div>
  );
}
