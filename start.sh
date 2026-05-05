#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  echo "Usage: $0"
  echo ""
  echo "Builds the WASM engine, builds and deploys the OAB smart contract to a"
  echo "local revive-dev-node, and starts the web frontend in contract mode."
  exit 0
}

for arg in "$@"; do
  case $arg in
    --help|-h) usage ;;
    *) echo "Unknown option: $arg"; usage ;;
  esac
done

echo "--- Building WASM ---"
"$SCRIPT_DIR/build-wasm.sh"

cleanup() {
    echo "--- Stopping processes ---"
    kill $NODE_PID $RPC_PID $WEB_PID 2>/dev/null || true
    pkill -f "revive-dev-node" 2>/dev/null || true
    pkill -f "eth-rpc" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "--- Building Contract ---"
cd "$SCRIPT_DIR/contract"
env -u CARGO -u RUSTUP_TOOLCHAIN cargo +nightly build --release
cd "$SCRIPT_DIR"

echo "--- Cleaning up stale processes ---"
pkill -f "revive-dev-node" 2>/dev/null || true
pkill -f "eth-rpc" 2>/dev/null || true
sleep 1

echo "--- Starting revive-dev-node ---"
revive-dev-node --dev &
NODE_PID=$!

echo "Waiting for node..."
for i in $(seq 1 30); do
  if curl -sf -X POST http://localhost:9944 -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"system_health","params":[],"id":1}' >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "--- Starting eth-rpc ---"
eth-rpc --dev &
RPC_PID=$!

echo "Waiting for eth-rpc..."
for i in $(seq 1 30); do
  if curl -sf -X POST http://localhost:8545 -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "--- Deploying Contract ---"
cd "$SCRIPT_DIR/contract"
./scripts/deploy.sh
cd "$SCRIPT_DIR"

echo "--- Starting Web App ---"
cd "$SCRIPT_DIR/web"
npm run dev &
WEB_PID=$!
cd "$SCRIPT_DIR"

echo ""
echo "=== Ready ==="
echo "Open http://localhost:5173/ to play"
echo ""

wait $NODE_PID $RPC_PID $WEB_PID
