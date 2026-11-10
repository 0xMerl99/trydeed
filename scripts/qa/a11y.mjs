// axe-core audit of the main pages. Reports every violation with its impact, rule and a sample selector.
//   node scripts/qa/a11y.mjs [--base URL]
import { chromium } from "playwright-core";
import { connectBurner } from "./connect.mjs";
const base = process.argv.includes("--base") ? process.argv[process.argv.indexOf("--base") + 1] : "http://localhost:3100";
const AXE = "https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const targets = [
  ["/", false], ["/auctions", false], ["/coins", false], ["/launch", false], ["/otc", false], ["/activity", false],
  ["/docs", false], ["/docs/integrations", false], ["/docs/qa", false], ["/docs/brand", false],
  ["/auctions/first", false], ["/otc/token/first", false], ["/sell", true], ["/portfolio", true], ["/otc/mine", true],
];
let total = 0;
for (const [p, wallet] of targets) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  if (p === "/auctions/first") { await page.goto(base + "/auctions"); await page.getByTestId("lot-card").first().getByRole("link", { name: "View Auction" }).click(); await page.getByTestId("bid-box").waitFor(); }
  else if (p === "/otc/token/first") { await page.goto(base + "/otc"); await page.getByTestId("markets-table").locator("tbody tr").first().click(); await page.getByTestId("offer-form").waitFor(); }
  else await page.goto(base + p, { waitUntil: "load" });
  if (wallet) await connectBurner(page);
  await page.waitForTimeout(1800);
  await page.addScriptTag({ url: AXE });
  const r = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] } })).violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, help: v.help, sample: v.nodes[0].target.join(" ").slice(0, 110), html: v.nodes[0].html.slice(0, 110) })));
  total += r.length;
  console.log(`\n${p}${wallet ? " (wallet)" : ""}: ${r.length} violation(s)`);
  for (const v of r) console.log(`  [${v.impact}] ${v.id} ×${v.n} — ${v.help}\n      ${v.sample}\n      ${v.html}`);
  await ctx.close();
}
await browser.close();
console.log(`\nTOTAL violations: ${total}`);
