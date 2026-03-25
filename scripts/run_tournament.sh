#!/bin/bash
# OAB Agent Tournament
# Runs 4 agents with different personalities on-chain, 100 games each.
# Each agent uses a different account: Alice, Bob, Charlie, Dave.

set -e

CHAIN_URL="${OAB_CHAIN_URL:-wss://oab-rpc.shawntabrizi.com}"
NUM_GAMES="${OAB_NUM_GAMES:-100}"
SET_ID="${OAB_SET_ID:-0}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "========================================="
echo " OAB Agent Tournament"
echo "========================================="
echo " Chain:   $CHAIN_URL"
echo " Games:   $NUM_GAMES per agent"
echo " Set ID:  $SET_ID"
echo "========================================="
echo ""

# Build the server
echo "Building oab-server..."
cd "$PROJECT_DIR"
cargo build -p oab-server --release 2>&1 | tail -1
OAB_SERVER="$PROJECT_DIR/target/release/oab-server"

# Agent configs: name, key, port
AGENTS=(
    "Greedy://Alice:4001:greedy.py"
    "Tank://Bob:4002:tank.py"
    "Aggro://Charlie:4003:aggro.py"
    "Economy://Dave:4004:economy.py"
)

PIDS=()

cleanup() {
    echo ""
    echo "Shutting down servers..."
    for pid in "${PIDS[@]}"; do
        kill "$pid" 2>/dev/null || true
    done
    wait 2>/dev/null
}
trap cleanup EXIT

# Start a server for each agent
for agent_config in "${AGENTS[@]}"; do
    IFS=: read -r NAME KEY PORT SCRIPT <<< "$agent_config"
    echo "Starting server for $NAME ($KEY) on port $PORT..."
    "$OAB_SERVER" --url "$CHAIN_URL" --key "$KEY" --port "$PORT" \
        2>"$SCRIPT_DIR/$NAME.server.log" &
    PIDS+=($!)
done

# Wait for servers to be ready
echo "Waiting for servers to connect and load cards..."
sleep 20

# Check servers are up
for agent_config in "${AGENTS[@]}"; do
    IFS=: read -r NAME KEY PORT SCRIPT <<< "$agent_config"
    if curl -s "http://localhost:$PORT/state" > /dev/null 2>&1; then
        echo "  $NAME server ready on port $PORT"
    else
        echo "  WARNING: $NAME server on port $PORT not responding"
        echo "  Check $SCRIPT_DIR/$NAME.server.log for errors"
    fi
done

echo ""
echo "========================================="
echo " Starting agents..."
echo "========================================="
echo ""

# Run agents in parallel, each writing to its own log
AGENT_PIDS=()
for agent_config in "${AGENTS[@]}"; do
    IFS=: read -r NAME KEY PORT SCRIPT <<< "$agent_config"
    echo "Launching $NAME agent ($SCRIPT) -> port $PORT..."
    python3 -u "$SCRIPT_DIR/agents/$SCRIPT" "$PORT" "$NUM_GAMES" \
        2>&1 | tee "$SCRIPT_DIR/$NAME.results.txt" &
    AGENT_PIDS+=($!)
done

# Wait for all agents to finish
echo ""
echo "All agents running. Waiting for completion..."
echo "(This may take a while — $NUM_GAMES games per agent on-chain)"
echo ""

for i in "${!AGENT_PIDS[@]}"; do
    IFS=: read -r NAME KEY PORT SCRIPT <<< "${AGENTS[$i]}"
    wait "${AGENT_PIDS[$i]}" 2>/dev/null || true
    echo "$NAME agent finished."
done

# Print results
echo ""
echo "========================================="
echo " TOURNAMENT RESULTS"
echo "========================================="
echo ""

for agent_config in "${AGENTS[@]}"; do
    IFS=: read -r NAME KEY PORT SCRIPT <<< "$agent_config"
    echo "--- $NAME ($KEY) ---"
    if [ -f "$SCRIPT_DIR/$NAME.results.txt" ]; then
        # Print the final summary (lines after "Final Results")
        grep -A 10 "Final Results" "$SCRIPT_DIR/$NAME.results.txt" 2>/dev/null || \
            tail -10 "$SCRIPT_DIR/$NAME.results.txt"
    else
        echo "  No results file found"
    fi
    echo ""
done
