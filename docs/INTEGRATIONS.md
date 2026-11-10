# Integrations: what is real, what is verified, what you must provide

Everything in Deed is real: there is no simulation. This page says exactly what that rests on, what has and has not
been verified, the trust assumptions, and what only *you* can do (deploy, fund, audit).

## What works with nothing of ours deployed

| | Without the Deed program on the network | With it |
| --- | --- | --- |
| **Launch a coin** | Yes: a Pump.fun-only launch (one transaction). The creator earns the creator fees directly. | Yes, with a Deed (four transactions) |
| Deed, fee rights for sale, auctions | No | Yes |
| OTC trading | No (it is escrowed by the program) | Yes |
| Reading anything | Pages are empty | Live |

So a launch needs only Pump.fun's existing mainnet programs, an RPC and the pinning key; it does not need you to deploy
anything. The Deed program is what turns a launched coin into an ownable, sellable asset, and a coin launched earlier can be
upgraded to a Deed afterwards (verified on the local validator, including a coin that had already traded).

## What the app talks to

| Piece | What it is | Status |
| --- | --- | --- |
| **Deed program** (`chain/`, Rust/Anchor 1.2) | Registry of Deeds, fee claims, auctions, OTC escrow. Program id `DUGCUEFnfSA2TBtzgx51hLmiwy6pYSuCPQBNwD2utRYz` (compiled in; keypair in `chain/keys/`, git-ignored). | Written and tested. **Not deployed anywhere by this repo**: you deploy it. |
| **Pump.fun programs** | `pump` `6EF8rrec…`, `pump_fees` `pfeeUxB6…`, `pump_amm` `pAMMBay6…`, `mayhem` `MAyhSmzX…`. Addresses and instruction layouts are from Pump's own public docs / published IDLs and the official `@pump-fun/pump-sdk`, not guessed. | Real. Launch, fee locking, fee distribution and a buy were run against the **actual mainnet binaries** on a local validator. |
| **Solana RPC** | Reads accounts/transactions, sends transactions. | You choose. `api.mainnet-beta.solana.com` answers 403 to browsers. **Free, no key, tested:** `https://solana-rpc.publicnode.com` (launching, network check, clock, balances, confirmations, activity all pass; it refuses `getProgramAccounts`, `getTokenLargestAccounts` and `getParsedTokenAccountsByOwner`). Fine until the Deed program is deployed; afterwards use a keyed RPC (Helius/QuickNode/Triton free tiers), because the auction, coin and OTC lists are built with `getProgramAccounts`. |
| **IPFS pinning (Pinata)** | Stores each coin's image and the two metadata JSON files. The only server secret (`PINATA_JWT`). | You provide the key. |
| **Wallet** | Phantom / Solflare / Wallet-Standard. Signs everything. | Standard adapter; not driven by a real extension in CI. |

Nothing in the app invents a program id, endpoint, mint instruction, settlement or fee-claim path. Each one is either the
Deed program's own instruction (built from its IDL) or Pump's, built by Pump's official SDK.

## What has been verified, and how

| Claim | Evidence |
| --- | --- |
| Auction rules (min bid, anti-sniping, 1 % fee on completed sales only, atomic refund, permissionless settle, cancel only before the first bid) | 8 Rust unit tests + 16 LiteSVM integration tests against the compiled SBF binary, including attacker cases (wrong refund account, redirected payouts, double settle, non-holder listing) |
| OTC (escrow, partial fills, rounding buyer-up / seller-down / last-exact, 0.5 % fee, private offers, reject, refusal of freeze-authority and dangerous Token-2022 mints) | same suites |
| `register_deed` only accepts a coin whose fees are 100 % locked to its vault with the authority revoked, by the creator, with a true 1/1 mint | same suites (forged config, wrong owner, partial split, unrevoked authority, thief with their own mint, supply 2, mint/freeze authority present, PermanentDelegate) |
| **Pump accepts the Deed vault PDA as the sole shareholder, the authority is revoked, and fees flow vault → holder** | local-validator e2e with the **real Pump programs**: launch → real buy → sweep + distribute → `claim_fees`; the claimant's balance rises by the vault's balance |
| The same code the browser runs works | the e2e suite drives `LiveDeedService` / `chain/writes` / `chain/launch` directly |

