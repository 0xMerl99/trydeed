//! Deed on-chain program.
//!
//! * **Deed registry** – ties a Pump.fun coin to a 1/1 Ownership NFT (the Deed). The coin's creator fees are locked,
//!   through Pump's own fee-sharing program, to a vault PDA owned by this program; whoever holds the Deed may claim
//!   everything that vault receives.
//! * **Auctions** – escrowed English auctions of Deeds: bids are held in the auction PDA, the previous bidder is refunded
//!   in the same transaction as the outbid, the end time lives on chain and is extended by anti-sniping, and a 1% fee is
//!   taken from completed sales only.
//! * **OTC** – wallet-to-wallet token/SOL offers escrowed on chain, with partial fills and a 0.5% fee on the SOL leg.
//!
//! Nothing here trusts a server: every rule is enforced by this program.
pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod state;
pub mod util;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("DUGCUEFnfSA2TBtzgx51hLmiwy6pYSuCPQBNwD2utRYz");

#[program]
pub mod deed_fun {
    use super::*;

    // ---- admin
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        instructions::initialize::handle_initialize(ctx)
    }

    pub fn update_config(ctx: Context<UpdateConfig>, new_admin: Pubkey) -> Result<()> {
        instructions::initialize::handle_update_config(ctx, new_admin)
    }

    // ---- the Deed
    pub fn register_deed(ctx: Context<RegisterDeed>) -> Result<()> {
        instructions::register_deed::handle_register_deed(ctx)
    }

    pub fn claim_fees(ctx: Context<ClaimFees>) -> Result<()> {
        instructions::claim_fees::handle_claim_fees(ctx)
    }

    // ---- auctions
    pub fn create_auction(ctx: Context<CreateAuction>, start_price: u64, duration_secs: i64) -> Result<()> {
        instructions::auction::handle_create_auction(ctx, start_price, duration_secs)
    }

    pub fn place_bid(ctx: Context<PlaceBid>, amount: u64) -> Result<()> {
        instructions::auction::handle_place_bid(ctx, amount)
    }

    pub fn settle_auction(ctx: Context<SettleAuction>) -> Result<()> {
        instructions::auction::handle_settle_auction(ctx)
    }

    pub fn cancel_auction(ctx: Context<CancelAuction>) -> Result<()> {
        instructions::auction::handle_cancel_auction(ctx)
    }

    pub fn close_auction(ctx: Context<CloseAuction>) -> Result<()> {
        instructions::auction::handle_close_auction(ctx)
    }

    // ---- OTC
    pub fn create_sell_offer(ctx: Context<CreateSellOffer>, args: CreateOfferArgs) -> Result<()> {
        instructions::otc::handle_create_sell_offer(ctx, args)
    }

    pub fn create_buy_offer(ctx: Context<CreateBuyOffer>, args: CreateOfferArgs) -> Result<()> {
        instructions::otc::handle_create_buy_offer(ctx, args)
    }

    pub fn fill_sell_offer(ctx: Context<FillSellOffer>, amount: u64) -> Result<()> {
        instructions::otc::handle_fill_sell_offer(ctx, amount)
    }

    pub fn fill_buy_offer(ctx: Context<FillBuyOffer>, amount: u64) -> Result<()> {
        instructions::otc::handle_fill_buy_offer(ctx, amount)
    }

    pub fn close_sell_offer(ctx: Context<CloseSellOffer>) -> Result<()> {
        instructions::otc::handle_close_sell_offer(ctx)
    }

    pub fn close_buy_offer(ctx: Context<CloseBuyOffer>) -> Result<()> {
        instructions::otc::handle_close_buy_offer(ctx)
    }
}
