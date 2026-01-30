# ManaLimit Documentation

## For New Contributors

Start here:

1. **[QUICKSTART.md](./QUICKSTART.md)** - Get running in 5 minutes
2. **[CURRENT_ARCHITECTURE.md](./CURRENT_ARCHITECTURE.md)** - How everything fits together

## Other Documentation

Located in the project root:

| Document | Description |
|----------|-------------|
| [RULEBOOK.md](../RULEBOOK.md) | Game rules and mechanics |
| [CARD_SCHEMA.md](../CARD_SCHEMA.md) | Card data structure and abilities |
| [BUILD.md](../BUILD.md) | Detailed build instructions |
| [PALLET_PLAN.md](../PALLET_PLAN.md) | Blockchain pallet design |
| [UI.md](../UI.md) | UI/UX design notes |

## Architecture Highlights

```
┌─────────────────────────────────────────────────────────┐
│                    manalimit-core                       │
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
