// Shared by the browser QA scripts: connects the app's flagged "E2E Burner" test wallet (a real keypair wallet that only
// exists when the app is started with NEXT_PUBLIC_E2E_BURNER_SECRET on a non-mainnet cluster).
export async function connectBurner(page) {
  await page.getByTestId("connect-wallet").first().click();
  await page.getByRole("button", { name: /E2E Burner/ }).click();
  await page.getByTestId("wallet-menu").first().waitFor();
  await page.getByRole("dialog", { name: "Connect a wallet" }).waitFor({ state: "hidden" }); // never interact through a closing modal
}
