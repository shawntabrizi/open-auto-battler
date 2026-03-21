import swordsWarm from '../../swords.svg';
import swordsCyberpunk from '../../swords-cyberpunk.svg';
import swordsPastel from '../../swords-pastel.svg';
import burnWarm from '../../burn.svg';
import burnCyberpunk from '../../burn-cyberpunk.svg';
import burnPastel from '../../burn-pastel.svg';

export type ThemeId = 'warm' | 'cyberpunk' | 'pastel';

// ════════════════════════════════════════════════════════════════
// PALETTE — the core color system. Every color in the UI derives from these.
// ════════════════════════════════════════════════════════════════

type ThemePalette = {
  // ── Neutral scale (11 steps, lightest → darkest) ──
  // Used for text, borders, backgrounds, and general UI chrome.
  // base50 = lightest (near-white), base950 = darkest (near-black).
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
  /** Attack/damage color — attack stat on cards, damage numbers */
  cardAttack: string;
  /** Burn value color — burn badges on cards, burn-related UI */
  cardBurn: string;
  /** Secondary warm accent — bronze achievements, warm highlights */
  accentWarm: string;
  /** Positive accent — health stat on cards, connected indicators, success text */
  positive: string;
  /** Special/rare accent — tournament UI, accent for unique elements */
  special: string;
  /** Win state color — victory screen title, win counters, perfect run text */
  victory: string;
  /** Loss state color — defeat screen title, error messages, danger buttons, disconnect indicators */
  defeat: string;

  // ── Surface colors ──
  /** Card background — the base color behind card content */
  cardBg: string;
  /** Board background — the game board/arena surface */
  boardBg: string;
  /** Shop/hand background — the hand area below the board */
  shopBg: string;
  /** Deepest background — page background, root element background */
  surfaceDark: string;
  /** Mid-tone surface — elevated panels, card slots, arena surface gradients */
  surfaceMid: string;
};

// ════════════════════════════════════════════════════════════════
// SHAPE — border radii that define the visual personality (sharp vs rounded).
// ════════════════════════════════════════════════════════════════

type ThemeShape = {
  /** Buttons, small interactive elements (e.g. "0.75rem") */
  buttonRadius: string;
  /** Panels, modals, large containers (e.g. "1rem") */
  panelRadius: string;
  /** Unit cards in hand and on board (e.g. "0.5rem") */
  cardRadius: string;
  /** Text inputs, selects, form controls (e.g. "0.75rem") */
  inputRadius: string;
  /** Pill-shaped elements — tags, status badges (e.g. "999px" for full pill) */
  pillRadius: string;
};

// ════════════════════════════════════════════════════════════════
// EFFECTS — shadows and focus indicators.
// Values are full CSS box-shadow strings.
// ════════════════════════════════════════════════════════════════

type ThemeEffects = {
  /** Default shadow for cards, panels, buttons at rest */
  shadowResting: string;
  /** Shadow on hover — slightly elevated, more prominent */
  shadowHover: string;
  /** Shadow for dragged/lifted elements — most prominent */
  shadowLifted: string;
  /** Focus ring for keyboard navigation — typically a colored outline glow */
  focusRing: string;
};

// ════════════════════════════════════════════════════════════════
// BACKGROUNDS — ambient page backgrounds and overlays.
// ════════════════════════════════════════════════════════════════

type ThemeBackgrounds = {
  /** CSS gradient for the ambient page background (radial gradients layered for atmosphere).
   *  Applied behind all content on every page. */
  appBackground: string;
  /** CSS gradient for the main title text ("OPEN AUTO BATTLER") — used with bg-clip-text.
   *  Also used for section headings like "BOARD", "HAND", "Card Details". */
  titleGradient: string;
  /** Opacity (0–1) for board and hand area overlays when custom backgrounds are active.
   *  Higher = darker overlay. App computes the actual rgba from surfaceDark + this value.
   *  Also controls the hand surface gradient intensity. */
  overlayOpacity: number;
};

// ════════════════════════════════════════════════════════════════
// ICONS — colors for icon tinting + SVG path data for icon shapes.
// ════════════════════════════════════════════════════════════════

