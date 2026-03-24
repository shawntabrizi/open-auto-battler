#!/bin/bash
# =============================================================================
# OAB Chain Deploy
# =============================================================================
#
# Builds the Substrate runtime locally, generates a new chain spec, and deploys
# the blockchain node to the VPS via SSH + Docker.
#
# Prerequisites (local machine):
#   - Rust toolchain with the wasm32 target (rustup target add wasm32-unknown-unknown)
#   - chain-spec-builder (install via: cargo install staging-chain-spec-builder)
#   - SSH access to the VPS (key-based auth to ubuntu@51.159.158.173)
#
# What it does:
#   1. Compiles the auto-battle-runtime (Rust -> WASM). This bakes in all game
#      data from cards/cards.json, cards/sets.json, and cards/styles.json
#      (including genesis NFT art CIDs) via the core/build.rs codegen step.
#   2. Generates a fresh chain_spec.json embedding the compiled WASM blob.
#   3. Ensures Docker and swap are set up on the VPS (first-time only).
#   4. Copies Dockerfile, docker-compose.yml, and chain_spec.json to the VPS.
#   5. Builds the Docker image and (re)starts the node container.
#
# Usage:
#   blockchain/deploy.sh            # Rolling update — keeps existing chain data
#   blockchain/deploy.sh --fresh    # Wipes chain data volume for a new genesis
#
# When to use --fresh:
#   - After changing genesis-affecting data (cards, sets, styles/NFT CIDs)
#   - After runtime changes that alter storage layout
#   - To reset the chain to a clean state
#
# When NOT to use --fresh:
#   - Routine runtime upgrades that are storage-compatible
#   - When you want to preserve on-chain state (balances, NFTs, game history)
#
# The node runs at ws://51.159.158.173:9944 (aliased to wss://oab-rpc.shawntabrizi.com)
# =============================================================================
set -e

SERVER="ubuntu@51.159.158.173"
REMOTE_DIR="oab-chain"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

FRESH_GENESIS=false

usage() {
  echo "Usage: $0 [--fresh]"
  echo ""
  echo "  --fresh    Wipe chain data and start from a new genesis"
  echo "  (default)  Keep existing chain data (rolling update)"
  exit 0
}

for arg in "$@"; do
  case $arg in
    --fresh) FRESH_GENESIS=true ;;
    --help|-h) usage ;;
    *) echo "Unknown option: $arg"; usage ;;
  esac
done

echo "=== OAB Chain Deploy ==="
if [ "$FRESH_GENESIS" = true ]; then
  echo "Mode: FRESH GENESIS (chain data will be wiped)"
else
  echo "Mode: Rolling update (chain data preserved)"
fi

# --- 1. Build runtime and generate chain spec ---
echo ""
echo "--- Building runtime ---"
cd "$SCRIPT_DIR"
cargo build -p auto-battle-runtime --release --locked

echo "--- Generating chain spec ---"
chain-spec-builder create -t development \
  --relay-chain paseo \
  --para-id 1000 \
  --runtime "$PROJECT_ROOT/target/release/wbuild/auto-battle-runtime/auto_battle_runtime.compact.compressed.wasm" \
  named-preset development > chain_spec.json

cd "$PROJECT_ROOT"

# --- 2. Install Docker on server if needed ---
echo ""
echo "--- Checking Docker on server ---"
if ! ssh "$SERVER" "docker --version" &>/dev/null; then
    echo "Installing Docker on server..."
    ssh "$SERVER" bash -s <<'INSTALL'
        sudo apt-get update
        sudo apt-get install -y ca-certificates curl
        sudo install -m 0755 -d /etc/apt/keyrings
        sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
        sudo chmod a+r /etc/apt/keyrings/docker.asc
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
        sudo apt-get update
        sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
        sudo usermod -aG docker ubuntu
INSTALL
    echo "Docker installed."
fi

# --- 3. Set up swap if not present (2GB RAM is tight for Substrate) ---
echo "--- Checking swap on server ---"
ssh "$SERVER" bash -s <<'SWAP'
    if [ "$(swapon --show | wc -l)" -eq 0 ]; then
        echo "Creating 4GB swap file..."
        sudo fallocate -l 4G /swapfile
        sudo chmod 600 /swapfile
        sudo mkswap /swapfile
        sudo swapon /swapfile
        echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
        echo "Swap enabled."
    else
        echo "Swap already configured."
    fi
SWAP

# --- 4. Copy files to server ---
echo ""
echo "--- Copying files to server ---"
ssh "$SERVER" "mkdir -p ~/$REMOTE_DIR"
scp "$SCRIPT_DIR/Dockerfile" "$SCRIPT_DIR/docker-compose.yml" "$SCRIPT_DIR/chain_spec.json" "$SERVER:~/$REMOTE_DIR/"

# --- 5. Build and deploy on server ---
echo ""
echo "--- Building image and starting node on server ---"
if [ "$FRESH_GENESIS" = true ]; then
    ssh "$SERVER" bash -s <<DEPLOY
        cd ~/$REMOTE_DIR
        sudo docker build -t oab-chain:latest .
        sudo docker compose down -v 2>/dev/null || true
        sudo docker compose up -d
DEPLOY
else
    ssh "$SERVER" bash -s <<DEPLOY
        cd ~/$REMOTE_DIR
        sudo docker build -t oab-chain:latest .
        sudo docker compose down 2>/dev/null || true
        sudo docker compose up -d
DEPLOY
fi

echo ""
echo "=== Deploy complete ==="
echo "Node RPC/WS: ws://51.159.158.173:9944"
echo ""
echo "Useful commands:"
echo "  ssh $SERVER 'cd ~/$REMOTE_DIR && sudo docker compose logs -f'    # view logs"
echo "  ssh $SERVER 'cd ~/$REMOTE_DIR && sudo docker compose restart'    # restart node"
echo "  ssh $SERVER 'cd ~/$REMOTE_DIR && sudo docker compose down'       # stop node"
