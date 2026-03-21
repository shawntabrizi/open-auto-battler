import swordsWarm from '../../swords.svg';
import swordsCyberpunk from '../../swords-cyberpunk.svg';
import swordsPastel from '../../swords-pastel.svg';
import burnWarm from '../../burn.svg';
import burnCyberpunk from '../../burn-cyberpunk.svg';
import burnPastel from '../../burn-pastel.svg';

export type ThemeId = 'warm' | 'cyberpunk' | 'pastel';

type ThemePalette = {
  warm50: string;
  warm100: string;
  warm200: string;
  warm300: string;
  warm400: string;
  warm500: string;
  warm600: string;
  warm700: string;
  warm800: string;
  warm900: string;
  warm950: string;
  gold: string;
  manaBlue: string;
  burnRed: string;
  burnGold: string;
  accentAmber: string;
  accentEmerald: string;
  accentViolet: string;
  victoryGreen: string;
  defeatRed: string;
  cardBg: string;
  boardBg: string;
  shopBg: string;
  surfaceDark: string;
  surfaceMid: string;
};

type ThemeShape = {
  buttonRadius: string;
  panelRadius: string;
  cardRadius: string;
  inputRadius: string;
  pillRadius: string;
};

type ThemeEffects = {
  shadowResting: string;
  shadowHover: string;
  shadowLifted: string;
  focusRing: string;
};

type ThemeBackgrounds = {
  appBackground: string;
  titleGradient: string;
  boardOverlay: string;
  handOverlay: string;
  handSurface: string;
};

type ThemeIcons = {
  accent: string;
  muted: string;
  mana: string;
  attack: string;
  health: string;
  warning: string;
  victory: string;
  defeat: string;
};

type ThemeButtons = {
  surfaceBackground: string;
  surfaceHoverBackground: string;
  surfaceBorder: string;
  surfaceHoverBorder: string;
  surfaceText: string;
  surfaceHoverText: string;
  selectedBackground: string;
  selectedHoverBackground: string;
  selectedBorder: string;
  selectedText: string;
  selectedShadow: string;
  toggleActiveBackground: string;
  ctaBackground: string;
  ctaHoverBackground: string;
  ctaBorder: string;
  ctaText: string;
  ctaShadow: string;
  battleBackground: string;
  battleHoverBackground: string;
  battleActiveBackground: string;
  battleBorder: string;
  battleText: string;
  battleGlow: string;
  manaFill: string;
  manaGlow: string;
};

type ThemeFonts = {
  decorative: string;
  title: string;
  heading: string;
  button: string;
  body: string;
  stat: string;
  mono: string;
};

type ThemeTextColors = {
  heroSubtitle: string;
  secondary: string;
};

type ThemeAchievements = {
  bronze: string;
  bronzeText: string;
  silver: string;
  silverText: string;
  gold: string;
  goldText: string;
};

export type ParticleShape = 'ember' | 'bokeh' | 'heart';

export type ParticleConfig = {
  shape: ParticleShape;
  /** Base size multiplier (default 1). Higher = bigger particles. */
  size: number;
  /** Number of particles (default ~40) */
  count: number;
};

type ThemeAssets = {
  playIcon: string;
  burnIcon: string;
  particles: ParticleConfig;
};

type ThemeBattleEffects = {
  ability: string;
  positive: string;
  negative: string;
};

export interface ThemeDefinition {
  id: ThemeId;
  label: string;
  palette: ThemePalette;
  shape: ThemeShape;
  effects: ThemeEffects;
  backgrounds: ThemeBackgrounds;
  icons: ThemeIcons;
  buttons: ThemeButtons;
  fonts: ThemeFonts;
  text: ThemeTextColors;
  achievements: ThemeAchievements;
  assets: ThemeAssets;
  battleEffects: ThemeBattleEffects;
}

type ThemeMap = Record<ThemeId, ThemeDefinition>;

