import { readFileSync } from "node:fs";
import path from "node:path";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction, type TransactionInstruction } from "@solana/web3.js";
import type { TxContext } from "@/services/types";

export const RPC = process.env.E2E_RPC ?? "http://127.0.0.1:8899";
export const conn = new Connection(RPC, "confirmed");

export const adminKeypair = () =>
  Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path.resolve(__dirname, ".out/admin.json"), "utf8"))));

export async function airdrop(to: PublicKey, sol: number) {
  const sig = await conn.requestAirdrop(to, sol * LAMPORTS_PER_SOL);
  const bh = await conn.getLatestBlockhash();
  await conn.confirmTransaction({ signature: sig, ...bh }, "confirmed");
}

export async function wallet(sol = 20) {
  const kp = Keypair.generate();
  await airdrop(kp.publicKey, sol);
  return kp;
}

/** A TxContext backed by a keypair: signs, sends and waits for confirmation exactly like the browser wallet path. */
export function ctxFor(kp: Keypair): TxContext {
  return {
    wallet: kp.publicKey.toBase58(),
    connection: conn,
    async send(tx: Transaction, opts) {
      const bh = await conn.getLatestBlockhash("confirmed");
      tx.feePayer = kp.publicKey;
      tx.recentBlockhash = bh.blockhash;
      tx.sign(kp, ...(opts?.signers ?? []));
      const wire = tx.serialize(); // throws if the transaction is over the 1232-byte limit
      const sig = await conn.sendRawTransaction(wire, { preflightCommitment: "confirmed" });
      const res = await conn.confirmTransaction({ signature: sig, ...bh }, "confirmed");
      if (res.value.err) throw new Error(`transaction ${sig} failed: ${JSON.stringify(res.value.err)}`);
      return sig;
    },
  };
}

export async function sendIxs(kp: Keypair, ixs: TransactionInstruction[], extra: Keypair[] = []) {
  return ctxFor(kp).send(new Transaction().add(...ixs), { signers: extra });
}

/** Logs of a confirmed transaction (for asserting on program behaviour). */
export async function logsOf(sig: string): Promise<string[]> {
  const tx = await conn.getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
  return tx?.meta?.logMessages ?? [];
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ shared setup

import { PROGRAM_ID, configPda, ix } from "@/chain/program";

/** Initialises the Deed config on the validator once (only the upgrade authority can). Returns the treasury address. */
export async function ensureInitialised(): Promise<PublicKey> {
  const cfg = await conn.getAccountInfo(configPda());
  if (cfg) {
    const { decodeConfig } = await import("@/chain/accounts");
    return new PublicKey(decodeConfig(cfg).treasury);
  }
  const admin = adminKeypair();
  await airdrop(admin.publicKey, 5);
  const treasury = await wallet(2);
  const programData = PublicKey.findProgramAddressSync([PROGRAM_ID.toBuffer()], new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111"))[0];
  await sendIxs(admin, [ix("initialize", {}, { admin: admin.publicKey, config: configPda(), treasury: treasury.publicKey, program_data: programData })]);
  return treasury.publicKey;
}
