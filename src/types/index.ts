/**
 * Deed domain model. Money is `bigint` lamports; token amounts are `bigint` base units; timestamps are unix seconds.
 */
import type { AuctionStatus } from "@/lib/auction";
import type { OfferKind } from "@/lib/otc";

export type Address = string;

export interface CoinLinks {
  twitter?: string;
  telegram?: string;
  website?: string;
}

export interface CoinFees {
  lifetime: bigint;
  /** Fees accrued in the last 24 h / 7 d. `null` = not derivable from the chain without a full-history indexer. */
  d24: bigint | null;
  d7: bigint | null;
  claimed: bigint;
  /** Accrued and not yet claimed — travels with the Deed. */
  unclaimed: bigint;
  /** The part of `unclaimed` that can be withdrawn right now. */
  claimable: bigint;
}

export type CoinStatus = "HELD" | "ON_AUCTION" | "SOLD";

/** A coin launched through Deed together with its Deed (1/1 Ownership NFT). */
export interface Coin {
  mint: Address;
  name: string;
  symbol: string;
  image?: string;
  description: string;
  links: CoinLinks;
  creator: Address;
  /** Mint address of the Deed (the 1/1 Ownership NFT). */
  deedMint: Address;
  /** Current holder of the Deed = whoever may claim 100% of the creator fees. Escrow while on auction. */
  deedOwner: Address;
  createdAt: number;
  launchedAt: number;
  fees: CoinFees;
  /** Market cap in lamports from Pump's bonding-curve reserves (SOL-quoted). `null` = not available. */
  market: { marketCapSol: bigint | null };
  status: CoinStatus;
  liveAuction: Address | null;
  /** Completed sales of this Deed. */
  sales: number;
}

export interface Auction {
  address: Address;
  coinMint: Address;
  deedMint: Address;
  seller: Address;
  startPrice: bigint;
  highestBid: bigint;
  highestBidder: Address | null;
  bidCount: number;
  bidders: number;
  startTs: number;
  /** On-chain end time. Extended by anti-sniping. */
  endTs: number;
  status: AuctionStatus;
  /** bps, fixed when the auction is created. */
  feeBps: number;
  coin: Coin;
}

export interface Bid {
  auction: Address;
  bidder: Address;
  amount: bigint;
  ts: number;
  /** This bid triggered the anti-sniping extension. */
  extended: boolean;
  /** Transaction signature. */
  ref: string;
}

export interface AuctionDetail {
  auction: Auction;
  /** Oldest first. */
  history: Bid[];
  /** Latest bid per wallet. Outbid SOL is refunded in the same transaction as the outbid, so there is nothing to claim. */
  bids: { bidder: Address; amount: bigint }[];
}

// ---------------------------------------------------------------- activity

export type ActivityKind =
  | "COIN_LAUNCHED"
  | "AUCTION_CREATED"
  | "BID_PLACED"
  | "AUCTION_SETTLED"
  | "AUCTION_CANCELLED"
  | "AUCTION_UNSOLD"
  | "DEED_TRANSFERRED"
  | "FEES_CLAIMED"
  | "OTC_OFFER_CREATED"
  | "OTC_OFFER_FILLED";

export interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  ts: number;
  /** Wallet that did it. */
  actor: Address | null;
  /** Counterparty where relevant (e.g. the new Deed owner). */
  counterparty?: Address | null;
  symbol?: string;
  image?: string;
  amount?: bigint;
  auction?: Address;
  coinMint?: Address;
  otcMint?: Address;
  offer?: Address;
  /** Transaction signature. */
  ref: string;
}

// ---------------------------------------------------------------- portfolio

export interface PortfolioBid {
  auction: Address;
  amount: bigint;
  status: "HIGHEST" | "WON";
  auctionView: Auction;
}

export interface TokenHolding {
  mint: Address;
  amount: bigint;
  decimals: number;
  symbol?: string;
  name?: string;
  image?: string;
  /** Present only when `source` is a real price feed. */
  valueUsd?: number | null;
  supported?: boolean;
}

export interface Portfolio {
  wallet: Address;
  /** Coins this wallet launched. */
  coins: (Coin & { needsFinish?: boolean })[];
  /** Deeds currently held by this wallet. */
  assets: Coin[];
  auctions: Auction[];
  bids: PortfolioBid[];
  history: ActivityEvent[];
}

