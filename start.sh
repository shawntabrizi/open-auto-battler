#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  echo "Usage: $0 [--no-chain | --blockchain | --contract]"
  echo ""
  echo "  --blockchain    Start the Substrate node and enable blockchain features (default)"
  echo "  --no-chain      Offline mode — no blockchain, no node required"
  echo "  --contract      Contract mode — start revive-dev-node, deploy contract, run frontend"
  exit 0
}

MODE="blockchain"

for arg in "$@"; do
  case $arg in
    --no-chain) MODE="offline" ;;
    --blockchain) MODE="blockchain" ;;
    --contract) MODE="contract" ;;
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
    kill $NODE_PID $RPC_PID $WEB_PID 2>/dev/null
}
trap cleanup EXIT

if [ "$MODE" = "contract" ]; then
  # ── Contract mode ────────────────────────────────────────────────────
  echo "--- Building Contract ---"
  cd "$SCRIPT_DIR/contract"
  env -u CARGO -u RUSTUP_TOOLCHAIN cargo +nightly build --release
  cd "$SCRIPT_DIR"

  echo "--- Starting revive-dev-node ---"
  revive-dev-node --dev &
  NODE_PID=$!
  sleep 2

  echo "--- Starting eth-rpc ---"
  eth-rpc --dev &
  RPC_PID=$!
  sleep 2

  echo "--- Deploying Contract ---"
  cd "$SCRIPT_DIR/contract"
  ./scripts/deploy.sh
  cd "$SCRIPT_DIR"

  echo "--- Starting Web App (contract mode) ---"
  cd "$SCRIPT_DIR/web"
  npm run dev &
  WEB_PID=$!
  cd "$SCRIPT_DIR"

  echo ""
  echo "=== Ready ==="
  echo "Open http://localhost:5173/#/contract to play"
  echo ""

  wait $NODE_PID $RPC_PID $WEB_PID

elif [ "$MODE" = "blockchain" ]; then
  # ── Blockchain (pallet) mode ─────────────────────────────────────────
  echo "--- Starting Blockchain ---"
  cd "$SCRIPT_DIR/blockchain"
  ./start_chain.sh &
  NODE_PID=$!
  cd "$SCRIPT_DIR"

  echo "--- Starting Web App (blockchain enabled) ---"
  cd "$SCRIPT_DIR/web"
  npm run dev:blockchain &
  WEB_PID=$!
  cd "$SCRIPT_DIR"

  wait $NODE_PID $WEB_PID

else
  # ── Offline mode ─────────────────────────────────────────────────────
  echo "--- Starting Web App (offline) ---"
  cd "$SCRIPT_DIR/web"
  npm run dev &
  WEB_PID=$!
  cd "$SCRIPT_DIR"

  wait $WEB_PID
fi
