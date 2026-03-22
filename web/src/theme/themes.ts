export type ThemeId = string;

// ════════════════════════════════════════════════════════════════
// BASE — the foundation of every theme.
// Flattens palette, shape, effects, fonts, backgrounds, and text
// into one required section that defines the theme's identity.
// ════════════════════════════════════════════════════════════════

type ThemeBase = {
  // ── Neutral scale (11 steps, lightest → darkest) ──
  /** Lightest neutral — used for bright highlights, inset glows */
  base50: string;
  /** Primary text color — card names, headings, body text */
  base100: string;
  /** Subtitle text — hero subtitles, secondary descriptions */
  base200: string;
  /** Muted text — labels, helper text, timestamps */
  base300: string;
  /** Tertiary text — less important labels, stat labels */
  base400: string;
  /** Placeholder text — input placeholders, disabled text */
  base500: string;
  /** Default borders — card edges, panel borders, dividers */
  base600: string;
  /** Subtle borders — panel borders, section dividers */
  base700: string;
  /** Dark borders/backgrounds — input backgrounds, dark panels */
  base800: string;
  /** Dark surfaces — panel backgrounds, card list backgrounds */
  base900: string;
  /** Darkest surface — near-black, used for deep backgrounds */
  base950: string;

  // ── Semantic colors ──
  /** Primary accent — selected states, highlights, stars, CTA borders. The "brand" color. */
  accent: string;
  /** Mana color — mana cost badges, mana bar fill, info text */
  mana: string;
  /** Positive accent — health stat on cards, connected indicators, success text */
  positive: string;
  /** Special/rare accent — tournament UI, accent for unique elements */
  special: string;
  /** Win state color — victory screen title, win counters, perfect run text */
  victory: string;
  /** Loss state color — defeat screen title, error messages, danger buttons, disconnect indicators */
  defeat: string;

  // ── Surface colors ──
  /** Deepest background — page background, root element background */
  surfaceDark: string;
  /** Mid-tone surface — elevated panels, card slots, arena surface gradients */
  surfaceMid: string;

  // ── Shape — border radii that define the visual personality ──
  /** Panels, modals, large containers (e.g. "1rem") */
  panelRadius: string;
  /** Text inputs, selects, form controls (e.g. "0.75rem") */
  inputRadius: string;
  /** Pill-shaped elements — tags, status badges (e.g. "999px" for full pill) */
  pillRadius: string;

  // ── Effects — shadows and focus indicators (full CSS box-shadow strings) ──
  /** Default shadow for cards, panels, buttons at rest */
  shadowResting: string;
  /** Shadow on hover — slightly elevated, more prominent */
  shadowHover: string;
  /** Shadow for dragged/lifted elements — most prominent */
  shadowLifted: string;
  /** Focus ring for keyboard navigation — typically a colored outline glow */
  focusRing: string;

  // ── Fonts — font-family strings for each typographic role ──
  /** Large decorative display text — the "OPEN AUTO BATTLER" title on home/login */
  decorative: string;
  /** Title/heading text — "BOARD", "HAND", "Card Details" headers (used with bg-clip-text) */
  title: string;
  /** Mid-level headings — card names, panel headers, form section labels */
  heading: string;
  /** Button labels — all interactive button text across the UI */
  button: string;
  /** Body text — descriptions, ability text, paragraphs, general content */
  body: string;
  /** Numeric stats — attack/health values on cards, mana counts, win/loss numbers */
  stat: string;
  /** Monospace — wallet addresses, card IDs, JSON data, technical info */
  mono: string;

  // ── Backgrounds ──
  /** CSS gradient for the ambient page background (radial gradients layered for atmosphere) */
  appBackground: string;
  /** CSS gradient for the main title text — used with bg-clip-text */
  titleGradient: string;
  // ── Text colors ──
  /** Secondary description text — button descriptions, card set descriptions, minor labels */
  secondary: string;
};

