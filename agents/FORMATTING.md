# Formatting Rules

These rules are mandatory for all agents working on this repository.

## Required Commands
- After making Rust changes, run `cargo fmt`.
- After making web or client changes, run `prettier` on the affected files.

## Scope
- Rust: `battle/`, `assets/`, `game/`, `client/`, `contract/`.
- Web: `web/`.

## Notes
- Formatting should be applied to only the files you changed.
- If a formatter is unavailable, note it in your response.
