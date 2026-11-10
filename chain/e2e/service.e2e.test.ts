/**
 * The app's real service layer (LiveDeedService + chain/writes) against a local validator that runs the REAL Pump.fun
 * programs and the compiled Deed program: launch, fee claim, auctions (bids, atomic refund, anti-sniping, settlement,
 * cancel), OTC (partial fills, fees, private offers, unsafe mints) and the reads the UI renders from.
 * Requires the test build with short timers: `bash chain/scripts/build.sh e2e`, then `bash chain/e2e/validator.sh`.
 */
import { createMint, getAssociatedTokenAddressSync, getOrCreateAssociatedTokenAccount, mintTo, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { ComputeBudgetProgram, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { OnlinePumpSdk, PUMP_SDK, feeSharingConfigPda, getBuyV3TokenAmountFromQuoteAmount } from "@pump-fun/pump-sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { conn, ctxFor, ensureInitialised, logsOf, sendIxs, sleep, wallet } from "./helpers";
import { eventsFromLogs } from "@/chain/events";
import { LiveDeedService } from "@/services/live";
import * as w from "@/chain/writes";
import { loadPendingLaunches } from "@/chain/launch";
import { deedStatePda } from "@/chain/program";
import { friendlyError } from "@/lib/errors";
import { getClusterTime } from "@/lib/solana";

const SOL = BigInt(LAMPORTS_PER_SOL);
const svc = new LiveDeedService({ launchDeps: { upload: async () => ({ uri: "https://example.com/coin.json", deedUri: "https://example.com/deed.json" }) } });
const bal = async (k: PublicKey) => BigInt(await conn.getBalance(k, "confirmed"));
/** Writes made outside the service (a Pump buy, a raw transaction) need the service's caches dropped before the next read. */
const settle = async () => {
  svc.invalidate();
  await sleep(50);
};
async function until(cond: () => Promise<boolean>, ms = 60_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await cond()) return;
    await sleep(300);
  }
  throw new Error("timed out waiting for a condition");
}

let treasury: PublicKey;
let creator: Keypair, alice: Keypair, bob: Keypair, carol: Keypair;
let coinMint: string;
let deedMint: string;

beforeAll(async () => {
  if (!(await conn.getVersion().catch(() => null))) throw new Error("No validator on 127.0.0.1:8899. Start it with: wsl bash chain/e2e/validator.sh");
  treasury = await ensureInitialised();
  [creator, alice, bob, carol] = await Promise.all([wallet(100), wallet(100), wallet(100), wallet(100)]);
});

