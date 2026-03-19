import React from 'react';
import { Link } from 'react-router-dom';
import { BackLink, BackLinkSpacer } from './PageHeader';

const TOOLS = [
  {
    to: '/blockchain/create-card',
    title: 'Card Creator',
    description: 'Design custom units with stats and complex abilities',
    icon: '🃏',
  },
  {
    to: '/blockchain/create-set',
    title: 'Set Creator',
    description: 'Bundle cards into playable sets with rarity weights',
    icon: '📦',
  },
  {
    to: '/blockchain/customize',
    title: 'Customize',
    description: 'Select NFT cosmetics for your game board and cards',
    icon: '🎨',
  },
  {
    to: '/blockchain/mint-nft',
    title: 'Mint NFT',
    description: 'Upload images and mint them as on-chain NFTs',
    icon: '🖼️',
  },
  {
    to: '/blockchain/ghosts',
    title: 'Ghost Browser',
    description: 'Inspect active ghost pools by set, bracket, and owner',
    icon: '👻',
  },
];

export const CreatorHubPage: React.FC = () => {
  return (
    <div className="min-h-screen min-h-svh bg-warm-950 text-warm-200 flex flex-col p-4 lg:p-8">
      <BackLink to="/blockchain" label="Dashboard" />
      <BackLinkSpacer />

      <div className="flex-1 flex flex-col items-center justify-center">
        <h1 className="text-2xl lg:text-4xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-600 uppercase mb-1 lg:mb-2">
          Creator Hub
        </h1>
        <p className="text-warm-500 text-xs lg:text-sm mb-6 lg:mb-10">
          Build, mint, and inspect on-chain content
        </p>

        <div className="grid grid-cols-2 gap-3 lg:gap-4 w-full max-w-2xl">
          {TOOLS.map((tool) => (
            <Link
              key={tool.to}
              to={tool.to}
              className="group bg-warm-900/50 border border-white/5 hover:border-yellow-500/30 rounded-xl lg:rounded-2xl p-3 lg:p-6 transition-all hover:bg-warm-900/80"
            >
              <div className="flex items-center gap-2 lg:block">
                <div className="text-xl lg:text-3xl lg:mb-3">{tool.icon}</div>
                <h2 className="text-sm lg:text-lg font-bold text-white group-hover:text-yellow-500 transition-colors">
                  {tool.title}
                </h2>
              </div>
              <p className="text-warm-500 text-xs lg:text-sm hidden lg:block mt-1">
                {tool.description}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};
