/**
 * Launching a coin. Two modes:
 *
 *  - **"pump"** (works on any network, needs nothing of ours): ONE transaction, Pump.fun `create_v2`. The wallet is the coin's
 *    creator and earns its creator fees directly, exactly as on pump.fun. No Deed exists yet. The coin is remembered on this
 *    device so it can be upgraded later.
 *  - **"deed"** (needs the Deed program deployed and initialised): four real transactions, each one a wallet prompt.
 *
 *      1. Pump.fun `create_v2`   – the coin itself (skipped when upgrading a coin that already exists).
 *      2. Pump Fees fee-sharing  – `create_fee_sharing_config` + `update_fee_shares_v2` with ONE shareholder: the Deed vault PDA
 *                                  at 100 %. Updating shares revokes the admin authority in the same step, so the split can
 *                                  never change again. The vault is pre-funded with the rent-exempt minimum so Pump's first
 *                                  payout always lands. Fees the curve still holds are swept to the creator first.
 *      3. The Deed               – a Token-2022 mint (metadata pointer + on-mint metadata), 1 token minted to the creator,
 *                                  mint authority revoked. Created by the creator's wallet, not by us.
 *      4. `register_deed`        – the Deed program VERIFIES steps 2-3 from Pump's and the token program's own account data,
 *                                  then records the link. It cannot be tricked into registering a coin whose fees are not
 *                                  locked to the vault.
 *
 * Every step checks the chain first, so a launch that was interrupted (closed tab, rejected prompt, dropped connection)
 * resumes where it stopped instead of repeating anything. A pump-mode coin is upgraded by calling `launch` again in "deed"
 * mode with `resume: <coin mint>`.
 */
import {
  AuthorityType,
  ExtensionType,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMetadataPointerInstruction,
  createInitializeMintInstruction,
  createMintToInstruction,
  createSetAuthorityInstruction,
  getMintLen,
} from "@solana/spl-token";
import {
  createInitializeInstruction as createInitializeMetadataInstruction,
  createUpdateAuthorityInstruction,
  createUpdateFieldInstruction,
  pack as packMetadata,
} from "@solana/spl-token-metadata";
import { ComputeBudgetProgram, Keypair, PublicKey, SystemProgram, Transaction, type TransactionInstruction } from "@solana/web3.js";
import { config } from "@/lib/config";
import { DeedRuleError } from "@/lib/errors";
import { lsGetJson, lsSetJson } from "@/lib/storage";
import type { LaunchInput, TxContext } from "@/services/types";
import { bondingCurvePda, decodeCurve } from "./pump";
import { PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ata, configPda, deedStatePda, ix, vaultPda, SYSTEM_PROGRAM } from "./program";

export interface UploadedMetadata {
  /** Metadata JSON of the coin (stored in Pump's token metadata). */
  uri: string;
  /** Metadata JSON of the Deed. */
  deedUri: string;
}

export interface LaunchDeps {
  /** Pins the image and the two metadata JSON files and returns their URIs. */
  upload(args: { coinMint: string; name: string; symbol: string; description: string; image: string | null; twitter: string; telegram: string }): Promise<UploadedMetadata>;
}

/** Default: the app's own `/api/metadata` route, which pins to IPFS with a server-side key. */
export const defaultDeps: LaunchDeps = {
  async upload(args) {
    const res = await fetch("/api/metadata", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(args) });
    const body = (await res.json().catch(() => null)) as { uri?: string; deedUri?: string; error?: string } | null;
    if (!res.ok || !body?.uri || !body.deedUri) throw new Error(body?.error ?? `Metadata upload failed (${res.status}).`);
    return { uri: body.uri, deedUri: body.deedUri };
  },
};