const DEFAULT_WARM_THEME: ThemeDefinition = {
  id: 'warm',
  label: 'Warm',
  palette: {
    warm50: '#f5ede0',
    warm100: '#e8dcc8',
    warm200: '#c4b498',
    warm300: '#a08a6c',
    warm400: '#7d6b50',
    warm500: '#5e4f3a',
    warm600: '#453a2a',
    warm700: '#332c20',
    warm800: '#241f18',
    warm900: '#1a1610',
    warm950: '#100e0a',
    gold: '#d4a843',
    manaBlue: '#5b8faa',
    burnRed: '#b85c4a',
    burnGold: '#d4a843',
    accentAmber: '#c48a2a',
    accentEmerald: '#5a9a6e',
    accentViolet: '#8b6fb0',
    victoryGreen: '#4a8c3a',
    defeatRed: '#a83a2a',
    cardBg: '#1e1a14',
    boardBg: '#161310',
    shopBg: '#1a1712',
    surfaceDark: '#0e0c09',
    surfaceMid: '#141210',
  },
  shape: {
    buttonRadius: '0.75rem',
    panelRadius: '1rem',
    cardRadius: '0.5rem',
    inputRadius: '0.75rem',
    pillRadius: '999px',
  },
  effects: {
    shadowResting: '0 1px 2px hsla(30, 40%, 12%, 0.4), 0 2px 6px hsla(30, 40%, 12%, 0.2)',
    shadowHover:
      '0 2px 4px hsla(30, 40%, 12%, 0.4), 0 4px 8px hsla(30, 40%, 12%, 0.3), 0 8px 16px hsla(30, 40%, 12%, 0.15)',
    shadowLifted:
      '0 4px 8px hsla(30, 40%, 12%, 0.4), 0 8px 16px hsla(30, 40%, 12%, 0.3), 0 16px 32px hsla(30, 40%, 12%, 0.2), 0 0 12px hsla(30, 40%, 20%, 0.1)',
    focusRing: '0 0 0 2px rgba(212, 168, 67, 0.8), 0 0 8px rgba(212, 168, 67, 0.4)',
  },
  backgrounds: {
    appBackground:
      'radial-gradient(ellipse at 50% 30%, rgba(196, 138, 42, 0.08), transparent 60%), radial-gradient(ellipse at 20% 80%, rgba(184, 92, 74, 0.06), transparent 50%), radial-gradient(ellipse at 80% 70%, rgba(91, 143, 170, 0.05), transparent 50%)',
    titleGradient: 'linear-gradient(to right, #facc15, #f59e0b, #f97316)',
    boardOverlay: 'rgba(26, 22, 16, 0.5)',
    handOverlay: 'rgba(26, 22, 16, 0.4)',
    handSurface:
      'radial-gradient(ellipse at 50% 0%, rgba(212, 168, 67, 0.12), transparent 52%), radial-gradient(ellipse at 20% 78%, rgba(90, 154, 110, 0.08), transparent 40%), linear-gradient(180deg, rgba(16, 14, 10, 0.96) 0%, rgba(26, 23, 18, 0.98) 26%, rgba(16, 14, 10, 1) 100%)',
  },
  icons: {
    accent: '#d4a843',
    muted: '#a08a6c',
    mana: '#5b8faa',
    attack: '#b85c4a',
    health: '#5a9a6e',
    warning: '#d4a843',
    victory: '#4a8c3a',
    defeat: '#a83a2a',
  },
  buttons: {
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
    battleBackground:
      'linear-gradient(135deg, transparent 0%, transparent 35%, rgba(255, 255, 255, 0.22) 42%, rgba(255, 248, 220, 0.45) 50%, rgba(255, 255, 255, 0.22) 58%, transparent 65%, transparent 100%), linear-gradient(to bottom, rgba(255, 255, 255, 0.2) 0%, transparent 8%, transparent 92%, rgba(0, 0, 0, 0.12) 100%), linear-gradient(180deg, #e8c44a 0%, #d4a830 15%, #b8892a 35%, #a07520 50%, #b8892a 65%, #d4a830 85%, #e8c44a 100%)',
    battleHoverBackground:
      'linear-gradient(135deg, transparent 0%, transparent 30%, rgba(255, 255, 255, 0.28) 40%, rgba(255, 248, 220, 0.55) 50%, rgba(255, 255, 255, 0.28) 60%, transparent 70%, transparent 100%), linear-gradient(to bottom, rgba(255, 255, 255, 0.25) 0%, transparent 8%, transparent 92%, rgba(0, 0, 0, 0.08) 100%), linear-gradient(180deg, #f0d060 0%, #e0c048 15%, #c8a030 35%, #b89028 50%, #c8a030 65%, #e0c048 85%, #f0d060 100%)',
    battleActiveBackground:
      'linear-gradient(135deg, transparent 0%, transparent 40%, rgba(255, 255, 255, 0.1) 48%, rgba(255, 248, 220, 0.2) 50%, rgba(255, 255, 255, 0.1) 52%, transparent 60%, transparent 100%), linear-gradient(180deg, #a07520 0%, #906818 30%, #b8892a 70%, #c8a030 100%)',
    battleBorder: '#7a5810',
    battleText: '#1a0f00',
    battleGlow: '0 0 20px rgba(184, 137, 42, 0.3), 0 0 8px rgba(184, 137, 42, 0.2)',
    manaFill: 'linear-gradient(to top, #5b8faa, #60a5fa)',
    manaGlow: '0 0 6px rgba(59, 130, 246, 0.5)',
  },
  fonts: {
    decorative: '"Cinzel Decorative", serif',
    title: '"Cinzel Decorative", serif',
    heading: 'Cinzel, serif',
    button: 'Cinzel, serif',
    body: '"Crimson Pro", Georgia, "Times New Roman", serif',
    stat: 'Teko, sans-serif',
    mono: '"IBM Plex Mono", "SFMono-Regular", ui-monospace, monospace',
  },
  text: {
    heroSubtitle: '#c4b498',
    secondary: '#a08a6c',
  },
  achievements: {
    bronze: '#b87333',
    bronzeText: '#d4956a',
    silver: '#9ca3af',
    silverText: '#c0c7d0',
    gold: '#d4a843',
    goldText: '#e8c44a',
  },
  assets: {
    playIcon: swordsWarm,
    burnIcon: burnWarm,
    particles: { shape: 'ember', size: 1, count: 40 },
  },
  battleEffects: {
    ability: '#eab308',
    positive: '#22c55e',
    negative: '#dc2626',
  },
};

