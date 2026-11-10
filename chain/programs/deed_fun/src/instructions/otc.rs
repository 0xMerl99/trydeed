use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{close_account, transfer_checked, CloseAccount, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::constants::*;
use crate::error::DeedError;
use crate::events::*;
use crate::state::{Config, Offer, OfferKind, OfferStatus};
use crate::util::{bps_of, check_mint_extensions, fill_lamports};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateOfferArgs {
    /// Chosen by the maker (any unique u64); part of the offer's address.
    pub nonce: u64,
    /// Token base units.
    pub amount: u64,
    /// Lamports for the WHOLE amount.
    pub price_total: u64,
    /// Smallest partial fill. `amount` = all or nothing.
    pub min_fill: u64,
    pub expires_in_secs: i64,
    /// `Pubkey::default()` = public offer.
    pub counterparty: Pubkey,
    /// `Pubkey::default()` = not a counter offer.
    pub parent: Pubkey,
}

// ====================================================================== shared validation

fn validate_mint(mint: &InterfaceAccount<Mint>) -> Result<()> {
    require!(mint.freeze_authority.is_none(), DeedError::FreezeAuthorityPresent);
    check_mint_extensions(&mint.to_account_info().try_borrow_data()?)
}

fn init_offer(
    offer: &mut Account<Offer>,
    bump: u8,
    maker: Pubkey,
    mint: Pubkey,
    token_program: Pubkey,
    kind: OfferKind,
    args: &CreateOfferArgs,
) -> Result<i64> {
    require!(args.amount > 0, DeedError::ZeroAmount);
    require!(args.price_total >= MIN_OFFER_LAMPORTS, DeedError::PriceTooLow);
    require!(args.price_total <= MAX_BID * 1000, DeedError::PriceTooLow);
    require!((1..=args.amount).contains(&args.min_fill), DeedError::InvalidMinFill);
    require!((MIN_OFFER_SECS..=MAX_OFFER_SECS).contains(&args.expires_in_secs), DeedError::InvalidExpiry);
    require!(args.counterparty != maker, DeedError::OwnOffer);

    let now = Clock::get()?.unix_timestamp;
    offer.maker = maker;
    offer.mint = mint;
    offer.token_program = token_program;
    offer.kind = kind;
    offer.counterparty = args.counterparty;
    offer.parent = args.parent;
    offer.amount_total = args.amount;
    offer.remaining = args.amount;
    offer.price_total = args.price_total;
    offer.price_remaining = args.price_total;
    offer.min_fill = args.min_fill;
    offer.created_at = now;
    offer.expires_at = now.checked_add(args.expires_in_secs).ok_or_else(|| error!(DeedError::Overflow))?;
    offer.fee_bps = OTC_FEE_BPS as u16;
    offer.fills = 0;
    offer.status = OfferStatus::Active;
    offer.nonce = args.nonce;
    offer.bump = bump;

    emit!(OfferCreated {
        offer: offer.key(),
        maker,
        mint,
        kind: kind as u8,
        counterparty: args.counterparty,
        parent: args.parent,
        amount: args.amount,
        price: args.price_total,
        min_fill: args.min_fill,
        expires_at: offer.expires_at,
        ts: now,
    });
    Ok(now)
}

/// Checks that apply to every fill.
fn check_fill(offer: &Offer, taker: &Pubkey, amount: u64, now: i64) -> Result<()> {
    require!(offer.status == OfferStatus::Active, DeedError::OfferNotActive);
    require!(now < offer.expires_at, DeedError::OfferExpired);
    require!(*taker != offer.maker, DeedError::OwnOffer);
    require!(offer.counterparty == Pubkey::default() || offer.counterparty == *taker, DeedError::NotCounterparty);
    require!(amount > 0, DeedError::ZeroAmount);
    require!(amount <= offer.remaining, DeedError::FillTooLarge);
    // A partial fill must be at least `min_fill`; whatever is left over can always be taken in one final fill.
    require!(amount == offer.remaining || amount >= offer.min_fill, DeedError::FillBelowMinimum);
    Ok(())
}

fn apply_fill(offer: &mut Offer, amount: u64, lamports: u64) -> Result<()> {
    offer.remaining = offer.remaining.checked_sub(amount).ok_or_else(|| error!(DeedError::Overflow))?;
    offer.price_remaining = offer.price_remaining.checked_sub(lamports).ok_or_else(|| error!(DeedError::Overflow))?;
    offer.fills = offer.fills.checked_add(1).ok_or_else(|| error!(DeedError::Overflow))?;
    if offer.remaining == 0 {
        offer.status = OfferStatus::Filled;
    }
    Ok(())
}

/// Who may close an open offer: the maker (cancel) or the named counterparty (reject).
fn closing_status(offer: &Offer, closer: &Pubkey) -> Result<OfferStatus> {
    require!(offer.status == OfferStatus::Active, DeedError::OfferNotActive);
    if *closer == offer.maker {
        Ok(OfferStatus::Cancelled)
    } else if offer.counterparty != Pubkey::default() && *closer == offer.counterparty {
        Ok(OfferStatus::Rejected)
    } else {
        err!(DeedError::NotAuthorizedToClose)
    }
}

// ====================================================================== SELL offers (tokens escrowed)

#[derive(Accounts)]
#[instruction(args: CreateOfferArgs)]
pub struct CreateSellOffer<'info> {
    #[account(mut)]
    pub maker: Signer<'info>,

    #[account(mint::token_program = token_program)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = maker,
        token::token_program = token_program,
    )]
    pub maker_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init,
        payer = maker,
        space = 8 + Offer::INIT_SPACE,
        seeds = [OFFER_SEED, maker.key().as_ref(), &args.nonce.to_le_bytes()],
        bump,
    )]
    pub offer: Account<'info, Offer>,

    #[account(
        init,
        payer = maker,
        associated_token::mint = mint,
        associated_token::authority = offer,
        associated_token::token_program = token_program,
    )]
    pub escrow: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_sell_offer(ctx: Context<CreateSellOffer>, args: CreateOfferArgs) -> Result<()> {
    validate_mint(&ctx.accounts.mint)?;
    init_offer(
        &mut ctx.accounts.offer,
        ctx.bumps.offer,
        ctx.accounts.maker.key(),
        ctx.accounts.mint.key(),
        ctx.accounts.token_program.key(),
        OfferKind::Sell,
        &args,
    )?;
    transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.maker_token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.escrow.to_account_info(),
                authority: ctx.accounts.maker.to_account_info(),
            },
        ),
        args.amount,
        ctx.accounts.mint.decimals,
    )
}