Run them yourself: [HOW_IT_WORKS.md §11](HOW_IT_WORKS.md#11-running-and-testing), results in [QA.md](QA.md).

## Not verified (be honest with yourself about these)

* **No independent security audit.** Escrow code that holds real funds should be audited before real money is at stake.
  Mainnet deployment is a decision for you; `chain/DEPLOY.md` lists what to do first.
* **No real wallet extension was driven.** Phantom/Solflare can't run headless. The same signing path is exercised with a
  keypair wallet; the extension-specific prompt, account switching and network mismatch are implemented through the
  standard adapter but not exercised.
* **No mainnet transaction has been sent** by this repo. Pump's mainnet programs change over time (they now have v3 trades,
  quote mints, sweeps); the app uses the official SDK for every Pump instruction so it tracks those changes, but re-run the
  e2e suite against a fresh clone before a release.
* **Browsers:** Edge/Chromium only. Screen readers were not run manually.

## Trust assumptions

1. **Pump's programs.** After the creator authority is revoked the fee split is immutable *except* through Pump's
   privileged `admin_cto_sharing_config` (a community-takeover instruction that needs Pump's own authority key). If Pump
   used it, they could redirect a coin's fees. That is a risk in Pump, not something Deed can remove. Anyone
   buying a Deed should know it.
2. **The program's upgrade authority.** Whoever holds the Deed program's upgrade authority can replace the program. Use a
   multisig / hardware wallet; once you are confident, consider making the program immutable
   (`solana program set-upgrade-authority --final`). The same key is the Deed `admin`, which can only change the fee
   **treasury** (fee *rates* are constants in the program).
3. **The RPC.** A malicious RPC could show wrong data; it cannot move funds (the wallet shows what it signs, the program
   enforces the rules). The app compares the RPC's genesis hash with the configured cluster and refuses to send otherwise.
4. **The metadata host.** Images and descriptions come from IPFS gateways; the app renders them as plain images and
   never executes anything from them. A coin's name/logo can be copied by anyone: every token page shows the full mint.

## What the chain cannot give a front end (and the app therefore does not show)

* **24 h / 7 d / 14-day creator-fee history**: needs a full-history indexer. Shown as "—". (The fee chart was removed
  rather than faked.)
* **USD values**: no price feed is invented. Market cap is shown in SOL from Pump's bonding-curve reserves.
* **24 h volume**: same reason.
* **Completeness of history at scale**: the activity feed and bid history are read from the program's most recent
  transactions through the RPC. Use an RPC with full history, or replace `src/chain/events.ts` with a Geyser/webhook indexer.

## What only you can do

1. **Build** the program (`bash chain/scripts/build.sh build`: SBPF v0) and **deploy** it with `chain/scripts/deploy.sh` using
   *your* funded keypair. The script refuses the test-only build and refuses mainnet without `DEED_CONFIRM_MAINNET=yes`
   plus a typed confirmation. It never reads or stores a key.
2. **Initialise** the config with `chain/scripts/initialize.mjs` (only the upgrade authority can), naming the **treasury**
   wallet that receives the fees. Fund the treasury with a little SOL first (rent floor).
3. **Provide** a dedicated RPC and a Pinata JWT.
4. **Commission an audit** before real money is at stake.
5. **Confirm the decisions below.**

## Decisions to confirm

Defaults chosen from your brief and the reference; each is a constant in one place.

| Decision | Chosen | Where to change |
| --- | --- | --- |
| Anti-sniping | a bid in the last 5 min extends the end **by** 5 min (brief). The reference's copy says "to 5 min from the bid" | `ANTI_SNIPE_SECS` / `end_after_bid` in the program and `lib/auction.ts` |
| OTC fee | 0.5 % of the SOL leg, paid by the token seller (copied from the reference) | `OTC_FEE_BPS` in `constants.rs` |
| Auction fee | 1 % of completed sales, paid by the seller (brief) | `AUCTION_FEE_BPS` |
| Minimum starting bid | 0.01 SOL (reference) | `MIN_START_PRICE` |
| Auction length | 10 minutes to 7 days | `MIN_AUCTION_SECS` / `MAX_AUCTION_SECS` |
| Website field on launched coins | locked to `NEXT_PUBLIC_SITE_URL` (assumed `deed.fun`) | `.env` |
| Header "X"/"CA" buttons | **X** link added (https://x.com/trydeedfun) in the header, mobile menu and footer, and as the share-card account; **CA** button added (header, mobile menu, footer; copies `CyM2mqHxu3XN2MZcmJq3xLnobdtaV8At52EYmRUapump`, the DEED Pump.fun token: Token-2022, 6 decimals, 1B supply, no mint/freeze authority, verified on chain) | `src/lib/social.ts`, `components/layout/Header.tsx` |
| Fee changes | rates are program constants: changing them means upgrading the program | `chain/programs/deed_fun/src/constants.rs` |
