/**
 * The REAL app in a real browser against the local validator (real Pump programs + the Deed program).
 *
 * A second Next dev server (own build dir, port 3101) is started with the cluster set to `localnet`, the RPC pointing at the
 * validator, and a flagged test wallet ("E2E Burner", a real keypair wallet that is never created on mainnet). The browser
 * connects it through the normal wallet picker and drives the actual screens; every assertion about money and ownership is
 * then checked on chain. The only stand-in is a tiny local HTTP server that answers like the Pinata pinning API, so the
 * launch form's metadata upload works without a third-party account.
 */
import { spawn, execSync, type ChildProcess } from "node:child_process";
import http from "node:http";
import { chromium, type Browser, type Page } from "playwright-core";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, ComputeBudgetProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { BN, utils } from "@coral-xyz/anchor";
import { OnlinePumpSdk, PUMP_SDK, getBuyV3TokenAmountFromQuoteAmount } from "@pump-fun/pump-sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { airdrop, conn, ctxFor, ensureInitialised, sendIxs, sleep, wallet } from "./helpers";
import { LiveDeedService } from "@/services/live";
import * as w from "@/chain/writes";
import { decodeDeedState } from "@/chain/accounts";
import { deedStatePda } from "@/chain/program";

const PORT = 3101;
const BASE = `http://localhost:${PORT}`;
const SOL = BigInt(LAMPORTS_PER_SOL);
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const bal = async (k: PublicKey) => BigInt(await conn.getBalance(k, "confirmed"));

const burner = Keypair.generate(); // the browser wallet
let server: ChildProcess;
let pinning: http.Server;
let browser: Browser;
let creator: Keypair, alice: Keypair;
const svc = new LiveDeedService({ launchDeps: { upload: async () => ({ uri: "https://example.com/c.json", deedUri: "https://example.com/d.json" }) } });

async function waitHttp(url: string, ms = 180_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return;
    } catch {
      /* not up yet */
    }
    await sleep(1000);
  }
  throw new Error(`${url} did not come up`);
}

async function connect(page: Page) {
  await page.getByTestId("connect-wallet").first().click();
  await page.getByRole("button", { name: /E2E Burner/ }).click();
  await page.getByTestId("wallet-menu").first().waitFor();
  await page.getByRole("dialog", { name: "Connect a wallet" }).waitFor({ state: "hidden" });
}

async function newPage(): Promise<{ page: Page; errors: string[] }> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource|favicon|net::ERR|example\.com|ipfs\.io/i.test(m.text())) errors.push(m.text().slice(0, 300));
  });
  return { page, errors };
}

beforeAll(async () => {
  if (!(await conn.getVersion().catch(() => null))) throw new Error("No validator on 127.0.0.1:8899. Start it with: wsl bash chain/e2e/validator.sh");
  await ensureInitialised();
  creator = await wallet(100);
  alice = await wallet(100);
  await airdrop(burner.publicKey, 100);

  // a stand-in for the Pinata pinning API (the only external service the launch form needs)
  pinning = http.createServer((req, res) => {
    req.on("data", () => {}).on("end", () => {
      const cid = "Qm" + utils.bytes.bs58.encode(Buffer.from(Keypair.generate().publicKey.toBytes())).slice(0, 44);
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ IpfsHash: cid }));
    });
  });
  await new Promise<void>((r) => pinning.listen(0, "127.0.0.1", r));
  const pinPort = (pinning.address() as { port: number }).port;

  server = spawn("npx", ["next", "dev", "-p", String(PORT)], {
    cwd: process.cwd(),
    shell: true,
    env: {
      ...process.env,
      NEXT_DIST_DIR: ".next-qa",
      NEXT_PUBLIC_SOLANA_CLUSTER: "localnet",
      NEXT_PUBLIC_SOLANA_RPC_URL: "http://127.0.0.1:8899",
      NEXT_PUBLIC_E2E_BURNER_SECRET: utils.bytes.bs58.encode(burner.secretKey),
      NEXT_PUBLIC_PRIORITY_FEE_MICROLAMPORTS: "0",
      PINATA_JWT: "test",
      PINATA_API_URL: `http://127.0.0.1:${pinPort}`,
    },
    stdio: "ignore",
  });
  await waitHttp(BASE + "/");
  browser = await chromium.launch({ channel: "msedge", headless: true });
}, 240_000);

afterAll(async () => {
  await browser?.close();
  pinning?.close();
  if (server?.pid) {
    try {
      execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: "ignore" });
    } catch {
      /* already gone */
    }
  }
});

let coinMint = "";

