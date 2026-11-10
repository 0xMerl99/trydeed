# Deploying the Deed program

Nothing in this repository deploys by itself or holds a key. These are the steps you run, with *your* keys.

> **Mainnet spends real SOL and the program will escrow real funds.** It has been tested on LiteSVM and on a local
> validator against the real Pump.fun programs. It has **not** been independently audited. Do the devnet pass first, get an
> audit, and only then deploy to mainnet.

## 0. Before anything

* Build the deployable binary: `bash chain/scripts/build.sh build` → `chain/target-out/deed_fun.so` (SBPF **v0**).
  The deploy script refuses an SBPF v3 build and refuses the test-only `target-out/e2e` build.
* Back up `chain/keys/deed_fun-keypair.json`. It decides the program's address (`DUGCUEFn…RYz`). Losing it before deploying
  means a new address and a rebuild; after deploying it is no longer needed to operate the program.
* Decide the **upgrade authority**. It can replace the program, and it is also the Deed `admin` (which can only change the
  fee treasury). For mainnet use a hardware wallet or a multisig (e.g. Squads), not a hot key.
* Decide the **treasury**: the wallet that receives the 1 % auction fee and the 0.5 % OTC fee. It must already exist and hold
  at least the rent-exempt minimum (0.00089 SOL), otherwise a small fee credit could fail and block a settlement.

## 1. Devnet (do this first)

```bash
solana airdrop 5 <authority-pubkey> --url devnet          # or use a faucet
bash chain/scripts/deploy.sh --cluster devnet --authority ~/authority.json
node chain/scripts/initialize.mjs --rpc https://api.devnet.solana.com --authority ~/authority.json --treasury <treasury-pubkey>
```

Then point the app at devnet (`NEXT_PUBLIC_SOLANA_CLUSTER=devnet`, a devnet RPC) and run a full launch → bid → settle →
claim → OTC pass with two wallets. Note: Pump.fun's programs on devnet are the ones Pump deploys there; the launch flow
needs them, so confirm Pump's devnet deployment is current before relying on it.

## 2. Mainnet

```bash
export DEED_CONFIRM_MAINNET=yes
bash chain/scripts/deploy.sh --cluster mainnet-beta --authority /path/to/authority.json --rpc https://your-dedicated-rpc
# prints the program id, authority, binary hash and balances, then asks you to type:  DEPLOY TO MAINNET
node chain/scripts/initialize.mjs --rpc https://your-dedicated-rpc --authority /path/to/authority.json --treasury <treasury-pubkey>
```

Cost for the current 468 KB binary (rent is refundable only by closing the program, which burns its address for good):

| Item | SOL |
| --- | --- |
| Program data account (default reserves 2 × the binary so it can grow on upgrade) | **≈ 6.52** |
| Program account | ≈ 0.001 |
| Upload buffer: needs to be in the wallet while uploading, returned when the deploy finishes | ≈ 3.26 (temporary) |
| Network fees (a few hundred small write transactions + priority fee) | < 0.02 |
| `initialize` (config account) + funding the treasury's rent floor | ≈ 0.003 |

So keep about **10 SOL** in the deploying wallet; about **6.5 SOL** is spent for good-as-rent. To cut it roughly in half,
deploy with `--max-len 468080` (no room to grow: a larger binary later would need a new program address). The script
prints the exact figure for your RPC before asking you to confirm.

## 3. After deploying

1. Verify the binary on chain matches what you built (`solana program dump <id> out.so` and compare hashes), and publish the
   source so others can verify it too.
2. Set the app's env: `NEXT_PUBLIC_SOLANA_CLUSTER`, a dedicated `NEXT_PUBLIC_SOLANA_RPC_URL`, `PINATA_JWT`,
   `NEXT_PUBLIC_SITE_URL`.
3. Move the upgrade authority to a multisig, or, once audited and you are done changing it, make the program immutable:
   `solana program set-upgrade-authority <id> --final`. (Immutable also means a bug can't be patched.)
4. Run `npm run build`, smoke-test a launch with a small amount, and watch the first auctions.

## Upgrading later

`solana program deploy <new.so> --program-id chain/keys/deed_fun-keypair.json --upgrade-authority <authority>`; the account
layouts (`Config`, `DeedState`, `Auction`, `Offer`) must stay compatible or live accounts become unreadable. Re-run
`build.sh test` and the e2e suite first, and copy the new IDL to `src/chain/idl/`.
