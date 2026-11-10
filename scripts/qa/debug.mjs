// Quick console/pageerror dump for one URL:  node scripts/qa/debug.mjs /activity [--wallet]
import { chromium } from "playwright-core";
const path = process.argv[2] || "/";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
if (process.argv.includes("--wallet")) await ctx.addInitScript(() => localStorage.setItem("deed.simwallet", "1"));
const page = await ctx.newPage();
page.on("console", (m) => console.log(`[${m.type()}]`, m.text().slice(0, 600)));
page.on("pageerror", (e) => console.log("[pageerror]", e.message.slice(0, 600), (e.stack || "").split("\n").slice(0, 4).join(" | ")));
await page.goto("http://localhost:3100" + path, { waitUntil: "load" });
await page.waitForTimeout(4000);
console.log("title:", await page.title());
await browser.close();