/** A coin this device launched that does not have a finished Deed yet (addresses only: never keys). */
export interface PendingLaunch {
  coinMint: string;
  uri: string;
  deedUri: string;
  deedMint?: string;
  name: string;
  symbol: string;
  createdAt: number;
}
const pendingKey = (wallet: string) => `deed.launches.${wallet}`;
export const loadPendingLaunches = (wallet: string): PendingLaunch[] => lsGetJson<PendingLaunch[]>(pendingKey(wallet), []);
function savePending(wallet: string, p: PendingLaunch) {
  const rest = loadPendingLaunches(wallet).filter((x) => x.coinMint !== p.coinMint);
  lsSetJson(pendingKey(wallet), [p, ...rest]);
}
function removePending(wallet: string, coinMint: string) {
  lsSetJson(pendingKey(wallet), loadPendingLaunches(wallet).filter((x) => x.coinMint !== coinMint));
}

const budget = (units: number): TransactionInstruction[] => [
  ComputeBudgetProgram.setComputeUnitLimit({ units }),
  ...(config.priorityFee > 0 ? [ComputeBudgetProgram.setComputeUnitPrice({ microLamports: config.priorityFee })] : []),
];

export const TOTAL_STEPS = 4;

export interface LaunchOutcome {
  coinMint: string;
  /** `null` for a pump-mode launch: there is no Deed yet. */
  deedMint: string | null;
  signatures: string[];
}

export type ProgramReadiness = { ready: true } | { ready: false; code: "NOT_DEPLOYED" | "NOT_INITIALISED"; message: string };

/** Is the Deed program deployed AND initialised on this network? (Two plain account reads.) */
export async function programReadiness(conn: TxContext["connection"]): Promise<ProgramReadiness> {
  const [program, cfg] = await Promise.all([conn.getAccountInfo(PROGRAM_ID), conn.getAccountInfo(configPda())]);
  if (!program?.executable) return { ready: false, code: "NOT_DEPLOYED", message: "The Deed program is not deployed on this network yet." };
  if (!cfg) return { ready: false, code: "NOT_INITIALISED", message: "The Deed program is deployed but not initialised on this network yet." };
  return { ready: true };
}

/**
 * Refuses a "deed" launch unless the program is ready. This matters: step 2 locks the coin's creator fees, irrevocably, to a
 * vault that only the Deed program can pay out. Without the program those fees would be stuck, so nothing may be sent (not even
 * step 1) until the program is really there.
 */
export async function assertProgramReady(conn: TxContext["connection"]): Promise<void> {
  const r = await programReadiness(conn);
  if (!r.ready) throw new DeedRuleError(r.code, `${r.message} Launching a Deed is disabled; nothing was created and nothing was spent.`);
}