describe("launch and fees", () => {
  it("launches a coin through the service and the reads show it with its Deed", async () => {
    const r = await svc.launchCoin(ctxFor(creator), { name: "Chalk Service", ticker: "CHSVC", description: "e2e", image: null, twitter: "", telegram: "" });
    coinMint = r.coin!.mint;
    deedMint = r.coin!.deedMint;
    expect(r.coin!.symbol).toBe("CHSVC");
    expect(r.coin!.name).toBe("Chalk Service");
    expect(r.coin!.creator).toBe(creator.publicKey.toBase58());
    expect(r.coin!.deedOwner).toBe(creator.publicKey.toBase58());
    expect(r.coin!.status).toBe("HELD");
    expect((await svc.listCoins()).map((c) => c.mint)).toContain(coinMint);
    const act = await svc.listActivity();
    expect(act.some((e) => e.kind === "COIN_LAUNCHED" && e.coinMint === coinMint)).toBe(true);
  });

  it("claims real Pump creator fees to the Deed holder (sweep + distribute + claim)", async () => {
    const trader = await wallet(40);
    const sdk = new OnlinePumpSdk(conn);
    const mint = new PublicKey(coinMint);
    const [global, feeConfig] = await Promise.all([sdk.fetchGlobal(), sdk.fetchFeeConfig()]);
    const st = await sdk.fetchBuyState(mint, trader.publicKey, TOKEN_2022_PROGRAM_ID);
    const quoteAmount = new BN(8_000_000_000);
    const buy = await PUMP_SDK.buyExactQuoteInV3Instructions({
      bondingCurve: st.bondingCurve,
      associatedUserAccountInfo: st.associatedUserAccountInfo,
      mint,
      user: trader.publicKey,
      quoteAmount,
      amount: getBuyV3TokenAmountFromQuoteAmount({ global, feeConfig, mintSupply: st.bondingCurve.tokenTotalSupply, bondingCurve: st.bondingCurve, amount: quoteAmount, curveBaseTokenBalance: st.curveBaseTokenBalance }),
      slippage: 5,
      quoteTokenProgram: st.quoteTokenProgram,
    });
    await sendIxs(trader, [ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), ...buy]);
    await settle();

    // the UI's numbers: fees are visible and claimable BEFORE anyone distributes them
    const before = (await svc.listCoins()).find((c) => c.mint === coinMint)!;
    expect(before.fees.unclaimed).toBeGreaterThan(0n);
    expect(before.market.marketCapSol).not.toBeNull();

    // someone who does not hold the Deed cannot claim
    await expect(svc.claimFees(ctxFor(alice), coinMint)).rejects.toThrow(/holds the Deed/);

    const walletBefore = await bal(creator.publicKey);
    const rcpt = await svc.claimFees(ctxFor(creator), coinMint);
    expect(rcpt.signature).toMatch(/^[1-9A-HJ-NP-Za-km-z]{60,}$/);
    await settle();
    const after = (await svc.listCoins()).find((c) => c.mint === coinMint)!;
    const gained = (await bal(creator.publicKey)) - walletBefore;
    const ev = eventsFromLogs(await logsOf(rcpt.signature), { sig: rcpt.signature, slot: 0, ts: 0 }).find((e) => e.kind === "FeesClaimed");
    // what the UI showed as claimable is EXACTLY what the program paid out (gross) ...
    expect(ev && "amount" in ev ? ev.amount : null).toBe(before.fees.unclaimed);
    // ... and the wallet nets that minus the network fee and the rent Pump's sweep/distribute accounts cost the payer (< 0.002 SOL)
    expect(gained).toBeGreaterThan(before.fees.unclaimed - 2_000_000n);
    expect(gained).toBeLessThanOrEqual(before.fees.unclaimed);
    expect(after.fees.claimed).toBeGreaterThan(0n);
    expect(after.fees.unclaimed).toBeLessThan(before.fees.unclaimed);
  });
});