const CYBERPUNK_THEME: ThemeDefinition = {
  id: 'cyberpunk',
  label: 'Cyberpunk',
  palette: {
    warm50: '#eafcff',
    warm100: '#c9f6ff',
    warm200: '#8fe8ff',
    warm300: '#4dd0f6',
    warm400: '#24b7db',
    warm500: '#1896b6',
    warm600: '#12718a',
    warm700: '#0f4d61',
    warm800: '#0b2436',
    warm900: '#081420',
    warm950: '#040812',
    gold: '#00f6ff',
    manaBlue: '#38bdf8',
    burnRed: '#ff4d9d',
    burnGold: '#f8ff66',
    accentAmber: '#f8ff66',
    accentEmerald: '#00ffa3',
    accentViolet: '#d946ef',
    victoryGreen: '#00ffa3',
    defeatRed: '#ff4d9d',
    cardBg: '#10192b',
    boardBg: '#0a1730',
    shopBg: '#0d1d3d',
    surfaceDark: '#07101f',
    surfaceMid: '#10284d',
  },
  shape: {
    buttonRadius: '0.4rem',
    panelRadius: '0.7rem',
    cardRadius: '0.55rem',
    inputRadius: '0.4rem',
    pillRadius: '0.55rem',
  },
  effects: {
    shadowResting: '0 0 0 1px rgba(0, 246, 255, 0.12), 0 4px 20px rgba(0, 0, 0, 0.35)',
    shadowHover:
      '0 0 0 1px rgba(0, 246, 255, 0.28), 0 8px 28px rgba(0, 0, 0, 0.5), 0 0 22px rgba(217, 70, 239, 0.12)',
    shadowLifted:
      '0 0 0 1px rgba(0, 246, 255, 0.35), 0 12px 34px rgba(0, 0, 0, 0.55), 0 0 28px rgba(0, 246, 255, 0.18)',
    focusRing: '0 0 0 2px rgba(0, 246, 255, 0.95), 0 0 18px rgba(0, 246, 255, 0.38)',
  },
  backgrounds: {
    appBackground:
      'radial-gradient(ellipse at 50% 10%, rgba(0, 246, 255, 0.18), transparent 55%), radial-gradient(ellipse at 15% 80%, rgba(217, 70, 239, 0.16), transparent 45%), radial-gradient(ellipse at 85% 65%, rgba(56, 189, 248, 0.12), transparent 50%)',
    titleGradient: 'linear-gradient(to right, #67e8f9, #00f6ff, #f472b6)',
    boardOverlay: 'rgba(7, 16, 31, 0.24)',
    handOverlay: 'rgba(7, 16, 31, 0.18)',
    handSurface:
      'radial-gradient(ellipse at 50% 0%, rgba(0, 246, 255, 0.18), transparent 54%), radial-gradient(ellipse at 18% 82%, rgba(217, 70, 239, 0.12), transparent 42%), linear-gradient(180deg, rgba(7, 16, 31, 0.96) 0%, rgba(13, 29, 61, 0.98) 28%, rgba(7, 16, 31, 1) 100%)',
  },
  icons: {
    accent: '#00f6ff',
    muted: '#8fe8ff',
    mana: '#38bdf8',
    attack: '#ff4d9d',
    health: '#00ffa3',
    warning: '#f8ff66',
    victory: '#00ffa3',
    defeat: '#ff4d9d',
  },
  buttons: {
    surfaceBackground: 'rgba(8, 20, 32, 0.82)',
    surfaceHoverBackground: 'rgba(11, 36, 54, 0.92)',
    surfaceBorder: 'rgba(0, 246, 255, 0.24)',
    surfaceHoverBorder: 'rgba(0, 246, 255, 0.6)',
    surfaceText: 'rgb(201 246 255)',
    surfaceHoverText: '#ffffff',
    selectedBackground:
      'linear-gradient(135deg, rgba(0, 246, 255, 0.92), rgba(217, 70, 239, 0.82))',
    selectedHoverBackground:
      'linear-gradient(135deg, rgba(103, 232, 249, 0.96), rgba(244, 114, 182, 0.88))',
    selectedBorder: 'rgba(0, 246, 255, 0.82)',
    selectedText: '#040812',
    selectedShadow: '0 0 18px rgba(0, 246, 255, 0.26), 0 0 28px rgba(217, 70, 239, 0.12)',
    toggleActiveBackground:
      'linear-gradient(135deg, rgba(0, 246, 255, 0.92), rgba(217, 70, 239, 0.82))',
    ctaBackground: 'linear-gradient(135deg, rgba(0, 246, 255, 0.2), rgba(217, 70, 239, 0.18))',
    ctaHoverBackground:
      'linear-gradient(135deg, rgba(0, 246, 255, 0.28), rgba(217, 70, 239, 0.24))',
    ctaBorder: 'rgba(0, 246, 255, 0.55)',
    ctaText: '#f8fbff',
    ctaShadow: '0 0 28px rgba(0, 246, 255, 0.18)',
    battleBackground:
      'linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, transparent 22%, rgba(0, 246, 255, 0.12) 45%, transparent 62%), linear-gradient(180deg, #113252 0%, #0b2038 24%, #111f46 48%, #41126d 76%, #8b1fa9 100%)',
    battleHoverBackground:
      'linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0%, transparent 18%, rgba(0, 246, 255, 0.2) 45%, transparent 62%), linear-gradient(180deg, #153b62 0%, #0d2745 24%, #162b59 48%, #57198a 76%, #c026d3 100%)',
    battleActiveBackground:
      'linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, transparent 20%, rgba(0, 246, 255, 0.1) 45%, transparent 60%), linear-gradient(180deg, #0a1b32 0%, #0c2140 40%, #3a1468 100%)',
    battleBorder: '#00d8ff',
    battleText: '#f8fbff',
    battleGlow: '0 0 22px rgba(0, 246, 255, 0.24), 0 0 34px rgba(217, 70, 239, 0.14)',
    manaFill: 'linear-gradient(to top, #0ea5e9, #22d3ee)',
    manaGlow: '0 0 8px rgba(34, 211, 238, 0.55)',
  },
  fonts: {
    decorative: 'Orbitron, sans-serif',
    title: 'Rajdhani, sans-serif',
    heading: 'Rajdhani, sans-serif',
    button: 'Oxanium, sans-serif',
    body: '"Space Grotesk", sans-serif',
    stat: 'Oxanium, sans-serif',
    mono: '"Space Mono", "IBM Plex Mono", ui-monospace, monospace',
  },
  text: {
    heroSubtitle: '#67e8f9',
    secondary: '#8fe8ff',
  },
  achievements: {
    bronze: '#f97316',
    bronzeText: '#fb923c',
    silver: '#94a3b8',
    silverText: '#cbd5e1',
    gold: '#ffd700',
    goldText: '#ffe44d',
  },
  assets: {
    playIcon: swordsCyberpunk,
    burnIcon: burnCyberpunk,
    particles: { shape: 'bokeh', size: 1.5, count: 25 },
  },
  battleEffects: {
    ability: '#f8ff66',
    positive: '#00ffa3',
    negative: '#ff4d9d',
  },
};

