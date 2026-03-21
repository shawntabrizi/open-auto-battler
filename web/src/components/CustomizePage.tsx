import React from 'react';
import { Link } from 'react-router-dom';
import { useCustomizationStore, type CustomizationType } from '../store/customizationStore';
import { CustomizationPreview } from './CustomizationPreview';
import { TopBar } from './TopBar';

const SECTIONS: { slug: string; type: CustomizationType; label: string; icon: string }[] = [
  { slug: 'backgrounds', type: 'board_bg', label: 'Background', icon: '🖼' },
  { slug: 'hand', type: 'hand_bg', label: 'Hand', icon: '🃏' },
  { slug: 'card-border', type: 'card_style', label: 'Card Border', icon: '🪟' },
  { slug: 'avatar', type: 'avatar', label: 'Avatar', icon: '👤' },
  { slug: 'card-art', type: 'card_art', label: 'Card Art', icon: '🎨' },
];

const SLOT_MAP: Record<
  CustomizationType,
  keyof ReturnType<typeof useCustomizationStore.getState>['selections']
> = {
  board_bg: 'boardBackground',
  hand_bg: 'handBackground',
  card_style: 'cardStyle',
  avatar: 'playerAvatar',
  card_art: 'cardArt',
};

export const CustomizePage: React.FC = () => {
  const { selections } = useCustomizationStore();

  return (
    <div className="app-shell h-screen h-svh text-base-200 flex flex-col">
      <TopBar backTo="/" backLabel="Menu" title="Customize" />

      {/* Mobile: two-column layout — preview left, categories right */}
      <div className="flex-1 flex lg:hidden p-2 gap-2 min-h-0">
        <div className="w-2/3 flex items-center justify-center">
          <CustomizationPreview />
        </div>
        <div className="w-1/3 flex flex-col gap-1 overflow-y-auto justify-center">
          {SECTIONS.map((section) => (
            <Link
              key={section.slug}
              to={`/customize/${section.slug}`}
              className="theme-panel theme-button flex items-center gap-2 bg-base-900/50 border border-white/5 hover:border-accent/30 rounded-lg px-3 py-1.5 transition-all hover:bg-base-800/50 active:scale-95"
            >
              <span className="text-base">{section.icon}</span>
              <span className="text-[10px] font-bold text-white">{section.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Desktop: preview on top, category grid below */}
      <div className="hidden lg:flex flex-col flex-1">
        <div className="flex justify-center px-8 pb-4">
          <div className="w-full max-w-xs">
            <CustomizationPreview />
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="grid grid-cols-2 gap-6 w-full max-w-lg">
            {SECTIONS.map((section) => {
              const current = selections[SLOT_MAP[section.type]];
              return (
                <Link
                  key={section.slug}
                  to={`/customize/${section.slug}`}
                  className="theme-panel bg-base-900/50 border border-white/5 hover:border-accent/30 rounded-2xl p-6 text-center transition-all hover:bg-base-800/50 active:scale-95"
                >
                  <div className="text-5xl mb-3">{section.icon}</div>
                  <div className="text-base font-bold text-white">{section.label}</div>
                  <div className="text-xs text-base-500 mt-1">
                    {current ? current.name : 'Default'}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
