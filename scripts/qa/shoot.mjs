// Screenshot tool for visual QA (Phase 14). Uses the locally installed Edge/Chrome via playwright-core.
//   node scripts/qa/shoot.mjs <outDir> [--base http://localhost:3100] [--paths /,/auctions] [--vp desktop,mobile] [--wallet]
// --wallet connects the app's flagged E2E burner test wallet first (needs NEXT_PUBLIC_E2E_BURNER_SECRET on a non-mainnet cluster).
import { chromium } from "playwright-core";
import { connectBurner } from "./connect.mjs";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const out = args[0] && !args[0].startsWith("--") ? args[0] : "qa-output/deed";
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const base = opt("base", "http://localhost:3100");
const paths = opt("paths", "/,/auctions,/coins,/launch,/sell,/portfolio,/otc,/otc/mine,/activity").split(",");
const wallet = args.includes("--wallet");
const ALL = {
  desktop: { width: 1440, height: 900 },
  laptop: { width: 1280, height: 800 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 390, height: 844 },
};
const vps = opt("vp", "desktop,laptop,tablet,mobile").split(",");
const nameOf = (p) => (p === "/" ? "home" : p === "/otc/mine" ? "otc-mine" : p.replace(/^\//, "").replace(/[/?=&]/g, "-"));

fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const problems = [];
for (const vn of vps) {
  const ctx = await browser.newContext({ viewport: ALL[vn], deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`[${vn}] pageerror ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|favicon|solana\.com/i.test(m.text())) problems.push(`[${vn}] console.error ${m.text().slice(0, 300)}`); });
  for (const p of paths) {
    let name = nameOf(p);
    if (p === "/auctions/first") {
      // detail pages have generated addresses: reach them the way a user would
      await page.goto(base + "/auctions", { waitUntil: "load" });
      await page.getByTestId("lot-card").first().getByRole("link", { name: "View Auction" }).click();
      await page.getByTestId("bid-box").waitFor();
      name = "lot";
    } else if (p === "/otc/token/first") {
      await page.goto(base + "/otc", { waitUntil: "load" });
      await page.getByTestId("markets-table").locator("tbody tr").first().click();
      await page.getByTestId("offer-form").waitFor();
      name = "otc-token";
    } else {
      await page.goto(base + p, { waitUntil: "load", timeout: 60000 }).catch((e) => problems.push(`goto ${p}: ${e.message}`));
    }
    if (wallet && !(await page.getByTestId("wallet-menu").count())) await connectBurner(page);
    await page.waitForTimeout(1600);
    await page.screenshot({ path: path.join(out, `${name}-${vn}.png`), fullPage: true });
  }
  await ctx.close();
}
await browser.close();
fs.writeFileSync(path.join(out, "problems.txt"), [...new Set(problems)].join("\n"));
console.log(problems.length ? `done with ${new Set(problems).size} problem(s):\n` + [...new Set(problems)].join("\n") : "done, no console/page errors");
