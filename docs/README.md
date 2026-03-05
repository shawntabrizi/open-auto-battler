# Open Auto Battler Documentation

## For New Contributors

Start here:

1. **[QUICKSTART.md](./QUICKSTART.md)** - Get running in 5 minutes
2. **[CURRENT_ARCHITECTURE.md](./CURRENT_ARCHITECTURE.md)** - How everything fits together

## Other Documentation

For detailed agent and architecture docs, see the [agents/](../agents/) folder.

## Architecture Highlights

```
┌─────────────────────────────────────────────────────────┐
│                    oab-core                       │
│              (Rust - runs everywhere)                   │
└────────────────────────┬────────────────────────────────┘
                         │
          ┌──────────────┼──────────────┐
          ▼                             ▼
┌─────────────────────┐      ┌─────────────────────┐
│   WASM (Browser)    │      │  Pallet (Chain)     │
│   Fast iteration    │      │  Authoritative      │
│   Local preview     │◄────►│  Verifies actions   │
└─────────────────────┘      └─────────────────────┘
                 SCALE encoding
```

Key insight: The browser and blockchain run the **exact same** battle logic. SCALE encoding ensures byte-perfect compatibility.
