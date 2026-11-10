/**
 * Typed reads of the Deed program's accounts. Everything is decoded from real account data with the IDL's coder.
 */
import { utils as anchorUtils, type BN } from "@coral-xyz/anchor";
import { PublicKey, type AccountInfo, type Connection } from "@solana/web3.js";
import { IDL, PROGRAM_ID, coder } from "./program";

const big = (v: BN) => BigInt(v.toString());
const variant = (e: object) => Object.keys(e)[0];
const NONE = PublicKey.default.toBase58();
const optKey = (k: PublicKey) => (k.toBase58() === NONE ? null : k.toBase58());

export interface DeedStateAcc {
  address: string;
  coinMint: string;
  deedMint: string;
  sharingConfig: string;
  creator: string;
  registeredAt: number;
  claimedTotal: bigint;
  auctionCount: bigint;
}

export type AuctionState = "Live" | "Settled" | "Cancelled";
export interface AuctionAcc {
  address: string;
  deedState: string;
  deedMint: string;
  coinMint: string;
  seller: string;
  nonce: bigint;
  startPrice: bigint;
  startTime: number;
  endTime: number;
  highestBidder: string | null;
  highestBid: bigint;
  bidCount: number;
  status: AuctionState;
  finalPrice: bigint;
  finalFee: bigint;
}

export type OfferState = "Active" | "Filled" | "Cancelled" | "Rejected";
export interface OfferAcc {
  address: string;
  maker: string;
  mint: string;
  tokenProgram: string;
  kind: "Sell" | "Buy";
  counterparty: string | null;
  parent: string | null;
  amountTotal: bigint;
  remaining: bigint;
  priceTotal: bigint;
  priceRemaining: bigint;
  minFill: bigint;
  createdAt: number;
  expiresAt: number;
  feeBps: number;
  fills: number;
  status: OfferState;
  nonce: bigint;
}

export interface ConfigAcc {
  admin: string;
  treasury: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function decodeDeedState(address: PublicKey, info: Pick<AccountInfo<Buffer>, "data">): DeedStateAcc {
  const a: any = coder.accounts.decode("DeedState", info.data);
  return {
    address: address.toBase58(),
    coinMint: a.coin_mint.toBase58(),
    deedMint: a.deed_mint.toBase58(),
    sharingConfig: a.sharing_config.toBase58(),
    creator: a.creator.toBase58(),
    registeredAt: Number(a.registered_at),
    claimedTotal: big(a.claimed_total),
    auctionCount: big(a.auction_count),
  };
}

export function decodeAuction(address: PublicKey, info: Pick<AccountInfo<Buffer>, "data">): AuctionAcc {
  const a: any = coder.accounts.decode("Auction", info.data);
  const s = variant(a.status);
  return {
    address: address.toBase58(),
    deedState: a.deed_state.toBase58(),
    deedMint: a.deed_mint.toBase58(),
    coinMint: a.coin_mint.toBase58(),
    seller: a.seller.toBase58(),
    nonce: big(a.nonce),
    startPrice: big(a.start_price),
    startTime: Number(a.start_time),
    endTime: Number(a.end_time),
    highestBidder: optKey(a.highest_bidder),
    highestBid: big(a.highest_bid),
    bidCount: Number(a.bid_count),
    status: (s.charAt(0).toUpperCase() + s.slice(1)) as AuctionState,
    finalPrice: big(a.final_price),
    finalFee: big(a.final_fee),
  };
}

export function decodeOffer(address: PublicKey, info: Pick<AccountInfo<Buffer>, "data">): OfferAcc {
  const a: any = coder.accounts.decode("Offer", info.data);
  const k = variant(a.kind);
  const s = variant(a.status);
  return {
    address: address.toBase58(),
    maker: a.maker.toBase58(),
    mint: a.mint.toBase58(),
    tokenProgram: a.token_program.toBase58(),
    kind: (k.charAt(0).toUpperCase() + k.slice(1)) as "Sell" | "Buy",
    counterparty: optKey(a.counterparty),
    parent: optKey(a.parent),
    amountTotal: big(a.amount_total),
    remaining: big(a.remaining),
    priceTotal: big(a.price_total),
    priceRemaining: big(a.price_remaining),
    minFill: big(a.min_fill),
    createdAt: Number(a.created_at),
    expiresAt: Number(a.expires_at),
    feeBps: Number(a.fee_bps),
    fills: Number(a.fills),
    status: (s.charAt(0).toUpperCase() + s.slice(1)) as OfferState,
    nonce: big(a.nonce),
  };
}

export function decodeConfig(info: Pick<AccountInfo<Buffer>, "data">): ConfigAcc {
  const a: any = coder.accounts.decode("Config", info.data);
  return { admin: a.admin.toBase58(), treasury: a.treasury.toBase58() };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ------------------------------------------------------------------ scans (getProgramAccounts filtered by the account discriminator)

const discriminator = (name: string) => {
  const d = IDL.accounts?.find((a) => a.name === name)?.discriminator;
  if (!d) throw new Error(`IDL has no account ${name}`);
  return anchorUtils.bytes.bs58.encode(Buffer.from(d));
};

async function scan<T>(conn: Connection, name: string, decode: (k: PublicKey, i: AccountInfo<Buffer>) => T): Promise<T[]> {
  const res = await conn.getProgramAccounts(PROGRAM_ID, { filters: [{ memcmp: { offset: 0, bytes: discriminator(name) } }] });
  const out: T[] = [];
  for (const { pubkey, account } of res) {
    try {
      out.push(decode(pubkey, account));
    } catch {
      /* an account the current IDL cannot decode is skipped, never guessed at */
    }
  }
  return out;
}

export const fetchAllDeeds = (c: Connection) => scan(c, "DeedState", decodeDeedState);
export const fetchAllAuctions = (c: Connection) => scan(c, "Auction", decodeAuction);
export const fetchAllOffers = (c: Connection) => scan(c, "Offer", decodeOffer);
