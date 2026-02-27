#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUTPUT_DIR="${OUTPUT_DIR:-$REPO_ROOT/target/coverage/oab-core}"
FAIL_UNDER_LINES="${FAIL_UNDER_LINES:-0}"

if ! cargo llvm-cov --version >/dev/null 2>&1; then
    echo "cargo-llvm-cov is required."
    echo "Install it with: cargo install cargo-llvm-cov"
    exit 1
fi

ACTIVE_TOOLCHAIN="$(rustup show active-toolchain | awk '{print $1}')"
if ! rustup component list --installed --toolchain "$ACTIVE_TOOLCHAIN" | grep -q "^llvm-tools"; then
    echo "llvm-tools-preview is required for coverage instrumentation."
    echo "Install it with: rustup component add llvm-tools-preview --toolchain $ACTIVE_TOOLCHAIN"
    exit 1
fi

mkdir -p "$OUTPUT_DIR"

pushd "$REPO_ROOT" >/dev/null

echo "--- Running core coverage collection ---"
cargo llvm-cov clean --workspace
cargo llvm-cov -p oab-core --no-report

SUMMARY_ARGS=(llvm-cov report --summary-only)
if [[ "$FAIL_UNDER_LINES" != "0" ]]; then
    SUMMARY_ARGS+=(--fail-under-lines "$FAIL_UNDER_LINES")
fi
cargo "${SUMMARY_ARGS[@]}"

echo "--- Writing coverage reports ---"
rm -rf "$OUTPUT_DIR/html"
cargo llvm-cov report --lcov --output-path "$OUTPUT_DIR/lcov.info"
cargo llvm-cov report --html --output-dir "$OUTPUT_DIR"

popd >/dev/null

echo "Coverage summary printed above."
echo "LCOV report: $OUTPUT_DIR/lcov.info"
echo "HTML report: $OUTPUT_DIR/html/index.html"
