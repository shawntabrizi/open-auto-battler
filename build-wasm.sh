#!/bin/bash
set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Building WASM core..."
cd "$SCRIPT_DIR/core"
wasm-pack build --target web --features browser
echo "Copying WASM to web/src/wasm..."
rm -rf "$SCRIPT_DIR/web/src/wasm"
cp -r pkg "$SCRIPT_DIR/web/src/wasm"
echo "WASM build complete!"
