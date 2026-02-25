#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  echo "Usage: $0 [--blockchain]"
  echo ""
  echo "  --blockchain    Start the Substrate node and enable blockchain features"
  echo "  (default)       Offline mode — no blockchain, no node required"
  exit 0
}

BLOCKCHAIN=false

for arg in "$@"; do
  case $arg in
    --blockchain) BLOCKCHAIN=true ;;
    --help|-h) usage ;;
    *) echo "Unknown option: $arg"; usage ;;
  esac
done

echo "--- Building WASM ---"
"$SCRIPT_DIR/build-wasm.sh"

if [ "$BLOCKCHAIN" = true ]; then
  echo "--- Starting Blockchain Node ---"
  cd "$SCRIPT_DIR/blockchain"
  ./start_chain.sh &
  CHAIN_PID=$!
  cd "$SCRIPT_DIR"

  cleanup() {
    echo "--- Stopping blockchain node ---"
    kill $CHAIN_PID 2>/dev/null
  }
  trap cleanup EXIT

  # Give the node a moment to start
  sleep 3

  echo "--- Starting Tauri Dev (blockchain enabled) ---"
  cd "$SCRIPT_DIR/web"
  VITE_ENABLE_BLOCKCHAIN=true TAURI_CLI_CONFIG='{"build":{"beforeDevCommand":"npm run dev:blockchain"}}' npm run tauri:dev

  wait $CHAIN_PID
else
  echo "--- Starting Tauri Dev (offline) ---"
  cd "$SCRIPT_DIR/web"
  npm run tauri:dev
fi