describe("auctions", () => {
  let auction: string;

  it("lists the Deed: it moves into escrow and the coin shows as on auction", async () => {
    const r = await w.createAuction(ctxFor(creator), coinMint, SOL / 2n, 8);
    auction = r.auction;
    await settle();
    const list = await svc.listAuctions();
    const a = list.find((x) => x.address === auction)!;
    expect(a.status).toBe("LIVE");
    expect(a.startPrice).toBe(SOL / 2n);
    const coin = (await svc.listCoins()).find((c) => c.mint === coinMint)!;
    expect(coin.status).toBe("ON_AUCTION");
    expect(coin.liveAuction).toBe(auction);
    expect(coin.deedOwner).toBe(auction);
    // the creator no longer holds it, so cannot claim or list it again
    await expect(svc.claimFees(ctxFor(creator), coinMint)).rejects.toThrow(/holds the Deed/);
  });

  it("enforces the bid rules on chain and refunds an outbid wallet in the same transaction", async () => {
    const r1 = await svc.placeBid(ctxFor(alice), { auction, amount: SOL / 2n });
    expect(r1.extended).toBe(false);
    // below the minimum next bid (current + max(5%, 0.1 SOL))
    await expect(svc.placeBid(ctxFor(bob), { auction, amount: SOL / 2n + 99_999_999n })).rejects.toThrow(/below the minimum next bid/i);
    // the seller cannot bid; the highest bidder cannot outbid themselves
    await expect(svc.placeBid(ctxFor(creator), { auction, amount: 2n * SOL })).rejects.toThrow(/own auction/i);
    await expect(svc.placeBid(ctxFor(alice), { auction, amount: 2n * SOL })).rejects.toThrow(/highest bid/i);

    const aliceBefore = await bal(alice.publicKey);
    await svc.placeBid(ctxFor(bob), { auction, amount: SOL / 2n + 100_000_000n });
    expect((await bal(alice.publicKey)) - aliceBefore).toBe(SOL / 2n); // refunded exactly, no claim step

    await settle();
    const d = await svc.getAuction(auction);
    expect(d.auction.highestBidder).toBe(bob.publicKey.toBase58());
    expect(d.auction.bidCount).toBe(2);
    expect(d.history.map((h) => h.bidder)).toEqual([alice.publicKey.toBase58(), bob.publicKey.toBase58()]);
    expect(d.history[0].ref).toMatch(/^[1-9A-HJ-NP-Za-km-z]{60,}$/);
  });

  it("settles after the on-chain end time: winner gets the Deed, seller gets price minus 1%, treasury 1%", async () => {
    // cannot settle early
    await expect(svc.settleAuction(ctxFor(carol), auction)).rejects.toThrow(/not ended/i);
    const { endTs } = (await svc.getAuction(auction)).auction;
    await until(async () => (await getClusterTime()) >= endTs + 1);

    const price = SOL / 2n + 100_000_000n;
    const [sellerB, treasuryB] = [await bal(creator.publicKey), await bal(treasury)];
    await svc.settleAuction(ctxFor(carol), auction); // permissionless: a third party finishes it
    await settle();
    expect((await bal(treasury)) - treasuryB).toBe(price / 100n);
    expect((await bal(creator.publicKey)) - sellerB).toBeGreaterThanOrEqual(price - price / 100n); // + escrow rent back
    const coin = (await svc.listCoins()).find((c) => c.mint === coinMint)!;
    expect(coin.deedOwner).toBe(bob.publicKey.toBase58());
    expect(coin.sales).toBe(1);
    expect(coin.status).toBe("SOLD");
    const done = (await svc.listAuctions()).find((x) => x.address === auction)!;
    expect(done.status).toBe("SETTLED");
    expect((await svc.getPortfolio(bob.publicKey.toBase58())).assets.map((c) => c.mint)).toContain(coinMint);
    // the old owner lost the fee rights; the new owner has them
    await expect(svc.claimFees(ctxFor(creator), coinMint)).rejects.toThrow(/holds the Deed/);
    const act = await svc.listActivity();
    expect(act.some((e) => e.kind === "AUCTION_SETTLED" && e.auction === auction && e.amount === price)).toBe(true);
    expect(act.some((e) => e.kind === "BID_PLACED" && e.auction === auction)).toBe(true);
  });

  it("anti-sniping: a bid inside the last window extends the end time", async () => {
    const r = await w.createAuction(ctxFor(bob), coinMint, SOL / 2n, 12);
    const acc = () => w.getAuctionAcc(ctxFor(bob), r.auction);
    const first = (await acc()).endTime;
    await svc.placeBid(ctxFor(alice), { auction: r.auction, amount: SOL / 2n }); // plenty of time left: no extension
    expect((await acc()).endTime).toBe(first);
    await until(async () => first - (await getClusterTime()) <= 1);
    const late = await svc.placeBid(ctxFor(carol), { auction: r.auction, amount: SOL / 2n + 100_000_000n });
    expect(late.extended).toBe(true);
    expect((await acc()).endTime).toBeGreaterThan(first);
    await until(async () => (await getClusterTime()) >= (await acc()).endTime + 1);
    await svc.settleAuction(ctxFor(alice), r.auction);
  });

  it("an auction without bids can be cancelled for free and the Deed returns", async () => {
    const holder = carol; // won the last one
    const r = await w.createAuction(ctxFor(holder), coinMint, SOL, 600 < 5 ? 5 : 30);
    await expect(svc.cancelAuction(ctxFor(alice), r.auction)).rejects.toThrow();
    const treasuryB = await bal(treasury);
    await svc.cancelAuction(ctxFor(holder), r.auction);
    await settle();
    expect((await svc.listCoins()).find((c) => c.mint === coinMint)!.deedOwner).toBe(holder.publicKey.toBase58());
    expect(await bal(treasury)).toBe(treasuryB); // no fee on a sale that did not complete
    expect((await svc.listAuctions()).find((x) => x.address === r.auction)!.status).toBe("UNSOLD" === "UNSOLD" ? "CANCELLED" : "CANCELLED");
  });
});

