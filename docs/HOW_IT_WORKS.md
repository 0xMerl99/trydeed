# How Deed works

**OWN THE FEES.** Launch a coin. Receive the Deed. Auction the rights.

This guide explains the product (what a Deed is and how auctions and OTC trades work), how to use every page, what the
program does on chain, and how the code underneath behaves. It is accurate to the current build and is also published
inside the app: open **Docs** in the top navigation (`/docs`).

> **Read this first.** Everything in the app is real: there is no simulation mode. Every action is a Solana transaction that
> *you* sign, and every rule is enforced by the **Deed program** (Rust/Anchor, in [`chain/`](../chain)), not by this website.
> The program is tested (LiteSVM + a local validator running the **real Pump.fun programs**), but it has **not been
> independently audited**, and it is only live on a network after *you* deploy it. What is verified, what is not, and what
> you must provide: [INTEGRATIONS.md](INTEGRATIONS.md).

**Contents**
1. [The idea in one minute](#1-the-idea-in-one-minute)
2. [Glossary](#2-glossary)
3. [The life of a coin](#3-the-life-of-a-coin)
4. [Auction rules, with worked examples](#4-auction-rules-with-worked-examples)
5. [OTC trading](#5-otc-trading)
6. [Using the app, page by page](#6-using-the-app-page-by-page)
7. [Wallets](#7-wallets)
8. [What happens on chain](#8-what-happens-on-chain)
9. [How the code works](#9-how-the-code-works)
10. [Money, time and precision](#10-money-time-and-precision)
11. [Running and testing](#11-running-and-testing)
12. [Troubleshooting](#12-troubleshooting)
13. [Where things live](#13-where-things-live)

---

## 1. The idea in one minute

Every coin launched on Pump.fun earns **creator fees** whenever it trades. Normally those fees belong to whoever
launched the coin, and the right to them can't be sold separately from the wallet.

Deed makes that right a **thing you can own and sell**:

1. **Launch** a coin through Deed.
2. You receive a unique **1/1 Ownership NFT, the Deed**.
3. The Deed controls **100 % of the coin's creator fees**. Whoever holds it can claim them.
4. **Hold** the Deed and keep claiming, or **auction** it. The highest bidder receives the Deed and takes over all
   *future* fee rights. The seller gets the SOL.

On top of that, **OTC Markets** let two wallets trade a large token position directly, priced in SOL, without going
through a liquidity pool, so it doesn't move the public chart.

What is for sale is **the fee rights, not the coin's token supply**. The app repeats this wherever you bid.

## 2. Glossary

| Term | Meaning |
| --- | --- |
| **Deed** | The unique 1/1 Ownership NFT for one coin (a Token-2022 mint with supply 1, no mint or freeze authority). Holding it = owning that coin's creator-fee rights. |
| **Fee vault** | A program-owned account (a PDA) that is the *only* recipient of the coin's creator fees. Only the Deed holder can withdraw from it. |
| **Creator fees** | SOL earned from trading the coin. *Lifetime* = claimed + claimable. *Unclaimed / claimable* = what you can withdraw right now (in the vault, plus what Pump still holds for the coin). |
| **Claim** | Withdraw the claimable fees to your wallet. Only the Deed holder can. Fees that haven't been claimed travel with the Deed to the next holder. |
| **Lot / auction** | A Deed listed for sale with a starting bid and an end time. |
| **Escrow** | While an auction runs, the Deed sits in a token account owned by the auction (not the seller) and the highest bid sits in the auction account. |
| **Outbid** | Someone placed a higher valid bid. Your SOL is **returned to your wallet in that same transaction**: there is nothing to claim. |
| **Settle** | After the end time, *anyone* can finalize: the Deed goes to the winner, the SOL (minus fee) to the seller. |
| **Lamport** | 1 SOL = 1,000,000,000 lamports. All money in the app is whole lamports. |
| **Offer (OTC)** | A listing to sell tokens (*sell offer*) or to buy them (*buy bid*), priced in SOL. |
| **Maker / taker** | The wallet that creates an offer / the wallet that fills it. |

## 3. The life of a coin

```
  LAUNCH ──► RECEIVE ──► OWN ──────────────► AUCTION ──► (new owner)
  coin on    Deed is     claim fees any      list the     highest bidder gets the Deed
  Pump.fun   minted to   time (or let        Deed; bids   + future fees; seller gets
             you         them accumulate)    in escrow    the SOL minus 1 %
```

### What *Launch* does (four transactions you approve)

| # | Transaction | Why |
| --- | --- | --- |
| 1 | **Pump.fun `create_v2`** | Creates the coin. Pump creates the mint and the bonding curve; you are the creator. |
| 2 | **Pump fee sharing** (`create_fee_sharing_config` + `update_fee_shares_v2`) + a small transfer to the vault | Sets the coin's fee split to **one shareholder, the Deed vault, at 100 %**. Updating the shares revokes the creator's admin authority in the same step, so the split can **never change again**. The transfer pre-funds the vault with the rent-exempt minimum (0.00089 SOL) so Pump's first payout always lands. |
| 3 | **Mint the Deed** | Creates a Token-2022 mint with on-mint metadata, mints exactly one token to you, then **permanently revokes** the mint authority. The metadata is made immutable. |
| 4 | **`register_deed`** (Deed program) | The program **verifies** (from Pump's and the token program's own account data) that the fee split is locked to the vault, that you are the coin's creator, and that the Deed is a true 1/1. Only then does it record the coin ↔ Deed link. |

### Launching before the Deed program is live

If the Deed program is **not** deployed (and initialised) on the network the app is pointed at, the Launch page says so and
switches to a **Pump.fun-only launch**: one transaction that creates the coin on Pump.fun. It needs nothing of ours on chain.
The wallet is the coin's creator and **earns its creator fees directly**, exactly as on pump.fun. What you do *not* get is
a Deed, so there are no tradable fee rights and no auctions for that coin yet. The coin is remembered on that device; once
the Deed program is live, the Launch page offers **Create its Deed** for it, which runs steps 2-4 above (and first sweeps any
creator fees the coin's curve has collected since launch, because Pump will not change the fee split until they are swept;
those earlier fees stay yours to collect on Pump.fun).

The app **never** locks fees to a Deed vault unless the program is there to pay them out: a Deed launch refuses to start
(before sending anything) on a network where the program is missing or uninitialised.

Every step first checks the chain, so an interrupted launch (a rejected prompt, a closed tab) **resumes** instead of
repeating anything: the launch page offers *Finish the launch*. Total cost is network fees plus about 0.01 SOL of account
rent (the coin and Deed accounts, the registry entry, the vault's rent floor).

*Why a separate vault?* So that "whoever holds the Deed" can be enforced by a program rather than by trust. Pump pays the
fees into the vault; `claim_fees` pays the vault out to whoever holds the Deed token at that moment.

A Deed is always in exactly one of three states, shown as a pill on every coin card:

| State | Meaning | Who can claim fees |
| --- | --- | --- |
| **Held by owner** | In a wallet, not listed. | That wallet. |
| **On auction** | In the auction's escrow account. | Nobody until it settles or is cancelled; the fees keep accruing in the vault for the next holder. |
| **Sold Nx** | Changed hands N times via auctions. | The current holder. |

An auction itself moves through these states:

```
 LIVE ──(time runs out)──► ENDED ──(someone settles)──► SETTLED   (has bids: Deed → winner)
   │                          └─ no bids: the seller cancels ───► UNSOLD     (Deed → seller)
   └─(seller cancels, only before the 1st bid)─► CANCELLED
```

`ENDED` is a real, visible state: the clock has stopped but nobody has settled yet. The page then shows
**Settle Auction**, and any wallet may press it.

## 4. Auction rules, with worked examples

The rules are **enforced by the program** ([`chain/programs/deed_fun`](../chain/programs/deed_fun)) and mirrored in
[`src/lib/auction.ts`](../src/lib/auction.ts) so the UI can pre-validate and explain. A test checks that the two agree.

### Fees: 1 % on completed sales only

| Action | Cost |
| --- | --- |
| List a Deed | free (network fee + the auction account's rent) |
| Place a bid | free (network fee) |
| Cancel (before the first bid) | free |
| **Completed sale** | **1 % of the winning bid, paid by the seller** |
| No bids / cancelled | no fee |

Example: a Deed sells for **12.5 SOL**. Fee = 0.125 SOL. Seller receives **12.375 SOL**. At a 1.5 SOL starting bid the
Sell wizard shows "You receive at the starting bid: 1.485 SOL".

### Minimum bid = current bid + MAX(5 % of it, 0.1 SOL)

The *first* bid only has to meet the starting price. After that, each bid must beat the current one by **5 % or
0.1 SOL, whichever is greater**.

| Current bid | 5 % | Increment used | Minimum next bid |
| --- | --- | --- | --- |
| *(no bids, start 2.00)* | — | — | **2.00** |
| 0.50 | 0.025 | 0.1 (floor) | **0.60** |
| 1.99 | 0.0995 | 0.1 | **2.09** |
| 2.00 | 0.10 | 0.1 (tie) | **2.10** |
| 3.50 | 0.175 | 0.175 | **3.675** |
| 10.00 | 0.50 | 0.5 | **10.50** |
| 100.00 | 5.00 | 5 | **105.00** |

The 5 % share is rounded **up** to the next lamport so the rule is never under-enforced. The bid box shows the exact
minimum, pre-fills it, offers quick-bid chips, and explains any rejection inline. You can't bid on your own auction, and
you can't outbid yourself while you hold the highest bid.

### Outbid SOL comes back automatically

Your bid moves into the auction account when you bid. When someone outbids you, **the same transaction** that places their
bid sends your SOL back to your wallet. There is no "claim refund" step and no state in which you are out of pocket.
(Crediting lamports to a wallet cannot fail, so a hostile bidder can't make a refund revert and block the auction.)

### Anti-sniping: a late bid extends the auction by 5 minutes

A bid placed in the **final five minutes** pushes the end time out **by five minutes**. Bids earlier than that change
nothing. It can chain.

Auction ends at 12:00:00:

| Bid placed at | Time left | New end |
| --- | --- | --- |
| 11:50:00 | 10 min | 12:00:00 (unchanged) |
| 11:57:00 | 3 min | **12:05:00** |
| 12:04:00 | 1 min | **12:10:00** |
| 12:10:01 | — | rejected: the auction has ended |

The extension is flagged in the bid history ("extended +5:00") and in a banner on the bid box. The original product's copy
says the end moves "to 5 minutes from the bid"; your brief says "by five minutes", which is what is built (see
[INTEGRATIONS.md](INTEGRATIONS.md#decisions-to-confirm)).

### The end time is the chain's, not your browser's

The end time is stored in the auction account and compared with the cluster's clock by the program. Every countdown
(card, ticker, bid box, floor) is computed against **cluster time**, synced every 60 s. Two people with different system
clocks see the same countdown.

### Listing rules (Sell)

* Only the **current holder** of a Deed can list it (the program checks the token account).
* Starting bid **≥ 0.01 SOL**.
* Duration: 10m, 15m, 30m, 1h, 6h, 12h, 24h, 3d or 7d (the program accepts 10 minutes to 7 days).
* Listing moves the Deed into escrow. **Cancel is only possible before the first bid.**
* An auction with no bids at its end is cancelled by the seller (no fee); anyone may settle one that has bids.

## 5. OTC trading

OTC lets a wallet sell or buy **a Solana SPL or Token-2022 token** for SOL, directly with another wallet. It never touches
liquidity pools, so it can't move the public chart.

### Two kinds of offer

| Offer type | **Sell offer** | **Buy bid** |
| --- | --- | --- |
| Maker wants to | sell tokens for SOL | buy tokens with SOL |
| What gets locked | the **tokens** (in an escrow token account) | the **SOL** (in the offer account) |
| A taker *buys* / *sells* | buys from it | sells into it |

A fill swaps both sides **atomically in one transaction, or nothing happens**.

### Price, amount, total

You enter an **amount** and either a **price per token** or a **total price**. The other recalculates as you type
(price × amount = total, and back), using exact integer math. Example: 1,000 EMBR at 0.0005 SOL = **0.5 SOL**; change
the total to 1 SOL and the price becomes **0.001**.

### Fee

**0.5 % of the SOL leg, paid by the token seller.** Selling 1,000 EMBR for 1 SOL: fee 0.005, you receive **0.995 SOL**. The
confirm dialog shows *You send / You receive / Platform fee* before anything is signed. (0.5 % is an assumption carried
over from the original; see [INTEGRATIONS.md](INTEGRATIONS.md#decisions-to-confirm).)

### Options when creating an offer

* **Partial fills**, with an optional minimum fill. Without it the offer is **all-or-nothing**.
* **Expiry**: 1h, 6h, 24h, 3d, 7d or 30d (the program accepts one minute to a year).
* **Private offer**: only one named wallet can fill or reject it.
* **Which tokens?** The program refuses mints that could freeze, drain or alter escrowed tokens: a **freeze authority**, or
  any Token-2022 extension other than metadata (transfer fee, transfer hook, permanent delegate, default-frozen accounts,
  close authority…). The market page says exactly why a token is unsupported and disables offers. Wrapped SOL is
  unsupported too (it is the payment asset).

### Rounding on partial fills

When the remaining amount doesn't divide evenly, the party **paying SOL rounds up** and the party **receiving SOL
rounds down**; the **last fill takes the exact remainder**, so not a single lamport is lost or created. (3 tokens for
10 lamports: buying 1 costs 4, selling 1 receives 3, and the sum of fills always equals the total.)

### Negotiating

On a public or private offer you can **Counteroffer**: that creates a *private* offer back to the maker with your terms (a
buy bid if they were selling, a sell offer if they were buying), linked to the original. The page shows the whole
**negotiation thread**.

### Offer states

| State | Meaning |
| --- | --- |
| **Active** | Open and fillable. |
| **Partially filled** | Some filled, some remaining. |
| **Accepted** | Fully filled. The offer's account closes itself and the maker gets the rent back. |
| **Cancelled** | The maker cancelled and got the escrow back. |
| **Rejected** | The private counterparty rejected it; the escrow went back to the maker. |
| **Expired** | Time ran out. Fills are refused; the escrow stays until the maker presses **Close** to take it back. |

Finished offers no longer exist as accounts (their rent is returned); their history is rebuilt from the program's events.
**My Offers** has *Sent*, *Received*, *Trades* and *Notifications* tabs.

> **A scam warning is built in.** Anyone can list any supported token; names and logos come from token metadata and can be
> copied. Every token page shows the **full mint address** with Copy so you can compare it.

## 6. Using the app, page by page

| Page | What it does | Key controls |
| --- | --- | --- |
| **Home** `/` | Overview: hero with a live Deed certificate, *How it works*, the **live auction floor**, live activity, Ending Soon, Recently Sold, Launched, the auction rules, and the OTC band. | *Launch a Coin*, *View Live Auctions*, *Place a Bid* |
| **Live Auctions** `/auctions` | Catalogue of live lots. | Sort chips (Ending Soon, Newest, Highest Bid, Highest Lifetime Fees, Most Bids, Ended), search by name/ticker/mint |
| **Auction detail** `/auctions/…` | One lot: fees, bid history, and the **bid box** (current bid, minimum next bid, countdown, input, quick bids, escrow notes, seller/Deed/mint/fee facts). | *Place Bid*, *Settle Auction*, *cancel it* (seller, before first bid) |
| **Coins** `/coins` | Every coin launched through Deed. Cards open the auction if it's on sale, otherwise a **details dialog**. | Sort (Newest, Market cap, Lifetime fees, On auction, Sold), search incl. creator |
| **Launch** `/launch` | Create a coin: name, ticker, description, image (png/jpg/gif/webp ≤ 1.5 MB), X, Telegram. A live **Deed certificate preview** updates as you type. | *LAUNCH COIN* → four-step progress → success panel with mint, certificate and *Start Auction* (or, while the Deed program is not live: *LAUNCH ON PUMP.FUN*, one step) |
| **Sell** `/sell` | 6-step wizard: Select Deed → Fee analytics (with **"Deed verified"**) → Starting bid → Duration → Summary → Start. | Wallet required |
| **Portfolio** `/portfolio` | Summary tiles + tabs: My Deeds, My Coins, My Auctions, My Bids, Fees, Token holdings, History. | *Sell on Auction*, *Claim X SOL* |
| **OTC Markets** `/otc` | Stats, search by name/symbol/**mint**, sortable markets table, recent trades. | *Open market*, *Wallet lookup* |
| **Token market** `/otc/token/…` | Token facts, best ask/bid, order book, trades, and the **make-offer form**. | Sell/Buy toggle, partial fills, private offer |
| **Offer** `/otc/offer/…` | One offer: fill form, fills, negotiation, state, details. | *Review purchase/sale*, *Counteroffer*, *Cancel*, *Reject*, *Close* |
| **Wallet lookup** `/otc/wallet` | Public token balances of any wallet; send its owner a private bid. | *Make OTC offer* |
| **My Offers** `/otc/mine` | Your OTC desk (see §5). | Tabs, filters |
| **Activity** `/activity` | The event feed: bids, listings, completed auctions, fee claims, launches, OTC trades, each with its transaction signature. | Filters: All, Bids, Auctions, Deeds, OTC, Launches, My wallet |

**What the chain can't tell the app.** Dashes (—) mean "not derivable without a full-history indexer": *24 h / 7 d fees*.
Market cap is shown **in SOL**, computed from Pump's bonding-curve reserves, because a USD figure would need a price feed
this app doesn't invent. "Recently sold" and the activity feed come from the program's recent events (see §9).

**Header & chrome.** Search (typing goes to `/coins?q=…`), notification bell (when connected), the wallet button, and a
ticker of recent events with the **total creator fees** pinned right. Below 1200 px the nav becomes a slide-over **menu**.
The watch hearts on cards save to your browser only.

## 7. Wallets

* **Connect.** *Connect Wallet* opens a picker listing detected wallets (Phantom, Solflare, and any Wallet-Standard wallet).
  Not-installed wallets link to their install page.
* **Every write is signed in your wallet** and confirmed on chain before the app says it worked. A transaction that
  fails on chain is reported as a failure, with the program's own message ("The bid is below the minimum next bid.").
* **Connected state.** A green-dot short address with a menu: Portfolio, My Offers, Copy address, Switch wallet,
  Disconnect (and your SOL balance).
* **Persistence.** The wallet is remembered and auto-reconnects. Disconnect forgets it.
* **Account switching.** If the wallet switches account, every wallet-scoped screen reloads for the new address and a toast
  says "Wallet changed to …". Data from the previous account is dropped, never shown.
* **Gated pages.** Sell, Portfolio and My Offers show "Connect your wallet" until connected. Actions on other pages (bid,
  launch, offer) open the picker on demand and then continue.
* **Network check.** The RPC's genesis hash is compared to the cluster the app is configured for. On a mismatch a red banner
  appears **and the app refuses to send any transaction.** On a test network a gold banner says funds are not real. (A
  wallet extension's own network setting can't be read through the adapter, so it isn't verified.)
* **Test wallet.** Automated browser tests use a flagged "E2E Burner" wallet (a key from an env var) against a local
  validator. It is never created when the cluster is `mainnet-beta`.

## 8. What happens on chain

### Accounts (all PDAs of the Deed program)

| Account | Seeds | Holds |
| --- | --- | --- |
| `Config` | `["config"]` | admin (may change the treasury) and the fee **treasury**. Created once, by the upgrade authority only. |
| `DeedState` | `["deed", coin_mint]` | the coin ↔ Deed link, the Pump sharing config, the creator, lifetime claimed, auction counter |
| Fee vault | `["vault", coin_mint]` | a plain system account that Pump pays creator fees into; paid out only by `claim_fees` |
| `Auction` | `["auction", deed_mint, nonce]` | seller, prices, **end time**, highest bidder/bid, status. Its lamports hold the highest bid; its token account holds the Deed. |
| `Offer` | `["offer", maker, nonce]` | an OTC offer. Its token account (sell) or its lamports (buy) hold the escrow. |

### Instructions

| Instruction | Who | Does |
| --- | --- | --- |
| `initialize`, `update_config` | upgrade authority / admin | set the fee treasury |
| `register_deed` | the coin's creator | verifies the fee lock + the 1/1 Deed, records the link |
| `claim_fees` | the Deed holder | pays the vault's balance (above its rent floor) to the holder |
| `create_auction` | the Deed holder | escrows the Deed, opens the auction |
| `place_bid` | anyone but the seller | escrows the bid, **refunds the previous bidder in the same transaction**, applies anti-sniping |
| `settle_auction` | anyone, after the end | Deed → winner, price − 1 % → seller, 1 % → treasury, closes the escrow |
| `cancel_auction` | the seller, before the 1st bid | returns the Deed |
| `close_auction` | the seller, after it finished | reclaims the auction account's rent |
| `create_sell_offer`, `create_buy_offer` | anyone | escrow tokens / SOL, open the offer |
| `fill_sell_offer`, `fill_buy_offer` | a taker | atomic swap with the fee; the last fill closes the offer |
| `close_sell_offer`, `close_buy_offer` | the maker (cancel) or the named counterparty (reject) | returns the escrow, closes the offer |

### How the fee lock is verified (the trust model)

`register_deed` reads Pump Fees' `SharingConfig` account for the coin and requires: its address is the PDA derived from the
coin mint **and** it is owned by the Pump Fees program (so it can't be a forged account); its status is active; its admin
is the signer (so only the creator can register, and nobody can register a Deed for someone else's coin); **the admin
authority has been revoked**; and **the shareholders are exactly `[vault, 10 000 bps]`**. It also requires the Deed mint to
be 0-decimal with supply 1, no mint authority, no freeze authority and only metadata extensions.

What this relies on: Pump's own programs behave as published. After the authority is revoked, the split is fixed by Pump,
**except through Pump's privileged `admin_cto_sharing_config` instruction**, which needs Pump's own authority key. That is a
trust assumption in Pump, not in Deed; it is stated plainly in [INTEGRATIONS.md](INTEGRATIONS.md#trust-assumptions).

## 9. How the code works

### The shape of it

```
Browser
 │
 ├─ app/…/page.tsx            thin server files: metadata + render one client "View"
 │
 ├─ components/…View.tsx      the screens. Read with hooks, write with useTx.
 │      ▲ reads                         │ writes
 │      │                               ▼
 │   useData()  (platform-wide)    useTx().run(ctx => service.method(...))
 │   useAsync() (per page)
 │
 ├─ components/wallet         DeedWallet = wallet-adapter (Phantom / Solflare / Wallet Standard)
 │
 └─ services/getService() ──► DeedService  (the ONLY thing the UI knows about the backend)
                                 └─ LiveDeedService
                                      ├─ chain/read.ts     program accounts + events + Pump + token programs → domain model
                                      ├─ chain/writes.ts   IDL-built transactions: bid, settle, claim, offers…
                                      └─ chain/launch.ts   the four-transaction launch (uses Pump's official SDK)
```

**One boundary.** Components never touch the chain directly. They call `getService()`.

### Reading data

There is no server database. [`chain/read.ts`](../src/chain/read.ts) builds a snapshot (cached 8 s) from:

* **Accounts**: `getProgramAccounts` filtered by the account discriminator → auctions, offers, Deed registry.
* **Events**: every state change emits an Anchor event. The most recent transactions of the program are read and decoded
  ([`chain/events.ts`](../src/chain/events.ts)) for bid history, fills, claims and the activity feed. Finished offers
  and closed auctions are rebuilt from their own events.
* **Pump and the token programs**: the bonding curve (market cap, un-swept fees), the vault balance, the Deed's holder, and
  each token's on-chain metadata, with its off-chain JSON fetched through a public IPFS gateway.

This client-side indexer is exact for what it returns and complete for early volume. Beyond that, use an RPC with full
history and/or replace the module with a Geyser/webhook indexer (the `DeedService` boundary means no UI change).

| Data | Refresh |
| --- | --- |
| Platform-wide (status, auctions, coins, activity) | 20 s |
| Auction detail, OTC offer | 15 s |
| Portfolio, Sell, OTC markets/token, My Offers | 20 s |
| Notifications (bell) | 45 s |
| Cluster clock sync | 60 s |

### Writing (one path for every action)

[`useTx().run`](../src/hooks/useTx.ts) is the only way a page performs a write:

```
click "Place Bid"
  → validate locally (lib/auction.validateBid) and show the confirm dialog
  → run(ctx => service.placeBid(ctx, …))
       1. wallet.connect()        opens the picker if needed; refuses if the RPC is the wrong cluster
       2. wallet.txContext()      { wallet, connection, send } built from a ref, never a stale closure
       3. service.placeBid(…)     build the instruction from the IDL → wallet signs → send → wait for CONFIRMED
       4. toast the receipt       the message names the real result
       5. refresh()               reload platform data; the page reloads its own
  → on error: friendlyError() shows the program's own message, or "You cancelled in your wallet. Nothing was sent."
```

### Time

[`useNow`](../src/hooks/useNow.ts) is one shared 1-second clock. `ClockSync` measures `clusterTime − Date.now()` every
minute and feeds an offset, so `useNow()` returns **cluster-adjusted** time. Every `Countdown` renders against it.

### Error handling and loading

* Pages show **skeletons** while loading and an **ErrorState** (with *Try again*) on failure, never a blank page.
* A route-level **error boundary** ([`app/error.tsx`](../src/app/error.tsx)) catches render crashes; **404** has its own page.
* Empty states are written per page.

### Persisted in your browser

| Key | What |
| --- | --- |
| `deed.wallet` | The wallet-adapter's remembered wallet |
| `deed.watchlist` | Hearted coins and auctions |
| `deed.nseen.<address>` | When you last read notifications (drives the bell badge) |
| `deed.launches.<address>` | Coins this device launched that have no finished Deed yet (coin and Deed addresses only; **no keys**), so they can be upgraded or resumed |

Storage can be blocked (private mode); every read/write is guarded and the app still renders.

## 10. Money, time and precision

* **All money is `bigint` lamports.** There is no floating-point in settlement math (the program uses `u64`/`u128`).
* SOL input is parsed **strictly**: digits and one dot, at most **9 decimals**, no signs, no exponents (`1e3` is rejected).
  `0.1 + 0.2` is exactly `0.3`.
* Display uses at least 2 decimals and trims the rest; amounts you must match exactly (bids) show full precision
  (3.675, not 3.68). Tiny non-zero values never display as `0.00`.
* Token amounts are `bigint` base units with the token's own decimals.
* **Addresses are never re-cased.** Base58 is case-sensitive, so addresses are shown exactly as they are even inside
  uppercase labels.

## 11. Running and testing

```bash
npm install
cp .env.example .env.local     # set the RPC (and, for launches, PINATA_JWT)
npm run dev                    # http://localhost:3000
npm run build && npm start
npm test                       # unit tests (rules, SOL precision, OTC rounding, program parity)
npm run typecheck
```

The program and its tests (Rust, in WSL on Windows; see [`chain/README`](../chain/README.md)):

```bash
bash chain/scripts/build.sh unit     # unit tests
bash chain/scripts/build.sh test     # build (SBPF v0) + 16 LiteSVM integration tests against the real binary
bash chain/scripts/build.sh e2e      # test-only build with short auction timers (never deployable)
bash chain/e2e/validator.sh          # local validator: REAL Pump.fun programs cloned read-only from mainnet + the Deed program
npm run test:e2e                     # the app's real service layer against that validator
```

Browser checks (need a running app; the QA scripts are described in [QA.md](QA.md)).

Configuration is in `.env.local` (see `.env.example`): `NEXT_PUBLIC_SOLANA_CLUSTER`, `NEXT_PUBLIC_SOLANA_RPC_URL`,
`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_IPFS_GATEWAY`, `NEXT_PUBLIC_PRIORITY_FEE_MICROLAMPORTS`, and the server-only
`PINATA_JWT`.

## 12. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| "Wrong network" red banner, writes refused | The RPC isn't the cluster in `NEXT_PUBLIC_SOLANA_CLUSTER`. Fix the RPC URL. |
| Pages say they couldn't load data | The public Solana RPC rate-limits or blocks browsers (and `getProgramAccounts`). Set `NEXT_PUBLIC_SOLANA_RPC_URL` to a dedicated endpoint. |
| "The Deed program has not been initialised on this network" | Run `chain/scripts/initialize.mjs` once after deploying (see `chain/DEPLOY.md`). |
| Launch fails with "Metadata hosting is not configured" | The server needs `PINATA_JWT` (image + metadata pinning). Nothing was created. |
| A launch stopped halfway, or a coin has no Deed yet | Open **Launch**: the list of your coins without a Deed offers *Create its Deed* / *Finish its Deed*, which resumes from the step that hasn't happened yet. Nothing is repeated. |
| "The transaction expired" | The network was busy; nothing was spent. Try again, or raise `NEXT_PUBLIC_PRIORITY_FEE_MICROLAMPORTS`. |
| Wallet button does nothing | No extension detected: install Phantom or Solflare and refresh. |
| Unstyled page after a build | A build was interrupted. Re-run `npm run build` fully (don't pipe it into `head`). |
| Port already in use | Another server holds it. `npm run dev -- -p 3001`. |

## 13. Where things live

```
chain/                    the Deed program (Rust/Anchor), its tests, the local-validator e2e suite, build + deploy scripts
src/
  app/                    routes (thin), globals.css (design tokens), error/404, api/metadata (IPFS pinning)
  chain/                  program.ts (IDL, PDAs, instruction builder) · accounts · events · read · writes · launch · pump · tokens
  components/
    layout/               Header, MobileMenu, Ticker, Footer, NetworkGuard, ClockSync
    wallet/               DeedWallet (provider+hook), WalletPicker, ConnectButton, ConnectGate, burner (test wallet)
    ui/                   Button, Modal, Toast, Tabs, Avatar, Countdown, Pill, States, Explorer, Icons, Logo…
    deed/                 DeedCertificate (the Deed as a document)
    home/ auctions/ coins/ launch/ sell/ portfolio/ otc/ activity/    one folder per area
    providers/            DataProvider, AppProviders
  hooks/                  useAsync, useNow, useTx, useNotifications, useWatchlist
  lib/                    auction, sol, otc, time, solana, config, errors, storage, format   (pure + tested)
  services/               types.ts (DeedService) · live.ts
  types/                  the domain model
docs/                     this guide + REFERENCE, BRAND, INTEGRATIONS, QA
scripts/qa, scripts/brand test tooling and asset generation
```

To change a **rule**, edit the program (`chain/programs/deed_fun/src/constants.rs`) *and* `lib/auction.ts` / `lib/otc.ts`
(and the tests beside them). To change **copy or layout**, edit the `*View.tsx` for that page. To change **colors or type**,
edit the tokens at the top of `app/globals.css`.