/// A taker buys `amount` tokens of a SELL offer for SOL. The fee (0.5% of the SOL leg) is paid by the token seller, so
/// the taker pays exactly the rounded-up price and the maker receives it minus the fee.
#[derive(Accounts)]
pub struct FillSellOffer<'info> {
    #[account(mut)]
    pub taker: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,

    /// CHECK: must be the configured treasury.
    #[account(mut, address = config.treasury @ DeedError::WrongTreasury)]
    pub treasury: UncheckedAccount<'info>,

    /// CHECK: must be the offer's maker.
    #[account(mut, address = offer.maker @ DeedError::NotMaker)]
    pub maker: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [OFFER_SEED, offer.maker.as_ref(), &offer.nonce.to_le_bytes()],
        bump = offer.bump,
        constraint = offer.kind == OfferKind::Sell @ DeedError::OfferNotActive,
    )]
    pub offer: Account<'info, Offer>,

    #[account(address = offer.mint, mint::token_program = token_program)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = offer,
        associated_token::token_program = token_program,
    )]
    pub escrow: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = taker,
        associated_token::mint = mint,
        associated_token::authority = taker,
        associated_token::token_program = token_program,
    )]
    pub taker_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_fill_sell_offer(ctx: Context<FillSellOffer>, amount: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let taker = ctx.accounts.taker.key();
    check_fill(&ctx.accounts.offer, &taker, amount, now)?;

    let lamports = fill_lamports(OfferKind::Sell, amount, ctx.accounts.offer.remaining, ctx.accounts.offer.price_remaining)?;
    let fee = bps_of(lamports, ctx.accounts.offer.fee_bps as u64);
    let to_maker = lamports.checked_sub(fee).ok_or_else(|| error!(DeedError::Overflow))?;

    // SOL: taker -> maker (net of fee) and treasury (fee).
    let sys = ctx.accounts.system_program.key();
    transfer(
        CpiContext::new(sys, Transfer { from: ctx.accounts.taker.to_account_info(), to: ctx.accounts.maker.to_account_info() }),
        to_maker,
    )?;
    if fee > 0 {
        transfer(
            CpiContext::new(sys, Transfer { from: ctx.accounts.taker.to_account_info(), to: ctx.accounts.treasury.to_account_info() }),
            fee,
        )?;
    }

    // Tokens: escrow -> taker.
    let maker_key = ctx.accounts.offer.maker;
    let nonce = ctx.accounts.offer.nonce.to_le_bytes();
    let bump = [ctx.accounts.offer.bump];
    let seeds: &[&[u8]] = &[OFFER_SEED, maker_key.as_ref(), &nonce, &bump];
    let signer: &[&[&[u8]]] = &[seeds];
    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.escrow.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.taker_token_account.to_account_info(),
                authority: ctx.accounts.offer.to_account_info(),
            },
            signer,
        ),
        amount,
        ctx.accounts.mint.decimals,
    )?;

    apply_fill(&mut ctx.accounts.offer, amount, lamports)?;
    let remaining = ctx.accounts.offer.remaining;
    emit!(OfferFilled {
        offer: ctx.accounts.offer.key(),
        maker: maker_key,
        taker,
        mint: ctx.accounts.mint.key(),
        kind: OfferKind::Sell as u8,
        amount,
        lamports,
        fee,
        remaining,
        ts: now,
    });

    if remaining == 0 {
        close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            CloseAccount {
                account: ctx.accounts.escrow.to_account_info(),
                destination: ctx.accounts.maker.to_account_info(),
                authority: ctx.accounts.offer.to_account_info(),
            },
            signer,
        ))?;
        ctx.accounts.offer.close(ctx.accounts.maker.to_account_info())?;
    }
    Ok(())
}