describe("OTC", () => {
  let mint: PublicKey;
  let offer: string;
  const UNIT = 1_000_000n; // 6 decimals

  beforeAll(async () => {
    const authority = await wallet(5);
    mint = await createMint(conn, authority, authority.publicKey, null, 6);
    for (const k of [alice, bob, carol]) {
      const a = await getOrCreateAssociatedTokenAccount(conn, authority, mint, k.publicKey);
      await mintTo(conn, authority, mint, a.address, authority, 1_000n * UNIT);
    }
  });

  it("a sell offer escrows tokens; partial fills pay the maker minus 0.5% and the last fill takes the exact remainder", async () => {
    const r = await svc.createOffer(ctxFor(alice), { kind: "SELL", mint: mint.toBase58(), amount: 100n * UNIT, priceTotal: SOL, partial: true, minFill: 10n * UNIT, expiresInSecs: 3600, counterparty: null, parent: null });
    offer = r.offer;
    await settle();
    const market = await svc.getOtcToken(mint.toBase58());
    expect(market.token.supported).toBe(true);
    expect(market.asks.map((o) => o.address)).toContain(offer);
    expect(market.bestAsk).toBe(SOL / 100n); // 0.01 SOL per whole token

    await expect(svc.fillOffer(ctxFor(bob), { offer, amount: 5n * UNIT })).rejects.toThrow(/minimum fill/i);
    const [makerB, treasuryB] = [await bal(alice.publicKey), await bal(treasury)];
    await svc.fillOffer(ctxFor(bob), { offer, amount: 40n * UNIT });
    const owed = (SOL * 40n) / 100n;
    expect((await bal(alice.publicKey)) - makerB).toBe(owed - (owed * 50n) / 10_000n);
    expect((await bal(treasury)) - treasuryB).toBe((owed * 50n) / 10_000n);
    await settle();
    const mid = await svc.getOtcOffer(offer);
    expect(mid.offer.state).toBe("PARTIALLY_FILLED");
    expect(mid.offer.remaining).toBe(60n * UNIT);
    expect(mid.offer.fills).toHaveLength(1);

    await svc.fillOffer(ctxFor(bob), { offer, amount: 60n * UNIT });
    await settle();
    expect(await conn.getAccountInfo(new PublicKey(offer))).toBeNull(); // a finished offer closes itself
    const done = await svc.getOtcOffer(offer); // …and is rebuilt from its events
    expect(done.offer.state).toBe("FILLED");
    expect(done.offer.live).toBe(false);
    expect(done.offer.fills).toHaveLength(2);
    expect(done.offer.fills.reduce((s, f) => s + f.lamports, 0n)).toBe(SOL);
    const stats = await svc.getOtcStats();
    expect(stats.trades).toBeGreaterThanOrEqual(2);
  });

  it("a private buy bid: only the named wallet can fill or reject it", async () => {
    const r = await svc.createOffer(ctxFor(bob), { kind: "BUY", mint: mint.toBase58(), amount: 10n * UNIT, priceTotal: SOL / 5n, partial: false, minFill: null, expiresInSecs: 3600, counterparty: alice.publicKey.toBase58(), parent: null });
    await expect(svc.fillOffer(ctxFor(carol), { offer: r.offer, amount: 10n * UNIT })).rejects.toThrow(/private/i);
    const mine = await svc.getOtcMine(alice.publicKey.toBase58());
    expect(mine.received.map((o) => o.address)).toContain(r.offer);
    expect((await svc.getNotifications(alice.publicKey.toBase58())).some((n) => n.kind === "OFFER_RECEIVED" && n.offer === r.offer)).toBe(true);

    const bobBefore = await bal(bob.publicKey);
    await svc.closeOffer(ctxFor(alice), r.offer, "reject"); // the counterparty rejects: bob's SOL returns
    expect((await bal(bob.publicKey)) - bobBefore).toBeGreaterThanOrEqual(SOL / 5n);
    await settle();
    expect((await svc.getOtcOffer(r.offer)).offer.state).toBe("REJECTED");
  });

  it("refuses mints that could freeze or drain escrowed tokens", async () => {
    const authority = await wallet(5);
    const risky = await createMint(conn, authority, authority.publicKey, authority.publicKey, 6); // has a freeze authority
    const a = await getOrCreateAssociatedTokenAccount(conn, authority, risky, alice.publicKey);
    await mintTo(conn, authority, risky, a.address, authority, 10n * UNIT);
    const t = await svc.getOtcToken(risky.toBase58());
    expect(t.token.supported).toBe(false);
    expect(t.token.reason).toMatch(/freeze/i);
    await expect(svc.createOffer(ctxFor(alice), { kind: "SELL", mint: risky.toBase58(), amount: UNIT, priceTotal: SOL, partial: false, minFill: null, expiresInSecs: 3600, counterparty: null, parent: null })).rejects.toThrow(/freeze/i);
  });

  it("program errors reach the user in the program's own words", () => {
    expect(friendlyError(new Error("Simulation failed.\nLogs:\n[ \"Program log: AnchorError thrown in x.rs:1. Error Code: BidTooLow. Error Number: 6021. Error Message: The bid is below the minimum next bid.\" ]"))).toBe("The bid is below the minimum next bid.");
    void getAssociatedTokenAddressSync;
  });
});

