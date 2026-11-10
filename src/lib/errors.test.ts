import { describe, expect, it } from "vitest";
import { friendlyError } from "./errors";

describe("friendlyError", () => {
  it("shows the program's own message from Anchor logs", () => {
    const e = new Error('Simulation failed.\nLogs:\n[\n  "Program log: AnchorError thrown in x.rs:1. Error Code: BidTooLow. Error Number: 6021. Error Message: The bid is below the minimum next bid.",\n  "Program X failed"\n]');
    expect(friendlyError(e)).toBe("The bid is below the minimum next bid.");
  });

  it("maps a bare custom program error through the IDL", () => {
    expect(friendlyError(new Error("failed: custom program error: 0x1779"))).toMatch(/Deed token must be held/);
  });

  it("explains an RPC that refuses the app's queries instead of printing raw JSON", () => {
    const raw = new Error('403 : {"jsonrpc":"2.0","error":{"code": 403, "message":"Access forbidden"}, "id": "x" }');
    expect(friendlyError(raw)).toMatch(/NEXT_PUBLIC_SOLANA_RPC_URL/);
    expect(friendlyError(new Error('429 : {"error":{"code": 429, "message":"Too many requests"}}'))).toMatch(/rate-limiting/);
  });

  it("treats a declined wallet prompt as nothing sent", () => {
    expect(friendlyError(Object.assign(new Error("User rejected the request."), { code: 4001 }))).toMatch(/Nothing was sent/);
  });

  it("does not mistake an unrelated message for an RPC refusal", () => {
    expect(friendlyError(new Error("Something odd happened"))).toBe("Something odd happened");
  });
});

describe("isRpcUnavailable", () => {
  it("recognises an endpoint that refuses, throttles or cannot be reached", async () => {
    const { isRpcUnavailable } = await import("./errors");
    expect(isRpcUnavailable(new Error('403 : {"error":{"code": 403, "message":"Access forbidden"}}'))).toBe(true);
    expect(isRpcUnavailable(new Error("429 Too Many Requests"))).toBe(true);
    expect(isRpcUnavailable(new TypeError("Failed to fetch"))).toBe(true);
  });
  it("does not swallow real failures", async () => {
    const { isRpcUnavailable } = await import("./errors");
    expect(isRpcUnavailable(new Error("custom program error: 0x1779"))).toBe(false);
    expect(isRpcUnavailable(new Error("That auction does not exist"))).toBe(false);
  });
});