// ════════════════════════════════════════════════════════════════
// BUTTONS — styling for the 4 button types used throughout the UI.
// Battle button fields live in ThemeBattleShop.
// Values are CSS strings (colors, gradients, box-shadows).
// ════════════════════════════════════════════════════════════════

type ThemeButtons = {
  /** Buttons, small interactive elements (e.g. "0.75rem") */
  buttonRadius: string;

  // ── Surface button: neutral, low-emphasis (menu items, back buttons, close, secondary actions) ──
  /** Background at rest */
  surfaceBackground: string;
  /** Background on hover */
  surfaceHoverBackground: string;
  /** Border color at rest */
  surfaceBorder: string;
  /** Border color on hover */
  surfaceHoverBorder: string;
  /** Text color at rest (muted) */
  surfaceText: string;
  /** Text color on hover (bright) */
  surfaceHoverText: string;

  // ── Selected button: active choice indicator (theme picker, speed selector, lives selector) ──
  /** Background when selected — typically a gradient */
  selectedBackground: string;
  /** Background when selected + hovered */
  selectedHoverBackground: string;
  /** Border when selected */
  selectedBorder: string;
  /** Text color when selected (usually dark on bright background) */
  selectedText: string;
  /** Glow/shadow around selected buttons */
  selectedShadow: string;

  // ── Toggle switch: on/off toggles in settings ──
  /** Background of the toggle track when active/on */
  toggleActiveBackground: string;

  // ── CTA (Call-to-Action): primary actions (Login, Connect, Start Game, Join Tournament) ──
  /** Background at rest — typically a subtle gradient */
  ctaBackground: string;
  /** Background on hover — slightly brighter */
  ctaHoverBackground: string;
  /** Border color */
  ctaBorder: string;
  /** Text color */
  ctaText: string;
  /** Ambient glow shadow on hover */
  ctaShadow: string;
};

// ════════════════════════════════════════════════════════════════
// ICON — SVG icon definition for per-section icon customization.
// ════════════════════════════════════════════════════════════════

/** SVG icon definition — paths rendered inside a 24×24 viewBox, with optional image URL override. */
export type ThemeIcon = {
  /** One or more SVG `d` attributes — each becomes a <path> element (used as fallback when url is set) */
  paths: string[];
  /** Optional image URL (IPFS, HTTPS) for a richer icon. Paths are used as fallback while loading or on error. */
  url?: string;
};

// ════════════════════════════════════════════════════════════════
// UNIT CARD — card-specific customization (rarity glows, stat icons)
// ════════════════════════════════════════════════════════════════

type ThemeUnitCard = {
  /** Card background — the base color behind card content */
  cardBg: string;
  /** Attack/damage color — attack stat on cards, damage numbers */
  cardAttack: string;
  /** Burn value color — burn badges on cards, burn-related UI */
  cardBurn: string;
  /** Unit cards in hand and on board (e.g. "0.5rem") */
  cardRadius: string;
  /** Rare card shimmer glow color (currently hardcoded rgba(56, 189, 248, *)) */
  rarityRareGlow: string;
  /** Legendary card pulse glow color (currently uses cardBurn) */
  rarityLegendaryGlow: string;
  /** Attack stat icon — swords (warm), crosshair (cyber), wand (pastel) */
  attackIcon: ThemeIcon;
  /** Health stat icon — heart (warm), shield (cyber), flower (pastel) */
  healthIcon: ThemeIcon;
  /** Ability indicator icon — sparkle (warm), bolt (cyber), butterfly (pastel) */
  abilityIcon: ThemeIcon;
  /** Mana cost icon — lightning bolt (warm), circuit (cyber), dewdrop (pastel) */
  manaIcon: ThemeIcon;
};

// ════════════════════════════════════════════════════════════════
// BATTLE SHOP — mana bar, shop-phase icons, and battle button styling.
// ════════════════════════════════════════════════════════════════

