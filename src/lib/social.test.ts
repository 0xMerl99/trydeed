import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { CA, CA_PUMP_URL, X_HANDLE, X_URL } from "./social";

describe("official links", () => {
  it("the contract address is a valid 32-byte Solana address that is a Pump.fun mint", () => {
    expect(new PublicKey(CA).toBytes()).toHaveLength(32);
    expect(CA.endsWith("pump")).toBe(true);
    expect(CA_PUMP_URL).toBe(`https://pump.fun/coin/${CA}`);
  });

  it("the X link and handle agree", () => {
    expect(X_URL).toBe(`https://x.com/${X_HANDLE.slice(1)}`);
  });
});
