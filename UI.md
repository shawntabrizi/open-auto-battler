### Context 3: The "Visual Spec" (UI Layout - Horizontal Mobile)

*Feed this to Claude to ensure the layout utilizes the width of a landscape screen effectively.*

```markdown
## UI Layout Specification (Landscape Mobile)
The game is optimized for horizontal viewing (16:9 or wider). The screen is divided into three primary horizontal bands.

### Zone 1: The Top HUD (Information)
A thin, semi-transparent bar running across the very top of the screen.
- **Top Left:** Lives (Heart Icons).
- **Top Center:** Round Counter & "Next Battle" Button.
- **Top Right:** Trophies (Win Count).

### Zone 2: The Battlefield (Main Stage)
Occupies the middle 50% of the screen height.
- **The Arena (Upper Part of Zone 2):**
  - **Left Side (Player):** 5 Slots. [Unit 5] [4] [3] [2] **[1]** -> (Faces Right)
  - **Right Side (Enemy):** 5 Slots. <- **[1]** [2] [3] [4] [5] (Faces Left)
  - *Center:* A clear gap where the "Clash" animation happens.
- **The Bench (Lower Part of Zone 2):**
  - Located directly beneath the Player's Unit Slots.
  - A row of 7 slots.
  - *Interaction:* Short drag distance from Bench (Up) -> Board.

### Zone 3: The Command Deck (Bottom Footer)
Occupies the bottom 30% of the screen. This is a distinct "Control Panel" with a heavy industrial aesthetic (Metal/Stone).

- **Left Anchor: The Ash Pile (Trash)**
  - A large, circular "Incinerator" zone in the bottom-left corner.
  - *Position:* Easy reach for the **Left Thumb**.
  - *Interaction:* Drag ANY card here to Pitch.
  - *Visual:* Always visible. Erupts with flame particles when hovering.

- **Right Anchor: The Mana Tank**
  - A large glass tube in the bottom-right corner.
  - *Position:* Easy visibility near the **Right Thumb**.
  - *Visual:* Liquid level rises/falls. Shows "Limit" capacity clearly.

- **Center Span: The Conveyor Belt (Shop)**
  - Runs horizontally between the Ash Pile and Mana Tank.
  - *Interaction:* Cards slide in from the Deck (Left) and move Right.
  - *Drag Path:* - To Buy: Drag Up (to Bench).
    - To Pitch: Drag Left (to Ash Pile).

```

### 💡 CSS Hint for Claude

> *"Use `display: grid` for the main container. The 'Command Deck' should have a fixed height (e.g., `180px`) at the bottom, while the Arena takes `flex: 1` to fill the remaining space. Ensure the 'Ash Pile' and 'Mana Tank' are absolutely positioned or flex-anchored to the corners of the footer to frame the shop belt."*
