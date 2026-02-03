# Agent Instructions (Canonical)

This folder is the single source of truth for AI agent guidance.
The top-level files (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`) are pointers only.

## Start Here
Read the following documents when relevant:
- `agents/AGENTS_INDEX.md` for the canonical index.
- `agents/ARCHITECTURE.md` for the system overview.
- `agents/CORE_ENGINE.md` for game rules and engine structure.
- `agents/WASM_BRIDGE.md` for Rust-to-WASM boundaries.
- `agents/WEB_UI.md` for frontend state and components.
- `agents/BLOCKCHAIN_PALLET.md` for on-chain logic and storage.
- `agents/SERIALIZATION_CONTRACTS.md` for SCALE and JSON contracts.
- `agents/TESTING_GUIDE.md` for test locations and expectations.
- `agents/FORMATTING.md` for mandatory formatting rules.
- `agents/POLKADOT_API.md` for frontend-to-chain interactions and SCALE rules.
- `agents/SUBSTRATE.md` for pallet structure, storage, and bounded types.
- `agents/REACT.md` for frontend patterns and state management.

## Global Requirements
- **WASM Bridge**: The project relies on a SCALE-encoded bridge between the Substrate chain and the browser WASM engine. Any changes to data structures must be reflected in both `core/` and the frontend formatting logic.
- **Named Arguments**: Never use positional arguments for extrinsics.
- **Bounded Complexity**: Respect the limits defined in the Pallet's `Config`.
- **Formatting**: After making changes, always run `cargo fmt` (Rust) and `prettier` (web/client) on affected files.

## Workflow Expectations
- Maintain the visual style established in `web/src/index.css`.
- Prefer minimal, targeted edits over broad refactors.