/** SVG icon definition — paths rendered inside a 24×24 viewBox. */
type ThemeIconSvg = {
  /** One or more SVG `d` attributes — each becomes a <path> element */
  paths: string[];
  /** Custom viewBox (default "0 0 24 24") */
  viewBox?: string;
};

type ThemeIcons = {
  // ── Icon colors (applied via CSS classes like "theme-icon-accent") ──
  /** Primary icon tint — menu icons, star icons, ability sparkles. Related: palette.accent */
  accent: string;
  /** Muted icon tint — close buttons, secondary icons. Related: palette.base300 */
  muted: string;
  /** Mana/info icon tint — mana bolt on cards. Related: palette.mana */
  mana: string;
  /** Attack icon tint — sword icon on unit cards. Related: palette.cardAttack */
  attack: string;
  /** Health icon tint — heart icon on unit cards, lives icon. Related: palette.positive */
  health: string;
  /** Warning icon tint — timer warnings, cost warnings. Related: palette.accent */
  warning: string;
  /** Victory icon tint — trophy on game over screen. Related: palette.victory */
  victory: string;
  /** Defeat icon tint — skull on game over screen. Related: palette.defeat */
  defeat: string;

  // ── Icon SVG shapes (the actual icon graphics, customizable per theme) ──
  svg: {
    /** Unit attack stat — swords (warm), crosshair (cyber), wand (pastel) */
    attack: ThemeIconSvg;
    /** Unit health stat — heart (warm), shield (cyber), flower (pastel) */
    health: ThemeIconSvg;
    /** Player lives counter — shield-heart (warm), battery (cyber), heart (pastel) */
    lives: ThemeIconSvg;
    /** Mana cost indicator — lightning bolt (warm), circuit (cyber), dewdrop (pastel) */
    mana: ThemeIconSvg;
    /** Ability indicator between stats — sparkle (warm), burst (cyber), butterfly (pastel) */
    ability: ThemeIconSvg;
    /** Victory screen icon — trophy (warm), crown (cyber), tiara (pastel) */
    victory: ThemeIconSvg;
    /** Defeat screen icon — skull (warm), error screen (cyber), broken heart (pastel) */
    defeat: ThemeIconSvg;
    /** Draw pool / bag — drawstring bag (warm), data cube (cyber), gift box (pastel) */
    bag: ThemeIconSvg;
  };
};

// ════════════════════════════════════════════════════════════════
// BUTTONS — styling for the 5 button types used throughout the UI.
// Values are CSS strings (colors, gradients, box-shadows).
// ════════════════════════════════════════════════════════════════

type ThemeButtons = {
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

  // ── Toggle switch: on/off toggles in settings (Show Card Names, Reduced Animations, etc.) ──
  /** Background of the toggle track when active/on — typically matches selectedBackground */
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

  // ── Battle button: the main "COMMIT" / "BATTLE" button during gameplay ──
  /** Background at rest — typically an elaborate metallic gradient */
  battleBackground: string;
  /** Background on hover — brighter/shinier */
  battleHoverBackground: string;
  /** Background when pressed/active — darker, pressed-in feel */
  battleActiveBackground: string;
  /** Border color */
  battleBorder: string;
  /** Text color (usually dark on bright metallic background) */
  battleText: string;
  /** Ambient glow around the button */
  battleGlow: string;

};

// ════════════════════════════════════════════════════════════════
// MANA — styling for the segmented mana bar between board and hand.
// ════════════════════════════════════════════════════════════════

type ThemeMana = {
  /** Fill gradient for filled mana segments */
  fill: string;
  /** Glow effect on filled mana segments */
  glow: string;
};

// ════════════════════════════════════════════════════════════════
// FONTS — font-family strings for each typographic role.
// Must be valid CSS font-family values. Fonts must be loaded via index.html.
// ════════════════════════════════════════════════════════════════

type ThemeFonts = {
  /** Large decorative display text — the "OPEN AUTO BATTLER" title on home/login.
   *  Should be dramatic and eye-catching. */
  decorative: string;
  /** Title/heading text — "BOARD", "HAND", "Card Details" headers, section titles.
   *  Used with bg-clip-text gradient effect. */
  title: string;
  /** Mid-level headings — card names, panel headers, form section labels */
  heading: string;
  /** Button labels — all interactive button text across the UI */
  button: string;
  /** Body text — descriptions, ability text, paragraphs, general content */
  body: string;
  /** Numeric stats — attack/health values on cards, mana counts, win/loss numbers.
   *  Should be clear and readable at small sizes. */
  stat: string;
  /** Monospace — wallet addresses, card IDs, JSON data, technical info */
  mono: string;
};

