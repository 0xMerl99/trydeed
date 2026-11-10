use anchor_lang::prelude::*;

/// Program-wide settings. Singleton PDA `["config"]`.
#[account]
#[derive(InitSpace)]
pub struct Config {
    /// May change the treasury. Nothing else: the fee rates are constants in the program.
    pub admin: Pubkey,
    /// Receives the 1% auction fee and the 0.5% OTC fee. Must be a wallet that already holds the rent minimum.
    pub treasury: Pubkey,
    pub bump: u8,
}

/// One per coin: the on-chain link between a Pump coin, its fee vault and its Deed (the 1/1 Ownership NFT).
/// PDA `["deed", coin_mint]`.
#[account]
#[derive(InitSpace)]
pub struct DeedState {
    pub coin_mint: Pubkey,
    pub deed_mint: Pubkey,
    /// Pump Fees `SharingConfig` of the coin; it pays the creator fees to `vault`.
    pub sharing_config: Pubkey,
    /// The wallet that launched the coin and received the Deed.
    pub creator: Pubkey,
    pub registered_at: i64,
    /// Lifetime lamports paid out to Deed holders.
    pub claimed_total: u64,
    /// Number of auctions ever opened for this Deed (also the next auction's nonce).
    pub auction_count: u64,
    pub vault_bump: u8,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum AuctionStatus {
    Live,
    Settled,
    Cancelled,
}

/// An English auction of a Deed. PDA `["auction", deed_mint, nonce_le]`.
/// The Deed sits in this PDA's associated token account and the highest bid sits in this PDA's lamports.
#[account]
#[derive(InitSpace)]
pub struct Auction {
    pub deed_state: Pubkey,
    pub deed_mint: Pubkey,
    pub coin_mint: Pubkey,
    pub seller: Pubkey,
    pub nonce: u64,
    pub start_price: u64,
    pub start_time: i64,
    /// Extended by anti-sniping. The program, not a server, decides when the auction ends.
    pub end_time: i64,
    /// `Pubkey::default()` until the first bid.
    pub highest_bidder: Pubkey,
    pub highest_bid: u64,
    pub bid_count: u32,
    pub status: AuctionStatus,
    pub final_price: u64,
    pub final_fee: u64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum OfferKind {
    /// The maker sells tokens (tokens are escrowed); a taker pays SOL.
    Sell,
    /// The maker bids SOL (SOL is escrowed); a taker delivers tokens.
    Buy,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum OfferStatus {
    Active,
    Filled,
    Cancelled,
    Rejected,
}

/// A wallet-to-wallet OTC offer. PDA `["offer", maker, nonce_le]`.
#[account]
#[derive(InitSpace)]
pub struct Offer {
    pub maker: Pubkey,
    pub mint: Pubkey,
    pub token_program: Pubkey,
    pub kind: OfferKind,
    /// `Pubkey::default()` = public offer; otherwise only this wallet may fill or reject.
    pub counterparty: Pubkey,
    /// The offer this one counters (`Pubkey::default()` = none).
    pub parent: Pubkey,
    pub amount_total: u64,
    pub remaining: u64,
    /// Lamports for the WHOLE offer.
    pub price_total: u64,
    pub price_remaining: u64,
    /// Smallest partial fill (equal to `amount_total` = all or nothing). The last fill may be smaller.
    pub min_fill: u64,
    pub created_at: i64,
    pub expires_at: i64,
    pub fee_bps: u16,
    pub fills: u32,
    pub status: OfferStatus,
    pub nonce: u64,
    pub bump: u8,
}
