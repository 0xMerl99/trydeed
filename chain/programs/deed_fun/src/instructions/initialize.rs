use anchor_lang::prelude::*;
use anchor_lang::solana_program::bpf_loader_upgradeable;

use crate::constants::*;
use crate::error::DeedError;
use crate::state::Config;

/// Only the program's upgrade authority may create the config. Without this check anyone could front-run the
/// deployer's `initialize` and set their own treasury.
#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(init, payer = admin, space = 8 + Config::INIT_SPACE, seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,

    /// The wallet that will receive fees. It must already exist and hold the rent-exempt minimum, otherwise a 1% fee
    /// credit to it could fail the rent check and block settlement.
    #[account(constraint = treasury.lamports() >= Rent::get()?.minimum_balance(0) @ DeedError::WrongTreasury)]
    pub treasury: SystemAccount<'info>,

    /// CHECK: the BPF Loader Upgradeable ProgramData account of this program; address and authority are verified below.
    #[account(
        seeds = [crate::ID.as_ref()],
        bump,
        seeds::program = bpf_loader_upgradeable::ID,
        constraint = upgrade_authority(&program_data) == Some(admin.key()) @ DeedError::NotUpgradeAuthority,
    )]
    pub program_data: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

/// ProgramData layout: u32 enum tag (3) | u64 slot | Option<Pubkey> upgrade authority (1 + 32) | ELF.
fn upgrade_authority(info: &UncheckedAccount) -> Option<Pubkey> {
    let data = info.try_borrow_data().ok()?;
    if *info.owner != bpf_loader_upgradeable::ID || data.len() < 45 {
        return None;
    }
    if u32::from_le_bytes(data[0..4].try_into().ok()?) != 3 || data[12] != 1 {
        return None;
    }
    Pubkey::try_from(&data[13..45]).ok()
}

pub fn handle_initialize(ctx: Context<Initialize>) -> Result<()> {
    let c = &mut ctx.accounts.config;
    c.admin = ctx.accounts.admin.key();
    c.treasury = ctx.accounts.treasury.key();
    c.bump = ctx.bumps.config;
    Ok(())
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    pub admin: Signer<'info>,

    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = admin)]
    pub config: Account<'info, Config>,

    /// The (possibly new) treasury; same funding rule as at initialisation.
    #[account(constraint = treasury.lamports() >= Rent::get()?.minimum_balance(0) @ DeedError::WrongTreasury)]
    pub treasury: SystemAccount<'info>,
}

pub fn handle_update_config(ctx: Context<UpdateConfig>, new_admin: Pubkey) -> Result<()> {
    let c = &mut ctx.accounts.config;
    c.admin = new_admin;
    c.treasury = ctx.accounts.treasury.key();
    Ok(())
}
