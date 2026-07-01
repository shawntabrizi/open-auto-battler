#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<EOF
Usage: $0 [--build-contract]

Builds the WASM game engine and starts the web frontend dev server for UI
development.

  --build-contract   Also build the PolkaVM contract (cargo build --release
                     in contract/) to verify it compiles.

Notes on on-chain play:
  The frontend uses the Polkadot Product SDK (@parity/product-sdk-*), which
  routes chain access through a Polkadot host. There is no local chain to
  wire up here — running \`npm run dev\` standalone renders the UI and the
  local WASM battle engine, but contract calls (start/submit/end) require:
    1. the contract deployed to paseo Asset Hub  (see contract/README.md:
       cdm build && cdm deploy -n paseo && cdm install), and
    2. the frontend running inside a host  (playground deploy, or Polkadot
       Desktop/Mobile pointed at localhost).

  (The old local Preview-Network zombienet + patched contract-dependency-manager
  loop was retired in the product-sdk migration.)
EOF
  exit 0
}

BUILD_CONTRACT=0
for arg in "$@"; do
  case $arg in
    --build-contract) BUILD_CONTRACT=1 ;;
    --help|-h) usage ;;
    *) echo "Unknown option: $arg"; usage ;;
  esac
done

WEB_PID=""
cleanup() {
  echo "--- Stopping processes ---"
  [ -n "$WEB_PID" ] && kill "$WEB_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "--- Building WASM game engine ---"
"$SCRIPT_DIR/build-wasm.sh"

if [ "$BUILD_CONTRACT" -eq 1 ]; then
  echo "--- Building PolkaVM contract ---"
  ( cd "$SCRIPT_DIR/contract" && cargo build --release )
fi

echo "--- Starting web dev server ---"
( cd "$SCRIPT_DIR/web" && npm run dev ) &
WEB_PID=$!

echo ""
echo "=== Web dev server starting ==="
echo "Open http://localhost:5173/  (UI + local battle engine)"
echo "For on-chain contract play, deploy to paseo + run inside a host — see contract/README.md"
echo ""

wait "$WEB_PID"
