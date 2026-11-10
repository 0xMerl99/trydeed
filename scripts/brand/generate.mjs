// Renders the PNG brand assets from the design: favicons, touch icon, social card.
//   node scripts/brand/generate.mjs        (needs network once, for the Fredericka the Great / Kalam webfonts used in the social card)
import { chromium } from "playwright-core";
import fs from "node:fs";

const MARK = (ink, paper, size) => `<svg width="${size}" height="${(size * 30) / 40}" viewBox="0 0 40 30" fill="none"><rect x="1" y="1" width="38" height="28" rx="3" fill="${paper}" stroke="${ink}" stroke-width="2"/><rect x="4.5" y="4.5" width="31" height="21" rx="1.5" stroke="#D4A017" stroke-width="1"/><path d="M9 10h14M9 14.2h10M9 18.4h7" stroke="${ink}" stroke-width="1.6" stroke-linecap="round"/><circle cx="29.5" cy="19" r="4.3" fill="#D4A017"/><circle cx="29.5" cy="19" r="2.3" stroke="#0A0A0A" stroke-width="1"/></svg>`;
const icon = (size) => `<body style="margin:0;width:${size}px;height:${size}px;background:#0A0A0A;display:grid;place-items:center;border-radius:${size * 0.22}px">${MARK("#0A0A0A", "#F5F5F4", size * 0.64)}</body>`;

const social = `<html><head><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Fredericka+the+Great&family=Kalam:wght@400;700&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet"></head>
<body style="margin:0;width:1200px;height:630px;background:#131E18;color:#F5F5F4;font-family:Kalam,sans-serif;position:relative;overflow:hidden">
  <div style="position:absolute;inset:28px;border:1px solid rgba(212,160,23,.55);border-radius:18px"></div>
  <div style="position:absolute;left:84px;top:78px;display:flex;align-items:center;gap:20px">${MARK("#F5F5F4", "#0A0A0A", 74)}
    <span style="font:400 42px 'Fredericka the Great';letter-spacing:.08em">DEED</span></div>
  <div style="position:absolute;right:84px;top:98px;font:500 17px 'JetBrains Mono';letter-spacing:.14em;color:#D4A017">1/1 OWNERSHIP NFT · 100% OF CREATOR FEES</div>
  <div style="position:absolute;left:84px;top:196px;font:400 128px/1 'Fredericka the Great';letter-spacing:.005em">OWN THE<br><span style="display:inline-block;border-bottom:9px solid #D4A017;padding-bottom:2px;line-height:1">FEES.</span></div>
  <div style="position:absolute;left:84px;bottom:76px;font:700 30px Kalam;color:#A1A1AA">Launch a coin. Receive the Deed. Auction the rights.</div>
</body></html>`;

const browser = await chromium.launch({ channel: "msedge", headless: true });
const out = async (html, w, h, file, transparent = false) => {
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  await p.setContent(html, { waitUntil: "networkidle" });
  await p.waitForTimeout(600);
  await p.screenshot({ path: file, omitBackground: transparent });
  await p.close();
  console.log("wrote", file);
};
fs.mkdirSync("public/brand", { recursive: true });
await out(icon(180), 180, 180, "src/app/apple-icon.png", true);
await out(icon(512), 512, 512, "public/brand/icon-512.png", true);
await out(icon(64), 64, 64, "public/brand/favicon-64.png", true);
await out(icon(32), 32, 32, "public/brand/favicon-32.png", true);
await out(social, 1200, 630, "src/app/opengraph-image.png");
fs.copyFileSync("src/app/opengraph-image.png", "src/app/twitter-image.png");
await browser.close();
