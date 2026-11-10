use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{close_account, transfer_checked, CloseAccount, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::constants::*;
use crate::error::DeedError;
use crate::events::*;
use crate::state::{Auction, AuctionStatus, Config, DeedState};
use crate::util::{bps_of, end_after_bid, min_next_bid};

// ====================================================================== create

/// The seller escrows the Deed (it moves into a token account owned by the auction PDA) and opens the auction.
#[derive(Accounts)]
pub struct CreateAuction<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    #[account(
        mut,
        seeds = [DEED_SEED, deed_state.coin_mint.as_ref()],
        bump = deed_state.bump,
        constraint = deed_state.deed_mint == deed_mint.key() @ DeedError::InvalidDeedMint,
    )]
    pub deed_state: Account<'info, DeedState>,

    #[account(mint::token_program = token_program)]
    pub deed_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = deed_mint,
        token::authority = seller,
        token::token_program = token_program,
        constraint = seller_deed_account.amount == 1 @ DeedError::NotDeedHolder,
    )]
    pub seller_deed_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init,
        payer = seller,
        space = 8 + Auction::INIT_SPACE,
        seeds = [AUCTION_SEED, deed_mint.key().as_ref(), &deed_state.auction_count.to_le_bytes()],
        bump,
    )]
    pub auction: Account<'info, Auction>,

    #[account(
        init,
        payer = seller,
        associated_token::mint = deed_mint,
        associated_token::authority = auction,
        associated_token::token_program = token_program,
    )]
    pub escrow: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_auction(ctx: Context<CreateAuction>, start_price: u64, duration_secs: i64) -> Result<()> {
    require!(start_price >= MIN_START_PRICE, DeedError::StartPriceTooLow);
    require!(start_price <= MAX_BID, DeedError::BidTooHigh);
    require!((MIN_AUCTION_SECS..=MAX_AUCTION_SECS).contains(&duration_secs), DeedError::InvalidDuration);

    let now = Clock::get()?.unix_timestamp;
    let st = &mut ctx.accounts.deed_state;
    let nonce = st.auction_count;
    st.auction_count = nonce.checked_add(1).ok_or_else(|| error!(DeedError::Overflow))?;

    let a = &mut ctx.accounts.auction;
    a.deed_state = st.key();
    a.deed_mint = ctx.accounts.deed_mint.key();
    a.coin_mint = st.coin_mint;
    a.seller = ctx.accounts.seller.key();
    a.nonce = nonce;
    a.start_price = start_price;
    a.start_time = now;
    a.end_time = now.checked_add(duration_secs).ok_or_else(|| error!(DeedError::Overflow))?;
    a.highest_bidder = Pubkey::default();
    a.highest_bid = 0;
    a.bid_count = 0;
    a.status = AuctionStatus::Live;
    a.final_price = 0;
    a.final_fee = 0;
    a.bump = ctx.bumps.auction;

    // Escrow the Deed.
    transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.seller_deed_account.to_account_info(),
                mint: ctx.accounts.deed_mint.to_account_info(),
                to: ctx.accounts.escrow.to_account_info(),
                authority: ctx.accounts.seller.to_account_info(),
            },
        ),
        1,
        ctx.accounts.deed_mint.decimals,
    )?;

    emit!(AuctionCreated {
        auction: a.key(),
        deed_mint: a.deed_mint,
        coin_mint: a.coin_mint,
        seller: a.seller,
        nonce,
        start_price,
        start_time: a.start_time,
        end_time: a.end_time,
    });
    Ok(())
}

// ====================================================================== bid

