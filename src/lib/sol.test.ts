import { describe, expect, it } from "vitest";
import { formatSol, parseSol, sol, toInputSol } from "./sol";
import { fillLamports, fmtUnits, otcFee, toUnits, totalFromUnitPrice } from "./otc";
import { age, countdown, countdownParts, countdownShort } from "./time";

describe("parseSol", () => {
  it("parses exactly, with no float error", () => {
    expect(parseSol("1")).toBe(1_000_000_000n);
    expect(parseSol("0.1")).toBe(100_000_000n);
    expect(parseSol("0.000000001")).toBe(1n);
    expect(parseSol("1,234.5")).toBe(1_234_500_000_000n);
    // the classic float trap
    expect(parseSol("0.1")! + parseSol("0.2")!).toBe(parseSol("0.3"));
  });
  it("rejects malformed or over-precise input", () => {
    for (const bad of ["", " ", "-1", "1e3", ".5", "1.", "abc", "0.0000000001", "1.2.3", "NaN"]) {
      expect(parseSol(bad), bad).toBeNull();
    }
  });
});

describe("SOL formatting", () => {
  it("round-trips for inputs", () => {
    for (const s of ["0", "1", "1.5", "0.105", "12.000000001"]) expect(toInputSol(parseSol(s)!)).toBe(s);
  });
  it("shows at least 2 decimals, trims the rest, groups thousands", () => {
    expect(formatSol(1_000_000_000n)).toBe("1.00");
    expect(formatSol(1_050_000_000n)).toBe("1.05");
    expect(formatSol(1_234_500_000_000n)).toBe("1,234.50");
  });
  it("never lets a bid read as a rounded-down number when asked for full precision", () => {
    expect(formatSol(1_005_000_000n, { max: 9 })).toBe("1.005");
    expect(formatSol(1_005_000_000n)).toBe("1.005");
  });
  it("shows tiny non-zero amounts with extra precision", () => {
    expect(sol(3_600_000n)).toBe("0.0036");
    expect(sol(0n)).toBe("0.00");
  });
});

describe("OTC units", () => {
  it("parses token amounts at token precision", () => {
    expect(toUnits("1.5", 6)).toBe(1_500_000n);
    expect(toUnits("1.1234567", 6)).toBeNull();
    expect(fmtUnits(1_500_000n, 6)).toBe("1.5");
    expect(fmtUnits(1_234_567_890_000n, 6)).toBe("1,234,567.89");
  });
  it("computes totals from a unit price without floats", () => {
    // 1,000 tokens (6 dp) at 0.0005 SOL each = 0.5 SOL
    expect(totalFromUnitPrice(toUnits("1000", 6)!, "0.0005", 6)).toBe(500_000_000n);
  });
  it("partial fills: buyers round up, sellers round down, the last fill takes the exact remainder", () => {
    // 3 tokens for 10 lamports; fill 1
    expect(fillLamports("SELL", 1n, 3n, 10n)).toBe(4n); // ceil(3.33)
    expect(fillLamports("BUY", 1n, 3n, 10n)).toBe(3n); // floor(3.33)
    expect(fillLamports("SELL", 3n, 3n, 10n)).toBe(10n); // all of it, exact
  });
  it("fee is floored bps of the SOL leg", () => {
    expect(otcFee(1_000_000_000n, 50)).toBe(5_000_000n);
  });
});

describe("countdown uses the supplied (cluster) clock", () => {
  it("formats under and over a day", () => {
    expect(countdown(1000 + 5 * 3600 + 41 * 60 + 34, 1000)).toBe("05:41:34");
    expect(countdown(1000 + 2 * 86400 + 5 * 3600 + 41 * 60, 1000)).toBe("2d 05h 41m");
    expect(countdown(1000, 1000)).toBe("Ended");
    expect(countdown(1000, 2000)).toBe("Ended");
  });
  it("splits into hour/min/sec boxes and a short form", () => {
    expect(countdownParts(1000 + 5 * 3600 + 45 * 60 + 56, 1000)).toEqual(["05", "45", "56"]);
    expect(countdownShort(1000 + 5 * 3600 + 45 * 60, 1000)).toBe("5h 45m");
    expect(countdownShort(1000 + 125, 1000)).toBe("2m 05s");
  });
  it("age", () => {
    expect(age(1000, 1000 + 14 * 60)).toBe("14m");
    expect(age(1000, 1000 + 3 * 3600)).toBe("3h");
  });
});
