# chain/: the Deed program

The on-chain half of Deed: a Rust/Anchor 1.2 program (`programs/deed_fun`) plus everything to build, test and deploy it.
How it behaves is described in [docs/HOW_IT_WORKS.md §8](../docs/HOW_IT_WORKS.md#8-what-happens-on-chain); what is verified
and what is not is in [docs/INTEGRATIONS.md](../docs/INTEGRATIONS.md).

```
programs/deed_fun/
  src/constants.rs   every rule as a constant (fees, minimum increment, anti-snipe window, limits, Pump addresses)
  src/state.rs       Config, DeedState, Auction, Offer
  src/util.rs        pure math (min bid, fee, anti-snipe, OTC rounding), Pump SharingConfig parser, Token-2022 screening, unit tests
  src/instructions/  initialize · register_deed · claim_fees · auction · otc
  src/events.rs      the events the front end indexes
  tests/deed.rs      16 LiteSVM integration tests against the compiled .so
scripts/             WSL helpers: setup, build/test, deploy, initialize, fork-fixture download
e2e/                 local-validator suite: real Pump programs + the app's real service layer
keys/                the program's address keypair (git-ignored; back it up)
target-out/          build artefacts: deed_fun.so (deployable), deed_fun.json (IDL), e2e/deed_fun.so (TEST ONLY)
```

## Toolchain (Windows: use WSL)

Rust/Solana tooling is much happier on Linux. `scripts/setup-wsl.sh` installs everything inside an Ubuntu WSL distro (apt
packages, Node 20, rustup, the Agave/Solana CLI, Anchor 1.2 via avm). The repo lives on the Windows drive, which is slow for
Rust, so `scripts/build.sh` mirrors the sources into `~/deed-chain`, builds there and copies the artefacts back.

```bash
# from Windows:   wsl -d Ubuntu -u root -- bash /mnt/d/Codes/deed/chain/scripts/wsl.sh 'bash /mnt/d/Codes/deed/chain/scripts/build.sh test'
bash chain/scripts/build.sh check    # cargo check
bash chain/scripts/build.sh unit     # unit tests
bash chain/scripts/build.sh build    # anchor build --arch v0  → target-out/deed_fun.so + IDL
bash chain/scripts/build.sh test     # build + the 16 integration tests
bash chain/scripts/build.sh e2e      # test-only build with 5 s auctions and a 2 s anti-snipe window (NEVER deploy)
```

**Always build with `--arch v0`** (the scripts do). Anchor 1.2's default, SBPF v3, is rejected by LiteSVM and is not what
mainnet validators run today. After a build, copy `target-out/deed_fun.json` to `src/chain/idl/` (the front end reads the
IDL from there).

## End-to-end against the real Pump programs

```bash
bash chain/scripts/build.sh e2e            # once
bash chain/e2e/validator.sh                # foreground; clones the Pump programs + their global accounts from mainnet (read-only)
npm run test:e2e                           # in another terminal
```

`validator.sh` deploys the Deed program as an *upgradeable* program whose upgrade authority is `e2e/.out/admin.json`, so
`initialize` is exercised exactly as on mainnet. Nothing is sent to mainnet: the clone only reads.

## Deploying

See [DEPLOY.md](DEPLOY.md). Short version: `scripts/deploy.sh --cluster … --authority <your keypair>` then
`scripts/initialize.mjs`. The scripts never read a key themselves and refuse the test build and refuse mainnet without an
explicit typed confirmation.