/// Returns the escrowed tokens to the maker and closes the offer. Callable by the maker (cancel) or by the named
/// counterparty of a private offer (reject).
#[derive(Accounts)]
pub struct CloseSellOffer<'info> {
    /// Pays for the maker's token account if it no longer exists.
    #[account(mut)]
    pub closer: Signer<'info>,

    /// CHECK: must be the offer's maker.
    #[account(mut, address = offer.maker @ DeedError::NotMaker)]
    pub maker: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [OFFER_SEED, offer.maker.as_ref(), &offer.nonce.to_le_bytes()],
        bump = offer.bump,
        constraint = offer.kind == OfferKind::Sell @ DeedError::OfferNotActive,
    )]
    pub offer: Account<'info, Offer>,

    #[account(address = offer.mint, mint::token_program = token_program)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = offer,
        associated_token::token_program = token_program,
    )]
    pub escrow: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = closer,
        associated_token::mint = mint,
        associated_token::authority = maker,
        associated_token::token_program = token_program,
    )]
    pub maker_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_close_sell_offer(ctx: Context<CloseSellOffer>) -> Result<()> {
    let status = closing_status(&ctx.accounts.offer, &ctx.accounts.closer.key())?;
    let returned = ctx.accounts.escrow.amount;

    let maker_key = ctx.accounts.offer.maker;
    let nonce = ctx.accounts.offer.nonce.to_le_bytes();
    let bump = [ctx.accounts.offer.bump];
    let seeds: &[&[u8]] = &[OFFER_SEED, maker_key.as_ref(), &nonce, &bump];
    let signer: &[&[&[u8]]] = &[seeds];
    if returned > 0 {
        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                TransferChecked {
                    from: ctx.accounts.escrow.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.maker_token_account.to_account_info(),
                    authority: ctx.accounts.offer.to_account_info(),
                },
                signer,
            ),
            returned,
            ctx.accounts.mint.decimals,
        )?;
    }
    close_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.key(),
        CloseAccount {
            account: ctx.accounts.escrow.to_account_info(),
            destination: ctx.accounts.maker.to_account_info(),
            authority: ctx.accounts.offer.to_account_info(),
        },
        signer,
    ))?;

    emit!(OfferClosed {
        offer: ctx.accounts.offer.key(),
        maker: maker_key,
        closer: ctx.accounts.closer.key(),
        status: status as u8, // Cancelled=2, Rejected=3
        returned_amount: returned,
        returned_lamports: 0,
        ts: Clock::get()?.unix_timestamp,
    });
    ctx.accounts.offer.close(ctx.accounts.maker.to_account_info())
}

// ====================================================================== BUY offers (SOL escrowed)

#[derive(Accounts)]
#[instruction(args: CreateOfferArgs)]
pub struct CreateBuyOffer<'info> {
    #[account(mut)]
    pub maker: Signer<'info>,

    #[account(mint::token_program = token_program)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = maker,
        space = 8 + Offer::INIT_SPACE,
        seeds = [OFFER_SEED, maker.key().as_ref(), &args.nonce.to_le_bytes()],
        bump,
    )]
    pub offer: Account<'info, Offer>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_buy_offer(ctx: Context<CreateBuyOffer>, args: CreateOfferArgs) -> Result<()> {
    validate_mint(&ctx.accounts.mint)?;
    init_offer(
        &mut ctx.accounts.offer,
        ctx.bumps.offer,
        ctx.accounts.maker.key(),
        ctx.accounts.mint.key(),
        ctx.accounts.token_program.key(),
        OfferKind::Buy,
        &args,
    )?;
    // Escrow the SOL.
    transfer(
        CpiContext::new(
            ctx.accounts.system_program.key(),
            Transfer { from: ctx.accounts.maker.to_account_info(), to: ctx.accounts.offer.to_account_info() },
        ),
        args.price_total,
    )
}

