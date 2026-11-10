#!/usr/bin/env bash
# Local validator for end-to-end tests: the REAL Pump.fun programs (cloned from mainnet, read-only) + the Deed program
# deployed as an UPGRADEABLE program whose upgrade authority is chain/e2e/.out/admin.json (so `initialize` works exactly
# as it will on mainnet). Nothing is sent to mainnet: the clone only reads accounts.
#
#   wsl bash chain/e2e/validator.sh        # foreground; Ctrl+C stops it. RPC: http://127.0.0.1:8899
set -euo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$SRC/e2e/.out"
mkdir -p "$OUT"
[ -f "$OUT/admin.json" ] || solana-keygen new --no-bip39-passphrase --silent --outfile "$OUT/admin.json"
ADMIN="$(solana-keygen pubkey "$OUT/admin.json")"
PROGRAM_ID="$(solana-keygen pubkey "$SRC/keys/deed_fun-keypair.json")"
# the TEST build (short auction timers). Build it with: bash chain/scripts/build.sh e2e
SO="$SRC/target-out/e2e/deed_fun.so"
[ -f "$SO" ] || { echo "missing $SO: run  bash chain/scripts/build.sh e2e  first"; exit 1; }

PUMP_PROGRAMS="6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e"
ARGS=()
for p in $PUMP_PROGRAMS; do ARGS+=(--clone-upgradeable-program "$p"); done
# Accounts Pump reads (globals, fee config, mayhem params...). Programs and system accounts are skipped.
SKIP=" 11111111111111111111111111111111 TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA $PUMP_PROGRAMS "
while read -r a; do
  [ -z "$a" ] && continue
  case "$SKIP" in *" $a "*) continue ;; esac
  ARGS+=(--maybe-clone "$a")
done < "$SRC/e2e/accounts.txt"
# extra accounts (written by e2e/extra-accounts.mjs when a test needs more: fee recipients, etc.)
if [ -f "$OUT/extra-accounts.txt" ]; then
  while read -r a; do [ -n "$a" ] && ARGS+=(--maybe-clone "$a"); done < "$OUT/extra-accounts.txt"
fi

echo "Deed program $PROGRAM_ID, upgrade authority $ADMIN"
exec solana-test-validator --reset --quiet --ledger "$HOME/deed-ledger" \
  --url https://api.mainnet-beta.solana.com \
  --rpc-port 8899 \
  --upgradeable-program "$PROGRAM_ID" "$SO" "$ADMIN" \
  "${ARGS[@]}"