type ThemeBattleShop = {
  /** Opacity (0–1) for board and hand area overlays when custom backgrounds are active */
  overlayOpacity: number;
  /** Board background — the game board/arena surface */
  boardBg: string;
  /** Shop/hand background — the hand area below the board */
  shopBg: string;
  /** Fill gradient for filled mana segments */
  manaFill: string;
  /** Glow effect on filled mana segments */
  manaGlow: string;
  /** Burn zone icon — flame (warm), shield (cyber), star (pastel) */
  burnIcon: ThemeIcon;
  /** Draw pool / bag icon — bag (warm), cube (cyber), gift (pastel) */
  bagIcon: ThemeIcon;
  /** Player lives icon — shield-heart (warm), battery (cyber), heart (pastel) */
  livesIcon: ThemeIcon;
  /** Battle button background at rest — typically an elaborate metallic gradient */
  battleBackground: string;
  /** Battle button background on hover — brighter/shinier */
  battleHoverBackground: string;
  /** Battle button background when pressed/active — darker, pressed-in feel */
  battleActiveBackground: string;
  /** Battle button border color */
  battleBorder: string;
  /** Battle button text color (usually dark on bright metallic background) */
  battleText: string;
  /** Battle button ambient glow */
  battleGlow: string;
};

// ════════════════════════════════════════════════════════════════
// BATTLE OVERLAY — combat animations, results, and team zones.
// ════════════════════════════════════════════════════════════════

type ThemeBattleOverlay = {
  /** Ability trigger glow — yellow flash when a unit's ability activates */
  abilityColor: string;
  /** Positive effect glow — green flash for buffs, heals, stat gains */
  positiveColor: string;
  /** Negative effect glow — red flash for damage, debuffs */
  negativeColor: string;
  /** Victory result banner color */
  resultVictory: string;
  /** Defeat result banner color */
  resultDefeat: string;
  /** Draw result banner color */
  resultDraw: string;
  /** Player team zone tint color */
  teamPlayerColor: string;
  /** Enemy team zone tint color */
  teamEnemyColor: string;
  /** Ability toast icon — ability indicator for combat toasts */
  abilityIcon: ThemeIcon;
};

// ════════════════════════════════════════════════════════════════
// GAME OVER — victory/defeat screen styling.
// ════════════════════════════════════════════════════════════════

type ThemeGameOver = {
  /** Victory screen atmospheric gradient */
  victoryAtmosphere: string;
  /** Defeat screen atmospheric gradient */
  defeatAtmosphere: string;
  /** Win pip color in the win/loss tracker */
  pipWin: string;
  /** Loss pip color in the win/loss tracker */
  pipLoss: string;
  /** Victory screen icon — trophy (warm), crown (cyber), tiara (pastel) */
  victoryIcon: ThemeIcon;
  /** Defeat screen icon — skull (warm), error (cyber), broken heart (pastel) */
  defeatIcon: ThemeIcon;
  /** Lives icon on game over stats */
  livesIcon: ThemeIcon;
};

// ════════════════════════════════════════════════════════════════
// ACHIEVEMENTS — identity colors for bronze/silver/gold trophy tiers.
// ════════════════════════════════════════════════════════════════

type ThemeAchievements = {
  /** Bronze badge background — trophy circle for "Win a battle with this card" */
  tier1: string;
  /** Bronze label text color */
  tier1Text: string;
  /** Silver badge background — trophy circle for "10-win run with this card" */
  tier2: string;
  /** Silver label text color */
  tier2Text: string;
  /** Gold badge background — trophy circle for "Perfect 10-0 run" */
  tier3: string;
  /** Gold label text color */
  tier3Text: string;
};

// ════════════════════════════════════════════════════════════════
// PARTICLES — ambient floating particles on the background canvas.
// ════════════════════════════════════════════════════════════════

/** Built-in particle shapes. Drawing code is in ParticleBackground.tsx. */
export type ParticleShape = 'ember' | 'bokeh' | 'heart';

