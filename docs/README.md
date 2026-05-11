# Open Auto Battler Documentation

## For New Contributors

Start here:

1. **[QUICKSTART.md](./QUICKSTART.md)** — get the WASM-only path running fast,
   or follow the full PPN setup for the on-chain loop.
2. **[../agents/ARCHITECTURE.md](../agents/ARCHITECTURE.md)** — the current
   system map. (The local `CURRENT_ARCHITECTURE.md` is a legacy snapshot of
   the pre-migration pallet-based design and should not be used as a guide.)
3. **[CONTAINER_DEV.md](./CONTAINER_DEV.md)** — distrobox/podman recipes for
   running the whole toolchain in a Linux container.

## Other Documentation

The canonical agent and architecture docs live in [`../agents/`](../agents/) —
`AGENTS_INDEX.md` is the entry point, with linked deep dives for the engine,
WASM bridge, web UI, serialization contracts, and testing.

`../contract/README.md` is the authoritative reference for the PolkaVM
contract, the PPN dev loop, and the upstream patches the loop currently
depends on.

## Architecture Highlights

```
┌────────────────────────────────────────────────────────────┐
│                Rust engine (battle/, game/, assets/)       │
│             pure, deterministic, runs everywhere           │
└──────────────────────────┬─────────────────────────────────┘
                           │
            ┌──────────────┼──────────────┐
            ▼                             ▼
┌─────────────────────┐         ┌─────────────────────────┐
│   WASM (browser)    │         │   PolkaVM contract      │
│  client/ → web/     │◄───────►│   contract/ on Asset Hub│
│  fast iteration     │  SCALE  │   authoritative arena   │
└─────────────────────┘         └─────────────────────────┘
                  Same Rust types both sides
```

Key insight: the browser and the contract execute the **exact same** battle
logic from the shared engine crates. SCALE encoding (via `parity_scale_codec`)
keeps the bytes byte-perfect across the boundary.