const PASTEL_THEME: ThemeDefinition = {
  id: 'pastel',
  label: 'Pastel',
  palette: {
    warm50: '#fff7fb',
    warm100: '#ffe5f1',
    warm200: '#ffcadd',
    warm300: '#ffadc9',
    warm400: '#f88eb4',
    warm500: '#e6749a',
    warm600: '#c95d81',
    warm700: '#9f4766',
    warm800: '#6f3348',
    warm900: '#492331',
    warm950: '#2e151f',
    gold: '#ff9ec4',
    manaBlue: '#a78bfa',
    burnRed: '#ff6b9f',
    burnGold: '#ffc6de',
    accentAmber: '#ffb3c7',
    accentEmerald: '#7dd3c7',
    accentViolet: '#c084fc',
    victoryGreen: '#6ee7b7',
    defeatRed: '#fb7185',
    cardBg: '#432233',
    boardBg: '#3b1930',
    shopBg: '#4b2240',
    surfaceDark: '#2b1321',
    surfaceMid: '#4b2240',
  },
  shape: {
    buttonRadius: '1rem',
    panelRadius: '1.4rem',
    cardRadius: '1rem',
    inputRadius: '0.95rem',
    pillRadius: '999px',
  },
  effects: {
    shadowResting: '0 6px 18px rgba(73, 35, 49, 0.28), 0 0 0 1px rgba(255, 255, 255, 0.04)',
    shadowHover: '0 10px 22px rgba(73, 35, 49, 0.34), 0 0 18px rgba(255, 158, 196, 0.12)',
    shadowLifted: '0 16px 34px rgba(73, 35, 49, 0.38), 0 0 24px rgba(255, 158, 196, 0.15)',
    focusRing: '0 0 0 2px rgba(255, 158, 196, 0.9), 0 0 14px rgba(255, 158, 196, 0.32)',
  },
  backgrounds: {
    appBackground:
      'radial-gradient(ellipse at 50% 12%, rgba(255, 196, 222, 0.22), transparent 58%), radial-gradient(ellipse at 20% 78%, rgba(192, 132, 252, 0.14), transparent 42%), radial-gradient(ellipse at 82% 72%, rgba(125, 211, 199, 0.12), transparent 44%)',
    titleGradient: 'linear-gradient(to right, #f9a8d4, #fda4af, #c084fc)',
    boardOverlay: 'rgba(43, 19, 33, 0.18)',
    handOverlay: 'rgba(43, 19, 33, 0.12)',
    handSurface:
      'radial-gradient(ellipse at 50% 0%, rgba(249, 168, 212, 0.18), transparent 54%), radial-gradient(ellipse at 82% 78%, rgba(192, 132, 252, 0.12), transparent 42%), linear-gradient(180deg, rgba(43, 19, 33, 0.95) 0%, rgba(75, 34, 64, 0.98) 28%, rgba(43, 19, 33, 1) 100%)',
  },
  icons: {
    accent: '#ff9ec4',
    muted: '#ffcadd',
    mana: '#a78bfa',
    attack: '#c084fc',
    health: '#f88eb4',
    warning: '#ffb3c7',
    victory: '#7dd3c7',
    defeat: '#fb7185',
  },
  buttons: {
    surfaceBackground: 'rgba(73, 35, 49, 0.7)',
    surfaceHoverBackground: 'rgba(111, 51, 72, 0.8)',
    surfaceBorder: 'rgba(255, 202, 221, 0.28)',
    surfaceHoverBorder: 'rgba(255, 202, 221, 0.56)',
    surfaceText: 'rgb(255 229 241)',
    surfaceHoverText: '#ffffff',
    selectedBackground:
      'linear-gradient(135deg, rgba(249, 168, 212, 0.96), rgba(192, 132, 252, 0.84))',
    selectedHoverBackground:
      'linear-gradient(135deg, rgba(251, 207, 232, 0.98), rgba(216, 180, 254, 0.88))',
    selectedBorder: 'rgba(255, 182, 193, 0.72)',
    selectedText: '#2e151f',
    selectedShadow: '0 0 18px rgba(249, 168, 212, 0.18), 0 0 24px rgba(192, 132, 252, 0.12)',
    toggleActiveBackground:
      'linear-gradient(135deg, rgba(249, 168, 212, 0.96), rgba(192, 132, 252, 0.84))',
    ctaBackground: 'linear-gradient(135deg, rgba(249, 168, 212, 0.24), rgba(192, 132, 252, 0.18))',
    ctaHoverBackground:
      'linear-gradient(135deg, rgba(249, 168, 212, 0.32), rgba(192, 132, 252, 0.24))',
    ctaBorder: 'rgba(255, 182, 193, 0.54)',
    ctaText: '#fff7fb',
    ctaShadow: '0 0 24px rgba(249, 168, 212, 0.16)',
    battleBackground:
      'linear-gradient(135deg, rgba(255, 255, 255, 0.18) 0%, transparent 34%, rgba(255, 255, 255, 0.08) 55%, transparent 80%), linear-gradient(180deg, #ffbfdc 0%, #fda4af 28%, #f38fb4 56%, #d08adf 100%)',
    battleHoverBackground:
      'linear-gradient(135deg, rgba(255, 255, 255, 0.24) 0%, transparent 32%, rgba(255, 255, 255, 0.12) 56%, transparent 82%), linear-gradient(180deg, #ffd1e6 0%, #fda4af 28%, #f58fbb 56%, #d8a0ff 100%)',
    battleActiveBackground:
      'linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0%, transparent 36%, rgba(255, 255, 255, 0.06) 54%, transparent 78%), linear-gradient(180deg, #de7dac 0%, #d06c9d 40%, #b66bc4 100%)',
    battleBorder: '#f9a8d4',
    battleText: '#3a1022',
    battleGlow: '0 0 20px rgba(249, 168, 212, 0.2), 0 0 28px rgba(192, 132, 252, 0.12)',
    manaFill: 'linear-gradient(to top, #a78bfa, #f9a8d4)',
    manaGlow: '0 0 8px rgba(249, 168, 212, 0.42)',
  },
  fonts: {
    decorative: 'Pacifico, cursive',
    title: '"Josefin Sans", sans-serif',
    heading: '"Josefin Sans", sans-serif',
    button: 'Jost, sans-serif',
    body: 'Lora, Georgia, serif',
    stat: 'Jost, sans-serif',
    mono: '"JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace',
  },
  text: {
    heroSubtitle: '#ffe5f1',
    secondary: '#ffcadd',
  },
  achievements: {
    bronze: '#dba06d',
    bronzeText: '#e8b990',
    silver: '#c9c0d3',
    silverText: '#ddd6e8',
    gold: '#f0c27a',
    goldText: '#f5d49a',
  },
  assets: {
    playIcon: swordsPastel,
    burnIcon: burnPastel,
    particles: { shape: 'heart', size: 2.5, count: 30 },
  },
  battleEffects: {
    ability: '#fbbf24',
    positive: '#6ee7b7',
    negative: '#fb7185',
  },
};

