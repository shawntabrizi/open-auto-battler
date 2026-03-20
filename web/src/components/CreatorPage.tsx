import { Link } from 'react-router-dom';
import { useArenaStore } from '../store/arenaStore';
import { TopBar } from './TopBar';
import { DesktopRecommendedBanner } from './DesktopRecommendedBanner';

const CREATOR_TOOLS = [
  {
    to: '/creator/card',
    label: 'Create Card',
    description: 'Design a new card with custom stats, abilities, and effects',
    icon: '🃏',
  },
  {
    to: '/creator/set',
    label: 'Create Set',
    description: 'Assemble cards into a playable card set with custom rarities',
    icon: '📦',
  },
  {
    to: '/creator/mint',
    label: 'Mint NFT',
    description: 'Upload art and mint cosmetic NFTs for card styles, boards, and avatars',
    icon: '🎨',
  },
];

export function CreatorPage() {
  const { isConnected } = useArenaStore();

  return (
    <div className="fixed inset-0 bg-warm-950 text-white flex flex-col">
      <TopBar backTo="/" backLabel="Menu" title="Creator Studio" />
      <DesktopRecommendedBanner />
      <div className="flex-1 overflow-y-auto">
        <div className="w-full max-w-lg mx-auto p-4 lg:p-8">
          <div className="text-center mb-6 lg:mb-10">
            <h1 className="text-2xl lg:text-4xl font-heading font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500">
              Creator Studio
            </h1>
            <p className="text-warm-400 text-xs lg:text-sm mt-2">
              Design cards, build sets, and mint cosmetic NFTs
            </p>
          </div>

          {!isConnected && (
            <div className="mb-6 p-3 rounded-xl border border-yellow-500/30 bg-yellow-500/5 text-center">
              <p className="text-yellow-300 text-xs lg:text-sm">
                Connect to the blockchain to use creator tools
              </p>
              <Link
                to="/network"
                className="inline-block mt-2 text-xs text-yellow-400 hover:text-yellow-300 underline"
              >
                Network Settings
              </Link>
            </div>
          )}

          <div className="flex flex-col gap-3 lg:gap-4">
            {CREATOR_TOOLS.map((tool) => (
              <Link
                key={tool.to}
                to={tool.to}
                className="group block p-4 lg:p-6 rounded-xl border border-warm-700/40 bg-warm-900/60 hover:border-warm-500 hover:bg-warm-800/60 transition-all active:scale-[0.99]"
              >
                <div className="flex items-start gap-4">
                  <span className="text-2xl lg:text-3xl">{tool.icon}</span>
                  <div>
                    <h2 className="font-heading font-bold text-base lg:text-lg text-white group-hover:text-yellow-400 transition-colors">
                      {tool.label}
                    </h2>
                    <p className="text-warm-400 text-xs lg:text-sm mt-0.5 leading-relaxed">
                      {tool.description}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
