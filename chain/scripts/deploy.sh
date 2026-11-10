#!/usr/bin/env bash
# Deploys the Deed program. DOES NOT run by itself and never touches a key unless YOU pass one.
#
#   bash chain/scripts/deploy.sh --cluster devnet  --authority ~/my-authority.json
#   bash chain/scripts/deploy.sh --cluster mainnet-beta --authority ~/my-authority.json --rpc https://your-rpc
#
# The authority keypair pays for the deployment and becomes (a) the program's upgrade authority and (b) the Deed `admin`
# that may change the fee treasury. For mainnet use a hardware wallet / multisig authority if you can, and read
# chain/DEPLOY.md first. The program's own address keypair is chain/keys/deed_fun-keypair.json (back it up).
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
CLUSTER=""; AUTH=""; RPC=""; MAXLEN=""; SO="$HERE/target-out/deed_fun.so"
while [ $# -gt 0 ]; do
  case "$1" in
    --cluster) CLUSTER="$2"; shift 2 ;;
    --authority) AUTH="$2"; shift 2 ;;
    --rpc) RPC="$2"; shift 2 ;;
    --so) SO="$2"; shift 2 ;;
    --max-len) MAXLEN="$2"; shift 2 ;;
    *) echo "unknown argument $1"; exit 2 ;;
  esac
done
[ -n "$CLUSTER" ] && [ -n "$AUTH" ] || { echo "usage: deploy.sh --cluster <mainnet-beta|devnet|localnet> --authority <keypair.json> [--rpc URL] [--so file] [--max-len BYTES]"; exit 2; }
[ -f "$AUTH" ] || { echo "authority keypair not found: $AUTH"; exit 2; }
[ -f "$SO" ] || { echo "program binary not found: $SO  (run: bash chain/scripts/build.sh build)"; exit 2; }
PROGRAM_KP="$HERE/keys/deed_fun-keypair.json"
[ -f "$PROGRAM_KP" ] || { echo "missing $PROGRAM_KP"; exit 2; }

case "$CLUSTER" in
  mainnet-beta) URL="${RPC:-https://api.mainnet-beta.solana.com}" ;;
  devnet)       URL="${RPC:-https://api.devnet.solana.com}" ;;
  localnet)     URL="${RPC:-http://127.0.0.1:8899}" ;;
  *) echo "unknown cluster $CLUSTER"; exit 2 ;;
esac

# ---- refuse the test-only build (short auction timers) on any real network
E2E="$HERE/target-out/e2e/deed_fun.so"
if [ "$CLUSTER" != "localnet" ]; then
  case "$SO" in *e2e*) echo "REFUSED: $SO is the test-only build."; exit 3 ;; esac
  if [ -f "$E2E" ] && [ "$(sha256sum "$SO" | cut -d' ' -f1)" = "$(sha256sum "$E2E" | cut -d' ' -f1)" ]; then
    echo "REFUSED: this binary is the test-only build (short auction timers). Rebuild with: bash chain/scripts/build.sh build"; exit 3
  fi
fi
# ---- the binary must be SBPF v0 (what every mainnet validator runs today)
if command -v readelf >/dev/null && readelf -h "$SO" | grep -q "CPU Version: 3"; then
  echo "REFUSED: $SO is SBPF v3. Build with: anchor build --arch v0 (chain/scripts/build.sh does this)"; exit 3
fi

PROGRAM_ID="$(solana-keygen pubkey "$PROGRAM_KP")"
AUTH_PK="$(solana-keygen pubkey "$AUTH")"
SIZE="$(stat -c %s "$SO")"
echo "cluster:            $CLUSTER ($URL)"
echo "program id:         $PROGRAM_ID"
echo "upgrade authority:  $AUTH_PK  (also becomes the Deed config admin)"
echo "binary:             $SO ($SIZE bytes, sha256 $(sha256sum "$SO" | cut -d' ' -f1))"
echo "authority balance:  $(solana balance "$AUTH_PK" --url "$URL")"
echo "rent for the program account: $(solana rent $((SIZE*2)) --url "$URL" 2>/dev/null | tail -1) (deploy allocates 2x for upgrades; most is refundable only by closing the program)"

if [ "$CLUSTER" = "mainnet-beta" ]; then
  echo
  echo "!! MAINNET: this spends REAL SOL and deploys an upgradeable program that will escrow REAL funds."
  echo "!! It has been tested on LiteSVM and a local validator against the real Pump programs, but it has NOT had an"
  echo "!! independent security audit. Read chain/DEPLOY.md before continuing."
  [ "${DEED_CONFIRM_MAINNET:-}" = "yes" ] || { echo "Set DEED_CONFIRM_MAINNET=yes to proceed."; exit 4; }
  read -r -p 'Type exactly  DEPLOY TO MAINNET  to continue: ' ans
  [ "$ans" = "DEPLOY TO MAINNET" ] || { echo "aborted"; exit 4; }
fi

solana program deploy "$SO" \
  --program-id "$PROGRAM_KP" \
  --upgrade-authority "$AUTH" \
  --keypair "$AUTH" \
  --url "$URL" \
  --with-compute-unit-price 10000 \
  --max-sign-attempts 60 \
  ${MAXLEN:+--max-len "$MAXLEN"}

echo
echo "Deployed. Next: initialise the config (sets the fee treasury; only the upgrade authority can):"
echo "  node chain/scripts/initialize.mjs --rpc $URL --authority $AUTH --treasury <fee-wallet-pubkey>"