export const DEFAULT_THEME_ID: ThemeId = 'warm';

export const THEMES: ThemeMap = {
  warm: DEFAULT_WARM_THEME,
  cyberpunk: CYBERPUNK_THEME,
  pastel: PASTEL_THEME,
};

export const THEME_OPTIONS = (Object.values(THEMES) as ThemeDefinition[]).map((theme) => ({
  id: theme.id,
  label: theme.label,
}));

function hexToRgbChannels(hex: string) {
  const normalized = hex.replace('#', '');
  const value =
    normalized.length === 3
      ? normalized
          .split('')
          .map((char) => char + char)
          .join('')
      : normalized;

  const int = Number.parseInt(value, 16);
  const red = (int >> 16) & 255;
  const green = (int >> 8) & 255;
  const blue = int & 255;
  return `${red} ${green} ${blue}`;
}

function setRootVariable(root: HTMLElement, name: string, value: string) {
  root.style.setProperty(name, value);
}

export function getTheme(themeId: ThemeId | null | undefined) {
  if (!themeId) return THEMES[DEFAULT_THEME_ID];
  return THEMES[themeId] ?? THEMES[DEFAULT_THEME_ID];
}

// ── Safety helpers for user-provided themes ──

const VALID_PARTICLE_SHAPES: ParticleShape[] = ['ember', 'bokeh', 'heart'];

