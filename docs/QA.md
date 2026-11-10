# QA report

Everything below was run against the **real program and the real Pump.fun programs**, not a simulation. There are four
layers; each one is reproducible with the command shown.

## Results

| Layer | What it proves | Command | Result |
| --- | --- | --- | --- |
| Rust unit tests | auction/OTC math, Pump `SharingConfig` parser, Token-2022 extension screening | `bash chain/scripts/build.sh unit` | **8 / 8** |
| Program integration (LiteSVM, the compiled SBF binary, real SPL Token / Token-2022 / Associated Token programs) | every instruction and every rule, with attacker cases | `bash chain/scripts/build.sh test` | **16 / 16** |
| Local-validator e2e: **real Pump.fun programs** + the Deed program + the app's service layer | launch → fee lock → real Pump buy → sweep + distribute → claim; auctions, anti-sniping, settlement; OTC; Pump-only launch, then upgrade to a Deed after it has traded | `npm run test:e2e` | **15 / 15** (launch + service) |
| Browser e2e: the real app in Edge, a flagged test wallet signing real transactions | launch form → four transactions → Deed in the wallet; Portfolio claim; bid rules, outbid refund, settle; launch with no Deed program on the network; no-simulation crawl | `npm run test:e2e` (`chain/e2e/ui.e2e.test.ts`) | **5 / 5** |
| TypeScript / unit | `tsc --noEmit`; auction rules, SOL precision, **parity with the program's vectors**, launch guards | `npm run typecheck`, `npm test` | clean / **50 / 50** |

### What the program tests cover (`chain/programs/deed_fun/tests/deed.rs`)

* **Config:** only the program's upgrade authority can initialise; an unfunded treasury is refused; a second init fails.
* **`register_deed`:** accepted only when Pump's sharing config is owned by Pump Fees, at the coin's PDA, active, with the
  admin revoked, the signer as admin, and the shareholders exactly `[vault, 10 000 bps]`; refused for a forged account,
  unrevoked authority, partial/other/empty shareholders, paused config, an unfunded vault, a thief using their own Deed mint,
  supply 2, a mint or freeze authority still present, 9 decimals, a Token-2022 mint with a `PermanentDelegate`, and a second
  registration.
* **`claim_fees`:** pays everything above the vault's rent floor to the holder; nothing to claim → error; a non-holder is
  refused; the right moves with the Deed.
* **Auctions:** limits (min start 0.01 SOL, 10 min – 7 days); non-holder can't list; bid rules (first bid ≥ start, then
  ≥ current + MAX(5 %, 0.1 SOL), exact boundaries at 1 / 2 / 10 SOL); seller and current highest bidder can't bid; wrong
  "previous bidder" account refused; the outbid wallet is refunded **in the same transaction** and only the highest bid stays
  escrowed; no bid after the end; anti-sniping (301 s no, 300 s yes, chaining, ended no); settlement (1 % fee to the
  treasury, price − 1 % to the seller, Deed to the winner, escrow closed, nothing left in the auction), early settle refused,
  redirected payout refused, double settle refused, new owner claims fees, old owner can't; cancel only before bids, free,
  Deed returns, no fee, re-listing uses the next nonce.
* **OTC:** sell and buy offers on both SPL Token and Token-2022; escrow; minimum fill; rounding (buyer up, seller down, last
  fill exact, total paid = price); 0.5 % fee to the treasury from the token seller's side; the final fill closes the offer
  and returns rent; private offers (stranger refused, counterparty can fill or reject, rejection returns the escrow);
  expiry; cancel; buy-bid cancel returns all SOL; input validation; mints with a freeze authority or a dangerous
  Token-2022 extension refused.

### What the local-validator suites cover

* `chain/e2e/launch.e2e.test.ts`: only the upgrade authority can initialise; the real `launch()` (four transactions) against
  the **cloned mainnet Pump binaries**: Pump's own `SharingConfig` shows `adminRevoked`, one shareholder = the Deed vault,
  10 000 bps; the Deed program recorded it; the Deed is a true 1/1 with no authorities; a real `buy_exact_quote_in_v3` creates
  fees; Pump's sweep + distribute move them into the vault; `claim_fees` pays the holder and leaves only the rent floor.
* `chain/e2e/service.e2e.test.ts`: `LiveDeedService` end to end. Notably: the number the UI shows as *claimable* is **exactly**
  the `FeesClaimed` amount the program pays; an outbid wallet's balance rises by exactly its bid, in the other bidder's
  transaction; settlement pays the treasury exactly 1 % and the seller at least price − 1 %; anti-sniping extends only
  inside the window; a finished OTC offer's account is gone and its history is rebuilt from events; program errors reach
  the user in the program's own words.
* `chain/e2e/ui.e2e.test.ts`: see below.

A **test-only build** (`build.sh e2e`, 5-second auctions, 2-second anti-snipe window) is used for the validator suites so
settlement can be exercised without waiting; it is written to `target-out/e2e/` and `deploy.sh` refuses it.

### Browser run

The browser suite starts its own app server (port 3101, own build dir) with `NEXT_PUBLIC_SOLANA_CLUSTER=localnet` and a flagged
"E2E Burner" wallet (a real keypair wallet, never created on mainnet), then drives Edge through the actual screens and checks
every outcome on chain:

* **Launch from the form:** fills name/ticker/description/image → four confirmed transactions → success panel → the Deed
  token is in the wallet and `DeedState` exists on chain → the Portfolio shows it. No console errors.
* **Claim from the Portfolio:** a real Pump buy creates fees → *Fees* tab → *Claim* → the wallet balance rises on chain and
  the toast says so.
* **Bidding:** the bid box blocks a below-minimum bid inline and disables the button; a bid through the confirm dialog
  escrows SOL and the page says "You hold the highest bid"; a rival outbids and the wallet is refunded in that same
  transaction; after the on-chain end time the UI user presses *Settle Auction* and the auction becomes `Settled`.
* **Launch with no Deed program:** the page is told the Deed program does not exist (one RPC answer replaced; everything else, including the launch transaction, goes to the real validator). It shows the Pump.fun-only notice and the *LAUNCH ON PUMP.FUN* button, sends ONE transaction, the real coin exists on chain, no Deed state exists, and the coin is listed on the Launch page as waiting for its Deed.
* **No-simulation crawl:** twelve pages (app and docs) contain no simulated data, tags, tools or modes.

## Visual comparison with tryauction.fun (Phase 14)

Both sites were captured at 1440×900, 1280×800, 768×1024 and 390×844 and compared side by side (`scripts/qa/compare.mjs`)
and numerically (`measure.mjs`, desktop home). These measurements were taken before the move to the real backend; the
layout code was not changed by it, but they should be re-run (`node scripts/qa/measure.mjs`) with data on the page.

| Element | Reference | Deed |
| --- | --- | --- |
| Content width | 1380 | **1380** |
| Hero column / right rail | 998 / 360 | **998 / 360** |
| Header height | 70 | **70** |
| Live-floor card | 998 × 234 | 998 × 236 (chalk theme) |
| Activity rail | 360 × 234 | 360 × 236 (chalk theme) |
| Nav link height | 39 | **39** |
| Stats row | 998 × 71 | 998 × 72 |
| Coin card | 333 × 154 | **333** × 153 |
| Large button | 140 × 58 | 167 × 55 (the hand-lettered face is wider than the reference's condensed one) |

Known, deliberate differences: the chalkboard visual language, the logo, the hero art (the Deed certificate and original
doodles replace the pixel auctioneer), the mobile header (compact bar + drawer), the 4-row activity rail, and market cap
shown in SOL (no price feed is invented).

## Defects found while testing (all fixed)

| # | Defect | Found by |
| --- | --- | --- |
| 1 | The compiled program was built for SBPF v3 (Anchor 1.2's default), which LiteSVM rejects and mainnet may not run: the build now forces `--arch v0` and the deploy script refuses v3 | first integration run |
| 2 | `settle_auction` edited lamports directly and *then* made token CPIs → the runtime rejected the instruction as unbalanced; CPIs now run first, direct lamport moves last | integration test |
| 3 | A new Deed registration test hit the wrong constraint first (constraint order) and a "thief" test didn't model the real attack: rewritten around a thief with their own clean 1/1 mint | integration test |
| 4 | Anchor's ESM build evaluated `exports` on the server and crashed every page → externalised for SSR, and server-rendered modules no longer import it | dev server |
| 5 | The test wallet emitted its `connect` event synchronously, before the wallet provider had registered its listener, so the picker never closed (real wallets are asynchronous; the test adapter now yields first) | browser run |
| 6 | The reader's 8 s cache made a transaction made outside the app invisible in tests: the service now exposes `invalidate()` (and drops caches after every write) | service e2e |
| 7 | Bid history of two bids in the same second came back in arbitrary order: it is now ordered by slot | service e2e |
| 8 | Program error text came back with trailing JSON punctuation (`." ]`): the parser now stops at the message's end | service e2e |
| 9 | A buy-bid fill by a wallet with no token account failed with a raw "AccountNotInitialized": it now says "You don't hold enough of this token" | service e2e |
| 10 | The connect handler swallowed every wallet error silently: non-cancellation errors are now shown | browser run |

## Not tested / limits (read this before relying on it)

* **No independent security audit.** The program holds escrowed funds; get one before mainnet.
* **No real wallet extension was driven.** Phantom/Solflare cannot run in headless Edge. The signing path is exercised with a
  keypair wallet through the standard adapter; the extension's own prompt, account switching and network mismatch are not.
* **Nothing was sent to mainnet by this repo.** The validator suites run Pump's *mainnet binaries* but on a local ledger.
  Re-run them against a fresh clone before a release, because Pump's programs change.
* **Client-side indexer limits.** The activity feed and bid history read the program's most recent transactions through the
  RPC (150 for the global feed, 100 per record). Fine for early volume; use an RPC with full history or a real indexer beyond
  that. 24 h / 7 d fee history and USD values are not derivable from the chain and are shown as "—".
* **Browsers:** Edge (Chromium) only. Not run in Firefox or Safari. Screen readers not run manually (axe only).
* The accessibility audit (axe-core, 15 pages, against the real backend with data) found one moderate issue (the loading skeleton had no level-one heading); it is fixed. Responsive overflow checks were done on the
  simulation-era build; the layout code is unchanged but they have not been re-run against the real backend.
* Hidden states of the reference that need a connected Phantom wallet could not be inspected on the original; they were rebuilt
  from its behaviour as described in [REFERENCE.md](REFERENCE.md#5-could-not-be-inspected).
