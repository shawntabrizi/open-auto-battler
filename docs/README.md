# Open Auto Battler Documentation

## For New Contributors

Start here:

1. **[QUICKSTART.md](./QUICKSTART.md)** - Get running in 5 minutes
2. **[CURRENT_ARCHITECTURE.md](./CURRENT_ARCHITECTURE.md)** - How everything fits together

## Other Documentation

For detailed agent and architecture docs, see the [agents/](../agents/) folder.

- [NFT_DESIGN.md](./NFT_DESIGN.md) - Scarcity NFTs, the claim minter, and achievement badges
- [UI_FLOW.md](./UI_FLOW.md) - Routes and navigation
- [CARD_DESIGN.md](./CARD_DESIGN.md) - Card design rules
- [../contract/README.md](../contract/README.md) - Arena contract API, deploy, and personhood
- [../BETA_RELEASE_PLAN.md](../BETA_RELEASE_PLAN.md) - Roadmap and open items

## Architecture Highlights

```
┌─────────────────────────────────────────────────────────┐
│          oab-battle + oab-game (Rust engine)            │
│              (no_std - runs everywhere)                 │
└────────────────────────┬────────────────────────────────┘
                         │
          ┌──────────────┴──────────────┐
          ▼                             ▼
┌─────────────────────┐      ┌─────────────────────┐
│   WASM (Browser)    │      │ PolkaVM contract    │
│   Shop phase        │      │ @oab/arena          │
│   Battle replay     │◄────►│ Authoritative       │
└─────────────────────┘      └─────────────────────┘
                 SCALE encoding
```

Key insight: The browser and the contract run the **exact same** battle logic. SCALE encoding ensures byte-perfect compatibility.