// ====================================================================== Pump-only launch, then upgrade to a Deed

async function buyOnPump(coin: string, lamports: bigint) {
  const trader = await wallet(40);
  const sdk = new OnlinePumpSdk(conn);
  const mint = new PublicKey(coin);
  const [global, feeConfig] = await Promise.all([sdk.fetchGlobal(), sdk.fetchFeeConfig()]);
  const st = await sdk.fetchBuyState(mint, trader.publicKey, TOKEN_2022_PROGRAM_ID);
  const quoteAmount = new BN(lamports.toString());
  const buy = await PUMP_SDK.buyExactQuoteInV3Instructions({
    bondingCurve: st.bondingCurve,
    associatedUserAccountInfo: st.associatedUserAccountInfo,
    mint,
    user: trader.publicKey,
    quoteAmount,
    amount: getBuyV3TokenAmountFromQuoteAmount({ global, feeConfig, mintSupply: st.bondingCurve.tokenTotalSupply, bondingCurve: st.bondingCurve, amount: quoteAmount, curveBaseTokenBalance: st.curveBaseTokenBalance }),
    slippage: 5,
    quoteTokenProgram: st.quoteTokenProgram,
  });
  await sendIxs(trader, [ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), ...buy]);
}

describe("launching without the Deed program, then upgrading", () => {
  const store = new Map<string, string>();
  const g = globalThis as unknown as { window?: unknown };
  beforeAll(() => {
    // the pending-launch record lives in localStorage in the browser; give Node a tiny one for this test
    g.window = { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) } };
  });
  afterAll(() => {
    delete g.window;
  });

  it("a pump-only coin earns the creator its fees directly, then upgrades to a Deed even after it has traded", async () => {
    const maker = await wallet(60);
    const r = await svc.launchCoin(ctxFor(maker), { name: "Pump Only", ticker: "PONLY", description: "", image: null, twitter: "", telegram: "", mode: "pump" });
    expect(r.coin).toBeNull();
    expect(r.symbol).toBe("PONLY");
    const mint = new PublicKey(r.mint);
    // exactly one thing was created on chain by us: the Pump coin. No Deed, no fee lock.
    expect(await conn.getAccountInfo(deedStatePda(mint))).toBeNull();
    expect(await conn.getAccountInfo(new PublicKey(feeSharingConfigPda(mint)))).toBeNull();
    expect(loadPendingLaunches(maker.publicKey.toBase58()).map((p) => p.coinMint)).toContain(r.mint);

    // it trades: the curve now holds creator fees for the creator. Pump refuses to set up fee sharing until they are swept,
    // so the upgrade has to sweep first.
    await buyOnPump(r.mint, 6n * SOL);

    const up = await svc.launchCoin(ctxFor(maker), { name: "Pump Only", ticker: "PONLY", description: "", image: null, twitter: "", telegram: "", mode: "deed", resume: r.mint });
    expect(up.coin).not.toBeNull();
    expect(up.coin!.deedOwner).toBe(maker.publicKey.toBase58());
    expect(loadPendingLaunches(maker.publicKey.toBase58()).map((p) => p.coinMint)).not.toContain(r.mint);

    // from here on it behaves like any Deed coin: new trading fees reach the Deed holder through the vault
    await buyOnPump(r.mint, 6n * SOL);
    svc.invalidate();
    const before = (await svc.listCoins()).find((c) => c.mint === r.mint)!;
    expect(before.fees.unclaimed).toBeGreaterThan(0n);
    const walletBefore = await bal(maker.publicKey);
    await svc.claimFees(ctxFor(maker), r.mint);
    expect(await bal(maker.publicKey)).toBeGreaterThan(walletBefore);
  }, 120_000);
});