export async function launch(ctx: TxContext, input: LaunchInput, deps: LaunchDeps = defaultDeps): Promise<LaunchOutcome> {
  const conn = ctx.connection;
  const mode = input.mode ?? "deed";
  if (mode === "deed") await assertProgramReady(conn); // before ANY transaction, including the Pump coin creation
  const wallet = new PublicKey(ctx.wallet);
  const total = mode === "pump" ? 1 : TOTAL_STEPS;
  const step = (index: number, label: string) => input.onStep?.({ index, total, label });
  const signatures: string[] = [];
  const { PUMP_SDK, feeSharingConfigPda } = await import("@pump-fun/pump-sdk");
  const { NATIVE_MINT, TOKEN_PROGRAM_ID } = await import("@solana/spl-token");

  const name = input.name.trim();
  const symbol = input.ticker.trim();

  // ---------------------------------------------------------------- 1. the coin
  let pending: PendingLaunch | null = null;
  if (input.resume) {
    // Upgrading / resuming a specific coin. A new launch never silently resumes an old one.
    pending = loadPendingLaunches(ctx.wallet).find((p) => p.coinMint === input.resume) ?? null;
    if (!pending) throw new DeedRuleError("NO_PENDING", "That launch is not pending on this device any more.");
    if ((await conn.getAccountInfo(new PublicKey(pending.coinMint))) === null) throw new DeedRuleError("NO_COIN", "That coin does not exist on this network.");
  } else {
    step(1, "Creating your coin on Pump.fun");
    const coinKp = Keypair.generate();
    const meta = await deps.upload({ coinMint: coinKp.publicKey.toBase58(), name, symbol, description: input.description, image: input.image, twitter: input.twitter, telegram: input.telegram });
    const create = await PUMP_SDK.createV2Instruction({
      mint: coinKp.publicKey,
      name,
      symbol,
      uri: meta.uri,
      creator: wallet,
      user: wallet,
      mayhemMode: false,
    });
    signatures.push(await ctx.send(new Transaction().add(...budget(400_000), create), { signers: [coinKp] }));
    pending = { coinMint: coinKp.publicKey.toBase58(), uri: meta.uri, deedUri: meta.deedUri, name, symbol, createdAt: Math.floor(Date.now() / 1000) };
    savePending(ctx.wallet, pending);
  }
  const coinMint = new PublicKey(pending.coinMint);
  if (mode === "pump") return { coinMint: coinMint.toBase58(), deedMint: null, signatures };
  const vault = vaultPda(coinMint);

  // ---------------------------------------------------------------- 2. lock the creator fees to the Deed vault
  const sharingAddr = feeSharingConfigPda(coinMint);
  let sharing = await conn.getAccountInfo(sharingAddr);
  const decoded = sharing ? PUMP_SDK.decodeSharingConfig(sharing) : null;
  const locked = !!decoded && decoded.adminRevoked && decoded.shareholders.length === 1 && decoded.shareholders[0].address.equals(vault) && decoded.shareholders[0].shareBps === 10_000;
  const rent0 = await conn.getMinimumBalanceForRentExemption(0);
  const vaultLamports = (await conn.getBalance(vault)) ?? 0;
  if (!locked) {
    step(2, "Locking the creator fees to your Deed");
    // A coin that has already traded holds creator fees on its curve. Pump refuses to create or change the fee split until they are
    // swept to the current creator (error 6095), so sweep first. Those fees are yours: you collect them on Pump.fun.
    if (!sharing) {
      const curve = await conn.getAccountInfo(bondingCurvePda(coinMint));
      const unswept = curve ? (decodeCurve(curve.data)?.creatorFeeUnswept ?? 0n) : 0n;
      if (unswept > 0n) {
        const sweep = await PUMP_SDK.sweepCreatorFeeInstruction({ payer: wallet, mint: coinMint, creator: wallet, quoteMint: NATIVE_MINT, quoteTokenProgram: TOKEN_PROGRAM_ID });
        signatures.push(await ctx.send(new Transaction().add(...budget(250_000), sweep)));
      }
    }
    const ixs: TransactionInstruction[] = [...budget(300_000)];
    if (vaultLamports < rent0) ixs.push(SystemProgram.transfer({ fromPubkey: wallet, toPubkey: vault, lamports: rent0 - vaultLamports }));
    if (!sharing) ixs.push(await PUMP_SDK.createFeeSharingConfig({ creator: wallet, mint: coinMint, pool: null }));
    ixs.push(
      await PUMP_SDK.updateFeeSharesV2({
        authority: wallet,
        mint: coinMint,
        currentShareholders: decoded ? decoded.shareholders.map((s) => s.address) : [wallet],
        newShareholders: [{ address: vault, shareBps: 10_000 }],
        quoteMint: NATIVE_MINT,
        quoteTokenProgram: TOKEN_PROGRAM_ID,
        bondingCurveComplete: false,
      }),
    );
    signatures.push(await ctx.send(new Transaction().add(...ixs)));
    sharing = await conn.getAccountInfo(sharingAddr);
  } else if (vaultLamports < rent0) {
    await ctx.send(new Transaction().add(SystemProgram.transfer({ fromPubkey: wallet, toPubkey: vault, lamports: rent0 - vaultLamports })));
  }

  // ---------------------------------------------------------------- 3. the Deed token
  let deedMint = pending.deedMint ? new PublicKey(pending.deedMint) : null;
  if (!deedMint || (await conn.getAccountInfo(deedMint)) === null) {
    step(3, "Minting your Deed");
    const kp = Keypair.generate();
    deedMint = kp.publicKey;
    const deedName = `Deed: ${pending.name}`.slice(0, 32);
    const metadata = { mint: deedMint, name: deedName, symbol: "DEED", uri: pending.deedUri, additionalMetadata: [["coin", coinMint.toBase58()]] as [string, string][] };
    const mintLen = getMintLen([ExtensionType.MetadataPointer]);
    const metadataLen = 4 + packMetadata({ ...metadata, updateAuthority: wallet }).length;
    const lamports = await conn.getMinimumBalanceForRentExemption(mintLen + metadataLen);
    const deedAta = ata(wallet, deedMint, TOKEN_2022_PROGRAM_ID);
    const tx = new Transaction().add(
      ...budget(200_000),
      SystemProgram.createAccount({ fromPubkey: wallet, newAccountPubkey: deedMint, space: mintLen, lamports, programId: TOKEN_2022_PROGRAM_ID }),
      // The metadata pointer has no authority: nobody can ever repoint this Deed's metadata.
      createInitializeMetadataPointerInstruction(deedMint, null, deedMint, TOKEN_2022_PROGRAM_ID),
      createInitializeMintInstruction(deedMint, 0, wallet, null, TOKEN_2022_PROGRAM_ID),
      createInitializeMetadataInstruction({ programId: TOKEN_2022_PROGRAM_ID, metadata: deedMint, updateAuthority: wallet, mint: deedMint, mintAuthority: wallet, name: metadata.name, symbol: metadata.symbol, uri: metadata.uri }),
      createUpdateFieldInstruction({ programId: TOKEN_2022_PROGRAM_ID, metadata: deedMint, updateAuthority: wallet, field: "coin", value: coinMint.toBase58() }),
      // then the metadata becomes immutable ...
      createUpdateAuthorityInstruction({ programId: TOKEN_2022_PROGRAM_ID, metadata: deedMint, oldAuthority: wallet, newAuthority: null }),
      createAssociatedTokenAccountIdempotentInstruction(wallet, deedAta, wallet, deedMint, TOKEN_2022_PROGRAM_ID),
      createMintToInstruction(deedMint, deedAta, wallet, 1n, [], TOKEN_2022_PROGRAM_ID),
      // ... and so does the supply: exactly one Deed will ever exist.
      createSetAuthorityInstruction(deedMint, wallet, AuthorityType.MintTokens, null, [], TOKEN_2022_PROGRAM_ID),
    );
    signatures.push(await ctx.send(tx, { signers: [kp] }));
    pending = { ...pending, deedMint: deedMint.toBase58() };
    savePending(ctx.wallet, pending);
  }

  // ---------------------------------------------------------------- 4. register
  const deedState = deedStatePda(coinMint);
  if ((await conn.getAccountInfo(deedState)) === null) {
    step(4, "Registering the Deed");
    const register = ix(
      "register_deed",
      {},
      {
        creator: wallet,
        coin_mint: coinMint,
        sharing_config: sharingAddr,
        vault,
        deed_mint: deedMint,
        creator_deed_account: ata(wallet, deedMint, TOKEN_2022_PROGRAM_ID),
        deed_state: deedState,
        token_program: TOKEN_2022_PROGRAM_ID,
        system_program: SYSTEM_PROGRAM,
      },
    );
    signatures.push(await ctx.send(new Transaction().add(...budget(150_000), register)));
  }
  removePending(ctx.wallet, coinMint.toBase58());
  return { coinMint: coinMint.toBase58(), deedMint: deedMint.toBase58(), signatures };
}
