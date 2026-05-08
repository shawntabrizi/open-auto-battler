#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<EOF
Usage: $0 [--no-bootstrap]

Boots the Polkadot Preview Network (ppn) zombienet, deploys the OAB
contract via the cdm CLI, runs cdm install to refresh cdm.json + typed
bindings, builds WASM, and starts the web frontend.

  --no-bootstrap   Skip registry bootstrap (use when re-running against
                   a chain that already has the registry deployed)

Environment:
  CDM_SRC          Path to a contract-dependency-manager checkout with
                   REGISTRY_ADDRESS patched to the locally-built registry.
                   Default: \$SCRIPT_DIR/../contract-dependency-manager
  PPN_DIR          Path to the ppn-proxy checkout. Default: \$SCRIPT_DIR/ppn

Prerequisites:
  bun ≥ 1.2, cargo-pvm-contract from charles/cdm-integration, ppn-proxy
  installed (curl install.sh), CDM_SRC clone with patched REGISTRY_ADDRESS.
  See contract/README.md for full setup.
EOF
  exit 0
}

NO_BOOTSTRAP=0
for arg in "$@"; do
  case $arg in
    --no-bootstrap) NO_BOOTSTRAP=1 ;;
    --help|-h) usage ;;
    *) echo "Unknown option: $arg"; usage ;;
  esac
done

CDM_SRC="${CDM_SRC:-$SCRIPT_DIR/../contract-dependency-manager}"
PPN_DIR="${PPN_DIR:-$SCRIPT_DIR/ppn}"

if [ ! -d "$CDM_SRC" ]; then
  echo "Error: cdm source not found at $CDM_SRC"
  echo "Set CDM_SRC=/path/to/contract-dependency-manager (with REGISTRY_ADDRESS patched)"
  exit 1
fi
if [ ! -d "$PPN_DIR" ]; then
  echo "Error: ppn not found at $PPN_DIR"
  echo "Run: curl -sL https://raw.githubusercontent.com/paritytech/ppn-proxy/main/install.sh | bash"
  exit 1
fi
if ! command -v bun >/dev/null 2>&1; then
  echo "Error: bun not on PATH (need ≥ 1.2)"
  exit 1
fi

CDM_CLI="bun run $CDM_SRC/src/apps/cli/src/cli.ts"
ASSET_HUB_WS="ws://127.0.0.1:10020"
ASSET_HUB_RPC="http://127.0.0.1:10020"
IPFS_GATEWAY="http://127.0.0.1:8080/ipfs"

PPN_PID=""
WEB_PID=""

# Comprehensive process sweep — zombienet spawns many descendants and Ctrl-C
# doesn't always reach them, leaving ports 10000-10030 + 8080 bound. Killing
# by full path catches everything spawned from $PPN_DIR/bin/.
sweep_chain_procs() {
  pkill -9 -f "zombie-cli" 2>/dev/null || true
  pkill -9 -f "polkadot-omni-node" 2>/dev/null || true
  pkill -9 -f "polkadot-execute-worker" 2>/dev/null || true
  pkill -9 -f "polkadot-prepare-worker" 2>/dev/null || true
  pkill -9 -f "polkadot-parachain" 2>/dev/null || true
  pkill -9 -f "$PPN_DIR/bin/polkadot" 2>/dev/null || true
  pkill -9 -f "$PPN_DIR/bin/ipfs" 2>/dev/null || true
}

cleanup() {
  echo "--- Stopping processes ---"
  [ -n "$WEB_PID" ] && kill "$WEB_PID" 2>/dev/null || true
  [ -n "$PPN_PID" ] && kill "$PPN_PID" 2>/dev/null || true
  sweep_chain_procs
}
trap cleanup EXIT INT TERM

echo "--- Cleaning up any stale chain processes ---"
sweep_chain_procs
sleep 1

echo "--- Building WASM ---"
"$SCRIPT_DIR/build-wasm.sh"

echo "--- Starting ppn zombienet (ephemeral) ---"
( cd "$PPN_DIR" && make start EPHEMERAL=1 ) >/tmp/oab-ppn.log 2>&1 &
PPN_PID=$!

echo "Waiting for Asset Hub at $ASSET_HUB_WS..."
for i in $(seq 1 120); do
  if curl -sf -X POST "$ASSET_HUB_RPC" -H 'Content-Type: application/json' \
      -d '{"jsonrpc":"2.0","method":"system_chain","params":[],"id":1}' >/dev/null 2>&1; then
    echo "Asset Hub ready (after ${i}s)."
    break
  fi
  if ! kill -0 "$PPN_PID" 2>/dev/null; then
    echo "Error: ppn exited unexpectedly. Tail of /tmp/oab-ppn.log:"
    tail -30 /tmp/oab-ppn.log
    exit 1
  fi
  sleep 1
done

if [ "$NO_BOOTSTRAP" -eq 0 ]; then
  echo "--- Building cdm ContractRegistry ---"
  ( cd "$CDM_SRC" && make build-registry )
  cp "$CDM_SRC/target/contract-registry.release.polkavm" \
     "$SCRIPT_DIR/contract/target/contract-registry.release.polkavm"

  echo "--- Bootstrap deploy (registry + OAB) ---"
  ( cd "$SCRIPT_DIR/contract" && $CDM_CLI deploy -n local --suri "//Alice" --bootstrap )
else
  echo "--- Deploying OAB (registry assumed present) ---"
  ( cd "$SCRIPT_DIR/contract" && $CDM_CLI deploy -n local --suri "//Alice" )
fi

echo "--- Refreshing web cdm.json + .cdm types ---"
( cd "$SCRIPT_DIR/web" && $CDM_CLI install \
    --assethub-url "$ASSET_HUB_WS" \
    --ipfs-gateway-url "$IPFS_GATEWAY" \
    @oab/arena )

echo "--- Registering cards & sets on @oab/arena ---"
CARDS_DUMP="$SCRIPT_DIR/contract/target/cards-dump.json"
( cd "$SCRIPT_DIR/register-cards" && cargo run --release -- --dump "$CARDS_DUMP" )
( cd "$SCRIPT_DIR/web" && bun run scripts/register-cards.ts "$CARDS_DUMP" \
    --ws "$ASSET_HUB_WS" --suri "//Alice" )

echo "--- Starting Web App ---"
( cd "$SCRIPT_DIR/web" && npm run dev ) &
WEB_PID=$!

echo ""
echo "=== Ready ==="
echo "Open http://localhost:5173/ to play"
echo "Asset Hub: $ASSET_HUB_WS  |  IPFS: $IPFS_GATEWAY"
echo ""

wait "$WEB_PID"
