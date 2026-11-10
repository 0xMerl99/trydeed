// node scripts/qa/probe.mjs /activity '[data-testid=activity-list]'  → prints innerText + child count after load
import { chromium } from "playwright-core";
const [, , path = "/", sel = "main"] = process.argv;
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto("http://localhost:3100" + path, { waitUntil: "load" });
for (const ms of [500, 1500, 4000]) {
  await page.waitForTimeout(ms);
  const r = await page.evaluate((s) => { const e = document.querySelector(s); return e ? { kids: e.children.length, text: e.innerText.slice(0, 160).replace(/\n/g, " | ") } : null; }, sel);
  console.log(ms, JSON.stringify(r));
}
await browser.close();
