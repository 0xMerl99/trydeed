# Deed

**OWN THE FEES.** Launch a coin. Receive the Deed. Auction the rights.

Deed is the ownership layer for coins launched on Pump.fun. Launch a coin and receive a unique **1/1 Ownership NFT,
the Deed**, that controls 100 % of the coin's creator fees. Hold it to claim the fees, or auction it: the highest bidder
takes over the fee rights. Large token positions trade **OTC**, wallet to wallet, without touching liquidity pools or the
public chart.

This repository is the whole product: a **Solana program** (Rust/Anchor) that enforces the rules, and a **Next.js app** that
talks to it. The front end is a white-label rebuild of the **tryauction.fun** experience (same pages, layout and
interaction patterns) under the Deed identity, styled as a **dark chalkboard**; code, art, fonts and copy are
original. See [docs/REFERENCE.md](docs/REFERENCE.md) and [docs/BRAND.md](docs/BRAND.md).

> **Status: real, tested, not audited, not deployed by this repo.** There is **no simulation mode**: every action is a
> Solana transaction you sign, and every rule (the 1 % fee, the minimum bid, anti-sniping, escrow, atomic refunds, OTC
> rounding) is enforced on chain by the Deed program. The program passes 8 unit tests, 16 LiteSVM integration tests, and an
> end-to-end suite on a local validator running the **real Pump.fun programs**. It has **not had an independent security
> audit**, and it goes live on a network only when *you* deploy it with your own funded key. What is verified, the trust
> assumptions, and what you must provide: [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md). Deploying: [chain/DEPLOY.md](chain/DEPLOY.md).

## Run it

```bash
npm install
cp .env.example .env.local     # set NEXT_PUBLIC_SOLANA_RPC_URL (a dedicated RPC) and, for launches, PINATA_JWT
npm run dev                    # http://localhost:3000
```

Until the Deed program is deployed on the configured network and initialised, the app shows that clearly and every write is
refused by the chain. To try the whole thing locally with test funds, use the local-validator setup in
[chain/README.md](chain/README.md).

| Script | |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js 16 (Turbopack) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | unit tests (auction rules, SOL precision, OTC rounding, parity with the program) |
| `npm run test:e2e` | the app's real service layer against a local validator (real Pump programs + the Deed program) |
| `bash chain/scripts/build.sh test` | build the program (SBPF v0) and run its 16 integration tests (needs WSL on Windows) |
| `node scripts/qa/*.mjs` | browser flows, axe audit, screenshots (see [docs/QA.md](docs/QA.md)) |

## Hosting on Render

The repo includes a Render Blueprint ([`render.yaml`](render.yaml)): New → Blueprint → pick this repo. It builds with
`npm ci --include=dev && npm run build` and starts with `npm start`. **Use a plan with at least 2 GB of RAM** (the blueprint
says `standard`): `next build` needs about 1.3 GB, so the 512 MB plans get the build killed. Set these when prompted (the `NEXT_PUBLIC_*` ones are baked
in at build time, so redeploy after changing them): `NEXT_PUBLIC_SOLANA_RPC_URL` (a dedicated RPC), `NEXT_PUBLIC_SITE_URL`,
and the server-only `PINATA_JWT`. This hosts the **web app**; the Solana program is deployed separately
([chain/DEPLOY.md](chain/DEPLOY.md)), and the app shows empty pages until it is.

## Pages

| Route | Page |
| --- | --- |
| `/` | Home: hero + Deed, How it works, live floor, activity, Ending Soon, Recently Sold, Launched, rules, OTC |
| `/auctions`, `/auctions/[address]` | Live Auctions catalogue; auction detail with bid box and history |
| `/coins` | Every coin: search, sort, details dialog |
| `/launch` | Launch (four transactions, resumable) + live Deed preview |
| `/sell` | 6-step listing wizard with Deed ownership verification |
| `/portfolio` | Deeds, coins, auctions, bids, claimable fees, token holdings, history |
| `/otc`, `/otc/token/[mint]`, `/otc/offer/[address]`, `/otc/wallet/[[address]]` | OTC markets, order book, offers (public / private / counter), wallet lookup |
| `/otc/mine` | My Offers: sent, received, trades, notifications |
| `/activity` | On-chain activity feed with filters and notifications |
| `/docs`, `/docs/[slug]` | In-app documentation, rendered from `docs/*.md` |

## Architecture

```
chain/                      the Deed program (Rust/Anchor), tests, local-validator e2e, build + deploy scripts
src/
  app/                      routes (thin) · globals.css = design tokens · api/metadata = IPFS pinning (server-side key)
  chain/                    program.ts (IDL, PDAs, instruction builder) · accounts · events · read · writes · launch · pump · tokens
  components/               layout/ wallet/ ui/ providers/ + one folder per area
  hooks/                    useAsync · useNow (cluster clock) · useTx · useNotifications · useWatchlist
  lib/                      auction · sol · otc · time · solana · config · errors · storage   (pure, tested)
  services/                 types.ts = DeedService · live.ts (the one backend)
  types/                    domain model
```

Design decisions worth knowing:

* **One boundary.** The UI only talks to `DeedService`. There is one implementation, which reads the program's accounts and
  events and builds real transactions.
* **Rules are code, and the program is the authority.** `chain/programs/deed_fun/src/constants.rs` holds every rule;
  `lib/auction.ts` and `lib/otc.ts` mirror them for pre-validation, and tests keep the two in step.
* **Money is `bigint` lamports** in the app and `u64`/`u128` in the program. No floats anywhere in settlement.
* **The fee lock is verified, not trusted.** `register_deed` reads Pump Fees' own account and refuses unless the coin's fees
  are 100 % locked to the Deed vault with the authority revoked, by the coin's creator, with a true 1/1 Deed.
* **Outbid SOL is refunded in the same transaction** as the outbid: no claim step, no stuck funds.
* **Never a false state.** Ownership shown in the UI comes from the chain. Writes are confirmed on chain before the app
  says they worked; a failed transaction is shown with the program's own message. Values the chain can't give a front end
  (24 h fees, USD prices) are shown as "—", not invented.
* **Countdowns use the cluster clock**, not a local timer.
* **Accessible by construction:** native `<dialog>` modals, roving-tabindex tabs, stretched-link cards (no nested controls),
  live regions for toasts and validation, reduced-motion support.

## Docs

The documentation is also **inside the app**: click **Docs** in the top navigation (or open `/docs`). The pages are rendered
at build time from the markdown files in [`docs/`](docs) ([`src/lib/docs.ts`](src/lib/docs.ts) holds the list).

**[HOW_IT_WORKS.md](docs/HOW_IT_WORKS.md) start here: the product, every page, the on-chain design and how the code behaves** ·
[INTEGRATIONS.md](docs/INTEGRATIONS.md) what is verified, trust assumptions, what you must provide ·
[chain/README.md](chain/README.md) and [chain/DEPLOY.md](chain/DEPLOY.md) the program, tests and deployment ·
[REFERENCE.md](docs/REFERENCE.md) what was inspected · [BRAND.md](docs/BRAND.md) design system · [QA.md](docs/QA.md) test results.
