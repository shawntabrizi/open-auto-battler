#!/usr/bin/env bash
#
# Deploy the OAB arena contract to a local revive-dev-node.
#
# Prerequisites:
#   - revive-dev-node running at localhost:9944
#   - eth-rpc running at localhost:8545
#   - Foundry installed (cast): curl -L https://foundry.paradigm.xyz | bash && foundryup
#
# The dev node provides a pre-funded dev account:
#   Private key: 0x5fb92d6e98884f76de468fa3f6278f8807c48bebc13595d45af5bdc4da702133
#   Address: 0xf24FF3a9CF04c71Dbc94D0b566f7A27B94566cac (Alith)
#
# Usage:
#   cd contract
#   ./scripts/deploy.sh [RPC_URL]

set -euo pipefail

RPC_URL="${1:-http://localhost:8545}"
# Standard dev account private key (Alith - pre-funded on dev nodes)
PRIVATE_KEY="0x5fb92d6e98884f76de468fa3f6278f8807c48bebc13595d45af5bdc4da702133"

echo "=== OAB Contract Deployment ==="
echo "RPC: $RPC_URL"
echo ""

# Check prerequisites
if ! command -v cast &> /dev/null; then
    echo "Error: Foundry 'cast' not found. Install with:"
    echo "  curl -L https://foundry.paradigm.xyz | bash && foundryup"
    exit 1
fi

if [ ! -f contract.polkavm ]; then
    echo "Error: contract.polkavm not found. Build with: make"
    exit 1
fi

# Check connection
echo "Checking connection..."
BLOCK=$(cast block-number --rpc-url "$RPC_URL" 2>/dev/null || echo "FAIL")
if [ "$BLOCK" = "FAIL" ]; then
    echo "Error: Cannot connect to $RPC_URL"
    echo "Start the dev node with:"
    echo "  Terminal 1: revive-dev-node --dev"
    echo "  Terminal 2: eth-rpc --dev"
    exit 1
fi
echo "Connected. Block: $BLOCK"

# Deploy contract
echo ""
echo "Deploying contract..."
BYTECODE="0x$(xxd -p contract.polkavm | tr -d '\n')"

DEPLOY_TX=$(cast send --rpc-url "$RPC_URL" \
    --private-key "$PRIVATE_KEY" \
    --create "$BYTECODE" \
    --json 2>&1)

CONTRACT_ADDRESS=$(echo "$DEPLOY_TX" | jq -r '.contractAddress // empty')
if [ -z "$CONTRACT_ADDRESS" ]; then
    echo "Deployment failed:"
    echo "$DEPLOY_TX"
    exit 1
fi

echo "Contract deployed at: $CONTRACT_ADDRESS"

# Register cards and sets
echo ""
echo "Registering cards and sets..."
REGISTER_TOOL="../../register-cards"

if [ -d "$REGISTER_TOOL" ]; then
    ADMIN_ADDR=$(cast wallet address --private-key "$PRIVATE_KEY" 2>/dev/null || echo "")
    if [ -n "$ADMIN_ADDR" ]; then
        cargo run --manifest-path "$REGISTER_TOOL/Cargo.toml" -- "$RPC_URL" "$CONTRACT_ADDRESS" "$ADMIN_ADDR"
    else
        cargo run --manifest-path "$REGISTER_TOOL/Cargo.toml" -- "$RPC_URL" "$CONTRACT_ADDRESS"
    fi
else
    echo "register-cards tool not found at $REGISTER_TOOL"
    echo "The contract is deployed but needs cards registered."
    echo "Run: cd register-cards && cargo run -- $RPC_URL $CONTRACT_ADDRESS"
fi

echo ""
echo "=== Deployment Complete ==="
echo "Contract: $CONTRACT_ADDRESS"
echo "RPC:      $RPC_URL"
echo ""
echo "To play, open the web UI and navigate to /#/contract/"
echo "Enter the RPC URL and contract address above."
