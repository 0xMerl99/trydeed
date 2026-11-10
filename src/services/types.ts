/**
 * DeedService — the only thing the UI knows about the backend. There is one implementation, `LiveDeedService`
 * (services/live.ts): it reads the Deed program's accounts and events from the configured Solana RPC and builds real
 * transactions that the connected wallet signs. There is no simulation mode.
 *
 * Write methods take a `TxContext` (the connected wallet and a way to sign + send + confirm) and resolve with a
 * `TxReceipt` carrying the real transaction signature.
 */
import type { Connection, Keypair, Transaction } from "@solana/web3.js";
import type { DurationKey } from "@/lib/auction";
import type {
  ActivityEvent,
  Address,
  Auction,
  AuctionDetail,
  Coin,
  Notification,
  OtcMine,
  OtcOffer,
  OtcOfferDetail,
  OtcMarketRow,
  OtcStats,
  OtcTokenMarket,
  Portfolio,
  PlatformStatus,
  WalletTokens,
} from "@/types";
import type { OfferKind } from "@/lib/otc";

export interface TxContext {
  /** The connected wallet performing the action. */
  wallet: Address;
  connection: Connection;
  /**
   * Signs with the connected wallet (plus any extra keypairs, e.g. a new mint), sends, and resolves with the signature
   * once the transaction is CONFIRMED on chain. Rejects if the wallet declines or the transaction fails.
   */
  send(tx: Transaction, opts?: { signers?: Keypair[] }): Promise<string>;
}

export interface TxReceipt {
  /** Real transaction signature of the last transaction of the action. */
  signature: string;
  /** Short human label for toasts, e.g. "Bid placed". */
  message: string;
}

// ------------------------------------------------------------------ inputs

/** Progress of the multi-transaction launch (each step is a wallet prompt). */
export interface LaunchStep {
  index: number;
  total: number;
  label: string;
}
export interface LaunchInput {
  name: string;
  ticker: string;
  description: string;
  /** data: URL of the uploaded image. */
  image: string | null;
  twitter: string;
  telegram: string;
  onStep?: (s: LaunchStep) => void;
}
export interface LaunchResult extends TxReceipt {
  coin: Coin;
}

export interface CreateAuctionInput {
  coinMint: Address;
  startPrice: bigint;
  duration: DurationKey;
}
export interface PlaceBidInput {
  auction: Address;
  amount: bigint;
}
export interface CreateOfferInput {
  kind: OfferKind;
  mint: Address;
  amount: bigint;
  priceTotal: bigint;
  partial: boolean;
  minFill: bigint | null;
  expiresInSecs: number;
  counterparty: Address | null;
  parent: Address | null;
}
export interface FillOfferInput {
  offer: Address;
  amount: bigint;
}
export type CloseReason = "cancel" | "reject" | "done";

export interface DeedService {
  // ---- platform
  getStatus(): Promise<PlatformStatus>;
  /** Unix seconds from the cluster — countdowns are computed against this, not the browser clock. */
  getClusterTime(): Promise<number>;

  // ---- reads
  listAuctions(): Promise<Auction[]>;
  getAuction(address: Address): Promise<AuctionDetail>;
  listCoins(): Promise<Coin[]>;
  listActivity(): Promise<ActivityEvent[]>;
  getPortfolio(wallet: Address): Promise<Portfolio>;

  // ---- auction + deed writes
  launchCoin(ctx: TxContext, input: LaunchInput): Promise<LaunchResult>;
  createAuction(ctx: TxContext, input: CreateAuctionInput): Promise<TxReceipt & { auction: Address }>;
  placeBid(ctx: TxContext, input: PlaceBidInput): Promise<TxReceipt & { extended: boolean }>;
  cancelAuction(ctx: TxContext, auction: Address): Promise<TxReceipt>;
  settleAuction(ctx: TxContext, auction: Address): Promise<TxReceipt>;
  claimFees(ctx: TxContext, coinMint: Address): Promise<TxReceipt>;

  // ---- OTC reads
  getOtcStats(): Promise<OtcStats>;
  listOtcMarkets(): Promise<OtcMarketRow[]>;
  getOtcToken(mint: Address): Promise<OtcTokenMarket>;
  getOtcOffer(address: Address): Promise<OtcOfferDetail>;
  getOtcMine(wallet: Address): Promise<OtcMine>;
  getNotifications(wallet: Address): Promise<Notification[]>;
  /** Public token balances of any wallet. */
  getWalletTokens(wallet: Address): Promise<WalletTokens>;

  // ---- OTC writes
  createOffer(ctx: TxContext, input: CreateOfferInput): Promise<TxReceipt & { offer: Address }>;
  fillOffer(ctx: TxContext, input: FillOfferInput): Promise<TxReceipt>;
  closeOffer(ctx: TxContext, offer: Address, reason: CloseReason): Promise<TxReceipt>;
}
