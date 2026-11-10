// Viewport-sized screenshot of one URL, optionally scrolled to a selector:
//   node scripts/qa/view.mjs <url> <out.png> [width=1440] [height=900] [selector]
import { chromium } from "playwright-core";
const [, , url, out, w = "1440", h = "900", sel] = process.argv;
const browser = await chromium.launch({ channel: "msedge", headless: true });
const ctx = await browser.newContext({ viewport: { width: +w, height: +h } });
if (process.env.WALLET) await ctx.addInitScript(() => localStorage.setItem("deed.simwallet", "1")); // connect the dev wallet
const page = await ctx.newPage();
await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(1200);
if (sel) { await page.locator(sel).first().scrollIntoViewIfNeeded(); await page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: "start" }), sel); await page.waitForTimeout(400); }
await page.screenshot({ path: out });
await browser.close();
