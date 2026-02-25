#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "--- Building WASM ---"
"$SCRIPT_DIR/build-wasm.sh"

echo "--- Building Tauri App ---"
cd "$SCRIPT_DIR/web"

# Pass --blockchain flag through to enable blockchain in the production build
if [ "$1" = "--blockchain" ]; then
  VITE_ENABLE_BLOCKCHAIN=true npm run tauri:build
else
  npm run tauri:build
fi
