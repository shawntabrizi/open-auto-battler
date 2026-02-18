# NFT Customization Specification

## Overview

The Auto Battle game supports purely aesthetic NFT-based customizations via `pallet-nfts`. Players own NFTs that represent cosmetic assets for four customization slots. No gameplay logic is affected. Customizations persist via localStorage so they work across all game modes once selected in blockchain mode.

## Collection Structure

- One master collection per game deployment (collection ID 0)
- Created via `Nfts::create()` with `MintType::Public` (anyone can mint)
- Collection metadata: `"Auto Battle Customizations"`

## Item Metadata Format

JSON string stored via `set_metadata`:

```json
{
  "type": "board_bg",
  "name": "Galaxy Arena",
  "image": "ipfs://bafybeih5...",
  "description": "A cosmic galaxy board background"
}
```

- `type`: one of `board_bg`, `hand_bg`, `card_style`, `avatar`
- `image`: IPFS CID URL pointing to the image
- Must fit within 256 bytes (StringLimit)

## Customization Types

### Board Background (`board_bg`)

Applied as the background image of the Arena component.

| Property | Value |
|----------|-------|
| Aspect Ratio | 16:9 |
| Recommended Size | 1920x1080 |
| Min Size | 960x540 |
| Format | PNG/WebP |
| Alpha | No |
| Max File Size | 2 MB |

### Hand Background (`hand_bg`)

Applied as the background image of the Shop/Hand component.

| Property | Value |
|----------|-------|
| Aspect Ratio | 5:1 |
| Recommended Size | 1920x384 |
| Min Size | 960x192 |
| Format | PNG/WebP |
| Alpha | Optional |
| Max File Size | 1 MB |

### Card Style Frame (`card_style`)

Overlay PNG frame rendered on top of card content. Must have a transparent center with decorative border/frame only.

| Property | Value |
|----------|-------|
| Aspect Ratio | 3:4 |
| Recommended Size | 256x352 |
| Min Size | 128x176 |
| Format | PNG (required) |
| Alpha | Required (frame overlay) |
| Max File Size | 500 KB |

### Player Avatar (`avatar`)

Circular avatar displayed in the HUD next to the Lives section.

| Property | Value |
|----------|-------|
| Aspect Ratio | 1:1 |
| Recommended Size | 256x256 |
| Min Size | 64x64 |
| Format | PNG/WebP |
| Alpha | Optional |
| Max File Size | 500 KB |

## Minting Flow

1. Upload image to IPFS (via Pinata or manually)
2. Call `Nfts::mint(collection, item, mint_to, None)`
3. Call `Nfts::set_metadata(collection, item, json_metadata)`

## localStorage Persistence

- Key: `oab_customize_${accountAddress}` for blockchain mode
- Key: `oab_customize_default` as fallback for non-blockchain modes
- Stores full selection data including resolved image URLs
- On blockchain mode: saves full NftItem data
- On other modes: reads saved image URL data directly (no chain queries needed)
