# UI Flow

This document tracks the complete menu and navigation structure of the game. Use it as the source of truth when adding new screens or changing navigation paths.

Last updated: 2026-03-19

## Navigation Flowchart

```mermaid
flowchart TD
  Login["Login Page (gate)"]

  Login --> Main["Main Menu"]

  Main --> Play["Play (local)"]
  Main --> PlayOnline["Play Online (blockchain)"]
  Main --> Tournament["Tournament (if live)"]
  Main --> Sandbox["Sandbox"]
  Main --> P2P["P2P Multiplayer"]
  Main --> Ghosts["Ghosts"]
  Main --> Presentations["Presentations"]

  Hamburger["Hamburger Menu (every page)"]
  Hamburger --> Settings["Settings"]
  Hamburger --> Account["Account"]
  Hamburger --> Network["Network"]
  Hamburger --> Shop["Shop"]
  Hamburger --> Logout["Log Out"]

  Settings --> Customize["Customize"]
```

## Login Page

**Route:** None (rendered by `AuthGate` when `isLoggedIn` is false)

**Purpose:** Blocks access to the entire app until the user selects a funded account and logs in.

**Behavior:**
- Auto-connects to the configured blockchain endpoint on mount.
- If the user was previously logged in (address stored in `localStorage` under `oab-logged-in`), the session is restored automatically after connection and this page is skipped.
- Logging out (via hamburger menu) clears the stored session and returns here.

**Contents:**
- Game title and subtitle
- Connection status banner (connected / connecting / disconnected)
  - "Configure" link to expand network picker when disconnected
- Network picker (collapsed by default): Localhost / Hosted Node / Custom endpoint + Connect button
- **Account selector** dropdown (shown when connected) — lists injected wallet accounts, local accounts, and dev accounts
- **Balance display** — shows the selected account's free balance
  - If balance > 0: **Log In** button (gold gradient)
  - If balance = 0: **Fund Account** button (purple gradient, replaces Log In)
  - If balance is loading: button is hidden
- "or" divider
- **Create Game Account** button — generates a new local mnemonic account, funds it, and auto-selects it

## Main Menu

**Route:** `/`

**Component:** `HomePage`

**Purpose:** Central hub for all game modes and features.

**Contents:**

### Primary actions
| Label | Route | Condition |
|---|---|---|
| PLAY | `/local` | Blockchain connected |
| PLAY | `/network` | Blockchain not connected (redirects to network settings) |
| PLAY ONLINE | `/blockchain` | Blockchain connected |
| PLAY ONLINE | `/network` | Blockchain not connected |
| TOURNAMENT LIVE | `/tournament` | Only shown when an active tournament exists |

The PLAY ONLINE card shows a live connection status dot (green/yellow/red) and block number.

### Secondary links (bottom row)
| Label | Route |
|---|---|
| Sandbox | `/sandbox` |
| P2P | `/multiplayer` |
| Ghosts | `/blockchain/ghosts` |
| Presentations | `/presentations` |

### Other
- Version number (`v0.1.0`) at the bottom
- Particle background animation
- Rotate prompt overlay (mobile portrait)

## Hamburger Menu (Global)

**Position:** Fixed top-right corner, present on every page after login.

**Trigger:** Hamburger icon button. Opens a slide-out panel from the right with a dark backdrop.

**Close:** Click backdrop, click X button, or press Escape.

**Menu items:**

| Label | Icon | Route | Notes |
|---|---|---|---|
| Settings | Gear | `/settings` | Game settings hub |
| Account | Person | `/account` | Account info, balances, name editing |
| Network | Globe | `/network` | Blockchain endpoint picker |
| Shop | Cart | `/shop` | Placeholder — coming soon |
| Log Out | Exit arrow | — | Clears login session, returns to login page |

The Log Out button sits at the bottom of the panel, separated by a border. It shows "connected" text when the blockchain connection is active.

## Settings

**Route:** `/settings`

**Back:** Menu (`/`)

**Contents:**
- Link to **Customize** (`/customize`) — card art, backgrounds, avatars

## Account

**Route:** `/account`

**Back:** Menu (`/`)

**Purpose:** View and manage the currently logged-in account.

**Contents:**
- **Name** — display name with inline edit (Save/Cancel, Enter/Escape). Persists to `localStorage` for local accounts.
- **Address** — full SS58 address, source type (dev / local / injected)
- **On-chain info** — 2x2 grid:
  - Nonce
  - Free balance (green)
  - Reserved balance (yellow)
  - Frozen balance (blue)
- Refresh button

## Network

**Route:** `/network`

**Back:** Menu (`/`)

**Purpose:** Configure and connect to a blockchain node.

**Contents:**
- **WebSocket Endpoint** selector — radio-style buttons:
  - Localhost (`ws://127.0.0.1:9944`)
  - Hosted Node (`wss://oab-rpc.shawntabrizi.com`)
  - Custom (freeform URL input)
- **Connect / Reconnect** button
- **Connection status** — dot indicator, connected/disconnected label, block number, current endpoint URL, error message if any

## Shop

**Route:** `/shop`

**Back:** Menu (`/`)

**Status:** Placeholder page. Shows a cart icon, "Coming Soon" heading, and description text.
