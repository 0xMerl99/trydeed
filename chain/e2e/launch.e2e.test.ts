/**
 * End to end against REAL Pump.fun programs (cloned from mainnet into a local validator) and the compiled Deed program:
 * launch a coin through the same `launch()` the app uses, prove the creator fees are locked to the Deed vault, generate
 * real trading fees with a real Pump buy, and claim them with the Deed. Nothing here is mocked.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { ComputeBudgetProgram, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PUMP_SDK, OnlinePumpSdk, feeSharingConfigPda, getBuyV3TokenAmountFromQuoteAmount } from "@pump-fun/pump-sdk";
import { BN } from "@coral-xyz/anchor";
import { adminKeypair, airdrop, conn, ctxFor, wallet, sendIxs } from "./helpers";
import { launch } from "@/chain/launch";
import { PROGRAM_ID, configPda, deedStatePda, ix, vaultPda } from "@/chain/program";
import { decodeDeedState } from "@/chain/accounts";

const BPF_UPGRADEABLE = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");

let creator: Keypair;
let coinMint: PublicKey;
let deedMint: PublicKey;

beforeAll(async () => {
  const health = await conn.getVersion().catch(() => null);
  if (!health) throw new Error("No validator on 127.0.0.1:8899. Start it with: wsl bash chain/e2e/validator.sh");
  creator = await wallet(50);
});

describe("deed program on a validator with the real Pump programs", () => {
  it("initialises the config (only the upgrade authority can)", async () => {
    const admin = adminKeypair();
    await airdrop(admin.publicKey, 5);
    const treasury = await wallet(2);
    const programData = PublicKey.findProgramAddressSync([PROGRAM_ID.toBuffer()], BPF_UPGRADEABLE)[0];
    const accounts = { admin: admin.publicKey, config: configPda(), treasury: treasury.publicKey, program_data: programData };

    // a stranger cannot initialise it
    const stranger = await wallet(2);
    await expect(sendIxs(stranger, [ix("initialize", {}, { ...accounts, admin: stranger.publicKey })])).rejects.toThrow();

    // (the validator keeps state between runs: initialise only the first time)
    if (!(await conn.getAccountInfo(configPda()))) await sendIxs(admin, [ix("initialize", {}, accounts)]);
    expect(await conn.getAccountInfo(configPda())).not.toBeNull();
  });

  it("launches a coin on Pump and locks its creator fees to the Deed vault", async () => {
    const steps: string[] = [];
    const out = await launch(
      ctxFor(creator),
      { name: "Chalk Test", ticker: "CHALK", description: "e2e", image: null, twitter: "", telegram: "", onStep: (s) => steps.push(s.label) },
      // The IPFS upload is an external service and is the ONLY thing replaced here; every transaction below is real.
      { upload: async () => ({ uri: "https://example.com/coin.json", deedUri: "https://example.com/deed.json" }) },
    );
    coinMint = new PublicKey(out.coinMint);
    deedMint = new PublicKey(out.deedMint);
    expect(out.signatures.length).toBe(4);
    expect(steps).toHaveLength(4);

    // Pump's own account says: one shareholder, the Deed vault, 100 %, authority revoked
    const info = (await conn.getAccountInfo(feeSharingConfigPda(coinMint)))!;
    const cfg = PUMP_SDK.decodeSharingConfig(info);
    expect(cfg.adminRevoked).toBe(true);
    expect(cfg.shareholders).toHaveLength(1);
    expect(cfg.shareholders[0].address.toBase58()).toBe(vaultPda(coinMint).toBase58());
    expect(cfg.shareholders[0].shareBps).toBe(10_000);

    // the Deed program recorded it
    const st = decodeDeedState(deedStatePda(coinMint), (await conn.getAccountInfo(deedStatePda(coinMint)))!);
    expect(st.deedMint).toBe(deedMint.toBase58());
    expect(st.creator).toBe(creator.publicKey.toBase58());

    // the Deed is a true 1/1 held by the creator, with no authorities left
    const mintAcc = await conn.getParsedAccountInfo(deedMint);
    const parsed = (mintAcc.value!.data as { parsed: { info: { supply: string; decimals: number; mintAuthority: string | null; freezeAuthority: string | null } } }).parsed.info;
    expect(parsed.supply).toBe("1");
    expect(parsed.decimals).toBe(0);
    expect(parsed.mintAuthority).toBeNull();
    expect(parsed.freezeAuthority).toBeNull();
  });

  it("a real Pump buy generates creator fees that reach the Deed holder through distribute + claim", async () => {
    const trader = await wallet(30);
    const sdk = new OnlinePumpSdk(conn);
    const [global, feeConfig] = await Promise.all([sdk.fetchGlobal(), sdk.fetchFeeConfig()]);
    const { bondingCurve, associatedUserAccountInfo, quoteTokenProgram, curveBaseTokenBalance } = await sdk.fetchBuyState(coinMint, trader.publicKey, TOKEN_2022_PROGRAM_ID);
    const quoteAmount = new BN(5_000_000_000); // spend at most 5 SOL, fees included
    const buy = await PUMP_SDK.buyExactQuoteInV3Instructions({
      bondingCurve,
      associatedUserAccountInfo,
      mint: coinMint,
      user: trader.publicKey,
      quoteAmount,
      amount: getBuyV3TokenAmountFromQuoteAmount({ global, feeConfig, mintSupply: bondingCurve.tokenTotalSupply, bondingCurve, amount: quoteAmount, curveBaseTokenBalance }),
      slippage: 5,
      quoteTokenProgram,
    });
    await sendIxs(trader, [ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), ...buy]);

    // Pump now holds creator fees for this coin on the curve. Sweep + distribute them (permissionless) into the Deed vault.
    const { instructions, sweepCount } = await sdk.buildDistributeCreatorFeesInstructions(coinMint, { payer: trader.publicKey });
    expect(sweepCount).toBeGreaterThan(0);
    await sendIxs(trader, [ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), ...instructions]);
    const vault = vaultPda(coinMint);
    const rent0 = await conn.getMinimumBalanceForRentExemption(0);
    const inVault = (await conn.getBalance(vault)) - rent0;
    expect(inVault).toBeGreaterThan(0);

    // The Deed holder claims it
    const before = await conn.getBalance(creator.publicKey);
    const deedAta = getAssociatedTokenAddressSync(deedMint, creator.publicKey, false, TOKEN_2022_PROGRAM_ID);
    await sendIxs(creator, [
      ix("claim_fees", {}, { claimant: creator.publicKey, deed_state: deedStatePda(coinMint), vault, deed_token: deedAta, system_program: SystemProgram.programId }),
    ]);
    const after = await conn.getBalance(creator.publicKey);
    expect(after - before).toBeGreaterThan(inVault - 20_000);
    expect(await conn.getBalance(vault)).toBe(rent0);
  });
});
