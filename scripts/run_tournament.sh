#!/bin/bash
# OAB Agent Tournament
# Runs 4 agents with different strategies across all card sets on-chain.
# Each agent gets a derived account per set (e.g. //Greedy//0 for set 0).

set -e

CHAIN_URL="${OAB_CHAIN_URL:-wss://oab-rpc.shawntabrizi.com}"
NUM_GAMES="${OAB_NUM_GAMES:-100}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Strategies: name:base_key:script
STRAT_NAMES=( Greedy    Tank    Aggro    Economy   )
STRAT_KEYS=(  //Greedy  //Tank  //Aggro  //Economy )
STRAT_SCRIPTS=( greedy.py tank.py aggro.py economy.py )

# Card set IDs to test
SETS=(0 1 2)

# Port for a given (strategy_index, set_id): 4000 + set_id * 10 + strat_idx
get_port() { echo $(( 4000 + $1 * 10 + $2 )); }

echo "========================================="
echo " OAB Agent Tournament"
echo "========================================="
echo " Chain:   $CHAIN_URL"
echo " Games:   $NUM_GAMES per agent per set"
echo " Sets:    ${#SETS[@]}"
echo " Agents:  ${#STRAT_NAMES[@]} per set"
echo " Total:   $(( ${#SETS[@]} * ${#STRAT_NAMES[@]} )) agent instances"
echo "========================================="
echo ""

# Build the server
echo "Building oab-server..."
cd "$PROJECT_DIR"
cargo build -p oab-server --release 2>&1 | tail -1
OAB_SERVER="$PROJECT_DIR/target/release/oab-server"

# Collect all derived account SURIs that need funding
FUND_ARGS=()
for SET_ID in "${SETS[@]}"; do
    for KEY in "${STRAT_KEYS[@]}"; do
        FUND_ARGS+=("${KEY}//${SET_ID}")
    done
done

echo "Funding ${#FUND_ARGS[@]} derived accounts..."
"$OAB_SERVER" --url "$CHAIN_URL" --key "//Alice" --fund "${FUND_ARGS[@]}"
echo ""

# Track all PIDs for cleanup
ALL_PIDS=()

cleanup() {
    echo ""
    echo "Shutting down all servers..."
    for pid in "${ALL_PIDS[@]}"; do
        kill "$pid" 2>/dev/null || true
    done
    wait 2>/dev/null
}
trap cleanup EXIT

# Start servers for every (strategy, set) combination
echo "Starting servers..."
for si in "${!STRAT_NAMES[@]}"; do
    NAME="${STRAT_NAMES[$si]}"
    KEY="${STRAT_KEYS[$si]}"
    for SET_ID in "${SETS[@]}"; do
        PORT=$(get_port "$SET_ID" "$si")
        DERIVED_KEY="${KEY}//${SET_ID}"
        LABEL="${NAME}_set${SET_ID}"

        echo "  $LABEL ($DERIVED_KEY) -> port $PORT (set $SET_ID)"
        "$OAB_SERVER" --url "$CHAIN_URL" --key "$DERIVED_KEY" --port "$PORT" --set "$SET_ID" \
            2>"$SCRIPT_DIR/$LABEL.server.log" &
        ALL_PIDS+=($!)
    done
done

# Wait for servers to be ready
echo ""
echo "Waiting for servers to connect and load cards..."
sleep 20

# Check servers are up
echo "Checking servers..."
for SET_ID in "${SETS[@]}"; do
    for si in "${!STRAT_NAMES[@]}"; do
        NAME="${STRAT_NAMES[$si]}"
        PORT=$(get_port "$SET_ID" "$si")
        LABEL="${NAME}_set${SET_ID}"
        if curl -s "http://localhost:$PORT/state" > /dev/null 2>&1; then
            echo "  $LABEL ready on port $PORT"
        else
            echo "  WARNING: $LABEL on port $PORT not responding"
            echo "  Check $SCRIPT_DIR/$LABEL.server.log"
        fi
    done
done

echo ""
echo "========================================="
echo " Starting agents..."
echo "========================================="
echo ""

# Launch all agents in parallel
AGENT_PIDS=()
AGENT_LABELS=()
for SET_ID in "${SETS[@]}"; do
    for si in "${!STRAT_NAMES[@]}"; do
        NAME="${STRAT_NAMES[$si]}"
        SCRIPT="${STRAT_SCRIPTS[$si]}"
        PORT=$(get_port "$SET_ID" "$si")
        LABEL="${NAME}_set${SET_ID}"

        echo "Launching $LABEL ($SCRIPT) -> port $PORT..."
        python3 -u "$SCRIPT_DIR/agents/$SCRIPT" "$PORT" "$NUM_GAMES" "$SET_ID" \
            2>&1 | tee "$SCRIPT_DIR/$LABEL.results.txt" &
        AGENT_PIDS+=($!)
        AGENT_LABELS+=("$LABEL")
    done
done

TOTAL=$(( ${#SETS[@]} * ${#STRAT_NAMES[@]} ))
echo ""
echo "All $TOTAL agents running. Waiting for completion..."
echo "($NUM_GAMES games per agent on-chain)"
echo ""

for i in "${!AGENT_PIDS[@]}"; do
    wait "${AGENT_PIDS[$i]}" 2>/dev/null || true
    echo "${AGENT_LABELS[$i]} finished."
done

# Print results grouped by set
echo ""
echo "========================================="
echo " TOURNAMENT RESULTS"
echo "========================================="

for SET_ID in "${SETS[@]}"; do
    echo ""
    echo "--- Set $SET_ID ---"
    echo ""
    for si in "${!STRAT_NAMES[@]}"; do
        NAME="${STRAT_NAMES[$si]}"
        LABEL="${NAME}_set${SET_ID}"
        RESULTS_FILE="$SCRIPT_DIR/$LABEL.results.txt"
        if [ -f "$RESULTS_FILE" ]; then
            grep -A 10 "Final Results" "$RESULTS_FILE" 2>/dev/null || \
                tail -10 "$RESULTS_FILE"
        else
            echo "  $LABEL: No results file found"
        fi
        echo ""
    done
done
