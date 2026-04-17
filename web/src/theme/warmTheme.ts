import type { ResolvedThemeDefinition } from './themes';

export const DEFAULT_WARM_THEME: ResolvedThemeDefinition = {
  id: 'warm',
  label: 'Warm',
  base: {
    base50: '#f5ede0',
    base100: '#e8dcc8',
    base200: '#c4b498',
    base300: '#a08a6c',
    base400: '#7d6b50',
    base500: '#5e4f3a',
    base600: '#453a2a',
    base700: '#332c20',
    base800: '#241f18',
    base900: '#1a1610',
    base950: '#100e0a',
    accent: '#d4a843',
    special: '#8b6fb0',
    positive: '#5a9a6e',
    negative: '#a83a2a',
    victory: '#4a8c3a',
    defeat: '#a83a2a',
    surfaceDark: '#0e0c09',
    surfaceMid: '#141210',
    panelRadius: '1rem',
    inputRadius: '0.75rem',
    pillRadius: '999px',
    shadowResting: '0 1px 2px hsla(30, 40%, 12%, 0.4), 0 2px 6px hsla(30, 40%, 12%, 0.2)',
    shadowHover:
      '0 2px 4px hsla(30, 40%, 12%, 0.4), 0 4px 8px hsla(30, 40%, 12%, 0.3), 0 8px 16px hsla(30, 40%, 12%, 0.15)',
    shadowLifted:
      '0 4px 8px hsla(30, 40%, 12%, 0.4), 0 8px 16px hsla(30, 40%, 12%, 0.3), 0 16px 32px hsla(30, 40%, 12%, 0.2), 0 0 12px hsla(30, 40%, 20%, 0.1)',
    focusRing: '0 0 0 2px rgba(212, 168, 67, 0.8), 0 0 8px rgba(212, 168, 67, 0.4)',
    decorative: '"Cinzel Decorative", serif',
    title: '"Cinzel Decorative", serif',
    heading: 'Cinzel, serif',
    button: 'Cinzel, serif',
    body: '"Crimson Pro", Georgia, "Times New Roman", serif',
    stat: 'Teko, sans-serif',
    mono: '"IBM Plex Mono", "SFMono-Regular", ui-monospace, monospace',
    appBackground:
      'radial-gradient(ellipse at 50% 30%, rgba(196, 138, 42, 0.08), transparent 60%), radial-gradient(ellipse at 20% 80%, rgba(184, 92, 74, 0.06), transparent 50%), radial-gradient(ellipse at 80% 70%, rgba(91, 143, 170, 0.05), transparent 50%)',
    titleGradient: 'linear-gradient(to right, #facc15, #f59e0b, #f97316)',
    secondary: '#a08a6c',
  },
  buttons: {
    buttonRadius: '0.75rem',
    surfaceBackground: 'rgba(26, 22, 16, 0.8)',
    surfaceHoverBackground: 'rgba(36, 31, 24, 0.92)',
    surfaceBorder: 'rgba(51, 44, 32, 0.6)',
    surfaceHoverBorder: 'rgba(125, 107, 80, 0.8)',
    surfaceText: 'rgb(160 138 108)',
    surfaceHoverText: '#ffffff',
    selectedBackground: 'linear-gradient(180deg, #e4c261 0%, #d4a843 52%, #c48a2a 100%)',
    selectedHoverBackground: 'linear-gradient(180deg, #edd07a 0%, #ddb653 52%, #cd9531 100%)',
    selectedBorder: 'rgba(180, 83, 9, 0.55)',
    selectedText: '#100e0a',
    selectedShadow: '0 0 18px rgba(212, 168, 67, 0.18)',
    toggleActiveBackground: 'linear-gradient(180deg, #e4c261 0%, #d4a843 52%, #c48a2a 100%)',
    ctaBackground: 'linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(234, 88, 12, 0.06))',
    ctaHoverBackground:
      'linear-gradient(135deg, rgba(251, 191, 36, 0.16), rgba(249, 115, 22, 0.09))',
    ctaBorder: 'rgba(245, 158, 11, 0.4)',
    ctaText: '#ffffff',
    ctaShadow: '0 0 30px rgba(245, 158, 11, 0.15)',
  },
  unitCard: {
    cardBg: '#1e1a14',
    cardAttack: '#b85c4a',
    cardBurn: '#d4a843',
    cardRadius: '0.5rem',
    rarityRareGlow: 'rgba(56, 189, 248, 0.6)',
    rarityLegendaryGlow: '#d4a843',
    attackIcon: {
      paths: [
        'M6.9522 13.9044 17.3804 1.738 22.5946 0 20.8565 5.2141 8.6902 15.6424C10.4283 17.3804 10.4283 19.1185 12.1663 17.3804 12.1663 19.1185 13.9044 20.8565 12.1663 20.8565A2.468 2.468 90 0110.4283 22.5946 8.6902 8.6902 90 006.9522 17.3804Q6.0832 17.2066 6.0832 18.2495T3.4761 20.5089 2.0857 19.1185 4.3451 16.5114 5.2141 15.6424A8.6902 8.6902 90 000 12.1663 2.468 2.468 90 011.738 10.4283C1.738 8.6902 3.4761 10.4283 5.2141 10.4283 3.4761 12.1663 5.2141 12.1663 6.9522 13.9044M17.3804 1.738 17.3804 5.2141 20.8565 5.2141 17.728 4.8665 17.3804 1.738',
      ],
    },
    healthIcon: {
      paths: [
        'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
      ],
    },
    abilityIcon: {
      paths: ['M12 2l1.09 6.9L20 10l-6.91 1.09L12 18l-1.09-6.91L4 10l6.91-1.1z'],
    },
    manaIcon: {
      paths: ['M13 3L4 14h7l-2 7 9-11h-7l2-7z'],
    },
  },
  battleShop: {
    boardBg: '#161310',
    shopBg: '#1a1712',
    overlayOpacity: 0.45,
    mana: '#5b8faa',
    manaFill: 'linear-gradient(to top, #5b8faa, #60a5fa)',
    manaGlow: '0 0 6px rgba(59, 130, 246, 0.5)',
    burnIcon: {
      paths: [
        'M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z',
      ],
    },
    bagIcon: {
      paths: [
        'M12 2C9.24 2 7 4.24 7 7h2c0-1.66 1.34-3 3-3s3 1.34 3 3h2c0-2.76-2.24-5-5-5z',
        'M5 9l1.5 12c.17 1.14 1.15 2 2.3 2h6.4c1.15 0 2.13-.86 2.3-2L19 9H5zm7 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z',
        'M12 13a2 2 0 100 4 2 2 0 000-4z',
      ],
    },
    livesIcon: {
      paths: [
        'M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3zm0 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z',
        'M12 9.5c-1.38 0-2.5 1.12-2.5 2.5s1.12 2.5 2.5 2.5 2.5-1.12 2.5-2.5-1.12-2.5-2.5-2.5z',
      ],
    },
    battleBackground:
      'linear-gradient(135deg, transparent 0%, transparent 35%, rgba(255, 255, 255, 0.22) 42%, rgba(255, 248, 220, 0.45) 50%, rgba(255, 255, 255, 0.22) 58%, transparent 65%, transparent 100%), linear-gradient(to bottom, rgba(255, 255, 255, 0.2) 0%, transparent 8%, transparent 92%, rgba(0, 0, 0, 0.12) 100%), linear-gradient(180deg, #e8c44a 0%, #d4a830 15%, #b8892a 35%, #a07520 50%, #b8892a 65%, #d4a830 85%, #e8c44a 100%)',
    battleHoverBackground:
      'linear-gradient(135deg, transparent 0%, transparent 30%, rgba(255, 255, 255, 0.28) 40%, rgba(255, 248, 220, 0.55) 50%, rgba(255, 255, 255, 0.28) 60%, transparent 70%, transparent 100%), linear-gradient(to bottom, rgba(255, 255, 255, 0.25) 0%, transparent 8%, transparent 92%, rgba(0, 0, 0, 0.08) 100%), linear-gradient(180deg, #f0d060 0%, #e0c048 15%, #c8a030 35%, #b89028 50%, #c8a030 65%, #e0c048 85%, #f0d060 100%)',
    battleActiveBackground:
      'linear-gradient(135deg, transparent 0%, transparent 40%, rgba(255, 255, 255, 0.1) 48%, rgba(255, 248, 220, 0.2) 50%, rgba(255, 255, 255, 0.1) 52%, transparent 60%, transparent 100%), linear-gradient(180deg, #a07520 0%, #906818 30%, #b8892a 70%, #c8a030 100%)',
    battleBorder: '#7a5810',
    battleText: '#1a0f00',
    battleGlow: '0 0 20px rgba(184, 137, 42, 0.3), 0 0 8px rgba(184, 137, 42, 0.2)',
  },
  battleOverlay: {
    abilityColor: '#eab308',
    abilityIcon: {
      paths: ['M12 2l1.09 6.9L20 10l-6.91 1.09L12 18l-1.09-6.91L4 10l6.91-1.1z'],
    },
    positiveColor: '#22c55e',
    negativeColor: '#dc2626',
    resultVictory: '#6ee7b7',
    resultDefeat: '#fca5a5',
    resultDraw: '#fcd34d',
    teamPlayerColor: 'rgba(90, 154, 110, 0.2)',
    teamEnemyColor: 'rgba(184, 92, 74, 0.2)',
  },
  gameOver: {
    victoryAtmosphere:
      'radial-gradient(ellipse at 30% 20%, rgba(212, 168, 67, 0.08) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(74, 140, 58, 0.06) 0%, transparent 50%), radial-gradient(ellipse at center, transparent 30%, rgba(0, 0, 0, 0.7) 100%)',
    defeatAtmosphere:
      'radial-gradient(ellipse at 50% 30%, rgba(168, 58, 42, 0.1) 0%, transparent 40%), radial-gradient(ellipse at center, transparent 20%, rgba(168, 58, 42, 0.15) 70%, rgba(0, 0, 0, 0.8) 100%)',
    pipWin: '#4a8c3a',
    pipLoss: '#a83a2a',
    victoryIcon: {
      paths: [
        'M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z',
      ],
    },
    defeatIcon: {
      paths: [
        'M12 2C6.48 2 2 6.48 2 12c0 3.07 1.39 5.81 3.57 7.63L7 22h4v-2h2v2h4l1.43-2.37C20.61 17.81 22 15.07 22 12c0-5.52-4.48-10-10-10zM8.5 15c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm7 0c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z',
        'M10 18h4v1h-4z',
      ],
    },
    livesIcon: {
      paths: [
        'M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3zm0 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z',
        'M12 9.5c-1.38 0-2.5 1.12-2.5 2.5s1.12 2.5 2.5 2.5 2.5-1.12 2.5-2.5-1.12-2.5-2.5-2.5z',
      ],
    },
  },
  setSelection: {},
  achievements: {
    tier1: '#b87333',
    tier1Text: '#d4956a',
    tier2: '#9ca3af',
    tier2Text: '#c0c7d0',
    tier3: '#d4a843',
    tier3Text: '#e8c44a',
  },
  assets: {
    particles: {
      icon: {
        paths: ['M7.2 9.6L9.6 2.4 16.8 6 22 14.4 16.8 19.2 6 16.8z'],
      },
      size: 1,
      count: 40,
    },
  },
  login: {},
  mainMenu: {
    heroSubtitle: '#c4b498',
    playIcon: {
      paths: [
        'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 2.18l7 3.12v4.7c0 4.83-3.4 9.36-7 10.5-3.6-1.14-7-5.67-7-10.5V6.3l7-3.12z',
        'M9.5 8L7 10.5 10.5 14 7 17.5 8.5 19l5-5-2-2 2-2L15.5 8 14 6.5z',
      ],
    },
  },
  settings: {},
  navigation: {},
  cardDetailPanel: {},
  tutorial: {},
  toast: {
    successBorder: 'rgba(74, 140, 58, 0.25)',
    errorBorder: 'rgba(168, 58, 42, 0.25)',
  },
  transactions: {},
  animations: {},
  mobile: {},
  bagOverlay: {},
  account: {},
  network: {},
  history: {},
  creator: {},
  marketplace: {},
};
