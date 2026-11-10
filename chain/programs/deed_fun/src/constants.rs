use anchor_lang::prelude::*;

// ---- PDA seeds
pub const CONFIG_SEED: &[u8] = b"config";
pub const DEED_SEED: &[u8] = b"deed";
pub const VAULT_SEED: &[u8] = b"vault";
pub const AUCTION_SEED: &[u8] = b"auction";
pub const OFFER_SEED: &[u8] = b"offer";

// ---- Pump.fun (official addresses from the pump-public-docs repository; verified against the published IDLs)
/// Pump Fees program: owns the fee-sharing `SharingConfig` accounts.
pub const PUMP_FEES_PROGRAM: Pubkey = pubkey!("pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ");
/// Seed of the SharingConfig PDA under the Pump Fees program: `["sharing-config", coin_mint]`.
pub const SHARING_CONFIG_SEED: &[u8] = b"sharing-config";
/// Anchor account discriminator of Pump Fees' `SharingConfig`.
pub const SHARING_CONFIG_DISCRIMINATOR: [u8; 8] = [216, 74, 9, 0, 56, 140, 93, 75];
/// `ConfigStatus::Active`.
pub const SHARING_STATUS_ACTIVE: u8 = 1;

// ---- fees (basis points, charged to the seller on COMPLETED sales only)
pub const AUCTION_FEE_BPS: u64 = 100; // 1%
pub const OTC_FEE_BPS: u64 = 50; // 0.5% of the SOL leg, paid by the token seller
pub const BPS_DENOMINATOR: u64 = 10_000;

// ---- auction rules
pub const MIN_INCREMENT_BPS: u64 = 500; // each bid must beat the current bid by 5% ...
pub const MIN_INCREMENT_LAMPORTS: u64 = 100_000_000; // ... or 0.1 SOL, whichever is greater
/// A bid in the last 5 minutes pushes the end out by 5 minutes (2 seconds in the test-only `e2e-short-timers` build).
#[cfg(not(feature = "e2e-short-timers"))]
pub const ANTI_SNIPE_SECS: i64 = 300;
#[cfg(feature = "e2e-short-timers")]
pub const ANTI_SNIPE_SECS: i64 = 2;
pub const MIN_START_PRICE: u64 = 10_000_000; // 0.01 SOL
/// 10 minutes. The `e2e-short-timers` feature exists ONLY for the local-validator end-to-end suite (5 seconds) so
/// settlement can be exercised without waiting; `build.sh e2e` writes that build to a separate folder and the deploy script
/// refuses it.
#[cfg(not(feature = "e2e-short-timers"))]
pub const MIN_AUCTION_SECS: i64 = 600;
#[cfg(feature = "e2e-short-timers")]
pub const MIN_AUCTION_SECS: i64 = 5;
pub const MAX_AUCTION_SECS: i64 = 604_800; // 7 days
pub const MAX_BID: u64 = 1_000_000_000_000_000; // 1,000,000 SOL: a sanity cap that keeps every sum far from u64::MAX

// ---- OTC rules
pub const MIN_OFFER_LAMPORTS: u64 = 100_000; // 0.0001 SOL
pub const MIN_OFFER_SECS: i64 = 60;
pub const MAX_OFFER_SECS: i64 = 31_536_000; // 365 days

// ---- Token-2022 extension types that a Deed or an OTC mint may carry. Everything else is refused because an
// extension such as PermanentDelegate, TransferHook, TransferFee, DefaultAccountState or MintCloseAuthority lets
// someone other than the escrow program move, freeze or destroy escrowed tokens.
pub const EXT_METADATA_POINTER: u16 = 18;
pub const EXT_TOKEN_METADATA: u16 = 19;
