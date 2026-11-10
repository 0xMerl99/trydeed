import { describe, expect, it } from "vitest";
import {
  AUCTION_RULES,
  auctionPhase,
  endAfterBid,
  minIncrement,
  minNextBid,
  platformFee,
  quickBids,
  sellerProceeds,
  validateBid,
} from "./auction";
import { parseSol } from "./sol";

const SOL = (s: string) => parseSol(s)!;
const base = {
  status: "LIVE" as const,
  seller: "seller",
  highestBidder: null as string | null,
  startPrice: SOL("0.5"),
  highestBid: 0n,
  bidCount: 0,
  endTs: 10_000,
};

describe("minimum increment = MAX(current × 5%, 0.1 SOL)", () => {
  it("uses 0.1 SOL while 5% is smaller (current < 2 SOL)", () => {
    expect(minIncrement(SOL("0.5"))).toBe(SOL("0.1")); // 5% = 0.025
    expect(minIncrement(SOL("1.99"))).toBe(SOL("0.1")); // 5% = 0.0995
  });
  it("is exactly equal at 2 SOL", () => {
    expect(minIncrement(SOL("2"))).toBe(SOL("0.1"));
  });
  it("uses 5% above 2 SOL", () => {
    expect(minIncrement(SOL("2.02"))).toBe(SOL("0.101"));
    expect(minIncrement(SOL("10"))).toBe(SOL("0.5"));
    expect(minIncrement(SOL("100"))).toBe(SOL("5"));
  });
  it("rounds the 5% share UP to the lamport (never under-enforces)", () => {
    // 2_000_000_001 lamports × 5% = 100_000_000.05 -> 100_000_001
    expect(minIncrement(2_000_000_001n)).toBe(100_000_001n);
  });
});

describe("minimum next bid", () => {
  it("first bid only has to meet the starting price", () => {
    expect(minNextBid(base)).toBe(SOL("0.5"));
  });
  it("then current bid + increment", () => {
    expect(minNextBid({ ...base, bidCount: 1, highestBid: SOL("1") })).toBe(SOL("1.1"));
    expect(minNextBid({ ...base, bidCount: 3, highestBid: SOL("10") })).toBe(SOL("10.5"));
  });
});

describe("validateBid", () => {
  const live = { ...base, bidCount: 1, highestBid: SOL("1"), highestBidder: "alice" };
  it("accepts exactly the minimum", () => {
    expect(validateBid(live, SOL("1.1"), 5_000, "bob").ok).toBe(true);
  });
  it("rejects one lamport below the minimum", () => {
    const r = validateBid(live, SOL("1.1") - 1n, 5_000, "bob");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("TOO_LOW");
  });
  it("rejects bad amounts", () => {
    for (const v of [null, 0n]) {
      const r = validateBid(live, v, 5_000, "bob");
      expect(r.ok === false && r.code).toBe("INVALID_AMOUNT");
    }
  });
  it("rejects the seller and the current highest bidder", () => {
    expect(validateBid(live, SOL("5"), 5_000, "seller")).toMatchObject({ ok: false, code: "OWN_AUCTION" });
    expect(validateBid(live, SOL("5"), 5_000, "alice")).toMatchObject({ ok: false, code: "ALREADY_HIGHEST" });
  });
  it("rejects bids once the clock has run out, or the auction is closed", () => {
    expect(validateBid(live, SOL("5"), 10_000, "bob")).toMatchObject({ ok: false, code: "NOT_LIVE" });
    expect(validateBid({ ...live, status: "SETTLED" }, SOL("5"), 5_000, "bob")).toMatchObject({ ok: false, code: "NOT_LIVE" });
  });
});

describe("anti-sniping: a bid in the final 5 minutes extends the end by 5 minutes", () => {
  it("does not extend with more than 5 minutes left", () => {
    expect(endAfterBid(10_000, 10_000 - 301)).toEqual({ endTs: 10_000, extended: false });
  });
  it("extends at exactly 5 minutes left and inside the window", () => {
    expect(endAfterBid(10_000, 10_000 - 300)).toEqual({ endTs: 10_300, extended: true });
    expect(endAfterBid(10_000, 10_000 - 1)).toEqual({ endTs: 10_300, extended: true });
  });
  it("never extends an auction that has already ended", () => {
    expect(endAfterBid(10_000, 10_000)).toEqual({ endTs: 10_000, extended: false });
    expect(endAfterBid(10_000, 10_500)).toEqual({ endTs: 10_000, extended: false });
  });
  it("can chain: each late bid pushes the end again", () => {
    let end = 10_000;
    let now = 9_900;
    for (let i = 0; i < 3; i++) {
      end = endAfterBid(end, now).endTs;
      now = end - 10;
    }
    expect(end).toBe(10_900);
  });
});

describe("auction phase", () => {
  it("is LIVE until endTs, then ENDED until someone settles", () => {
    expect(auctionPhase(base, 9_999)).toBe("LIVE");
    expect(auctionPhase(base, 10_000)).toBe("ENDED");
    expect(auctionPhase({ ...base, status: "SETTLED" }, 99_999)).toBe("SETTLED");
  });
});

describe("1% platform fee — completed sales only", () => {
  it("takes 1% of the winning bid from the seller", () => {
    expect(platformFee(SOL("10"))).toBe(SOL("0.1"));
    expect(sellerProceeds(SOL("10"))).toBe(SOL("9.9"));
    expect(AUCTION_RULES.feeBps).toBe(100n);
  });
  it("floors to a lamport and fee + proceeds always equals the price", () => {
    const price = 123_456_789n;
    expect(platformFee(price) + sellerProceeds(price)).toBe(price);
  });
});

describe("quickBids", () => {
  it("starts at the minimum and is de-duplicated and ascending", () => {
    const q = quickBids(SOL("1.1"));
    expect(q[0]).toBe(SOL("1.1"));
    expect(q).toEqual([...q].sort((a, b) => (a < b ? -1 : 1)));
    expect(new Set(q).size).toBe(q.length);
  });
});
