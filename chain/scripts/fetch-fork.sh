#!/usr/bin/env bash
# Downloads the REAL Pump.fun programs (and the global accounts they read) from mainnet into ~/deed-chain/fixtures so the
# fork test can launch a coin and lock its creator fees against the actual, unmodified Pump programs.
# Read-only: nothing is sent to mainnet. Usage: bash fetch-fork.sh [rpc-url]
set -uo pipefail
RPC="${1:-https://api.mainnet-beta.solana.com}"
OUT="$HOME/deed-chain/fixtures"
mkdir -p "$OUT/programs" "$OUT/accounts"
for p in 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ \
         pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e; do
  if [ ! -s "$OUT/programs/$p.so" ]; then
    echo "dump program $p"
    timeout 180 solana program dump "$p" "$OUT/programs/$p.so" --url "$RPC" || echo "FAILED $p"
    sleep 1
  fi
done
# extra accounts are listed one per line in fixtures/accounts.txt (written by the TS helper that derives the PDAs)
if [ -f "$OUT/accounts.txt" ]; then
  while read -r a; do
    [ -z "$a" ] && continue
    if [ ! -s "$OUT/accounts/$a.json" ]; then
      echo "account $a"
      timeout 60 solana account "$a" --output json --output-file "$OUT/accounts/$a.json" --url "$RPC" || echo "MISSING $a"
      sleep 0.5
    fi
  done < "$OUT/accounts.txt"
fi
ls -la "$OUT/programs" "$OUT/accounts" 2>/dev/null
