// Captures the modal dialogs: wallet picker (disconnected) and confirm-bid (connected). BASE=http://localhost:3000
import { chromium } from "playwright-core";
const base = process.env.BASE || "http://localhost:3100";
const browser = await chromium.launch({ channel: "msedge", headless: true });
{
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.goto(base + "/", { waitUntil: "load" });
  await page.getByTestId("connect-wallet").first().click();
  await page.getByRole("dialog", { name: "Connect a wallet" }).waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: "qa-output/chalk-dialog-picker.png" });
}
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => localStorage.setItem("deed.simwallet", "1"));
  const page = await ctx.newPage();
  await page.goto(base + "/auctions", { waitUntil: "load" });
  await page.getByTestId("lot-card").filter({ hasText: "Brass Key" }).getByRole("link", { name: "View Auction" }).click();
  await page.getByTestId("place-bid").click();
  await page.getByRole("dialog", { name: "Confirm bid" }).waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: "qa-output/chalk-dialog-bid.png" });
}
await browser.close(); console.log("ok");
