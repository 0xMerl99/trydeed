// Finds elements that stick out past the viewport (the cause of horizontal scroll).
//   node scripts/qa/overflow.mjs /path 1280
import { chromium } from "playwright-core";
const [, , path = "/", width = "1280", base = "http://localhost:3100", wallet = ""] = process.argv;
const browser = await chromium.launch({ channel: "msedge", headless: true });
const ctx = await browser.newContext({ viewport: { width: Number(width), height: 800 } });
if (wallet === "wallet") await ctx.addInitScript(() => localStorage.setItem("deed.simwallet", "1")); // connected header is wider
const page = await ctx.newPage();
await page.goto(base + path, { waitUntil: "load" });
await page.waitForTimeout(1500);
const out = await page.evaluate(() => {
  const iw = window.innerWidth;
  const bad = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width && r.right > iw + 1) {
      // ignore anything clipped by an overflow:hidden/auto ancestor
      let p = el.parentElement, clipped = false;
      while (p && p !== document.body) { const o = getComputedStyle(p).overflowX; if (o === "hidden" || o === "auto" || o === "scroll" || o === "clip") { clipped = true; break; } p = p.parentElement; }
      if (!clipped) bad.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 80)} right=${Math.round(r.right)} w=${Math.round(r.width)}`);
    }
  }
  return { sw: document.documentElement.scrollWidth, iw, bad: bad.slice(0, 12) };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
