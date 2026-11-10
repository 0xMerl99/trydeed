/**
 * Pump.fun integration points. Addresses come from the official pump-public-docs / published IDLs. Heavy SDK code is
 * loaded lazily, only by the flows that build Pump instructions (launch, claim), never by a page that just lists coins.
 */
import { PublicKey, type Connection, type TransactionInstruction } from "@solana/web3.js";

export const PUMP_PROGRAM = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
export const PUMP_FEES_PROGRAM = new PublicKey("pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ");

export const bondingCurvePda = (mint: PublicKey) => PublicKey.findProgramAddressSync([Buffer.from("bonding-curve"), mint.toBuffer()], PUMP_PROGRAM)[0];
export const sharingConfigPda = (mint: PublicKey) => PublicKey.findProgramAddressSync([Buffer.from("sharing-config"), mint.toBuffer()], PUMP_FEES_PROGRAM)[0];
export const creatorVaultPda = (creator: PublicKey) => PublicKey.findProgramAddressSync([Buffer.from("creator-vault"), creator.toBuffer()], PUMP_PROGRAM)[0];

export interface CurveView {
  virtualTokenReserves: bigint;
  virtualQuoteReserves: bigint;
  tokenTotalSupply: bigint;
  complete: boolean;
  /** Creator fees accrued on the curve and not yet swept to the creator vault (v3 trades). */
  creatorFeeUnswept: bigint;
}

/** Layout of Pump's `BondingCurve` account (IDL order): disc(8) u64 x5 | complete | creator(32) | … | creator_fee u64 @125. */
export function decodeCurve(data: Buffer): CurveView | null {
  if (data.length < 49) return null;
  return {
    virtualTokenReserves: data.readBigUInt64LE(8),
    virtualQuoteReserves: data.readBigUInt64LE(16),
    tokenTotalSupply: data.readBigUInt64LE(40),
    complete: data[48] !== 0,
    creatorFeeUnswept: data.length >= 133 ? data.readBigUInt64LE(125) : 0n,
  };
}

/** Market cap in lamports from the curve's virtual reserves (SOL-quoted coins): supply x price. */
export function marketCapLamports(c: CurveView): bigint | null {
  if (c.virtualTokenReserves === 0n) return null;
  return (c.virtualQuoteReserves * c.tokenTotalSupply) / c.virtualTokenReserves;
}

/** Fees that Pump holds for a coin but has not paid into the Deed vault yet: un-swept curve bucket + creator-vault balance. */
export async function pendingPumpFees(conn: Connection, coinMint: PublicKey): Promise<bigint> {
  const sharing = sharingConfigPda(coinMint);
  const [curve, vault] = await conn.getMultipleAccountsInfo([bondingCurvePda(coinMint), creatorVaultPda(sharing)]);
  let total = curve ? (decodeCurve(curve.data)?.creatorFeeUnswept ?? 0n) : 0n;
  if (vault) {
    const floor = BigInt(await conn.getMinimumBalanceForRentExemption(vault.data.length));
    const extra = BigInt(vault.lamports) - floor;
    if (extra > 0n) total += extra;
  }
  return total;
}

/**
 * The instructions that move a coin's accrued creator fees into the Deed vault: sweep the curve bucket (if any), then
 * Pump's permissionless `distribute_creator_fees`. They are built by Pump's own SDK. Returns `[]` when Pump holds nothing
 * distributable.
 */
export async function distributeInstructions(conn: Connection, payer: PublicKey, coinMint: PublicKey): Promise<{ instructions: TransactionInstruction[]; sweepCount: number }> {
  const { OnlinePumpSdk } = await import("@pump-fun/pump-sdk");
  const sdk = new OnlinePumpSdk(conn);
  try {
    const r = await sdk.buildDistributeCreatorFeesInstructions(coinMint, { payer });
    return { instructions: r.instructions, sweepCount: r.sweepCount };
  } catch {
    return { instructions: [], sweepCount: 0 };
  }
}