/// Places a bid. The bid moves into the auction PDA and the previous highest bid is returned to its bidder in the
/// SAME transaction, so there is no refund to claim later and an outbid wallet is never out of pocket.
#[derive(Accounts)]
pub struct PlaceBid<'info> {
    #[account(mut)]
    pub bidder: Signer<'info>,

    #[account(
        mut,
        seeds = [AUCTION_SEED, auction.deed_mint.as_ref(), &auction.nonce.to_le_bytes()],
        bump = auction.bump,
    )]
    pub auction: Account<'info, Auction>,

    /// CHECK: refunded when there is a previous highest bidder (must equal `auction.highest_bidder`); ignored for the
    /// first bid. Crediting lamports to any account cannot fail, so no bidder can block the next bid.
    #[account(mut)]
    pub previous_bidder: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_place_bid(ctx: Context<PlaceBid>, amount: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let bidder = ctx.accounts.bidder.key();

    let (minimum, prev_bid, prev_bidder, ended) = {
        let a = &ctx.accounts.auction;
        require!(a.status == AuctionStatus::Live, DeedError::AuctionNotLive);
        require!(bidder != a.seller, DeedError::SellerCannotBid);
        require!(a.bid_count == 0 || bidder != a.highest_bidder, DeedError::AlreadyHighestBidder);
        (min_next_bid(a.bid_count, a.highest_bid, a.start_price)?, a.highest_bid, a.highest_bidder, now >= a.end_time)
    };
    require!(!ended, DeedError::AuctionEnded);
    require!(amount >= minimum, DeedError::BidTooLow);
    require!(amount <= MAX_BID, DeedError::BidTooHigh);

    // Bid into escrow.
    transfer(
        CpiContext::new(
            ctx.accounts.system_program.key(),
            Transfer { from: ctx.accounts.bidder.to_account_info(), to: ctx.accounts.auction.to_account_info() },
        ),
        amount,
    )?;

    // Refund the outbid bidder, atomically.
    let had_previous = ctx.accounts.auction.bid_count > 0;
    if had_previous {
        require_keys_eq!(ctx.accounts.previous_bidder.key(), prev_bidder, DeedError::PreviousBidderMismatch);
        ctx.accounts.auction.sub_lamports(prev_bid)?;
        ctx.accounts.previous_bidder.add_lamports(prev_bid)?;
    }

    let a = &mut ctx.accounts.auction;
    let (end_time, extended) = end_after_bid(a.end_time, now);
    a.end_time = end_time;
    a.highest_bid = amount;
    a.highest_bidder = bidder;
    a.bid_count = a.bid_count.checked_add(1).ok_or_else(|| error!(DeedError::Overflow))?;

    emit!(BidPlaced {
        auction: a.key(),
        bidder,
        amount,
        end_time,
        extended,
        refunded_bidder: if had_previous { prev_bidder } else { Pubkey::default() },
        refunded_amount: if had_previous { prev_bid } else { 0 },
        ts: now,
    });
    Ok(())
}

// ====================================================================== settle

/// Anyone may settle an auction once the on-chain end time has passed: the winner receives the Deed, the seller the
/// price minus the 1% fee, and the treasury the fee. Nothing is charged when an auction does not complete.
#[derive(Accounts)]
pub struct SettleAuction<'info> {
    /// Pays for the winner's token account if it does not exist yet.
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,

    /// CHECK: must be the configured treasury.
    #[account(mut, address = config.treasury @ DeedError::WrongTreasury)]
    pub treasury: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [AUCTION_SEED, auction.deed_mint.as_ref(), &auction.nonce.to_le_bytes()],
        bump = auction.bump,
    )]
    pub auction: Account<'info, Auction>,

    /// CHECK: must be the auction's seller; receives the proceeds and the escrow rent.
    #[account(mut, address = auction.seller @ DeedError::NotSeller)]
    pub seller: UncheckedAccount<'info>,

    /// CHECK: must be the highest bidder; the Deed goes to their token account.
    #[account(address = auction.highest_bidder)]
    pub winner: UncheckedAccount<'info>,

    #[account(address = auction.deed_mint, mint::token_program = token_program)]
    pub deed_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = deed_mint,
        associated_token::authority = auction,
        associated_token::token_program = token_program,
    )]
    pub escrow: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = caller,
        associated_token::mint = deed_mint,
        associated_token::authority = winner,
        associated_token::token_program = token_program,
    )]
    pub winner_deed_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_settle_auction(ctx: Context<SettleAuction>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let (price, fee) = {
        let a = &ctx.accounts.auction;
        require!(a.status == AuctionStatus::Live, DeedError::AuctionNotLive);
        require!(a.bid_count > 0, DeedError::AuctionHasNoBids);
        require!(now >= a.end_time, DeedError::AuctionNotEnded);
        (a.highest_bid, bps_of(a.highest_bid, AUCTION_FEE_BPS))
    };
    let proceeds = price.checked_sub(fee).ok_or_else(|| error!(DeedError::Overflow))?;

    // Deed first: escrow -> winner, then close the escrow (rent back to the seller who paid it). The token CPIs run
    // before any direct lamport edits so the runtime never sees a half-moved balance mid-instruction.
    release_deed(
        &ctx.accounts.auction,
        &ctx.accounts.token_program,
        &ctx.accounts.deed_mint,
        &ctx.accounts.escrow,
        &ctx.accounts.winner_deed_account,
        &ctx.accounts.seller.to_account_info(),
    )?;

    // SOL: escrow -> treasury (fee) and seller (the rest).
    ctx.accounts.auction.sub_lamports(price)?;
    ctx.accounts.treasury.add_lamports(fee)?;
    ctx.accounts.seller.add_lamports(proceeds)?;

    let a = &mut ctx.accounts.auction;
    a.status = AuctionStatus::Settled;
    a.final_price = price;
    a.final_fee = fee;

    emit!(AuctionSettled {
        auction: a.key(),
        deed_mint: a.deed_mint,
        coin_mint: a.coin_mint,
        seller: a.seller,
        winner: a.highest_bidder,
        price,
        fee,
        ts: now,
    });
    Ok(())
}

