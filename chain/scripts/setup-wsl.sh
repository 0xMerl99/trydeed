#!/usr/bin/env bash
# One-time toolchain setup for building/testing the Deed Solana program inside WSL (Ubuntu).
# Run from Windows:  wsl -d Ubuntu -u root -- bash /mnt/d/Codes/deed/programs/scripts/setup-wsl.sh
# Installs: build deps, Node 20, Rust (rustup), the Solana/Agave CLI (+ SBF toolchain), and Anchor (via avm).
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

echo "== apt packages"
apt-get update -y
apt-get install -y build-essential pkg-config libssl-dev libudev-dev curl git ca-certificates xz-utils bzip2 python3 unzip

echo "== node 20"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
node --version

echo "== rust"
if ! command -v rustc >/dev/null; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
fi
# shellcheck disable=SC1091
source "$HOME/.cargo/env"
rustc --version

echo "== solana (agave) cli"
if ! command -v solana >/dev/null && [ ! -x "$HOME/.local/share/solana/install/active_release/bin/solana" ]; then
  sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
fi
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
solana --version

echo "== anchor (avm)"
if ! command -v avm >/dev/null; then
  cargo install --git https://github.com/coral-xyz/anchor avm --force
fi
avm install latest
avm use latest
anchor --version

echo "== DONE"