describe("the real UI against the real chain", () => {
  it("launches a coin from the form: four real transactions, then the Deed is in the wallet", async () => {
    const { page, errors } = await newPage();
    await page.goto(BASE + "/launch", { waitUntil: "load" });
    await connect(page);
    await page.locator("#ln").fill("Chalk UI");
    await page.locator("#lt").fill("CHUI");
    await page.locator("#ld").fill("launched from the browser test");
    await page.locator("#li").setInputFiles({ name: "c.png", mimeType: "image/png", buffer: PNG });
    await page.getByTestId("launch-submit").click();
    await page.getByTestId("launch-success").waitFor({ timeout: 150_000 });
    const mintText = await page.getByTestId("launch-success").locator(".mono").first().innerText();
    coinMint = mintText.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/)![0];

    const st = decodeDeedState(deedStatePda(new PublicKey(coinMint)), (await conn.getAccountInfo(deedStatePda(new PublicKey(coinMint))))!);
    expect(st.creator).toBe(burner.publicKey.toBase58());
    const held = await conn.getTokenAccountsByOwner(burner.publicKey, { mint: new PublicKey(st.deedMint) });
    expect(held.value.length).toBe(1);

    // Portfolio shows the Deed it just minted
    await page.goto(BASE + "/portfolio", { waitUntil: "load" });
    await page.getByTestId("portfolio-summary").waitFor();
    await expect.poll(async () => (await page.locator("main").innerText()).includes("CHUI"), { timeout: 30_000 }).toBe(true);
    expect(errors).toEqual([]);
    await page.context().close();
  }, 240_000);

  it("a Pump trade creates fees; the Deed holder claims them from the Portfolio", async () => {
    const trader = await wallet(40);
    const sdk = new OnlinePumpSdk(conn);
    const mint = new PublicKey(coinMint);
    const [global, feeConfig] = await Promise.all([sdk.fetchGlobal(), sdk.fetchFeeConfig()]);
    const st = await sdk.fetchBuyState(mint, trader.publicKey, TOKEN_2022_PROGRAM_ID);
    const quoteAmount = new BN(6_000_000_000);
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

    const { page, errors } = await newPage();
    await page.goto(BASE + "/portfolio", { waitUntil: "load" });
    await connect(page);
    await page.getByRole("tab", { name: /^Fees/ }).click();
    const claim = page.getByRole("button", { name: /^Claim / }).first();
    await claim.waitFor({ timeout: 40_000 });
    const before = await bal(burner.publicKey);
    await claim.click();
    await expect.poll(async () => (await bal(burner.publicKey)) > before, { timeout: 60_000 }).toBe(true);
    await expect.poll(async () => await page.locator(".toast.show").innerText().catch(() => ""), { timeout: 30_000 }).toMatch(/fees claimed/i);
    expect(errors).toEqual([]);
    await page.context().close();
  }, 200_000);

  it("bidding: the UI enforces the minimum, an outbid wallet is refunded with no claim step, and the winner settles in the UI", async () => {
    // a coin + Deed held by a script wallet, on a 40 s auction (the test build allows short auctions)
    const out = await svc.launchCoin(ctxFor(creator), { name: "Chalk Lot", ticker: "LOT", description: "", image: null, twitter: "", telegram: "" });
    const r = await w.createAuction(ctxFor(creator), out.coin.mint, SOL / 2n, 40);
    const { page, errors } = await newPage();
    await page.goto(`${BASE}/auctions/${r.auction}`, { waitUntil: "load" });
    await connect(page);
    await page.getByTestId("bid-box").waitFor();

    // below the minimum: blocked inline, button disabled
    await page.locator("#bid").fill("0.4");
    expect(await page.getByTestId("place-bid").isDisabled()).toBe(true);
    await page.locator("#bid").fill("0.5");
    const before = await bal(burner.publicKey);
    await page.getByTestId("place-bid").click();
    await page.getByTestId("confirm-bid").click();
    await expect.poll(async () => (await w.getAuctionAcc(ctxFor(creator), r.auction)).highestBidder, { timeout: 60_000 }).toBe(burner.publicKey.toBase58());
    expect(before - (await bal(burner.publicKey))).toBeGreaterThanOrEqual(SOL / 2n);
    await expect.poll(async () => (await page.locator("main").innerText()).includes("You hold the highest bid"), { timeout: 30_000 }).toBe(true);

    // a rival outbids: the burner is refunded in that very transaction
    const midBalance = await bal(burner.publicKey);
    await svc.placeBid(ctxFor(alice), { auction: r.auction, amount: SOL / 2n + 100_000_000n });
    expect((await bal(burner.publicKey)) - midBalance).toBe(SOL / 2n);

    // after the on-chain end time anyone can settle; here the UI user does
    const endTs = (await w.getAuctionAcc(ctxFor(creator), r.auction)).endTime;
    await expect.poll(async () => Math.floor(Date.now() / 1000) > endTs + 2, { timeout: 90_000, interval: 1000 }).toBe(true);
    await page.reload({ waitUntil: "load" });
    await connect(page).catch(() => {});
    await page.getByTestId("settle").click();
    await expect.poll(async () => (await w.getAuctionAcc(ctxFor(creator), r.auction)).status, { timeout: 60_000 }).toBe("Settled");
    expect(errors).toEqual([]);
    await page.context().close();
  }, 300_000);

  it("no page, anywhere, talks about a simulation", async () => {
    const { page } = await newPage();
    const pages = ["/", "/auctions", "/coins", "/launch", "/otc", "/activity", "/docs", "/docs/how-it-works", "/docs/integrations", "/docs/qa", "/docs/brand", "/docs/reference"];
    for (const p of pages) {
      await page.goto(BASE + p, { waitUntil: "load" });
      await page.waitForTimeout(800);
      const text = await page.locator("body").innerText();
      // the docs may MENTION that there is no simulation; no UI may show simulated data, tags or tools
      if (!p.startsWith("/docs")) expect(text, `${p} mentions a simulation`).not.toMatch(/simulat|SIM-|DEV tools|Simulation mode/i);
      else expect(text, `${p} claims a simulated mode exists`).not.toMatch(/Simulated wallet|Reset simulation|NEXT_PUBLIC_DEED_MODE|DEV tools/i);
    }
    await page.context().close();
  }, 120_000);
});
