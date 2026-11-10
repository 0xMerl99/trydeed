# Reference inspection — tryauction.fun

Captured 2026-11-10 with a real browser (Edge, headless via playwright-core) at 1440×900, 1280×800, 768×1024 and
390×844. Every nav route was loaded in its **disconnected** state. Source of truth for what Deed reproduces.

> **Scope note.** Deed is an independent implementation. Layout, information architecture, flows and
> interaction patterns follow the reference. Code, art, fonts, copy, contract addresses and API payloads are **not**
> copied: all code here is written from scratch and every on-chain identifier of the reference product was ignored.

## 1. Application model

Vanilla-JS single-page app, hash routed, one `#app` mount, a data layer that polls a same-origin JSON API every 20 s.
Wallet = a single provider (Phantom) with a "Connect Wallet" button, no picker.

| Hash route | Nav item | Page |
| --- | --- | --- |
| `#home` | logo | Home |
| `#auctions` | Live Auctions | Catalogue (chips + search + 3-col lot grid) |
| `#lot-{auction}` | Live Auctions | Auction detail |
| `#coins` | Coins | Launched coins grid |
| `#launch` | Launch | Launch form + certificate preview |
| `#sell` | Sell | 6-step consign wizard (wallet required) |
| `#portfolio` | Portfolio | Summary tiles + 6 tabs (wallet required) |
| `#otc` | OTC Markets | KPI strip, mint search, sort chips, markets table, recent trades |
| `#otc-token-{mint}` | OTC Markets | Token market: book (asks/bids), trades, make-offer form |
| `#otc-offer-{addr}` | OTC Markets | Offer detail: fill form, fills, negotiation thread, state |
| `#otc-wallet[-{addr}]` | OTC Markets | Wallet lookup: public token balances |
| `#otc-mine` | My Offers | Made / Received / Trades / Notifications (wallet required) |
| `#activity` | Activity | Live activity feed with filter chips (+ notifications when connected) |
| `#admin` | — | Not in the nav, not replicated |

## 2. Global chrome

* **Header** — sticky, 68–70 px tall, content max-width 1420 px with 20 px gutters (1380 px content). Left→right:
  logo + wordmark, 8 nav links (14 px / weight 800, 39 px tall pills, 10 px radius, active = filled), search field
  (40 px tall, 10 px radius, flex 1 1 240, max 320), contract-address pill ("CA: coming soon"), X button 38×38,
  notifications bell (hidden until a wallet is connected), "Connect Wallet" button (primary, small).
* **Ticker** — 40 px strip under the header. Infinite marquee (60 s) of recent events: bids, sales, auctions,
  launches, OTC trades, ending-soon lots. Pinned "Total creator fees" cell at the right edge (hidden < 900 px).
* **Footer** — logo, one-line tagline, X link, network tag ("Solana mainnet"). 94 px tall at desktop.
* **Toast** — bottom-centre pill, 3.6 s. **Modal** — centred, max 460 px, backdrop click closes.
* **Sound toggle** and chalkboard doodle canvas — decorative, specific to the reference's brand. Not replicated.

## 3. Pages

**Home.** 22 px top pad. Row 1: `hero` (998 px) + `How it works` rail (360 px, 4 numbered steps joined by a
dotted line). Hero = eyebrow, H1 (clamp 40–70 px), lede, two CTAs (primary "Launch a Coin", secondary), hero art,
then a 4-tile stats row (Live auctions, Total creator fees, Fee on sales only, Projects sold). Row 2 (26 px gap):
dark **Live auction floor** card (998×234: coin image with "1/1" badge, ticker/name/socials, Market cap, 24h volume,
Creator fees, Starting/Current bid, Bidders, red HOURS/MIN/SEC countdown boxes, "Place a Bid" + watch heart) +
**Live activity** rail (360 px, up to 7 rows: age · avatar · wallet · text). Then **Ending Soon** (4 cards),
**Recently Sold** (5 compact cards, only if any), **Launched on …** (up to 8 coin cards), and a 3-card **rules**
strip (Anti-sniping / Minimum raise / Fee only on a sale). Empty floor: "The floor is open." + two CTAs.

