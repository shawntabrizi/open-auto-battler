TARGETS = all clean
.PHONY: $(TARGETS)
.SILENT: $(TARGETS)

all:
	# RUSTC_BOOTSTRAP is required for build-std
	RUSTC_BOOTSTRAP=1 cargo build --release
	polkatool link --strip --output contract.polkavm target/riscv64emac-unknown-none-polkavm/release/contract
	@echo "Built: contract.polkavm"
	@ls -la contract.polkavm
	@echo "Code size:"
	@wc -c < contract.polkavm | xargs -I {} echo "  {} bytes"

clean:
	cargo clean
	rm -f contract.polkavm
