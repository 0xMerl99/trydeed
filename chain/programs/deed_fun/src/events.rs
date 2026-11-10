use anchor_lang::prelude::*;

/// Events are the history the web app indexes (bids, fills, claims). Balances and states are read from accounts.
#[event]
pub struct DeedRegistered {
    pub coin_mint: Pubkey,
    pub deed_mint: Pubkey,
    pub deed_state: Pubkey,
    pub creator: Pubkey,
}

#[event]
pub struct FeesClaimed {
    pub coin_mint: Pubkey,
    pub deed_mint: Pubkey,
    pub claimant: Pubkey,
    pub amount: u64,
}

#[event]
pub struct AuctionCreated {
    pub auction: Pubkey,
    pub deed_mint: Pubkey,
    pub coin_mint: Pubkey,
    pub seller: Pubkey,
    pub nonce: u64,
    pub start_price: u64,
    pub start_time: i64,
    pub end_time: i64,
}

#[event]
pub struct BidPlaced {
    pub auction: Pubkey,
    pub bidder: Pubkey,
    pub amount: u64,
    pub end_time: i64,
    pub extended: bool,
    /// The bidder that was outbid and refunded in this same transaction (`Pubkey::default()` for the first bid).
    pub refunded_bidder: Pubkey,
    pub refunded_amount: u64,
    pub ts: i64,
}

#[event]
pub struct AuctionSettled {
    pub auction: Pubkey,
    pub deed_mint: Pubkey,
    pub coin_mint: Pubkey,
    pub seller: Pubkey,
    pub winner: Pubkey,
    pub price: u64,
    pub fee: u64,
    pub ts: i64,
}

#[event]
pub struct AuctionCancelled {
    pub auction: Pubkey,
    pub deed_mint: Pubkey,
    pub seller: Pubkey,
    pub ts: i64,
}

#[event]
pub struct OfferCreated {
    pub offer: Pubkey,
    pub maker: Pubkey,
    pub mint: Pubkey,
    pub kind: u8,
    pub counterparty: Pubkey,
    pub parent: Pubkey,
    pub amount: u64,
    pub price: u64,
    pub min_fill: u64,
    pub expires_at: i64,
    pub ts: i64,
}

#[event]
pub struct OfferFilled {
    pub offer: Pubkey,
    pub maker: Pubkey,
    pub taker: Pubkey,
    pub mint: Pubkey,
    pub kind: u8,
    pub amount: u64,
    pub lamports: u64,
    pub fee: u64,
    pub remaining: u64,
    pub ts: i64,
}

#[event]
pub struct OfferClosed {
    pub offer: Pubkey,
    pub maker: Pubkey,
    pub closer: Pubkey,
    /// 2 = cancelled by the maker, 3 = rejected by the named counterparty.
    pub status: u8,
    pub returned_amount: u64,
    pub returned_lamports: u64,
    pub ts: i64,
}
