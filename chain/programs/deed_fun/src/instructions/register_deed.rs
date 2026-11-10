use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::constants::*;
use crate::error::DeedError;
use crate::events::DeedRegistered;
use crate::state::DeedState;
use crate::util::{check_mint_extensions, parse_sharing_config};

/// Registers the Deed of a Pump.fun coin.
///
/// This instruction does not create or move anything on Pump: it VERIFIES, from Pump Fees' own account data, that
///   1. the coin's `SharingConfig` pays 100% (10 000 bps) of the creator fees to this program's vault PDA,
///   2. the config's admin authority has been revoked, so that split can never be changed again, and
///   3. the signer is the coin's creator (the config's admin),
/// and that the Deed mint is a true 1/1 (supply 1, 0 decimals, mint and freeze authority revoked). Only then does it
/// record the coin <-> Deed link. From that moment, whoever holds the Deed token can call `claim_fees`.
#[derive(Accounts)]
pub struct RegisterDeed<'info> {
    /// The coin's creator. Receives the Deed (it must already hold the single token) and pays the registry rent.
    #[account(mut)]
    pub creator: Signer<'info>,

    /// CHECK: only its address is used; the sharing config below is bound to it.
    pub coin_mint: UncheckedAccount<'info>,

    /// CHECK: owned by the Pump Fees program, at the PDA derived from the coin mint, with SharingConfig data that is
    /// validated in the handler.
    #[account(
        seeds = [SHARING_CONFIG_SEED, coin_mint.key().as_ref()],
        bump,
        seeds::program = PUMP_FEES_PROGRAM,
        owner = PUMP_FEES_PROGRAM @ DeedError::InvalidSharingConfig,
    )]
    pub sharing_config: UncheckedAccount<'info>,

    /// The system-owned vault that Pump pays the creator fees into. Must be pre-funded with the rent-exempt minimum so
    /// that any payout (even a tiny first one) leaves the account rent-exempt.
    #[account(
        seeds = [VAULT_SEED, coin_mint.key().as_ref()],
        bump,
        constraint = vault.lamports() >= Rent::get()?.minimum_balance(0) @ DeedError::VaultNotFunded,
    )]
    pub vault: SystemAccount<'info>,

    #[account(
        mint::decimals = 0,
        mint::token_program = token_program,
        constraint = deed_mint.supply == 1 @ DeedError::InvalidDeedMint,
        constraint = deed_mint.key() != coin_mint.key() @ DeedError::InvalidDeedMint,
        constraint = deed_mint.mint_authority.is_none() @ DeedError::DeedMintAuthoritiesPresent,
        constraint = deed_mint.freeze_authority.is_none() @ DeedError::DeedMintAuthoritiesPresent,
    )]
    pub deed_mint: InterfaceAccount<'info, Mint>,

    #[account(
        token::mint = deed_mint,
        token::authority = creator,
        token::token_program = token_program,
        constraint = creator_deed_account.amount == 1 @ DeedError::DeedNotHeldByRegistrant,
    )]
    pub creator_deed_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init,
        payer = creator,
        space = 8 + DeedState::INIT_SPACE,
        seeds = [DEED_SEED, coin_mint.key().as_ref()],
        bump,
    )]
    pub deed_state: Account<'info, DeedState>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handle_register_deed(ctx: Context<RegisterDeed>) -> Result<()> {
    let a = &ctx.accounts;

    // The Deed's metadata lives in Token-2022 extensions; refuse anything that could move or burn it behind the holder's back.
    check_mint_extensions(&a.deed_mint.to_account_info().try_borrow_data()?)?;

    let cfg = parse_sharing_config(&a.sharing_config.try_borrow_data()?)?;
    require_keys_eq!(cfg.mint, a.coin_mint.key(), DeedError::InvalidSharingConfig);
    require!(cfg.status == SHARING_STATUS_ACTIVE, DeedError::SharingConfigNotActive);
    require_keys_eq!(cfg.admin, a.creator.key(), DeedError::NotCoinCreator);
    require!(cfg.admin_revoked, DeedError::FeeAuthorityNotRevoked);
    require!(
        cfg.shareholders.len() == 1 && cfg.shareholders[0] == (a.vault.key(), 10_000),
        DeedError::FeesNotLockedToVault
    );

    let st = &mut ctx.accounts.deed_state;
    st.coin_mint = ctx.accounts.coin_mint.key();
    st.deed_mint = ctx.accounts.deed_mint.key();
    st.sharing_config = ctx.accounts.sharing_config.key();
    st.creator = ctx.accounts.creator.key();
    st.registered_at = Clock::get()?.unix_timestamp;
    st.claimed_total = 0;
    st.auction_count = 0;
    st.vault_bump = ctx.bumps.vault;
    st.bump = ctx.bumps.deed_state;

    emit!(DeedRegistered {
        coin_mint: st.coin_mint,
        deed_mint: st.deed_mint,
        deed_state: st.key(),
        creator: st.creator,
    });
    Ok(())
}