export type ParticleConfig = {
  /** Which built-in shape to render: 'ember' (jagged ash), 'bokeh' (soft circles), 'heart' */
  shape: ParticleShape;
  /** Size multiplier (1 = default). Larger = bigger particles. Range: 0.1–10. */
  size: number;
  /** Number of particles on screen. Range: 0–200. */
  count: number;
};

// ════════════════════════════════════════════════════════════════
// ASSETS — image URLs and particle config.
// URLs must be safe (http/https or relative paths, no javascript: or data: URIs).
// ════════════════════════════════════════════════════════════════

type ThemeAssets = {
  /** Ambient particle configuration for the background effect */
  particles: ParticleConfig;
};

// ════════════════════════════════════════════════════════════════
// TOAST — toast notification styling.
// ════════════════════════════════════════════════════════════════

type ThemeToast = {
  /** Success toast border color */
  successBorder: string;
  /** Error toast border color */
  errorBorder: string;
};

// ════════════════════════════════════════════════════════════════
// STUB SECTIONS — placeholders for future page-specific customization.
// These are empty now but reserved for per-page theming expansion.
// ════════════════════════════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type ThemeSetSelection = {};
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type ThemeLogin = {};

type ThemeMainMenu = {
  /** Hero subtitle color — the "Roguelike Deck-Building Auto-Battler" tagline */
  heroSubtitle: string;
  /** Play/battle icon — large icon on home and play pages */
  playIcon: ThemeIcon;
};

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type ThemeSettings = {};
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type ThemeNavigation = {};
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type ThemeCardDetailPanel = {};
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type ThemeTutorial = {};
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type ThemeTransactions = {};
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type ThemeAnimations = {};
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type ThemeMobile = {};
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type ThemeBagOverlay = {};
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type ThemeAccount = {};
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type ThemeNetwork = {};
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type ThemeHistory = {};
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type ThemeCreator = {};
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type ThemeMarketplace = {};

// ════════════════════════════════════════════════════════════════
// THEME DEFINITION — what theme creators provide.
// `base` is required; all other sections are optional and inherit from defaults.
// ════════════════════════════════════════════════════════════════

export interface ThemeDefinition {
  /** Unique identifier — 'warm', 'cyberpunk', 'pastel', or a custom string */
  id: ThemeId;
  /** Display name shown in the theme picker UI */
  label: string;
  /** Foundation colors, shapes, effects, fonts, backgrounds, and text */
  base: ThemeBase;
  /** Styling for the 4 button types: surface, selected, CTA, toggle */
  buttons?: Partial<ThemeButtons>;
  /** Unit card customization (rarity glows, stat icons) */
  unitCard?: Partial<ThemeUnitCard>;
  /** Battle shop phase styling (mana bar, icons, battle button) */
  battleShop?: Partial<ThemeBattleShop>;
  /** Battle overlay styling (combat effects, results, team zones) */
  battleOverlay?: Partial<ThemeBattleOverlay>;
  /** Victory/defeat screen styling */
  gameOver?: Partial<ThemeGameOver>;
  /** Card set selection screen */
  setSelection?: Partial<ThemeSetSelection>;
  /** Bronze/silver/gold trophy colors for the achievement system */
  achievements?: Partial<ThemeAchievements>;
  /** Image assets (play icon, burn icon) and particle effect config */
  assets?: Partial<ThemeAssets>;
  /** Login page customization */
  login?: Partial<ThemeLogin>;
  /** Main menu customization */
  mainMenu?: Partial<ThemeMainMenu>;
  /** Settings page customization */
  settings?: Partial<ThemeSettings>;
  /** Navigation customization */
  navigation?: Partial<ThemeNavigation>;
  /** Card detail panel customization */
  cardDetailPanel?: Partial<ThemeCardDetailPanel>;
  /** Tutorial customization */
  tutorial?: Partial<ThemeTutorial>;
  /** Toast notification customization */
  toast?: Partial<ThemeToast>;
  /** Transaction UI customization */
  transactions?: Partial<ThemeTransactions>;
  /** Animation customization */
  animations?: Partial<ThemeAnimations>;
  /** Mobile-specific customization */
  mobile?: Partial<ThemeMobile>;
  /** Bag overlay customization */
  bagOverlay?: Partial<ThemeBagOverlay>;
  /** Account page customization */
  account?: Partial<ThemeAccount>;
  /** Network page customization */
  network?: Partial<ThemeNetwork>;
  /** History page customization */
  history?: Partial<ThemeHistory>;
  /** Creator page customization */
  creator?: Partial<ThemeCreator>;
  /** Marketplace customization */
  marketplace?: Partial<ThemeMarketplace>;
}

