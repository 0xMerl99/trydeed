#!/usr/bin/env bash
# Builds / tests the Deed program inside WSL.
#
# The repo lives on the Windows drive (/mnt/d), which is very slow for Rust. This script mirrors the sources into the
# Linux home (~/deed-chain), runs the requested step there, and copies the artefacts back into chain/target-out/.
#
#   bash chain/scripts/build.sh check   # cargo check
#   bash chain/scripts/build.sh unit    # cargo test --lib (pure unit tests)
#   bash chain/scripts/build.sh build   # anchor build  -> chain/target-out/{deed_fun.so,deed_fun.json}
#   bash chain/scripts/build.sh test    # anchor build + cargo test (LiteSVM integration tests, incl. the Pump fork test)
set -euo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd)"
DST="$HOME/deed-chain"
mkdir -p "$DST"
# Mirror sources; keep ~/deed-chain/{target,fixtures}.
rsync -a --delete --exclude target --exclude fixtures --exclude target-out --exclude keys --exclude '.git' "$SRC/" "$DST/"
mkdir -p "$DST/target/deploy" "$SRC/target-out"
cp -n "$SRC/keys/deed_fun-keypair.json" "$DST/target/deploy/deed_fun-keypair.json" 2>/dev/null || true
cd "$DST"
step="${1:-check}"
case "$step" in
  check) cargo check --all-targets ;;
  unit)  cargo test --lib ;;
  build)
    anchor build --arch v0
    ;;
  test)
    anchor build --arch v0
    cp target/deploy/deed_fun.so "$DST/fixtures/deed_fun.so" 2>/dev/null || { mkdir -p fixtures; cp target/deploy/deed_fun.so fixtures/deed_fun.so; }
    cargo test -- --nocapture --test-threads=2
    ;;
  e2e)
    # Test-only build with short auction timers for the local-validator suite. NEVER deploy this artefact.
    mkdir -p "$SRC/target-out/e2e"
    cargo build-sbf --arch v0 --features e2e-short-timers --manifest-path programs/deed_fun/Cargo.toml --sbf-out-dir "$DST/target-e2e/deploy"
    cp "$DST/target-e2e/deploy/deed_fun.so" "$SRC/target-out/e2e/deed_fun.so"
    echo "== done (e2e)"
    exit 0
    ;;
  *) echo "unknown step $step"; exit 2 ;;
esac
# Export artefacts when present.
[ -f target/deploy/deed_fun.so ] && cp target/deploy/deed_fun.so "$SRC/target-out/deed_fun.so" || true
[ -f target/idl/deed_fun.json ] && cp target/idl/deed_fun.json "$SRC/target-out/deed_fun.json" || true
echo "== done ($step)"