/// A taker sells `amount` tokens into a BUY bid. The tokens go straight to the maker; the escrowed SOL goes to the
/// taker minus the 0.5% fee (paid by the token seller, i.e. the taker).
#[derive(Accounts)]
pub struct FillBuyOffer<'info> {
    #[account(mut)]
    pub taker: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,

    /// CHECK: must be the configured treasury.
    #[account(mut, address = config.treasury @ DeedError::WrongTreasury)]
    pub treasury: UncheckedAccount<'info>,

    /// CHECK: must be the offer's maker; receives the tokens and the rent of the closed offer.
    #[account(mut, address = offer.maker @ DeedError::NotMaker)]
    pub maker: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [OFFER_SEED, offer.maker.as_ref(), &offer.nonce.to_le_bytes()],
        bump = offer.bump,
        constraint = offer.kind == OfferKind::Buy @ DeedError::OfferNotActive,
    )]
    pub offer: Account<'info, Offer>,

    #[account(address = offer.mint, mint::token_program = token_program)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = taker,
        token::token_program = token_program,
    )]
    pub taker_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = taker,
        associated_token::mint = mint,
        associated_token::authority = maker,
        associated_token::token_program = token_program,
    )]
    pub maker_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_fill_buy_offer(ctx: Context<FillBuyOffer>, amount: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let taker = ctx.accounts.taker.key();
    check_fill(&ctx.accounts.offer, &taker, amount, now)?;

    let lamports = fill_lamports(OfferKind::Buy, amount, ctx.accounts.offer.remaining, ctx.accounts.offer.price_remaining)?;
    require!(lamports > 0, DeedError::FillRoundsToZero);
    let fee = bps_of(lamports, ctx.accounts.offer.fee_bps as u64);
    let to_taker = lamports.checked_sub(fee).ok_or_else(|| error!(DeedError::Overflow))?;

    // Tokens: taker -> maker.
    transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.taker_token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.maker_token_account.to_account_info(),
                authority: ctx.accounts.taker.to_account_info(),
            },
        ),
        amount,
        ctx.accounts.mint.decimals,
    )?;

    // SOL: escrow (the offer PDA's lamports) -> taker (net of fee) and treasury (fee).
    ctx.accounts.offer.sub_lamports(lamports)?;
    ctx.accounts.taker.add_lamports(to_taker)?;
    ctx.accounts.treasury.add_lamports(fee)?;

    apply_fill(&mut ctx.accounts.offer, amount, lamports)?;
    let remaining = ctx.accounts.offer.remaining;
    emit!(OfferFilled {
        offer: ctx.accounts.offer.key(),
        maker: ctx.accounts.offer.maker,
        taker,
        mint: ctx.accounts.mint.key(),
        kind: OfferKind::Buy as u8,
        amount,
        lamports,
        fee,
        remaining,
        ts: now,
    });
    if remaining == 0 {
        ctx.accounts.offer.close(ctx.accounts.maker.to_account_info())?;
    }
    Ok(())
}

/// Returns the escrowed SOL to the maker and closes the offer (cancel by the maker, reject by the counterparty).
#[derive(Accounts)]
pub struct CloseBuyOffer<'info> {
    #[account(mut)]
    pub closer: Signer<'info>,

    /// CHECK: must be the offer's maker; receives the escrowed SOL and the offer's rent.
    #[account(mut, address = offer.maker @ DeedError::NotMaker)]
    pub maker: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [OFFER_SEED, offer.maker.as_ref(), &offer.nonce.to_le_bytes()],
        bump = offer.bump,
        constraint = offer.kind == OfferKind::Buy @ DeedError::OfferNotActive,
    )]
    pub offer: Account<'info, Offer>,
}

pub fn handle_close_buy_offer(ctx: Context<CloseBuyOffer>) -> Result<()> {
    let status = closing_status(&ctx.accounts.offer, &ctx.accounts.closer.key())?;
    let returned = ctx.accounts.offer.price_remaining;
    emit!(OfferClosed {
        offer: ctx.accounts.offer.key(),
        maker: ctx.accounts.offer.maker,
        closer: ctx.accounts.closer.key(),
        status: status as u8,
        returned_amount: 0,
        returned_lamports: returned,
        ts: Clock::get()?.unix_timestamp,
    });
    // `close` moves ALL lamports (escrow + rent) to the maker.
    ctx.accounts.offer.close(ctx.accounts.maker.to_account_info())
}
