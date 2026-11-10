# Starts the app against the local validator with the flagged test wallet, on port 3101 (own build dir), for manual browser QA.
#   powershell -File chain/e2e/qa-server.ps1
# It generates a throwaway keypair for the test wallet each run and prints its address so you can fund it
# (solana airdrop 100 <address> --url http://127.0.0.1:8899).
$ErrorActionPreference = "Stop"
Set-Location (Resolve-Path "$PSScriptRoot\..\..")
$kp = node -e "const {Keypair}=require('@solana/web3.js');const {utils}=require('@coral-xyz/anchor');const k=Keypair.generate();console.log(k.publicKey.toBase58()+' '+utils.bytes.bs58.encode(k.secretKey))"
$pub, $secret = $kp -split ' '
Write-Host "E2E burner wallet: $pub"
$env:NEXT_DIST_DIR = ".next-qa"
$env:NEXT_PUBLIC_SOLANA_CLUSTER = "localnet"
$env:NEXT_PUBLIC_SOLANA_RPC_URL = "http://127.0.0.1:8899"
$env:NEXT_PUBLIC_E2E_BURNER_SECRET = $secret
$env:NEXT_PUBLIC_PRIORITY_FEE_MICROLAMPORTS = "0"
npx next dev -p 3101
