#!/usr/bin/env bash
# Generates optimized WebP images from source PNGs for card art.
# Requires: sips (macOS built-in) and cwebp (brew install webp)
# Usage: ./optimize-card-art.sh

set -euo pipefail

CARDS_DIR="$(cd "$(dirname "$0")/.." && pwd)/public/images/cards"
SM_DIR="$CARDS_DIR/sm"
MD_DIR="$CARDS_DIR/md"

mkdir -p "$SM_DIR" "$MD_DIR"

# Check for cwebp
if ! command -v cwebp &>/dev/null; then
  echo "cwebp not found. Install with: brew install webp"
  exit 1
fi

count=0
for src in "$CARDS_DIR"/*.png; do
  [[ -f "$src" ]] || continue
  base=$(basename "$src" .png)

  # Small: 256x340 for in-game UnitCard
  sips -z 340 256 "$src" --out "/tmp/card_sm_${base}.png" &>/dev/null
  cwebp -q 80 "/tmp/card_sm_${base}.png" -o "$SM_DIR/${base}.webp" &>/dev/null
  rm -f "/tmp/card_sm_${base}.png"

  # Medium: 464x616 for detail/modal views
  sips -z 616 464 "$src" --out "/tmp/card_md_${base}.png" &>/dev/null
  cwebp -q 85 "/tmp/card_md_${base}.png" -o "$MD_DIR/${base}.webp" &>/dev/null
  rm -f "/tmp/card_md_${base}.png"

  ((count++))
  printf "\r  Processed %d images..." "$count"
done

echo ""
echo ""
echo "=== Optimization Complete ==="
echo "Generated: $count small (256x340) + $count medium (464x616) WebP images"
echo ""
echo "Small dir: $SM_DIR"
du -sh "$SM_DIR" 2>/dev/null || true
echo ""
echo "Medium dir: $MD_DIR"
du -sh "$MD_DIR" 2>/dev/null || true

# Clean up source PNGs (they're just copies from ~/Downloads)
echo ""
read -p "Delete source PNGs from $CARDS_DIR? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  rm -f "$CARDS_DIR"/*.png
  echo "Source PNGs removed."
else
  echo "Source PNGs kept."
fi
