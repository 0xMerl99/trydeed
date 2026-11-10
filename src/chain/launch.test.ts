import { beforeEach, describe, expect, it, vi } from "vitest";
import { launch } from "./launch";
import type { TxContext } from "@/services/types";

const ctxWith = (getAccountInfo: (k: unknown) => Promise<unknown>) => {
  const send = vi.fn(async () => "sig");
  const ctx = { wallet: "11111111111111111111111111111112", connection: { getAccountInfo }, send } as unknown as TxContext;
  return { ctx, send };
};
const input = { name: "X", ticker: "X", description: "", image: null, twitter: "", telegram: "" };
const upload = vi.fn(async () => ({ uri: "https://x/c.json", deedUri: "https://x/d.json" }));

beforeEach(() => vi.clearAllMocks());

describe("a Deed launch refuses to start when the Deed program is not ready", () => {
  it("not deployed: sends nothing, uploads nothing, creates no coin", async () => {
    const { ctx, send } = ctxWith(async () => null);
    await expect(launch(ctx, input, { upload })).rejects.toThrow(/not deployed/i);
    expect(send).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it("deployed but never initialised: still sends nothing", async () => {
    let n = 0;
    // first lookup = the program (executable), second = the config account (missing)
    const { ctx, send } = ctxWith(async () => (n++ === 0 ? { executable: true } : null));
    await expect(launch(ctx, input, { upload })).rejects.toThrow(/not initialised/i);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("a Pump.fun-only launch needs nothing of ours", () => {
  it("with no Deed program on the network it sends exactly ONE transaction (the coin) and creates no Deed", async () => {
    const lookups = vi.fn(async () => null); // would report "not deployed" for every account
    const { ctx, send } = ctxWith(lookups);
    const out = await launch(ctx, { ...input, mode: "pump" }, { upload });
    expect(out.deedMint).toBeNull();
    expect(out.signatures).toEqual(["sig"]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(lookups).not.toHaveBeenCalled(); // it never even asks whether the Deed program exists
  });

  it("upgrading a coin this device did not launch is refused", async () => {
    const { ctx } = ctxWith(async () => ({ executable: true }));
    await expect(launch(ctx, { ...input, mode: "deed", resume: "11111111111111111111111111111113" }, { upload })).rejects.toThrow(/not pending/i);
  });
});