// ════════════════════════════════════════════════════════════════
// TEXT — semantic text colors for specific UI contexts.
// ════════════════════════════════════════════════════════════════

type ThemeTextColors = {
  /** Hero subtitle color — the "Roguelike Deck-Building Auto-Battler" tagline.
   *  Also used for page descriptions on home/login. */
  heroSubtitle: string;
  /** Secondary description text — button descriptions ("Online Arena, Offline, Peer-to-Peer"),
   *  card set descriptions, minor labels throughout the UI. */
  secondary: string;
};

// ════════════════════════════════════════════════════════════════
// ACHIEVEMENTS — identity colors for bronze/silver/gold trophy tiers.
// These represent real-world metals and should retain their identity across themes,
// but can be adapted to fit the theme's palette (e.g. pastel bronze = soft peach).
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
  /** Image for the PLAY button on home/play pages — swords (warm), energy blades (cyber), wands (pastel).
   *  Rendered via <img src>, which blocks SVG script execution. */
  playIcon: string;
  /** Image for the burn zone in the shop — campfire (warm), neon dissolve (cyber), fairy dust (pastel).
   *  Rendered via <img src>. */
  burnIcon: string;
  /** Ambient particle configuration for the background effect */
  particles: ParticleConfig;
};

// ════════════════════════════════════════════════════════════════
// BATTLE EFFECTS — colors for combat animations and highlights.
// Used by CSS animations on cards during battle replay.
// ════════════════════════════════════════════════════════════════

type ThemeBattleEffects = {
  /** Ability trigger glow — yellow flash when a unit's ability activates.
   *  Used for: source-glow animation, ability toast popup border/text. */
  ability: string;
  /** Positive effect glow — green flash for buffs, heals, stat gains.
   *  Used for: target-highlight-positive animation, floating +HP/+ATK numbers. */
  positive: string;
  /** Negative effect glow — red flash for damage, debuffs.
   *  Used for: target-highlight animation, floating damage numbers. */
  negative: string;
};

// ════════════════════════════════════════════════════════════════
// THEME DEFINITION — the complete theme interface.
// ════════════════════════════════════════════════════════════════

export interface ThemeDefinition {
  /** Unique identifier — 'warm', 'cyberpunk', 'pastel', or a custom string */
  id: ThemeId;
  /** Display name shown in the theme picker UI */
  label: string;
  /** Core color system — all UI colors derive from these */
  palette: ThemePalette;
  /** Border radius values defining visual personality (sharp vs rounded) */
  shape: ThemeShape;
  /** Box-shadow and focus ring styles */
  effects: ThemeEffects;
  /** Page backgrounds, title gradients, overlay opacity */
  backgrounds: ThemeBackgrounds;
  /** Icon tint colors + SVG shape definitions for game icons */
  icons: ThemeIcons;
  /** Styling for the 5 button types: surface, selected, CTA, battle, toggle */
  buttons: ThemeButtons;
  /** Mana bar fill and glow styling */
  mana: ThemeMana;
  /** Font-family strings for 7 typographic roles */
  fonts: ThemeFonts;
  /** Semantic text colors for hero subtitle and secondary descriptions */
  text: ThemeTextColors;
  /** Bronze/silver/gold trophy colors for the achievement system */
  achievements: ThemeAchievements;
  /** Image assets (play icon, burn icon) and particle effect config */
  assets: ThemeAssets;
  /** Combat animation highlight colors (ability trigger, buff, damage) */
  battleEffects: ThemeBattleEffects;
}

type ThemeMap = Record<ThemeId, ThemeDefinition>;

// ── Icon SVG paths per theme ──