// ════════════════════════════════════════════════════════════════
// RESOLVED THEME — fully merged with defaults, every field guaranteed present.
// This is what applyThemeToDocument and components work with.
// ════════════════════════════════════════════════════════════════

export interface ResolvedThemeDefinition {
  id: ThemeId;
  label: string;
  base: ThemeBase;
  buttons: ThemeButtons;
  unitCard: ThemeUnitCard;
  battleShop: ThemeBattleShop;
  battleOverlay: ThemeBattleOverlay;
  gameOver: ThemeGameOver;
  setSelection: ThemeSetSelection;
  achievements: ThemeAchievements;
  assets: ThemeAssets;
  login: ThemeLogin;
  mainMenu: ThemeMainMenu;
  settings: ThemeSettings;
  navigation: ThemeNavigation;
  cardDetailPanel: ThemeCardDetailPanel;
  tutorial: ThemeTutorial;
  toast: ThemeToast;
  transactions: ThemeTransactions;
  animations: ThemeAnimations;
  mobile: ThemeMobile;
  bagOverlay: ThemeBagOverlay;
  account: ThemeAccount;
  network: ThemeNetwork;
  history: ThemeHistory;
  creator: ThemeCreator;
  marketplace: ThemeMarketplace;
}

// ════════════════════════════════════════════════════════════════
// BUILT-IN THEMES
// ════════════════════════════════════════════════════════════════

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
    mana: '#5b8faa',
    positive: '#5a9a6e',
    special: '#8b6fb0',
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
        'M6.92 5L5 7l4.5 4.5-2.5 2.5 1.41 1.41L11 12.83l1.58 1.58L11.17 16l1.41 1.41 1.42-1.41 1.58 1.58-2.12 2.12 1.41 1.42 2.13-2.12 1.41 1.41L19.83 19 20 18.83l.59.59 1.41-1.42-.58-.58L23 16l-8.5-8.5L16 6l-2-2-1.5 1.5L11 4 6.92 5zM8.34 7.34L11 6l1.93 1.93-2.12 2.12L8.34 7.34z',
        'M1 21l2.34-2.34 1.42 1.42L2.42 22.42z',
        'M3 19l5-5 1.41 1.41-5 5z',
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
    overlayOpacity: 0.45,
    boardBg: '#161310',
    shopBg: '#1a1712',
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
    positiveColor: '#22c55e',
    negativeColor: '#dc2626',
    resultVictory: '#6ee7b7',
    resultDefeat: '#fca5a5',
    resultDraw: '#fcd34d',
    teamPlayerColor: 'rgba(90, 154, 110, 0.2)',
    teamEnemyColor: 'rgba(184, 92, 74, 0.2)',
    abilityIcon: {
      paths: ['M12 2l1.09 6.9L20 10l-6.91 1.09L12 18l-1.09-6.91L4 10l6.91-1.1z'],
    },
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
    particles: { shape: 'ember', size: 1, count: 40 },
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

// ════════════════════════════════════════════════════════════════
// THEME MAP & HELPERS
// ════════════════════════════════════════════════════════════════

export const DEFAULT_THEME_ID: ThemeId = 'warm';

