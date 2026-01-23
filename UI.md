# Manalimit: UI & Interaction Specification

## 1. Overview

**Manalimit** uses a state-driven UI where React acts as a pure view layer for the Rust `GameEngine`. The layout is optimized for a landscape experience, focusing on clear zones for information, action, and feedback.

## 2. Layout Structure

The application is divided into several main components coordinated by `GameLayout.tsx`:

### Zone 1: Top HUD (`HUD.tsx`)
A persistent header providing game status.
- **Left:** Lives display (Heart icons).
- **Center:** Round counter and the **Battle!** button (only visible during the Shop phase).
- **Right:** Trophy/Win tracker (Star icons).

### Zone 2: The Arena (`Arena.tsx`)
The central gameplay area where combat and board management happen.
- **Enemy Board:** 5 slots at the top (displayed as placeholders during the Shop phase).
- **VS Divider:** A central "VS" label separating the teams.
- **Player Board:** 5 slots at the bottom.
  - **Layout:** Units are displayed from right-to-left (Position 1 is the front-most unit on the right).
  - **Interaction:** 
    - Click to select a unit (opening the Detail Panel).
    - Drag a unit to swap positions.
    - Drag a unit to the **Ash Pile** to pitch it.

### Zone 3: Command Deck (`Shop.tsx`)
The bottom area for economic actions.
- **Ash Pile (Left):** A circular incinerator zone ("🔥").
  - **Interaction:** Drop any card here (from Shop or Board) to destroy it and gain Mana.
- **The Shop (Center):** A row of available cards.
  - **Interaction:**
    - Click to select.
    - Drag to the Board to Buy (if Mana is sufficient).
    - Drag to the Ash Pile to Pitch.
- **Mana Tank (Right):** A visual "liquid" container showing `Current / Limit`.
  - **Visual:** Height of the blue liquid represents the percentage of mana capacity filled.

### Side Panel: Card Details (`CardDetailPanel.tsx`)
A sliding panel on the left (toggled by selection).
- **Tabs:** "Card Details" for unit info and "Rules" for game guides.
- **Content:** Large art, flavor text, detailed ability descriptions with trigger/effect explanations.
- **Actions:** Quick buttons for Buy, Freeze, and Pitch.
- **Debug:** Toggleable "Raw JSON" view for developers.

## 3. Interaction Patterns

### Drag & Drop
The game utilizes native HTML5 Drag and Drop for intuitive management:
- **Shop -> Board:** Buys the unit (deducts mana).
- **Shop -> Ash Pile:** Pitches the card for mana.
- **Board -> Ash Pile:** Pitches the unit from the board.
- **Board -> Board:** Swaps unit positions.

### Selection
Clicking a card or board unit selects it, which:
1. Highlights the card with a golden ring.
2. Opens the **Card Detail Panel** on the left.
3. Repositions the main Arena/Shop to make room for the panel.

## 4. Battle Experience (`BattleOverlay.tsx`)

When a round ends, a full-screen modal overlays the UI for deterministic battle playback.

### Battle Arena (`BattleArena.tsx`)
- **Playback Control:** Speed adjustment (1x to 5x) saved to local storage.
- **Animations:**
  - **Clash Bump:** Units physically lurch toward the center during a strike.
  - **Damage Numbers:** Floating red "-X" text over units.
  - **Stat Changes:** Floating green "+X/+X" text for buffs.
  - **Ability Toasts:** Temporary golden labels appearing above units when an ability triggers (e.g., "Loot").
  - **Death/Slide:** Units are removed and survivors slide forward to fill the front-most slots.
- **Result:** Displays a clear "VICTORY", "DEFEAT", or "DRAW" message before allowing the user to continue to the next round.

## 5. Visual Theme
- **Backgrounds:** Dark, industrial/stone textures (`bg-board-bg`, `bg-shop-bg`).
- **Cards:** Clean borders with icons for stats (Sword for Attack, Heart for Health).
- **Mana:** Glowing blue theme (`mana-blue`).
- **Pitch:** Fiery red theme (`pitch-red`).