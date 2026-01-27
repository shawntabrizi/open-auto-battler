#!/bin/bash
set -e

# Build the runtime
cargo build -p auto-battle-runtime --release --locked

# Create the chain spec using the newly built WASM
# We redirect to chain_spec.json to ensure it is updated
chain-spec-builder create -t development \
--relay-chain paseo \
--para-id 1000 \
--runtime ./target/release/wbuild/auto-battle-runtime/auto_battle_runtime.compact.compressed.wasm \
named-preset development > chain_spec.json

# Start the node
polkadot-omni-node --chain ./chain_spec.json --dev
