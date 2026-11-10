/**
 * Leaves real, populated state on the local validator so the app can be inspected by hand (or by the a11y / screenshot
 * scripts): two coins, a live 7-day auction with two bids, an OTC sell offer and a buy bid. Idempotent enough to re-run.
 *   npx vitest run --config vitest.e2e.config.ts chain/e2e/seed.e2e.test.ts
 */
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { conn, ctxFor, ensureInitialised, wallet } from "./helpers";
import { LiveDeedService } from "@/services/live";
import * as w from "@/chain/writes";

const SOL = BigInt(LAMPORTS_PER_SOL);
const svc = new LiveDeedService({ launchDeps: { upload: async () => ({ uri: "https://example.com/c.json", deedUri: "https://example.com/d.json" }) } });

describe("seed", () => {
  it("creates a live auction with bids and OTC offers", async () => {
    await ensureInitialised();
    const [creator, alice, bob] = await Promise.all([wallet(200), wallet(200), wallet(200)]);
    const coin = await svc.launchCoin(ctxFor(creator), { name: "Paper Crown", ticker: "CROWN", description: "seed coin", image: null, twitter: "", telegram: "" });
    await svc.launchCoin(ctxFor(creator), { name: "Brass Key", ticker: "KEY", description: "seed coin", image: null, twitter: "", telegram: "" });
    const a = await w.createAuction(ctxFor(creator), coin.coin.mint, 2n * SOL, 7 * 24 * 3600);
    await svc.placeBid(ctxFor(alice), { auction: a.auction, amount: 2n * SOL });
    await svc.placeBid(ctxFor(bob), { auction: a.auction, amount: 2n * SOL + 200_000_000n });

    const authority = await wallet(5);
    const mint = await createMint(conn, authority, authority.publicKey, null, 6);
    for (const k of [alice, bob]) {
      const acc = await getOrCreateAssociatedTokenAccount(conn, authority, mint, k.publicKey);
      await mintTo(conn, authority, mint, acc.address, authority, 5_000n * 1_000_000n);
    }
    await svc.createOffer(ctxFor(alice), { kind: "SELL", mint: mint.toBase58(), amount: 1_000n * 1_000_000n, priceTotal: 2n * SOL, partial: true, minFill: 100n * 1_000_000n, expiresInSecs: 7 * 24 * 3600, counterparty: null, parent: null });
    await svc.createOffer(ctxFor(bob), { kind: "BUY", mint: mint.toBase58(), amount: 500n * 1_000_000n, priceTotal: SOL / 2n, partial: false, minFill: null, expiresInSecs: 7 * 24 * 3600, counterparty: null, parent: null });
    svc.invalidate();
    expect((await svc.listAuctions()).some((x) => x.status === "LIVE")).toBe(true);
    expect((await svc.listOtcMarkets()).length).toBeGreaterThan(0);
  }, 120_000);
});