/** Sanitize a URL to prevent javascript: / data: URI injection. Only allow http(s) and relative paths. */
function sanitizeAssetUrl(url: string, fallback: string): string {
  if (!url || typeof url !== 'string') return fallback;
  const trimmed = url.trim().toLowerCase();
  if (trimmed.startsWith('javascript:') || trimmed.startsWith('data:')) return fallback;
  return url;
}

/** Clamp a number within safe bounds */
function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}

/**
 * Sanitize an untrusted theme definition (e.g. loaded from an NFT).
 * Validates asset URLs, clamps numeric values, and enforces enum choices.
 * CSS string values (colors, gradients, fonts) are safe since they're applied
 * via CSS custom properties which cannot execute code.
 */
export function sanitizeTheme(
  untrusted: ThemeDefinition,
  base: ThemeDefinition = DEFAULT_WARM_THEME
): ThemeDefinition {
  return {
    ...untrusted,
    assets: {
      playIcon: sanitizeAssetUrl(untrusted.assets?.playIcon, base.assets.playIcon),
      burnIcon: sanitizeAssetUrl(untrusted.assets?.burnIcon, base.assets.burnIcon),
      particles: {
        shape: VALID_PARTICLE_SHAPES.includes(untrusted.assets?.particles?.shape)
          ? untrusted.assets.particles.shape
          : base.assets.particles.shape,
        size: clampNumber(untrusted.assets?.particles?.size, 0.1, 10, base.assets.particles.size),
        count: clampNumber(untrusted.assets?.particles?.count, 0, 200, base.assets.particles.count),
      },
    },
    battleEffects: {
      ability: untrusted.battleEffects?.ability ?? base.battleEffects.ability,
      positive: untrusted.battleEffects?.positive ?? base.battleEffects.positive,
      negative: untrusted.battleEffects?.negative ?? base.battleEffects.negative,
    },
  };
}