// ---------------------------------------------------------------- OTC

export interface OtcToken {
  mint: Address;
  symbol?: string;
  name?: string;
  image?: string;
  decimals: number;
  standard: "SPL Token" | "Token-2022";
  supply: bigint;
  mintAuthority: Address | null;
  freezeAuthority: Address | null;
  /** Launched through Deed. */
  platformCoin: boolean;
  supported: boolean;
  /** Why it can't be traded, when `supported` is false. */
  reason?: string;
  /** Token-2022 transfer fee: buy bids are disabled (the buyer would receive less than they bid for). */
  transferFee?: boolean;
  warnings: string[];
  /** Reference price in SOL per whole token from a public feed — comparison only. */
  refPriceSol?: number | null;
}

export type OfferState = "ACTIVE" | "PARTIALLY_FILLED" | "FILLED" | "CANCELLED" | "REJECTED" | "EXPIRED";

export interface OtcFill {
  taker: Address;
  amount: bigint;
  lamports: bigint;
  fee: bigint;
  ts: number;
  ref: string;
}

export interface OtcOffer {
  address: Address;
  kind: OfferKind;
  mint: Address;
  maker: Address;
  /** Private offer: only this wallet may fill / reject. */
  counterparty: Address | null;
  amountTotal: bigint;
  remaining: bigint;
  priceTotal: bigint;
  priceRemaining: bigint;
  /** Smallest partial fill; equal to `amountTotal` means all-or-nothing. */
  minFill: bigint;
  createdAt: number;
  expiresAt: number;
  state: OfferState;
  /** The escrow account is still open — assets remain locked until it is filled, cancelled or closed. */
  live: boolean;
  feeBps: number;
  parent: Address | null;
  fills: OtcFill[];
  createdRef: string;
  closedRef?: string;
  token: OtcToken;
}

export interface OtcMarketRow {
  token: OtcToken;
  mint: Address;
  bestAsk: bigint | null; // lamports per WHOLE token
  bestBid: bigint | null;
  asks: number;
  bids: number;
  volume24h: bigint;
  lastTradeTs: number | null;
  firstSeen: number;
}

export interface OtcTrade {
  mint: Address;
  token: OtcToken;
  offer: Address;
  maker: Address;
  taker: Address;
  kind: OfferKind;
  amount: bigint;
  lamports: bigint;
  fee: bigint;
  ts: number;
  ref: string;
}

export interface OtcStats {
  activeOffers: number;
  activeBids: number;
  trades: number;
  volume: bigint;
  feeBps: number;
  recent: OtcTrade[];
}

export interface OtcTokenMarket {
  token: OtcToken;
  asks: OtcOffer[];
  bids: OtcOffer[];
  trades: OtcTrade[];
  bestAsk: bigint | null;
  bestBid: bigint | null;
  volume24h: bigint;
  trades24h: number;
  feeBps: number;
}

export interface OtcOfferDetail {
  offer: OtcOffer;
  negotiation: OtcOffer[];
}

export interface OtcMine {
  made: OtcOffer[];
  received: OtcOffer[];
  trades: OtcTrade[];
}

export type NotificationKind =
  | "OFFER_RECEIVED"
  | "COUNTER_RECEIVED"
  | "OFFER_FILLED"
  | "OFFER_PARTIALLY_FILLED"
  | "OFFER_REJECTED"
  | "OFFER_EXPIRED"
  | "OFFER_CANCELLED";

export interface Notification {
  id: string;
  kind: NotificationKind;
  ts: number;
  offer: Address;
  mint: Address;
  symbol?: string;
  amount?: bigint;
  lamports?: bigint;
  needsClose?: boolean;
}

export interface WalletTokens {
  wallet: Address;
  sol: bigint | null;
  tokens: TokenHolding[];
  truncated: boolean;
}

// ---------------------------------------------------------------- platform

export interface PlatformStatus {
  cluster: "mainnet-beta" | "devnet" | "testnet" | "localnet";
  /** The deployed Deed program the app talks to. */
  programId: string;
  feeBps: number;
  otcFeeBps: number;
  totalFeesLifetime: bigint;
}
