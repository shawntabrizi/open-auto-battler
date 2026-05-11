# Container-based Dev Setup

The OAB on-chain loop pulls in a non-trivial pile of toolchain pieces (Rust
nightly, `cargo-pvm-contract` from a specific branch, `bun`, `wasm-pack`, a
private-repo PPN checkout, a patched sibling clone of
`contract-dependency-manager`). If you'd rather not splatter all of that
across your host, here are two container recipes that work on Linux.

> **Not tested on macOS/Windows.** Docker Desktop's filesystem and networking
> layers will work but with overhead. The Linux-native distrobox path below
> is the smoothest.

## Recommended: distrobox (Fedora 43+ host)

`distrobox` runs a container that mounts your `$HOME`, shares your X/Wayland
session, and uses host networking — so PPN's ports (`10000–10030`, `8080`)
and Vite's `5173` just work, and the bind-mounted repo means edits from your
host editor are visible inside.

```bash
# 1. Create the container (Fedora base; Debian/Ubuntu also fine)
distrobox create --name oab --image fedora:43

# 2. Enter it
distrobox enter oab

# 3. Install the toolchain (inside the container)
sudo dnf install -y git make gcc gcc-c++ cmake pkg-config openssl-devel \
  protobuf-compiler clang nodejs npm curl unzip

# Rust + nightly
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"
rustup toolchain install nightly --component rust-src --profile minimal

# wasm-pack + cargo-pvm-contract (charles/cdm-integration)
cargo install wasm-pack
HOST_TARGET=$(rustc -vV | grep '^host:' | cut -d' ' -f2)
git clone -b charles/cdm-integration \
  https://github.com/paritytech/cargo-pvm-contract.git /tmp/cpvm
cargo install --force --locked --target "$HOST_TARGET" \
  --path /tmp/cpvm/crates/cargo-pvm-contract

# bun ≥ 1.2 for the cdm CLI
curl -fsSL https://bun.sh/install | bash
echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.bashrc
export PATH="$HOME/.bun/bin:$PATH"

# gh, for cloning the private PPN repo
sudo dnf install -y gh
gh auth login
```

Then follow `docs/QUICKSTART.md` Path 2 from inside the container. Because
the repo lives on your host filesystem (bind-mounted into the container),
`./start.sh` writes WASM artefacts back to your host tree and the dev server
serves them out normally.

### Why host networking matters here

`start.sh`'s `pkill -9 -f "$PPN_DIR/bin/polkadot"` cleans up zombienet
descendants by absolute path — works fine inside a container, and won't reach
host processes. With distrobox's default networking, the Vite server on
`:5173` and Asset Hub on `:10020` are reachable from your host browser
without any `-p` flags.

## Alternative: rootless podman

If you want stricter isolation (no host-home mount), a `Containerfile`-based
flow works too. Sketch:

```Dockerfile
# Containerfile
FROM fedora:43

RUN dnf install -y git make gcc gcc-c++ cmake pkg-config openssl-devel \
      protobuf-compiler clang nodejs npm curl unzip gh \
 && curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y \
 && . "$HOME/.cargo/env" \
 && rustup toolchain install nightly --component rust-src --profile minimal \
 && cargo install wasm-pack

# bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:/root/.cargo/bin:${PATH}"

# cargo-pvm-contract (specific branch)
RUN git clone -b charles/cdm-integration \
      https://github.com/paritytech/cargo-pvm-contract.git /tmp/cpvm \
 && HOST_TARGET=$(rustc -vV | grep '^host:' | cut -d' ' -f2) \
 && cargo install --force --locked --target "$HOST_TARGET" \
      --path /tmp/cpvm/crates/cargo-pvm-contract \
 && rm -rf /tmp/cpvm

WORKDIR /workspace
```

Build and run:

```bash
podman build -t oab-dev -f Containerfile .
podman run --rm -it \
  -v "$PWD":/workspace:Z \
  -p 5173:5173 -p 10000:10000 -p 10010:10010 \
  -p 10020:10020 -p 10030:10030 -p 8080:8080 \
  oab-dev bash

# Inside the container:
gh auth login                       # PPN repo is private
git clone --depth 1 --branch main \
  https://github.com/paritytech/product-preview-net.git ppn
cd ppn && make ensure-deps
cd ..
# ...then the rest of QUICKSTART Path 2.
```

The `:Z` SELinux relabel on the bind mount is required on Fedora; drop it on
distros without SELinux.

### Caveats

- **PPN binary download** (~250 MB) goes into `ppn/bin/` which is on the
  bind-mounted repo, so it survives container rebuilds — don't add `ppn/`
  to a `.dockerignore`.
- **`cargo` and `~/.cargo`** should live on a persistent volume if you plan
  to rebuild often, otherwise every `podman run` redownloads crates. Add
  `-v oab-cargo:/root/.cargo`.
- **GitHub auth.** Either run `gh auth login` interactively inside the
  container each session, or bind-mount `~/.config/gh:/root/.config/gh:ro`
  from the host.
- **`pkill -9 -f …`** in `start.sh` is process-namespace-scoped inside a
  container, so it can't reach host processes — which is what you want.

## Trade-offs

| Concern                       | distrobox       | podman rootless   |
|---                            |---              |---                |
| Setup ceremony                | minimal         | Containerfile     |
| Host isolation                | low (home mount)| high              |
| Browser-from-host on `:5173`  | works (host net)| needs `-p 5173`   |
| Reuse host editor / git creds | yes             | requires bind/share |
| Reproducibility               | medium          | high              |

If in doubt, start with distrobox — you can always rebuild from a clean
container if anything goes sideways, and the workflow is closest to running
the tooling directly on your host.
