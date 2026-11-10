#!/usr/bin/env bash
# Creates the Deed program's address keypair once (chain/keys/deed_fun-keypair.json) and prints its public key.
# The keypair file is git-ignored. Whoever holds it can deploy the program at that address; keep a backup.
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)/keys"
mkdir -p "$DIR"
if [ ! -f "$DIR/deed_fun-keypair.json" ]; then
  solana-keygen new --no-bip39-passphrase --silent --outfile "$DIR/deed_fun-keypair.json"
  echo "created $DIR/deed_fun-keypair.json"
fi
solana-keygen pubkey "$DIR/deed_fun-keypair.json"