**Live Auctions.** Page title block (eyebrow, H1 with highlighted last word, one paragraph). Toolbar: 7 sort chips
(Ending Soon, Newest, Highest Bid, Highest Lifetime Fees, Highest 24h Fees, Most Bids, Ended) + search ("coin
name, ticker or mint address"). Grid of lot cards (3 col ≥ 981 px, 2 col, 1 col ≤ 640 px): ticker eyebrow + status
pill (Live / Ending when < 10 min / Ended · settle), avatar + name + `$TICKER · MC`, 3 stats (Lifetime fees, 24h
fees, Bids), current/starting bid + time left, **View Auction** + **Place Bid**. Closed lots use a compact card.
Empty: dashed "Nothing here yet." / "No lots match “q”."

**Auction detail.** Back link; two columns (1.25fr / 1fr, 28 px gap). Left: header (96 px avatar, eyebrow
"Ownership NFT · $T", H1, `$T · Coin age`), notice ("You're bidding on the Ownership NFT and its creator-fee
rights, not the token supply…"), 8-cell stat grid (Lifetime / 24h / 7d / Unclaimed fees, Market cap, Volume 24h,
Coin age, Bids), 14-day fee bar chart, bid-history table (Wallet · Bid amount · Time · Status). Right (sticky
bid box): eyebrow + Live pill, big current bid, Minimum next bid + Time left, bid input with SOL unit + **Place
Bid**, 3 quick-bid chips, escrow explainer, "extended" banner, refund/cancel affordances, then a definition list
(Seller, Highest bidder, Ownership NFT, Coin mint, Auction, Start, End, Platform fee). Ended/settled states swap the
box for a Settle / Finish payouts / Claim refund button and a SOLD stamp.

**Coins.** Sort chips (Newest, Market cap, Lifetime fees, On auction, Sold) + search (name, ticker, mint or
creator). 4-col grid of coin cards (62 px square image, ticker, name, "Launched 12m ago", watch heart; Market cap,
Creator fees, status pill: On auction / Sold Nx / Held by owner). Card click → auction if live, else Pump.fun.

**Launch.** Two columns (1.2fr / .8fr). Left panel form: Coin name (≤32), Ticker (≤10, uppercased), Description
(≤500), Image upload (png/jpg/gif/webp ≤ 4 MB), X, Telegram, Website (locked to the platform site), full-width
LAUNCH COIN, helper copy about the 3 transactions and ~0.05 SOL of rent/fees. Right: eyebrow "Your Ownership NFT",
live **certificate** preview (updates as you type), "What you get" list. Submit opens a progress modal (5 steps);
success replaces the form with a "Your coin is live." panel, mint address, certificate and 3 actions.

**Sell.** Gated: "Connect your wallet" prompt. Connected: 6-step wizard (Select NFT → Fee analytics → Starting bid →
Duration → Summary → Start). Duration options 10m, 15m, 30m, 1h, 6h, 12h, 24h, 3d, 7d. Starting bid ≥ 0.01 SOL.
Summary shows what the seller receives after the 1 % fee and what is (and is not) transferred.

**Portfolio.** Gated. Eyebrow with short address; 4 summary tiles (Ownership NFTs, Claimable now, Refunds, Active
bids); tabs **My Coins / My Assets / My Auctions / My Bids / Refunds / Fees**, each with its own table or card grid
and empty state; explanatory footnote about Pump.fun payout thresholds.

**OTC Markets.** H1 "Trade any token, wallet to wallet". 5-tile KPI strip (Active sell offers, Active buy bids,
Trades settled, Volume, Trading fee 0.5 %). Search by name/symbol/mint + **Open market** + **Wallet lookup**. Sort
chips (Volume 24h, Most offers, Most bids, Latest trade, Newest market, Launched here). Markets table (Token, Best
ask, Best bid, Reference, Offers, Bids, Volume 24h, Last trade). Recent OTC trades table. Scam-awareness notice.
**Token page:** header panel (avatar, standard, badges, mint line with Copy + explorer link, decimals/supply/
authorities), warning list, 5 KPI tiles, two-up order book (Sell offers / Buy bids), recent trades, make-offer
form (Sell/Buy segmented control, Amount, Price per token ↔ Total price two-way, partial fills + minimum fill,
expiry select, private offer + counterparty). **Offer page:** fill form, Cancel / Reject / Counteroffer / Close
actions, fills table, negotiation thread, definition list. **Wallet lookup:** address form + holdings table.

**My Offers.** Gated. Tiles (Open offers, SOL locked in bids, Offers to you, Trades). Tabs Made / Received / Trades /
Notifications. States rendered as badges (ACTIVE, PARTIALLY_FILLED, FILLED, CANCELLED, REJECTED, EXPIRED).

**Activity.** H1 "Everything, on-chain". Filter chips All / Auctions / OTC / Launches over the live-activity list.
When connected, a notifications card sits beside it; when not, a connect prompt below.

## 4. Responsive behaviour observed

* ≤ 1180 px — home rows collapse to one column, `Recently Sold` 5→3 columns.
* ≤ 980 px — detail/form grids stack, lots 3→2, stat grid 4→2, bid box un-sticks.
* ≤ 900 px — hero stacks, 4-up rows → 2, header search moves to its own row, ticker total hidden.
* ≤ 640 px — single column everywhere; header wraps to four rows (logo/CA, X/wallet, scrolling nav, search).
  This is the one place Deed **deliberately diverges**: a compact app-style header + slide-over menu instead.

## 5. Could not be inspected

* Any connected-wallet state (Sell wizard, Portfolio tabs, My Offers tabs, notifications, bell) — Phantom is not
  available in headless Chrome and the reference gives no preview. These are rebuilt from the reference's **source
  behaviour** (labels, columns, steps, copy) and are flagged in `docs/INTEGRATIONS.md`.
* Transaction modals, launch progress modal, offer detail with fills — only reachable through a real transaction.
* The reference's contract/IDL and server API. Not replicated; Deed defines its own `DeedService` contract.
* The sound toggle, chalk/doodle canvas and pixel auctioneer art (brand-specific decoration).
