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

# Build WASM
echo "--- Building WASM ---"
"$SCRIPT_DIR/build-wasm.sh"

# Function to cleanup background processes on exit
cleanup() {
    echo "--- Stopping processes ---"
    kill $BLOCKCHAIN_PID $WEB_PID 2>/dev/null
}
trap cleanup EXIT

if [ "$BLOCKCHAIN" = true ]; then
  # Start Blockchain
  echo "--- Starting Blockchain ---"
  cd "$SCRIPT_DIR/blockchain"
  ./start_chain.sh &
  BLOCKCHAIN_PID=$!
  cd "$SCRIPT_DIR"

  # Start Web App with blockchain enabled
  echo "--- Starting Web App (blockchain enabled) ---"
  cd "$SCRIPT_DIR/web"
  npm run dev:blockchain &
  WEB_PID=$!
  cd "$SCRIPT_DIR"

  wait $BLOCKCHAIN_PID $WEB_PID
else
  # Start Web App in offline mode
  echo "--- Starting Web App (offline) ---"
  cd "$SCRIPT_DIR/web"
  npm run dev &
  WEB_PID=$!
  cd "$SCRIPT_DIR"

  wait $WEB_PID
fi
