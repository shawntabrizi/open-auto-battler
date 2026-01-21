#!/bin/bash
set -e

echo "Building WASM core..."
cd core
wasm-pack build --target web
echo "Copying WASM to web/src/wasm..."
rm -rf ../web/src/wasm
cp -r pkg ../web/src/wasm
echo "WASM build complete!"