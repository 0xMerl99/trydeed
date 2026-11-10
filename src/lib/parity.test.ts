/**
 * Parity with the Deed program. The program (Rust, `chain/programs/deed_fun/src/util.rs`) is the authority; these TS
 * functions pre-validate in the browser. Every vector below is also asserted in the Rust unit tests, so if either side
 * changes a rule, one of the two suites fails.
 */
import { describe, expect, it } from "vitest";
import { AUCTION_RULES, endAfterBid, minIncrement, minNextBid, platformFee } from "./auction";
import { fillLamports, otcFee } from "./otc";

const SOL = 1_000_000_000n;

describe("auction rules match the program", () => {
  it("constants", () => {
    expect(AUCTION_RULES.feeBps).toBe(100n);
    expect(AUCTION_RULES.minIncrementBps).toBe(500n);
    expect(AUCTION_RULES.minIncrementLamports).toBe(100_000_000n);
    expect(AUCTION_RULES.antiSnipeSecs).toBe(300);
    expect(AUCTION_RULES.minStartLamports).toBe(10_000_000n);
  });

  it("minimum increment is MAX(5%, 0.1 SOL), rounded up", () => {
    expect(minIncrement(SOL)).toBe(100_000_000n);
    expect(minIncrement(2n * SOL)).toBe(100_000_000n);
    expect(minIncrement(10n * SOL)).toBe(500_000_000n);
    expect(minIncrement(2n * SOL + 1n)).toBe(100_000_001n);
  });

  it("next bid floor", () => {
    expect(minNextBid({ bidCount: 0, highestBid: 0n, startPrice: (5n * SOL) / 100n })).toBe((5n * SOL) / 100n);
    expect(minNextBid({ bidCount: 1, highestBid: SOL, startPrice: 0n })).toBe(SOL + 100_000_000n);
    expect(minNextBid({ bidCount: 3, highestBid: 10n * SOL, startPrice: 0n })).toBe(10n * SOL + 500_000_000n);
  });

  it("fee is floored", () => {
    expect(platformFee(SOL)).toBe(10_000_000n);
    expect(platformFee(199n)).toBe(1n);
    expect(platformFee(99n)).toBe(0n);
    expect(otcFee(SOL, 50)).toBe(5_000_000n);
  });

  it("anti-sniping only inside the last five minutes", () => {
    expect(endAfterBid(10_000, 0)).toEqual({ endTs: 10_000, extended: false });
    expect(endAfterBid(10_000, 10_000 - 301)).toEqual({ endTs: 10_000, extended: false });
    expect(endAfterBid(10_000, 10_000 - 300)).toEqual({ endTs: 10_300, extended: true });
    expect(endAfterBid(10_000, 10_000 - 1)).toEqual({ endTs: 10_300, extended: true });
    expect(endAfterBid(10_000, 10_000)).toEqual({ endTs: 10_000, extended: false });
  });
});

describe("OTC rounding matches the program", () => {
  it("buyer rounds up, seller rounds down, the last fill is exact", () => {
    expect(fillLamports("SELL", 1n, 3n, 10n)).toBe(4n);
    expect(fillLamports("BUY", 1n, 3n, 10n)).toBe(3n);
    expect(fillLamports("SELL", 3n, 3n, 10n)).toBe(10n);
    expect(fillLamports("BUY", 3n, 3n, 10n)).toBe(10n);
  });

  it("greedy partial fills of a bid never pay out more than the escrow", () => {
    let remaining = 1_000_003n;
    let price = 777_777_777n;
    const total = price;
    let paid = 0n;
    for (const step of [123_456n, 1n, 99_999n, 500_000n, 276_547n]) {
      const l = fillLamports("BUY", step, remaining, price);
      paid += l;
      remaining -= step;
      price -= l;
    }
    expect(remaining).toBe(0n);
    expect(price).toBe(0n);
    expect(paid).toBe(total);
  });
});
