import idl from "@/chain/idl/deed_fun.json";

/** A rule was broken (bad bid, not the owner, offer expired…). The message is safe to show to the user. */
export class DeedRuleError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "DeedRuleError";
    this.code = code;
  }
}

/** User closed / declined the wallet prompt. */
export const isUserRejection = (e: unknown): boolean => {
  const err = e as { code?: number; name?: string; message?: string } | null;
  const m = String(err?.message ?? e ?? "");
  return err?.code === 4001 || err?.name === "WalletSignTransactionError" && /reject|declin|cancel|denied/i.test(m) || /user rejected|rejected the request|request rejected|cancell?ed|denied|declined/i.test(m);
};

const DEED_ERRORS = new Map<number, string>((idl.errors ?? []).map((e: { code: number; name: string; msg?: string }) => [e.code, e.msg ?? e.name]));

/** Everything a thrown value can tell us: message, nested errors, and the program logs the RPC attached. */
function collectText(e: unknown, depth = 0): string {
  if (e == null || depth > 3) return "";
  if (typeof e === "string") return e;
  const o = e as { message?: unknown; logs?: unknown; error?: unknown; cause?: unknown };
  const logs = Array.isArray(o.logs) ? (o.logs as unknown[]).join("\n") : "";
  return [typeof o.message === "string" ? o.message : "", logs, collectText(o.error, depth + 1), collectText(o.cause, depth + 1)].filter(Boolean).join("\n");
}

/**
 * Turns a failed transaction into the program's own words. Anchor writes `Error Message: …` into the logs for every error
 * it raises (ours and its constraint checks); a bare `custom program error: 0x…` is mapped through the IDL's error table.
 */
export function chainErrorMessage(e: unknown): string | null {
  const text = collectText(e);
  if (!text) return null;
  const anchor = /Error Message: ([^"\\\n]+?)\.?\s*(?:["\\]|\n|$)/.exec(text);
  if (anchor) return anchor[1].trim().replace(/\.$/, "") + ".";
  const custom = /custom program error: 0x([0-9a-f]+)/i.exec(text);
  if (custom) {
    const msg = DEED_ERRORS.get(parseInt(custom[1], 16));
    if (msg) return msg + ".";
  }
  if (/insufficient lamports|insufficient funds|attempt to debit an account but found no record of a prior credit|0x1\b/i.test(text)) {
    return "Your wallet does not have enough SOL for this (including network fees and account rent).";
  }
  if (/"code"\s*:\s*403|access forbidden|status code:? 403|\(403\)/i.test(text)) {
    return "The Solana RPC endpoint refused the request: public endpoints block the program queries this app needs. Set NEXT_PUBLIC_SOLANA_RPC_URL in .env.local to a dedicated RPC (Helius, QuickNode, Triton…) and restart.";
  }
  if (/"code"\s*:\s*429|too many requests|rate limit/i.test(text)) return "The Solana RPC endpoint is rate-limiting this app. Try again in a moment, or use a dedicated RPC (NEXT_PUBLIC_SOLANA_RPC_URL).";
  if (/program that does not exist|ProgramAccountNotFound|invalid program argument/i.test(text)) return "The Deed program is not deployed on this network yet, so this action is not available.";
  if (/blockhash not found|block height exceeded|has expired/i.test(text)) return "The transaction expired before it was confirmed. Nothing was spent: try again.";
  return null;
}

/**
 * The RPC endpoint itself is unusable (it refuses the app's queries, rate-limits it, or cannot be reached). Distinct from a
 * rule being broken or a transaction failing: reads fall back to empty pages instead of showing an error box.
 */
export function isRpcUnavailable(e: unknown): boolean {
  const text = collectText(e);
  return /"code"\s*:\s*(403|429)|access forbidden|status code:? (403|429)|\(403\)|too many requests|rate limit|failed to fetch|fetch failed|networkerror|load failed|ECONNREFUSED|ENOTFOUND/i.test(text);
}

/** Maps anything thrown to a short, honest message for a toast. */
export function friendlyError(e: unknown): string {
  if (isUserRejection(e)) return "You cancelled in your wallet. Nothing was sent.";
  if (e instanceof DeedRuleError) return e.message;
  const onChain = chainErrorMessage(e);
  if (onChain) return onChain;
  const m = e instanceof Error ? e.message : String(e ?? "");
  return m || "Something went wrong.";
}