export const THEMES: Record<string, ResolvedThemeDefinition> = {
  warm: DEFAULT_WARM_THEME,
};

export function getTheme(themeId: ThemeId | null | undefined): ResolvedThemeDefinition {
  if (!themeId) return THEMES[DEFAULT_THEME_ID];
  return THEMES[themeId] ?? THEMES[DEFAULT_THEME_ID];
}

// ════════════════════════════════════════════════════════════════
// RESOLVE — merge a partial ThemeDefinition with defaults.
// Produces a ResolvedThemeDefinition with every field guaranteed present.
// ════════════════════════════════════════════════════════════════

export function resolveTheme(theme: ThemeDefinition): ResolvedThemeDefinition {
  const d = DEFAULT_WARM_THEME;
  return {
    id: theme.id,
    label: theme.label,
    base: { ...d.base, ...theme.base },
    buttons: { ...d.buttons, ...theme.buttons },
    unitCard: { ...d.unitCard, ...theme.unitCard },
    battleShop: { ...d.battleShop, ...theme.battleShop },
    battleOverlay: { ...d.battleOverlay, ...theme.battleOverlay },
    gameOver: { ...d.gameOver, ...theme.gameOver },
    setSelection: { ...d.setSelection, ...theme.setSelection },
    achievements: { ...d.achievements, ...theme.achievements },
    assets: {
      ...d.assets,
      ...theme.assets,
      particles: { ...d.assets.particles, ...theme.assets?.particles },
    },
    login: { ...d.login, ...theme.login },
    mainMenu: { ...d.mainMenu, ...theme.mainMenu },
    settings: { ...d.settings, ...theme.settings },
    navigation: { ...d.navigation, ...theme.navigation },
    cardDetailPanel: { ...d.cardDetailPanel, ...theme.cardDetailPanel },
    tutorial: { ...d.tutorial, ...theme.tutorial },
    toast: { ...d.toast, ...theme.toast },
    transactions: { ...d.transactions, ...theme.transactions },
    animations: { ...d.animations, ...theme.animations },
    mobile: { ...d.mobile, ...theme.mobile },
    bagOverlay: { ...d.bagOverlay, ...theme.bagOverlay },
    account: { ...d.account, ...theme.account },
    network: { ...d.network, ...theme.network },
    history: { ...d.history, ...theme.history },
    creator: { ...d.creator, ...theme.creator },
    marketplace: { ...d.marketplace, ...theme.marketplace },
  };
}

// ── Safety helpers for user-provided themes ──

const VALID_PARTICLE_SHAPES: ParticleShape[] = ['ember', 'bokeh', 'heart'];

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
  defaults: ResolvedThemeDefinition = DEFAULT_WARM_THEME
): ThemeDefinition {
  return {
    ...untrusted,
    base: untrusted.base,
    battleShop: untrusted.battleShop
      ? {
          ...untrusted.battleShop,
          overlayOpacity: clampNumber(
            untrusted.battleShop.overlayOpacity,
            0,
            1,
            defaults.battleShop.overlayOpacity
          ),
        }
      : undefined,
    assets: untrusted.assets
      ? {
          particles: untrusted.assets.particles
            ? {
                shape: VALID_PARTICLE_SHAPES.includes(untrusted.assets.particles.shape)
                  ? untrusted.assets.particles.shape
                  : defaults.assets.particles.shape,
                size: clampNumber(
                  untrusted.assets.particles.size,
                  0.1,
                  10,
                  defaults.assets.particles.size
                ),
                count: clampNumber(
                  untrusted.assets.particles.count,
                  0,
                  200,
                  defaults.assets.particles.count
                ),
              }
            : undefined,
        }
      : undefined,
  };
}

// ════════════════════════════════════════════════════════════════
// APPLY — write resolved theme values to CSS custom properties.
// CSS variable names are unchanged from the pre-restructure version.
// ════════════════════════════════════════════════════════════════

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

