use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use anchor_spl::token_interface::TokenAccount;

use crate::constants::*;
use crate::error::DeedError;
use crate::events::FeesClaimed;
use crate::state::DeedState;

/// Pays everything the coin's fee vault holds (above its rent-exempt floor) to the current Deed holder.
/// Pump pays the creator fees into the vault by itself (`distribute_creator_fees`, callable by anyone); this
/// instruction is the second hop. A Deed that sits in an auction escrow is held by the auction PDA, which cannot sign,
/// so nobody can claim while it is escrowed: the fees keep accumulating for the next holder.
#[derive(Accounts)]
pub struct ClaimFees<'info> {
    #[account(mut)]
    pub claimant: Signer<'info>,

    #[account(mut, seeds = [DEED_SEED, deed_state.coin_mint.as_ref()], bump = deed_state.bump)]
    pub deed_state: Account<'info, DeedState>,

    #[account(mut, seeds = [VAULT_SEED, deed_state.coin_mint.as_ref()], bump = deed_state.vault_bump)]
    pub vault: SystemAccount<'info>,

    /// The claimant's token account holding the Deed.
    #[account(
        constraint = deed_token.mint == deed_state.deed_mint @ DeedError::NotDeedHolder,
        constraint = deed_token.owner == claimant.key() @ DeedError::NotDeedHolder,
        constraint = deed_token.amount == 1 @ DeedError::NotDeedHolder,
    )]
    pub deed_token: InterfaceAccount<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
}

pub fn handle_claim_fees(ctx: Context<ClaimFees>) -> Result<()> {
    let floor = Rent::get()?.minimum_balance(0);
    let amount = ctx.accounts.vault.lamports().saturating_sub(floor);
    require!(amount > 0, DeedError::NothingToClaim);

    let coin_mint = ctx.accounts.deed_state.coin_mint;
    let bump = [ctx.accounts.deed_state.vault_bump];
    let seeds: &[&[u8]] = &[VAULT_SEED, coin_mint.as_ref(), &bump];
    transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.key(),
            Transfer { from: ctx.accounts.vault.to_account_info(), to: ctx.accounts.claimant.to_account_info() },
            &[seeds],
        ),
        amount,
    )?;

    let st = &mut ctx.accounts.deed_state;
    st.claimed_total = st.claimed_total.checked_add(amount).ok_or_else(|| error!(DeedError::Overflow))?;
    emit!(FeesClaimed { coin_mint, deed_mint: st.deed_mint, claimant: ctx.accounts.claimant.key(), amount });
    Ok(())
}
