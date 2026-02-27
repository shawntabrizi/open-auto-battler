FROM docker.io/paritytech/ci-unified:latest as builder

WORKDIR /polkadot
COPY . /polkadot

RUN cargo fetch
RUN cargo build --locked --profile production

FROM docker.io/parity/base-bin:latest

COPY --from=builder /polkadot/target/production/wbuild/auto-battle-runtime/auto_battle_runtime.compact.compressed.wasm /runtime/

USER root
RUN useradd -m -u 1001 -U -s /bin/sh -d /polkadot polkadot && \
	mkdir -p /data /polkadot/.local/share && \
	chown -R polkadot:polkadot /data && \
	ln -s /data /polkadot/.local/share/polkadot && \
# unclutter and minimize the attack surface
	rm -rf /usr/bin /usr/sbin

USER polkadot

EXPOSE 30333 9933 9944 9615
VOLUME ["/data"]