/** Classic RPG icons — swords, hearts, trophies */
const WARM_ICONS: ThemeIcons['svg'] = {
  attack: {
    paths: [
      'M6.92 5L5 7l4.5 4.5-2.5 2.5 1.41 1.41L11 12.83l1.58 1.58L11.17 16l1.41 1.41 1.42-1.41 1.58 1.58-2.12 2.12 1.41 1.42 2.13-2.12 1.41 1.41L19.83 19 20 18.83l.59.59 1.41-1.42-.58-.58L23 16l-8.5-8.5L16 6l-2-2-1.5 1.5L11 4 6.92 5zM8.34 7.34L11 6l1.93 1.93-2.12 2.12L8.34 7.34z',
      'M1 21l2.34-2.34 1.42 1.42L2.42 22.42z',
      'M3 19l5-5 1.41 1.41-5 5z',
    ],
  },
  health: {
    paths: [
      'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
    ],
  },
  lives: {
    // Shield with heart — player lives
    paths: [
      'M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3zm0 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z',
      'M12 9.5c-1.38 0-2.5 1.12-2.5 2.5s1.12 2.5 2.5 2.5 2.5-1.12 2.5-2.5-1.12-2.5-2.5-2.5z',
    ],
  },
  mana: {
    paths: ['M13 3L4 14h7l-2 7 9-11h-7l2-7z'],
  },
  ability: {
    paths: ['M12 2l1.09 6.9L20 10l-6.91 1.09L12 18l-1.09-6.91L4 10l6.91-1.1z'],
  },
  victory: {
    paths: [
      'M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z',
    ],
  },
  defeat: {
    paths: [
      'M12 2C6.48 2 2 6.48 2 12c0 3.07 1.39 5.81 3.57 7.63L7 22h4v-2h2v2h4l1.43-2.37C20.61 17.81 22 15.07 22 12c0-5.52-4.48-10-10-10zM8.5 15c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm7 0c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z',
      'M10 18h4v1h-4z',
    ],
  },
  bag: {
    // Drawstring bag
    paths: [
      'M12 2C9.24 2 7 4.24 7 7h2c0-1.66 1.34-3 3-3s3 1.34 3 3h2c0-2.76-2.24-5-5-5z',
      'M5 9l1.5 12c.17 1.14 1.15 2 2.3 2h6.4c1.15 0 2.13-.86 2.3-2L19 9H5zm7 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z',
      'M12 13a2 2 0 100 4 2 2 0 000-4z',
    ],
  },
};

/** Cyberpunk tech icons — crosshair, shield, circuit, glitch */
const CYBERPUNK_ICONS: ThemeIcons['svg'] = {
  attack: {
    // Crosshair / targeting reticle
    paths: [
      'M12 2a10 10 0 100 20 10 10 0 000-20zm0 18a8 8 0 110-16 8 8 0 010 16z',
      'M13 7h-2v4H7v2h4v4h2v-4h4v-2h-4V7z',
    ],
  },
  health: {
    // Hexagonal shield
    paths: [
      'M12 2L4 6.5v5c0 4.55 3.4 8.82 8 9.5 4.6-.68 8-4.95 8-9.5v-5L12 2zm0 17.92c-3.72-.72-6-4.22-6-7.92V7.78l6-3.39 6 3.39v4.22c0 3.7-2.28 7.2-6 7.92z',
      'M11 10h2v5h-2zm0-3h2v2h-2z',
    ],
  },
  lives: {
    // Battery / power cell
    paths: [
      'M15.67 4H14V2h-4v2H8.33C7.6 4 7 4.6 7 5.33v15.33C7 21.4 7.6 22 8.33 22h7.33c.74 0 1.34-.6 1.34-1.33V5.33C17 4.6 16.4 4 15.67 4zM15 18H9V6h6v12z',
      'M10 8h4v4h-4z',
    ],
  },
  mana: {
    // Circuit/energy node
    paths: [
      'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14c-2.33 0-4.32-1.45-5.12-3.5h1.67c.7 1.19 1.97 2 3.45 2s2.75-.81 3.45-2h1.67c-.8 2.05-2.79 3.5-5.12 3.5z',
    ],
  },
  ability: {
    // Lightning/data burst
    paths: [
      'M7 2v11h3v9l7-12h-4l4-8z',
    ],
  },
  victory: {
    // Crown
    paths: [
      'M2 19h20v3H2zm2-2l3-6 3 3 4-7 4 7 3-3v6H4z',
    ],
  },
  defeat: {
    // Glitch/error — broken screen
    paths: [
      'M20 3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H4V5h16v14z',
      'M7 8l3 3-3 3 1.41 1.41L12 12l-3.59-3.59z',
      'M13 15h4v2h-4z',
    ],
  },
  bag: {
    // Data cube / inventory
    paths: [
      'M21 16.5c0 .38-.21.71-.53.88l-7.9 4.44c-.36.2-.8.2-1.14 0l-7.9-4.44A.991.991 0 013 16.5v-9c0-.38.21-.71.53-.88l7.9-4.44c.36-.2.8-.2 1.14 0l7.9 4.44c.32.17.53.5.53.88v9z',
      'M12 12.5L3.5 7.5M12 12.5v9.5M12 12.5l8.5-5',
    ],
  },
};

