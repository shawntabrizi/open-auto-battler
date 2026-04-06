#!/usr/bin/env bash
#
# Deploy the OAB arena contract to a local revive-dev-node.
#
# Prerequisites:
#   - revive-dev-node running (e.g. revive-dev-node --dev)
#   - eth-rpc running (e.g. eth-rpc --dev)
#   - contract.polkavm built (cd contract && make)
#
# Usage:
#   cd contract
#   ./scripts/deploy.sh [RPC_URL]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONTRACT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_DIR="$(cd "$CONTRACT_DIR/.." && pwd)"

RPC_URL="${1:-http://localhost:8545}"

echo "=== OAB Contract Deployment ==="
echo "RPC: $RPC_URL"
echo ""

POLKAVM="$CONTRACT_DIR/target/contract.release.polkavm"
if [ ! -f "$POLKAVM" ]; then
    # Fall back to old location
    POLKAVM="$CONTRACT_DIR/contract.polkavm"
fi
if [ ! -f "$POLKAVM" ]; then
    echo "Error: contract.polkavm not found. Build with:"
    echo "  cd contract && env -u CARGO -u RUSTUP_TOOLCHAIN cargo +nightly build --release"
    exit 1
fi

# Check connection
echo "Checking connection..."
RESULT=$(curl -sf -X POST "$RPC_URL" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' 2>/dev/null || echo "FAIL")
if [ "$RESULT" = "FAIL" ]; then
    echo "Error: Cannot connect to $RPC_URL"
    echo "Start the dev node with:"
    echo "  Terminal 1: revive-dev-node --dev"
    echo "  Terminal 2: eth-rpc --dev"
    exit 1
fi
echo "Connected."

# Get dev account
FROM=$(curl -s -X POST "$RPC_URL" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_accounts","params":[],"id":1}' \
  | python3 -c "import sys,json; accts=json.load(sys.stdin)['result']; print(accts[0] if accts else '')")

if [ -z "$FROM" ]; then
    echo "Error: No dev accounts available"
    exit 1
fi
echo "Using account: $FROM"

# Get chain ID
CHAIN_ID=$(curl -s -X POST "$RPC_URL" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
  | python3 -c "import sys,json; print(int(json.load(sys.stdin)['result'],16))")
echo "Chain ID: $CHAIN_ID"

# Deploy contract
echo ""
echo "Deploying contract..."
BYTECODE="0x$(xxd -p "$POLKAVM" | tr -d '\n')"

TX_HASH=$(curl -s -X POST "$RPC_URL" \
  -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_sendTransaction\",\"params\":[{\"from\":\"$FROM\",\"data\":\"$BYTECODE\",\"gas\":\"0x10000000\"}],\"id\":1}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('result',''))")

echo "Deploy TX: $TX_HASH"
sleep 3

CONTRACT_ADDRESS=$(curl -s -X POST "$RPC_URL" \
  -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getTransactionReceipt\",\"params\":[\"$TX_HASH\"],\"id\":1}" \
  | python3 -c "import sys,json; r=json.load(sys.stdin).get('result',{}); print(r.get('contractAddress','') if r else '')")

if [ -z "$CONTRACT_ADDRESS" ]; then
    echo "Deployment failed!"
    exit 1
fi
echo "Contract deployed at: $CONTRACT_ADDRESS"

# Register cards and sets
echo ""
echo "Registering cards and sets..."
REGISTER_TOOL="$REPO_DIR/register-cards"

if [ -d "$REGISTER_TOOL" ]; then
    cargo run --release --manifest-path "$REGISTER_TOOL/Cargo.toml" -- "$RPC_URL" "$CONTRACT_ADDRESS" "$FROM"
else
    echo "register-cards tool not found. Run manually:"
    echo "  cd register-cards && cargo run -- $RPC_URL $CONTRACT_ADDRESS"
fi

# Write deployment.json for the frontend
DEPLOYMENT_FILE="$CONTRACT_DIR/deployment.json"
cat > "$DEPLOYMENT_FILE" <<EOJSON
{
  "address": "$CONTRACT_ADDRESS",
  "rpcUrl": "$RPC_URL",
  "chainId": $CHAIN_ID
}
EOJSON
echo ""
echo "Written: $DEPLOYMENT_FILE"

echo ""
echo "=== Deployment Complete ==="
echo "Contract: $CONTRACT_ADDRESS"
echo "RPC:      $RPC_URL"
echo "Chain ID: $CHAIN_ID"
echo ""
echo "The frontend will auto-detect this address from contract/deployment.json"
echo "Navigate to /#/contract/ to play."
