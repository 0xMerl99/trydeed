// Measures key layout boxes on the Deed home at 1440x900 and prints them next to the reference numbers
// captured from tryauction.fun (docs/REFERENCE.md §2-3). Usage: node scripts/qa/measure.mjs [--base URL]
import { chromium } from "playwright-core";
const base = process.argv.includes("--base") ? process.argv[process.argv.indexOf("--base") + 1] : "http://localhost:3100";
const REF = { header: [1424, 70], logo: [177, 45], navLink: [98, 39], search: [220, 40], ticker: [1424, 40], content: 1380, hero: [998, 425], rail: [360, 425], stats: [998, 71], floor: [998, 234], activity: [360, 234], card: [333, 154], btnLg: [140, 58], footer: [1424, 94] };
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.goto(base + "/", { waitUntil: "load" });
await page.waitForTimeout(2000);
const m = await page.evaluate(() => {
  const box = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; };
  const q = (s) => document.querySelector(s);
  const sections = [...document.querySelectorAll("main section")];
  return {
    header: box(q("header")), logo: box(q("header a[aria-label]")), navLink: box(q("header nav a")), search: box(q("header form[role=search]")), ticker: box(q(".ticker")),
    content: Math.round(q("main .wrap").getBoundingClientRect().width - 40), hero: box(sections[0]?.children[0]), rail: box(sections[0]?.children[1]), stats: box(sections[0]?.children[0]?.lastElementChild),
    floor: box(q("[data-testid=floor-card]")), activity: box(q("[data-testid=floor-card]")?.nextElementSibling), card: box(q("main article.group")), btnLg: box(q(".btn-lg")), footer: box(q("footer")),
  };
});
const fmt = (a) => (Array.isArray(a) ? `${a[0]}×${a[1]}` : String(a));
console.log("element".padEnd(10), "reference".padEnd(12), "deed".padEnd(12), "Δ");
for (const k of Object.keys(REF)) {
  const r = REF[k], d = m[k];
  const dw = Array.isArray(r) && d ? `${d[0] - r[0]}w ${d[1] - r[1]}h` : (d - r);
  console.log(k.padEnd(10), fmt(r).padEnd(12), fmt(d).padEnd(12), dw);
}
await browser.close();