/** Pastel fairy icons — wand, flower, butterfly */
const PASTEL_ICONS: ThemeIcons['svg'] = {
  attack: {
    // Magic wand with star tip
    paths: [
      'M15 1l-1.4 4.2L9.4 3.8 10.8 8 6.6 6.6 8 10.8l-4.2 1.4L8 13.6l-1.4 4.2L10.8 16l-1.4 4.2L13.6 16l4.2 1.4L16 13.2l4.2 1.4L18.8 10.8 23 9.4l-4.2-1.4L20.2 3.8 16 5.2z',
    ],
  },
  health: {
    // Flower / blossom
    paths: [
      'M12 22c4.97 0 9-4.03 9-9-4.97 0-9 4.03-9 9zM5.6 10.25c0 1.38 1.12 2.5 2.5 2.5.53 0 1.01-.16 1.42-.44l-.02.19c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5l-.02-.19c.4.28.89.44 1.42.44 1.38 0 2.5-1.12 2.5-2.5 0-1-.59-1.85-1.43-2.25.84-.4 1.43-1.25 1.43-2.25 0-1.38-1.12-2.5-2.5-2.5-.53 0-1.01.16-1.42.44l.02-.19C14.5 2.12 13.38 1 12 1S9.5 2.12 9.5 3.5l.02.19c-.4-.28-.89-.44-1.42-.44-1.38 0-2.5 1.12-2.5 2.5 0 1 .59 1.85 1.43 2.25-.84.4-1.43 1.25-1.43 2.25zM12 5.5c1.38 0 2.5 1.12 2.5 2.5s-1.12 2.5-2.5 2.5S9.5 9.38 9.5 8s1.12-2.5 2.5-2.5z',
      'M3 13c0 4.97 4.03 9 9 9 0-4.97-4.03-9-9-9z',
    ],
  },
  lives: {
    // Cute heart — player lives
    paths: [
      'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
    ],
  },
  mana: {
    // Dewdrop / water drop
    paths: [
      'M12 2c-5.33 8.03-8 12.76-8 16 0 4.42 3.58 8 8 8s8-3.58 8-8c0-3.24-2.67-7.97-8-16zm0 22c-3.31 0-6-2.69-6-6 0-1 .25-2.26 1-4h10c.75 1.74 1 3 1 4 0 3.31-2.69 6-6 6z',
    ],
  },
  ability: {
    // Butterfly
    paths: [
      'M12 12c-1 0-2-.45-2-1s.9-1 2-1 2 .45 2 1-.9 1-2 1zm-5.44-.78C4.37 12.21 3 14 3 16c0 2.76 2.46 5 5.5 5 1.93 0 3.63-.94 4.5-2.35-.43-.2-.82-.47-1.16-.79C10.73 19.2 9.2 20 7.5 20 5.57 20 4 18.65 4 17c0-1.2.72-2.24 1.79-2.83L5.56 11.22zm10.88 0l-.23 2.95C18.28 14.76 19 15.8 19 17c0 1.65-1.57 3-3.5 3-1.7 0-3.23-.8-3.84-2.14-.34.32-.73.59-1.16.79.87 1.41 2.57 2.35 4.5 2.35 3.04 0 5.5-2.24 5.5-5 0-2-1.37-3.79-3.56-4.78z',
      'M12 4C9 4 7 6 7 8c0 1.5.8 2.8 2 3.5V13c0 1 1.34 2 3 2s3-1 3-2v-1.5c1.2-.7 2-2 2-3.5 0-2-2-4-5-4z',
    ],
  },
  victory: {
    // Sparkle crown / tiara
    paths: [
      'M5 16h14v3H5z',
      'M12 4l2 4 4-2-2 4 4 2H4l4-2-2-4 4 2z',
    ],
  },
  defeat: {
    // Broken heart
    paths: [
      'M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3z',
      'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09V21.35z',
      'M11 7l2 4-2 3 2 4',
    ],
  },
  bag: {
    // Gift box / treasure chest
    paths: [
      'M20 6h-2.18c.11-.31.18-.65.18-1a2.996 2.996 0 00-5.5-1.65l-.5.67-.5-.68C10.96 2.54 10.05 2 9 2 7.34 2 6 3.34 6 5c0 .35.07.69.18 1H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-5-1c0-.55.45-1 1-1s1 .45 1 1-.45 1-1 1-1-.45-1-1zM9 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm11 15H4v-2h16v2zm0-5H4V8h5.08L7 10.83 8.62 12 11 8.76l1-1.36 1 1.36L15.38 12 17 10.83 14.92 8H20v6z',
    ],
  },
};