export function applyThemeToDocument(
  themeId: ThemeId,
  root: HTMLElement = document.documentElement
) {
  applyResolvedThemeToDocument(getTheme(themeId), root);
}

export function applyResolvedThemeToDocument(
  theme: ResolvedThemeDefinition,
  root: HTMLElement = document.documentElement
) {
  // ── Palette colors (hex → RGB channels for Tailwind alpha support) ──
  const paletteEntries: [string, string][] = [
    ['--color-base-50', theme.base.base50],
    ['--color-base-100', theme.base.base100],
    ['--color-base-200', theme.base.base200],
    ['--color-base-300', theme.base.base300],
    ['--color-base-400', theme.base.base400],
    ['--color-base-500', theme.base.base500],
    ['--color-base-600', theme.base.base600],
    ['--color-base-700', theme.base.base700],
    ['--color-base-800', theme.base.base800],
    ['--color-base-900', theme.base.base900],
    ['--color-base-950', theme.base.base950],
    ['--color-accent', theme.base.accent],
    ['--color-mana', theme.base.mana],
    ['--color-card-attack', theme.unitCard.cardAttack],
    ['--color-card-burn', theme.unitCard.cardBurn],
    ['--color-positive', theme.base.positive],
    ['--color-special', theme.base.special],
    ['--color-victory', theme.base.victory],
    ['--color-defeat', theme.base.defeat],
    ['--color-card-bg', theme.unitCard.cardBg],
    ['--color-board-bg', theme.battleShop.boardBg],
    ['--color-shop-bg', theme.battleShop.shopBg],
    ['--color-surface-dark', theme.base.surfaceDark],
    ['--color-surface-mid', theme.base.surfaceMid],
  ];

  for (const [name, value] of paletteEntries) {
    setRootVariable(root, name, hexToRgbChannels(value));
  }

  // ── Shape ──
  setRootVariable(root, '--theme-button-radius', theme.buttons.buttonRadius);
  setRootVariable(root, '--theme-panel-radius', theme.base.panelRadius);
  setRootVariable(root, '--theme-card-radius', theme.unitCard.cardRadius);
  setRootVariable(root, '--theme-input-radius', theme.base.inputRadius);
  setRootVariable(root, '--theme-pill-radius', theme.base.pillRadius);

  // ── Effects ──
  setRootVariable(root, '--shadow-resting', theme.base.shadowResting);
  setRootVariable(root, '--shadow-hover', theme.base.shadowHover);
  setRootVariable(root, '--shadow-lifted', theme.base.shadowLifted);
  setRootVariable(root, '--theme-focus-ring', theme.base.focusRing);

  // ── Backgrounds ──
  setRootVariable(root, '--theme-app-background', theme.base.appBackground);
  setRootVariable(root, '--theme-title-gradient', theme.base.titleGradient);

  // Compute overlay and hand surface from overlayOpacity + palette
  const ov = theme.battleShop.overlayOpacity;
  const sdRgb = hexToRgbChannels(theme.base.surfaceDark);
  const smRgb = hexToRgbChannels(theme.base.surfaceMid);
  const acRgb = hexToRgbChannels(theme.base.accent);
  setRootVariable(root, '--theme-board-overlay', `rgba(${sdRgb.replace(/ /g, ', ')}, ${ov})`);
  setRootVariable(
    root,
    '--theme-hand-overlay',
    `rgba(${sdRgb.replace(/ /g, ', ')}, ${Math.max(ov - 0.1, 0)})`
  );
  setRootVariable(
    root,
    '--theme-hand-surface',
    `radial-gradient(ellipse at 50% 0%, rgba(${acRgb.replace(/ /g, ', ')}, ${ov * 0.3}), transparent 52%), linear-gradient(180deg, rgba(${sdRgb.replace(/ /g, ', ')}, 0.96) 0%, rgba(${smRgb.replace(/ /g, ', ')}, 0.98) 26%, rgba(${sdRgb.replace(/ /g, ', ')}, 1) 100%)`
  );

  // ── Buttons ──
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

  setRootVariable(root, '--theme-battle-button-bg', theme.battleShop.battleBackground);
  setRootVariable(root, '--theme-battle-button-hover-bg', theme.battleShop.battleHoverBackground);
  setRootVariable(root, '--theme-battle-button-active-bg', theme.battleShop.battleActiveBackground);
  setRootVariable(root, '--theme-battle-button-border', theme.battleShop.battleBorder);
  setRootVariable(root, '--theme-battle-button-text', theme.battleShop.battleText);
  setRootVariable(root, '--theme-battle-button-glow', theme.battleShop.battleGlow);

  // ── Battle shop (mana bar) ──
  setRootVariable(root, '--theme-mana-fill', theme.battleShop.manaFill);
  setRootVariable(root, '--theme-mana-glow', theme.battleShop.manaGlow);

  // ── Fonts ──
  setRootVariable(root, '--font-decorative', theme.base.decorative);
  setRootVariable(root, '--font-title', theme.base.title);
  setRootVariable(root, '--font-heading', theme.base.heading);
  setRootVariable(root, '--font-button', theme.base.button);
  setRootVariable(root, '--font-body', theme.base.body);
  setRootVariable(root, '--font-stat', theme.base.stat);
  setRootVariable(root, '--font-mono', theme.base.mono);

  // ── Text colors ──
  setRootVariable(root, '--theme-hero-subtitle', theme.mainMenu.heroSubtitle);
  setRootVariable(root, '--theme-secondary-text', theme.base.secondary);

  // ── Achievements ──
  setRootVariable(root, '--theme-achievement-tier1', theme.achievements.tier1);
  setRootVariable(root, '--theme-achievement-tier1-text', theme.achievements.tier1Text);
  setRootVariable(root, '--theme-achievement-tier2', theme.achievements.tier2);
  setRootVariable(root, '--theme-achievement-tier2-text', theme.achievements.tier2Text);
  setRootVariable(root, '--theme-achievement-tier3', theme.achievements.tier3);
  setRootVariable(root, '--theme-achievement-tier3-text', theme.achievements.tier3Text);

  // ── Battle overlay ──
  setRootVariable(root, '--theme-battle-ability', theme.battleOverlay.abilityColor);
  setRootVariable(root, '--theme-battle-positive', theme.battleOverlay.positiveColor);
  setRootVariable(root, '--theme-battle-negative', theme.battleOverlay.negativeColor);
  setRootVariable(root, '--theme-result-victory', theme.battleOverlay.resultVictory);
  setRootVariable(root, '--theme-result-defeat', theme.battleOverlay.resultDefeat);
  setRootVariable(root, '--theme-result-draw', theme.battleOverlay.resultDraw);
  setRootVariable(root, '--theme-team-player', theme.battleOverlay.teamPlayerColor);
  setRootVariable(root, '--theme-team-enemy', theme.battleOverlay.teamEnemyColor);

  // ── Unit card ──
  setRootVariable(root, '--theme-rarity-rare-glow', theme.unitCard.rarityRareGlow);
  setRootVariable(root, '--theme-rarity-legendary-glow', theme.unitCard.rarityLegendaryGlow);

  // ── Game over ──
  setRootVariable(root, '--theme-gameover-victory-atmosphere', theme.gameOver.victoryAtmosphere);
  setRootVariable(root, '--theme-gameover-defeat-atmosphere', theme.gameOver.defeatAtmosphere);
  setRootVariable(root, '--theme-pip-win', theme.gameOver.pipWin);
  setRootVariable(root, '--theme-pip-loss', theme.gameOver.pipLoss);

  // ── Toast ──
  setRootVariable(root, '--theme-toast-success-border', theme.toast.successBorder);
  setRootVariable(root, '--theme-toast-error-border', theme.toast.errorBorder);

  root.dataset.theme = theme.id;
}