// ====================================================================== cancel

/// The seller can cancel only while there are no bids; the Deed returns to them. Free of charge.
#[derive(Accounts)]
pub struct CancelAuction<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    #[account(
        mut,
        seeds = [AUCTION_SEED, auction.deed_mint.as_ref(), &auction.nonce.to_le_bytes()],
        bump = auction.bump,
        has_one = seller @ DeedError::NotSeller,
    )]
    pub auction: Account<'info, Auction>,

    #[account(address = auction.deed_mint, mint::token_program = token_program)]
    pub deed_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = deed_mint,
        associated_token::authority = auction,
        associated_token::token_program = token_program,
    )]
    pub escrow: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = seller,
        associated_token::mint = deed_mint,
        associated_token::authority = seller,
        associated_token::token_program = token_program,
    )]
    pub seller_deed_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_cancel_auction(ctx: Context<CancelAuction>) -> Result<()> {
    {
        let a = &ctx.accounts.auction;
        require!(a.status == AuctionStatus::Live, DeedError::AuctionNotLive);
        require!(a.bid_count == 0, DeedError::AuctionHasBids);
    }
    release_deed(
        &ctx.accounts.auction,
        &ctx.accounts.token_program,
        &ctx.accounts.deed_mint,
        &ctx.accounts.escrow,
        &ctx.accounts.seller_deed_account,
        &ctx.accounts.seller.to_account_info(),
    )?;
    let a = &mut ctx.accounts.auction;
    a.status = AuctionStatus::Cancelled;
    emit!(AuctionCancelled { auction: a.key(), deed_mint: a.deed_mint, seller: a.seller, ts: Clock::get()?.unix_timestamp });
    Ok(())
}

// ====================================================================== close

/// Optional housekeeping: once an auction is finished the seller can reclaim the auction account's rent.
/// (The sale itself stays visible in the transaction history; only the account goes away.)
#[derive(Accounts)]
pub struct CloseAuction<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    #[account(
        mut,
        close = seller,
        has_one = seller @ DeedError::NotSeller,
        constraint = auction.status != AuctionStatus::Live @ DeedError::AuctionStillOpen,
    )]
    pub auction: Account<'info, Auction>,
}

pub fn handle_close_auction(_ctx: Context<CloseAuction>) -> Result<()> {
    Ok(())
}

// ====================================================================== shared

/// Moves the escrowed Deed (1 token) to `to`, then closes the escrow account with its rent going to `rent_to`.
fn release_deed<'info>(
    auction: &Account<'info, Auction>,
    token_program: &Interface<'info, TokenInterface>,
    deed_mint: &InterfaceAccount<'info, Mint>,
    escrow: &InterfaceAccount<'info, TokenAccount>,
    to: &InterfaceAccount<'info, TokenAccount>,
    rent_to: &AccountInfo<'info>,
) -> Result<()> {
    let deed_key = auction.deed_mint;
    let nonce = auction.nonce.to_le_bytes();
    let bump = [auction.bump];
    let seeds: &[&[u8]] = &[AUCTION_SEED, deed_key.as_ref(), &nonce, &bump];
    let signer: &[&[&[u8]]] = &[seeds];

    transfer_checked(
        CpiContext::new_with_signer(
            token_program.key(),
            TransferChecked {
                from: escrow.to_account_info(),
                mint: deed_mint.to_account_info(),
                to: to.to_account_info(),
                authority: auction.to_account_info(),
            },
            signer,
        ),
        escrow.amount,
        deed_mint.decimals,
    )?;
    close_account(CpiContext::new_with_signer(
        token_program.key(),
        CloseAccount {
            account: escrow.to_account_info(),
            destination: rent_to.to_account_info(),
            authority: auction.to_account_info(),
        },
        signer,
    ))
}