const DEFAULT_WARM_THEME: ThemeDefinition = {
  id: 'warm',
  label: 'Warm',
  palette: {
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
    cardAttack: '#b85c4a',
    cardBurn: '#d4a843',
    accentWarm: '#c48a2a',
    positive: '#5a9a6e',
    special: '#8b6fb0',
    victory: '#4a8c3a',
    defeat: '#a83a2a',
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
    overlayOpacity: 0.45,
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
    svg: WARM_ICONS,
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
  },
  mana: {
    fill: 'linear-gradient(to top, #5b8faa, #60a5fa)',
    glow: '0 0 6px rgba(59, 130, 246, 0.5)',
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
    tier1: '#b87333',
    tier1Text: '#d4956a',
    tier2: '#9ca3af',
    tier2Text: '#c0c7d0',
    tier3: '#d4a843',
    tier3Text: '#e8c44a',
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
    base50: '#eafcff',
    base100: '#c9f6ff',
    base200: '#8fe8ff',
    base300: '#4dd0f6',
    base400: '#24b7db',
    base500: '#1896b6',
    base600: '#12718a',
    base700: '#0f4d61',
    base800: '#0b2436',
    base900: '#081420',
    base950: '#040812',
    accent: '#00f6ff',
    mana: '#38bdf8',
    cardAttack: '#ff4d9d',
    cardBurn: '#f8ff66',
    accentWarm: '#f8ff66',
    positive: '#00ffa3',
    special: '#d946ef',
    victory: '#00ffa3',
    defeat: '#ff4d9d',
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
    overlayOpacity: 0.2,
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
    svg: CYBERPUNK_ICONS,
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
  },
  mana: {
    fill: 'linear-gradient(to top, #0ea5e9, #22d3ee)',
    glow: '0 0 8px rgba(34, 211, 238, 0.55)',
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
    tier1: '#f97316',
    tier1Text: '#fb923c',
    tier2: '#94a3b8',
    tier2Text: '#cbd5e1',
    tier3: '#ffd700',
    tier3Text: '#ffe44d',
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
    base50: '#fff7fb',
    base100: '#ffe5f1',
    base200: '#ffcadd',
    base300: '#ffadc9',
    base400: '#f88eb4',
    base500: '#e6749a',
    base600: '#c95d81',
    base700: '#9f4766',
    base800: '#6f3348',
    base900: '#492331',
    base950: '#2e151f',
    accent: '#ff9ec4',
    mana: '#a78bfa',
    cardAttack: '#ff6b9f',
    cardBurn: '#ffc6de',
    accentWarm: '#ffb3c7',
    positive: '#7dd3c7',
    special: '#c084fc',
    victory: '#6ee7b7',
    defeat: '#fb7185',
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
    overlayOpacity: 0.15,
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
    svg: PASTEL_ICONS,
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
  },
  mana: {
    fill: 'linear-gradient(to top, #a78bfa, #f9a8d4)',
    glow: '0 0 8px rgba(249, 168, 212, 0.42)',
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
    tier1: '#dba06d',
    tier1Text: '#e8b990',
    tier2: '#c9c0d3',
    tier2Text: '#ddd6e8',
    tier3: '#f0c27a',
    tier3Text: '#f5d49a',
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
    backgrounds: {
      ...untrusted.backgrounds,
      overlayOpacity: clampNumber(untrusted.backgrounds?.overlayOpacity, 0, 1, base.backgrounds.overlayOpacity),
    },
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
    ['--color-base-50', theme.palette.base50],
    ['--color-base-100', theme.palette.base100],
    ['--color-base-200', theme.palette.base200],
    ['--color-base-300', theme.palette.base300],
    ['--color-base-400', theme.palette.base400],
    ['--color-base-500', theme.palette.base500],
    ['--color-base-600', theme.palette.base600],
    ['--color-base-700', theme.palette.base700],
    ['--color-base-800', theme.palette.base800],
    ['--color-base-900', theme.palette.base900],
    ['--color-base-950', theme.palette.base950],
    ['--color-accent', theme.palette.accent],
    ['--color-mana', theme.palette.mana],
    ['--color-card-attack', theme.palette.cardAttack],
    ['--color-card-burn', theme.palette.cardBurn],
    ['--color-accent-warm', theme.palette.accentWarm],
    ['--color-positive', theme.palette.positive],
    ['--color-special', theme.palette.special],
    ['--color-victory', theme.palette.victory],
    ['--color-defeat', theme.palette.defeat],
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

  // Compute overlay and hand surface from overlayOpacity + palette
  const ov = theme.backgrounds.overlayOpacity;
  const sdRgb = hexToRgbChannels(theme.palette.surfaceDark);
  const smRgb = hexToRgbChannels(theme.palette.surfaceMid);
  const acRgb = hexToRgbChannels(theme.palette.accent);
  setRootVariable(root, '--theme-board-overlay', `rgba(${sdRgb.replace(/ /g, ', ')}, ${ov})`);
  setRootVariable(root, '--theme-hand-overlay', `rgba(${sdRgb.replace(/ /g, ', ')}, ${Math.max(ov - 0.1, 0)})`);
  setRootVariable(
    root,
    '--theme-hand-surface',
    `radial-gradient(ellipse at 50% 0%, rgba(${acRgb.replace(/ /g, ', ')}, ${ov * 0.3}), transparent 52%), linear-gradient(180deg, rgba(${sdRgb.replace(/ /g, ', ')}, 0.96) 0%, rgba(${smRgb.replace(/ /g, ', ')}, 0.98) 26%, rgba(${sdRgb.replace(/ /g, ', ')}, 1) 100%)`
  );
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

  setRootVariable(root, '--theme-mana-fill', theme.mana.fill);
  setRootVariable(root, '--theme-mana-glow', theme.mana.glow);

  setRootVariable(root, '--font-decorative', theme.fonts.decorative);
  setRootVariable(root, '--font-title', theme.fonts.title);
  setRootVariable(root, '--font-heading', theme.fonts.heading);
  setRootVariable(root, '--font-button', theme.fonts.button);
  setRootVariable(root, '--font-body', theme.fonts.body);
  setRootVariable(root, '--font-stat', theme.fonts.stat);
  setRootVariable(root, '--font-mono', theme.fonts.mono);
  setRootVariable(root, '--theme-hero-subtitle', theme.text.heroSubtitle);
  setRootVariable(root, '--theme-secondary-text', theme.text.secondary);

  setRootVariable(root, '--theme-achievement-tier1', theme.achievements.tier1);
  setRootVariable(root, '--theme-achievement-tier1-text', theme.achievements.tier1Text);
  setRootVariable(root, '--theme-achievement-tier2', theme.achievements.tier2);
  setRootVariable(root, '--theme-achievement-tier2-text', theme.achievements.tier2Text);
  setRootVariable(root, '--theme-achievement-tier3', theme.achievements.tier3);
  setRootVariable(root, '--theme-achievement-tier3-text', theme.achievements.tier3Text);

  setRootVariable(root, '--theme-battle-ability', theme.battleEffects.ability);
  setRootVariable(root, '--theme-battle-positive', theme.battleEffects.positive);
  setRootVariable(root, '--theme-battle-negative', theme.battleEffects.negative);

  root.dataset.theme = theme.id;
}
