/**
 * History from the chain: the Deed program emits an Anchor event for every state change. We read the transaction logs of
 * the program (or of one account) and decode them. Accounts tell us what IS; events tell us what HAPPENED (bids, fills,
 * claims). Finished offers disappear as accounts, so their story is rebuilt from these events.
 *
 * This is a client-side indexer: it reads the most recent `limit` transactions. It is correct for what it returns and
 * complete for early volume; beyond that, point `NEXT_PUBLIC_SOLANA_RPC_URL` at a provider with full history and/or
 * replace this module with a Geyser/webhook indexer. See docs/INTEGRATIONS.md.
 */
import type { BN } from "@coral-xyz/anchor";
import { PublicKey, type Connection } from "@solana/web3.js";
import { eventParser } from "./program";

const NONE = PublicKey.default.toBase58();
const big = (v: BN) => BigInt(v.toString());
const key = (k: PublicKey) => k.toBase58();
const optKey = (k: PublicKey) => (k.toBase58() === NONE ? null : k.toBase58());

export type ChainEvent = { sig: string; slot: number; ts: number } & (
  | { kind: "DeedRegistered"; coinMint: string; deedMint: string; deedState: string; creator: string }
  | { kind: "FeesClaimed"; coinMint: string; deedMint: string; claimant: string; amount: bigint }
  | { kind: "AuctionCreated"; auction: string; deedMint: string; coinMint: string; seller: string; nonce: bigint; startPrice: bigint; startTime: number; endTime: number }
  | { kind: "BidPlaced"; auction: string; bidder: string; amount: bigint; endTime: number; extended: boolean; refundedBidder: string | null; refundedAmount: bigint }
  | { kind: "AuctionSettled"; auction: string; deedMint: string; coinMint: string; seller: string; winner: string; price: bigint; fee: bigint }
  | { kind: "AuctionCancelled"; auction: string; deedMint: string; seller: string }
  | { kind: "OfferCreated"; offer: string; maker: string; mint: string; side: "Sell" | "Buy"; counterparty: string | null; parent: string | null; amount: bigint; price: bigint; minFill: bigint; expiresAt: number }
  | { kind: "OfferFilled"; offer: string; maker: string; taker: string; mint: string; side: "Sell" | "Buy"; amount: bigint; lamports: bigint; fee: bigint; remaining: bigint }
  | { kind: "OfferClosed"; offer: string; maker: string; closer: string; status: "Cancelled" | "Rejected"; returnedAmount: bigint; returnedLamports: bigint }
);

/* eslint-disable @typescript-eslint/no-explicit-any */
function normalise(name: string, d: any): Record<string, unknown> | null {
  switch (name) {
    case "DeedRegistered":
      return { kind: name, coinMint: key(d.coin_mint), deedMint: key(d.deed_mint), deedState: key(d.deed_state), creator: key(d.creator) };
    case "FeesClaimed":
      return { kind: name, coinMint: key(d.coin_mint), deedMint: key(d.deed_mint), claimant: key(d.claimant), amount: big(d.amount) };
    case "AuctionCreated":
      return { kind: name, auction: key(d.auction), deedMint: key(d.deed_mint), coinMint: key(d.coin_mint), seller: key(d.seller), nonce: big(d.nonce), startPrice: big(d.start_price), startTime: Number(d.start_time), endTime: Number(d.end_time) };
    case "BidPlaced":
      return { kind: name, auction: key(d.auction), bidder: key(d.bidder), amount: big(d.amount), endTime: Number(d.end_time), extended: !!d.extended, refundedBidder: optKey(d.refunded_bidder), refundedAmount: big(d.refunded_amount) };
    case "AuctionSettled":
      return { kind: name, auction: key(d.auction), deedMint: key(d.deed_mint), coinMint: key(d.coin_mint), seller: key(d.seller), winner: key(d.winner), price: big(d.price), fee: big(d.fee) };
    case "AuctionCancelled":
      return { kind: name, auction: key(d.auction), deedMint: key(d.deed_mint), seller: key(d.seller) };
    case "OfferCreated":
      return { kind: name, offer: key(d.offer), maker: key(d.maker), mint: key(d.mint), side: Number(d.kind) === 0 ? "Sell" : "Buy", counterparty: optKey(d.counterparty), parent: optKey(d.parent), amount: big(d.amount), price: big(d.price), minFill: big(d.min_fill), expiresAt: Number(d.expires_at) };
    case "OfferFilled":
      return { kind: name, offer: key(d.offer), maker: key(d.maker), taker: key(d.taker), mint: key(d.mint), side: Number(d.kind) === 0 ? "Sell" : "Buy", amount: big(d.amount), lamports: big(d.lamports), fee: big(d.fee), remaining: big(d.remaining) };
    case "OfferClosed":
      return { kind: name, offer: key(d.offer), maker: key(d.maker), closer: key(d.closer), status: Number(d.status) === 3 ? "Rejected" : "Cancelled", returnedAmount: big(d.returned_amount), returnedLamports: big(d.returned_lamports) };
    default:
      return null;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function eventsFromLogs(logs: string[], meta: { sig: string; slot: number; ts: number }): ChainEvent[] {
  const out: ChainEvent[] = [];
  try {
    for (const e of eventParser.parseLogs(logs)) {
      const n = normalise(e.name, e.data);
      if (n) out.push({ ...meta, ...n } as ChainEvent);
    }
  } catch {
    /* a log line we cannot parse is ignored */
  }
  return out;
}

interface Cache {
  newest?: string;
  events: ChainEvent[];
}
const caches = new Map<string, Cache>();

/**
 * Events of the most recent `limit` successful transactions touching `address` (the program id for the global feed, an
 * auction/offer PDA for one record). Incremental: only signatures newer than the last call are fetched.
 */
export async function loadEvents(conn: Connection, address: PublicKey, limit = 100): Promise<ChainEvent[]> {
  const id = `${address.toBase58()}:${limit}`;
  const cache = caches.get(id) ?? { events: [] };
  const sigs = await conn.getSignaturesForAddress(address, { limit, until: cache.newest }, "confirmed");
  const fresh = sigs.filter((s) => !s.err);
  if (sigs.length) cache.newest = sigs[0].signature;
  const added: ChainEvent[] = [];
  for (let i = 0; i < fresh.length; i += 20) {
    const chunk = fresh.slice(i, i + 20);
    const txs = await conn.getTransactions(chunk.map((s) => s.signature), { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
    txs.forEach((tx, j) => {
      if (!tx?.meta || tx.meta.err || !tx.meta.logMessages) return;
      const s = chunk[j];
      added.push(...eventsFromLogs(tx.meta.logMessages, { sig: s.signature, slot: s.slot, ts: s.blockTime ?? tx.blockTime ?? 0 }));
    });
  }
  cache.events = [...added, ...cache.events].sort((a, b) => b.slot - a.slot).slice(0, limit * 3);
  caches.set(id, cache);
  return cache.events;
}

/** Forget everything we cached (after a write the next read must see it). */
export function resetEventCache() {
  caches.clear();
}
