/**
 * Real Solana reads (via the configured RPC). Nothing in this file fabricates data:
 * - cluster verification compares the RPC's genesis hash to the published hash of the configured cluster
 * - balances / token holdings are `getBalance` / `getParsedTokenAccountsByOwner`
 * - cluster time is the block time of the latest slot
 */
import { Connection, PublicKey } from "@solana/web3.js";
import { GENESIS_HASH, config, type Cluster } from "./config";
import type { TokenHolding } from "@/types";

let _conn: Connection | null = null;
export function getConnection(): Connection {
  return (_conn ??= new Connection(config.rpcUrl, { commitment: "confirmed" }));
}

export function isValidPublicKey(s: string): boolean {
  try {
    return new PublicKey(s.trim()).toBytes().length === 32;
  } catch {
    return false;
  }
}

export type ClusterCheck =
  | { status: "ok"; cluster: Cluster }
  | { status: "mismatch"; expected: Cluster; genesis: string }
  | { status: "unverified"; reason: string };

let verifyP: Promise<ClusterCheck> | null = null;
/** Confirms the RPC endpoint is really the cluster the app is configured for. One RPC call per page load, shared. */
export function verifyCluster(): Promise<ClusterCheck> {
  return (verifyP ??= doVerify());
}

async function doVerify(): Promise<ClusterCheck> {
  const expected = GENESIS_HASH[config.cluster];
  if (!expected) return { status: "unverified", reason: "No published genesis hash for this cluster." };
  try {
    const genesis = await getConnection().getGenesisHash();
    return genesis === expected ? { status: "ok", cluster: config.cluster } : { status: "mismatch", expected: config.cluster, genesis };
  } catch (e) {
    return { status: "unverified", reason: e instanceof Error ? e.message : "RPC unreachable" };
  }
}

export async function getSolBalance(address: string): Promise<bigint> {
  return BigInt(await getConnection().getBalance(new PublicKey(address)));
}

/** Seconds since epoch from the cluster, not the browser clock. */
export async function getClusterTime(): Promise<number> {
  const c = getConnection();
  const slot = await c.getSlot("confirmed");
  const t = await c.getBlockTime(slot);
  if (t == null) throw new Error("Cluster returned no block time");
  return t;
}

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

export interface MintInfo {
  mint: string;
  decimals: number;
  supply: bigint;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  standard: "SPL Token" | "Token-2022";
  /** Token-2022 extensions present on the mint (e.g. "transferFeeConfig"). */
  extensions: string[];
}

/** Reads a token mint's real on-chain facts. Throws if the account is not a token mint. */
export async function getMintInfo(mint: string): Promise<MintInfo> {
  const res = await getConnection().getParsedAccountInfo(new PublicKey(mint));
  const acc = res.value;
  if (!acc) throw new Error("No account exists at that address on this network.");
  const owner = acc.owner.toBase58();
  if (owner !== TOKEN_PROGRAM && owner !== TOKEN_2022_PROGRAM) throw new Error("That address is not a token mint.");
  const data = acc.data as { parsed?: { type?: string; info?: Record<string, unknown> } };
  if (data.parsed?.type !== "mint") throw new Error("That address is not a token mint.");
  const i = data.parsed.info as {
    decimals: number; supply: string; mintAuthority: string | null; freezeAuthority: string | null; extensions?: { extension: string }[];
  };
  return {
    mint,
    decimals: i.decimals,
    supply: BigInt(i.supply),
    mintAuthority: i.mintAuthority ?? null,
    freezeAuthority: i.freezeAuthority ?? null,
    standard: owner === TOKEN_2022_PROGRAM ? "Token-2022" : "SPL Token",
    extensions: (i.extensions ?? []).map((e) => e.extension),
  };
}

/** Non-zero SPL / Token-2022 balances of a wallet, largest first. */
export async function getTokenHoldings(owner: string, limit = 200): Promise<{ tokens: TokenHolding[]; truncated: boolean }> {
  const c = getConnection();
  const pk = new PublicKey(owner);
  const [a, b] = await Promise.all([
    c.getParsedTokenAccountsByOwner(pk, { programId: new PublicKey(TOKEN_PROGRAM) }),
    c.getParsedTokenAccountsByOwner(pk, { programId: new PublicKey(TOKEN_2022_PROGRAM) }).catch(() => ({ value: [] as never[] })),
  ]);
  const merged = new Map<string, TokenHolding>();
  for (const { account } of [...a.value, ...b.value]) {
    const info = (account.data as { parsed?: { info?: { mint: string; tokenAmount: { amount: string; decimals: number } } } }).parsed?.info;
    if (!info) continue;
    const amount = BigInt(info.tokenAmount.amount);
    if (amount === 0n) continue;
    const prev = merged.get(info.mint);
    merged.set(info.mint, { mint: info.mint, decimals: info.tokenAmount.decimals, amount: (prev?.amount ?? 0n) + amount });
  }
  const all = [...merged.values()].sort((x, y) => (y.amount > x.amount ? 1 : y.amount < x.amount ? -1 : 0));
  return { tokens: all.slice(0, limit), truncated: all.length > limit };
}
