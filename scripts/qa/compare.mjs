// Side-by-side composites: reference (left) vs Deed (right). Phase 14.
//   node scripts/qa/compare.mjs <refDir> <deedDir> <outDir> [--pages home,auctions] [--vp desktop,mobile] [--crop 1500]
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const a = process.argv.slice(2);
const [refDir, deedDir, outDir] = a;
const opt = (n, d) => { const i = a.indexOf(`--${n}`); return i >= 0 ? a[i + 1] : d; };
const pages = opt("pages", "home,auctions,coins,launch,sell,portfolio,otc,otc-mine,activity,lot,otc-token").split(",");
const vps = opt("vp", "desktop").split(",");
const crop = Number(opt("crop", "1500"));
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
for (const vp of vps) for (const pg of pages) {
  const r = path.resolve(refDir, `${pg}-${vp}.png`), d = path.resolve(deedDir, `${pg}-${vp}.png`);
  if (!fs.existsSync(r) || !fs.existsSync(d)) { console.log("skip", pg, vp); continue; }
  const W = vp === "mobile" ? 390 : vp === "tablet" ? 768 : 1440;
  const scale = vp === "mobile" ? 1 : vp === "tablet" ? 0.9 : 0.6;
  const html = `<body style="margin:0;background:#888;display:flex;gap:12px;align-items:flex-start;width:${(W * scale + 12) * 2}px">
    ${[["REFERENCE tryauction.fun", r], ["DEED", d]].map(([t, f]) => `<div><div style="font:700 13px sans-serif;color:#fff;padding:4px">${t}</div><div style="width:${W * scale}px;height:${crop * scale}px;overflow:hidden"><img src="${pathToFileURL(f)}" style="width:${W * scale}px"></div></div>`).join("")}</body>`;
  const p = await browser.newPage({ viewport: { width: Math.round((W * scale + 12) * 2), height: Math.round(crop * scale + 30) } });
  const htmlFile = path.resolve(outDir, `_${pg}-${vp}.html`);
  fs.writeFileSync(htmlFile, html);
  await p.goto(pathToFileURL(htmlFile).href); // file:// images only load from a file:// page, not about:blank
  await p.waitForLoadState("load");
  await p.screenshot({ path: path.join(outDir, `${pg}-${vp}.png`) });
  await p.close();
  fs.unlinkSync(htmlFile);
}
await browser.close();
console.log("composites in", outDir);
