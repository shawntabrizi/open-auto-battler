import { useState, useCallback } from 'react';

const PAGES: Record<string, string> = {
  Home: '/',
  Play: '/play',
  Sets: '/sets',
  'Set Preview': '/sets/1',
  'Card Sandbox': '/cards',
  History: '/history',
  Achievements: '/history/achievements',
  Stats: '/history/stats',
  'Battle History': '/history/battles',
  'Ghost Browser': '/history/ghosts',
  Practice: '/practice',
  'Practice Game': '/practice/game',
  Arena: '/arena',
  'Arena Game': '/arena/game',
  Versus: '/versus',
  'Versus Lobby': '/versus/lobby',
  'Versus Game': '/versus/game',
  Tournament: '/tournament',
  'Tournament Lobby': '/tournament/lobby',
  'Tournament Game': '/tournament/game',
  Customize: '/customize',
  'Customize: Backgrounds': '/customize/backgrounds',
  'Customize: Hand': '/customize/hand',
  'Customize: Card Border': '/customize/card-border',
  'Customize: Avatar': '/customize/avatar',
  'Customize: Card Art': '/customize/card-art',
  Creator: '/creator',
  'Create Card': '/creator/card',
  'Create Set': '/creator/set',
  'Mint NFT': '/creator/mint',
  Settings: '/settings',
  Account: '/account',
  Network: '/network',
  Marketplace: '/marketplace',
  Presentations: '/presentations',
  'Game Over (Victory)': '/dev/game-over?result=victory',
  'Game Over (Defeat)': '/dev/game-over?result=negative',
};

const PRESETS = {
  'iPhone SE': { w: 667, h: 375 },
  'iPhone SE (vertical)': { w: 375, h: 667 },
  'iPhone 14': { w: 852, h: 393 },
  'iPhone 14 Pro Max': { w: 932, h: 430 },
  'iPad Mini': { w: 1024, h: 768 },
  'iPad Pro 11"': { w: 1194, h: 834 },
  'Desktop 1080p': { w: 1920, h: 1080 },
  'Desktop 1440p': { w: 2560, h: 1440 },
};

type PresetName = keyof typeof PRESETS;

interface ViewportConfig {
  preset: PresetName;
}

function IframeViewport({
  width,
  height,
  label,
  route,
}: {
  width: number;
  height: number;
  label: string;
  route: string;
}) {
  const maxH = window.innerHeight * 0.85;
  const desiredScale = Math.min(1, maxH / height);
  const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');
  const scale = isFirefox ? 1 : desiredScale;
  const src = `${window.location.origin}${window.location.pathname}#${route}`;

  return (
    <div className="flex flex-col items-center gap-1 flex-shrink-0">
      <div className="text-xs text-base-400 font-mono">
        {label} ({width}x{height}) {scale < 1 && `@ ${Math.round(scale * 100)}%`}
      </div>
      <div
        style={{
          width: width * scale,
          height: height * scale,
          overflow: 'hidden',
          borderRadius: 8,
        }}
        className="border border-base-600 shadow-lg"
      >
        <iframe
          src={src}
          style={{
            width,
            height,
            transform: scale === 1 ? undefined : `scale(${scale})`,
            transformOrigin: scale === 1 ? undefined : 'top left',
            border: 'none',
          }}
          title={label}
        />
      </div>
    </div>
  );
}

export function DevPage() {
  // Prevent recursive iframes
  if (window !== window.top) {
    return null;
  }

  const [activePage, setActivePage] = useState('Local Game');
  const [viewports, setViewports] = useState<ViewportConfig[]>([
    { preset: 'iPhone SE' },
    { preset: 'iPhone SE (vertical)' },
    { preset: 'iPad Pro 11"' },
  ]);
  const [routeVersion, setRouteVersion] = useState(0);

  const handlePageChange = useCallback((page: string) => {
    setActivePage(page);
    setRouteVersion((v) => v + 1);
  }, []);

  const updateViewport = (index: number, preset: PresetName) => {
    setViewports((prev) => prev.map((v, i) => (i === index ? { ...v, preset } : v)));
  };

  const addViewport = () => {
    setViewports((prev) => [...prev, { preset: 'iPad Mini' }]);
  };

  const removeViewport = (index: number) => {
    if (viewports.length <= 1) return;
    setViewports((prev) => prev.filter((_, i) => i !== index));
  };

  const route = PAGES[activePage] ?? '/';

  return (
    <div className="app-shell h-screen flex flex-col text-white overflow-hidden">
      {/* Toolbar */}
      <div className="theme-panel flex-shrink-0 flex items-center gap-4 px-4 py-2 border-b border-base-700">
        <span className="text-sm font-bold text-accent mr-2">DEV</span>

        <label className="text-xs text-base-400">Page:</label>
        <select
          value={activePage}
          onChange={(e) => handlePageChange(e.target.value)}
          className="theme-input bg-base-800 text-white text-sm rounded px-2 py-1 border border-base-600"
        >
          {Object.keys(PAGES).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>

        <div className="w-px h-5 bg-base-700" />

        {viewports.map((vp, i) => (
          <div key={i} className="flex items-center gap-1">
            <select
              value={vp.preset}
              onChange={(e) => updateViewport(i, e.target.value as PresetName)}
              className="theme-input bg-base-800 text-white text-xs rounded px-2 py-1 border border-base-600"
            >
              {Object.keys(PRESETS).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            {viewports.length > 1 && (
              <button
                onClick={() => removeViewport(i)}
                className="text-base-500 hover:text-negative text-xs px-1"
              >
                x
              </button>
            )}
          </div>
        ))}

        <button
          onClick={addViewport}
          className="theme-button theme-surface-button text-xs border rounded px-2 py-1"
        >
          + Add
        </button>
      </div>

      {/* Viewports */}
      <div className="flex-1 flex items-start justify-center gap-6 p-4 overflow-auto">
        {viewports.map((vp, i) => {
          const size = PRESETS[vp.preset];
          return (
            <IframeViewport
              key={`${i}-${routeVersion}`}
              width={size.w}
              height={size.h}
              label={vp.preset}
              route={route}
            />
          );
        })}
      </div>
    </div>
  );
}