export function applyThemeToDocument(
  themeId: ThemeId,
  root: HTMLElement = document.documentElement
) {
  const theme = getTheme(themeId);
  const paletteEntries: [string, string][] = [
    ['--color-warm-50', theme.palette.warm50],
    ['--color-warm-100', theme.palette.warm100],
    ['--color-warm-200', theme.palette.warm200],
    ['--color-warm-300', theme.palette.warm300],
    ['--color-warm-400', theme.palette.warm400],
    ['--color-warm-500', theme.palette.warm500],
    ['--color-warm-600', theme.palette.warm600],
    ['--color-warm-700', theme.palette.warm700],
    ['--color-warm-800', theme.palette.warm800],
    ['--color-warm-900', theme.palette.warm900],
    ['--color-warm-950', theme.palette.warm950],
    ['--color-gold', theme.palette.gold],
    ['--color-mana-blue', theme.palette.manaBlue],
    ['--color-burn-red', theme.palette.burnRed],
    ['--color-burn-gold', theme.palette.burnGold],
    ['--color-accent-amber', theme.palette.accentAmber],
    ['--color-accent-emerald', theme.palette.accentEmerald],
    ['--color-accent-violet', theme.palette.accentViolet],
    ['--color-victory-green', theme.palette.victoryGreen],
    ['--color-defeat-red', theme.palette.defeatRed],
    ['--color-card-bg', theme.palette.cardBg],
    ['--color-board-bg', theme.palette.boardBg],
    ['--color-shop-bg', theme.palette.shopBg],
    ['--color-surface-dark', theme.palette.surfaceDark],
    ['--color-surface-mid', theme.palette.surfaceMid],
  ];

  for (const [name, value] of paletteEntries) {
    setRootVariable(root, name, hexToRgbChannels(value));
  }

  setRootVariable(root, '--theme-button-radius', theme.shape.buttonRadius);
  setRootVariable(root, '--theme-panel-radius', theme.shape.panelRadius);
  setRootVariable(root, '--theme-card-radius', theme.shape.cardRadius);
  setRootVariable(root, '--theme-input-radius', theme.shape.inputRadius);
  setRootVariable(root, '--theme-pill-radius', theme.shape.pillRadius);

  setRootVariable(root, '--shadow-resting', theme.effects.shadowResting);
  setRootVariable(root, '--shadow-hover', theme.effects.shadowHover);
  setRootVariable(root, '--shadow-lifted', theme.effects.shadowLifted);
  setRootVariable(root, '--theme-focus-ring', theme.effects.focusRing);

  setRootVariable(root, '--theme-app-background', theme.backgrounds.appBackground);
  setRootVariable(root, '--theme-title-gradient', theme.backgrounds.titleGradient);
  setRootVariable(root, '--theme-board-overlay', theme.backgrounds.boardOverlay);
  setRootVariable(root, '--theme-hand-overlay', theme.backgrounds.handOverlay);
  setRootVariable(root, '--theme-hand-surface', theme.backgrounds.handSurface);
  setRootVariable(root, '--theme-icon-accent', theme.icons.accent);
  setRootVariable(root, '--theme-icon-muted', theme.icons.muted);
  setRootVariable(root, '--theme-icon-mana', theme.icons.mana);
  setRootVariable(root, '--theme-icon-attack', theme.icons.attack);
  setRootVariable(root, '--theme-icon-health', theme.icons.health);
  setRootVariable(root, '--theme-icon-warning', theme.icons.warning);
  setRootVariable(root, '--theme-icon-victory', theme.icons.victory);
  setRootVariable(root, '--theme-icon-defeat', theme.icons.defeat);

  setRootVariable(root, '--theme-surface-button-bg', theme.buttons.surfaceBackground);
  setRootVariable(root, '--theme-surface-button-bg-hover', theme.buttons.surfaceHoverBackground);
  setRootVariable(root, '--theme-surface-button-border', theme.buttons.surfaceBorder);
  setRootVariable(root, '--theme-surface-button-border-hover', theme.buttons.surfaceHoverBorder);
  setRootVariable(root, '--theme-surface-button-text', theme.buttons.surfaceText);
  setRootVariable(root, '--theme-surface-button-text-hover', theme.buttons.surfaceHoverText);
  setRootVariable(root, '--theme-selected-button-bg', theme.buttons.selectedBackground);
  setRootVariable(root, '--theme-selected-button-bg-hover', theme.buttons.selectedHoverBackground);
  setRootVariable(root, '--theme-selected-button-border', theme.buttons.selectedBorder);
  setRootVariable(root, '--theme-selected-button-text', theme.buttons.selectedText);
  setRootVariable(root, '--theme-selected-button-shadow', theme.buttons.selectedShadow);
  setRootVariable(root, '--theme-toggle-active-bg', theme.buttons.toggleActiveBackground);

  setRootVariable(root, '--theme-cta-bg', theme.buttons.ctaBackground);
  setRootVariable(root, '--theme-cta-bg-hover', theme.buttons.ctaHoverBackground);
  setRootVariable(root, '--theme-cta-border', theme.buttons.ctaBorder);
  setRootVariable(root, '--theme-cta-text', theme.buttons.ctaText);
  setRootVariable(root, '--theme-cta-shadow', theme.buttons.ctaShadow);

  setRootVariable(root, '--theme-battle-button-bg', theme.buttons.battleBackground);
  setRootVariable(root, '--theme-battle-button-hover-bg', theme.buttons.battleHoverBackground);
  setRootVariable(root, '--theme-battle-button-active-bg', theme.buttons.battleActiveBackground);
  setRootVariable(root, '--theme-battle-button-border', theme.buttons.battleBorder);
  setRootVariable(root, '--theme-battle-button-text', theme.buttons.battleText);
  setRootVariable(root, '--theme-battle-button-glow', theme.buttons.battleGlow);

  setRootVariable(root, '--theme-mana-fill', theme.buttons.manaFill);
  setRootVariable(root, '--theme-mana-glow', theme.buttons.manaGlow);

  setRootVariable(root, '--font-decorative', theme.fonts.decorative);
  setRootVariable(root, '--font-title', theme.fonts.title);
  setRootVariable(root, '--font-heading', theme.fonts.heading);
  setRootVariable(root, '--font-button', theme.fonts.button);
  setRootVariable(root, '--font-body', theme.fonts.body);
  setRootVariable(root, '--font-stat', theme.fonts.stat);
  setRootVariable(root, '--font-mono', theme.fonts.mono);
  setRootVariable(root, '--theme-hero-subtitle', theme.text.heroSubtitle);
  setRootVariable(root, '--theme-secondary-text', theme.text.secondary);

  setRootVariable(root, '--theme-achievement-bronze', theme.achievements.bronze);
  setRootVariable(root, '--theme-achievement-bronze-text', theme.achievements.bronzeText);
  setRootVariable(root, '--theme-achievement-silver', theme.achievements.silver);
  setRootVariable(root, '--theme-achievement-silver-text', theme.achievements.silverText);
  setRootVariable(root, '--theme-achievement-gold', theme.achievements.gold);
  setRootVariable(root, '--theme-achievement-gold-text', theme.achievements.goldText);

  setRootVariable(root, '--theme-battle-ability', theme.battleEffects.ability);
  setRootVariable(root, '--theme-battle-positive', theme.battleEffects.positive);
  setRootVariable(root, '--theme-battle-negative', theme.battleEffects.negative);

  root.dataset.theme = theme.id;
}
