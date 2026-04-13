#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  echo "Usage: $0 [--no-chain]"
  echo ""
  echo "  (default)       Start the Substrate node and enable blockchain features"
  echo "  --no-chain      Offline mode — no blockchain, no node required"
  exit 0
}

BLOCKCHAIN=true

for arg in "$@"; do
  case $arg in
    --no-chain) BLOCKCHAIN=false ;;
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

  # Wait for chain RPC to be ready
  echo "--- Waiting for chain RPC (ws://127.0.0.1:9944) ---"
  until curl -s -o /dev/null -w '' --max-time 1 -X POST -H "Content-Type: application/json" \
    -d '{"id":1,"jsonrpc":"2.0","method":"system_name"}' http://127.0.0.1:9944 2>/dev/null; do
    sleep 1
  done
  echo "--- Chain RPC ready ---"

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
