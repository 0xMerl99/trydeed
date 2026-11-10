//! Pure helpers: auction/OTC math, Pump Fees `SharingConfig` parsing and Token-2022 extension screening.
//! Everything here is covered by unit tests at the bottom of the file.
use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::DeedError;
use crate::state::OfferKind;

// ------------------------------------------------------------------ auction math

/// MAX(current x 5%, 0.1 SOL). The 5% share is rounded UP to the next lamport so the rule is never under-enforced.
pub fn min_increment(current: u64) -> u64 {
    let pct = (current as u128 * MIN_INCREMENT_BPS as u128 + (BPS_DENOMINATOR as u128 - 1)) / BPS_DENOMINATOR as u128;
    (pct as u64).max(MIN_INCREMENT_LAMPORTS)
}

/// First bid: at least the starting price. After that: current bid + MAX(5%, 0.1 SOL).
pub fn min_next_bid(bid_count: u32, highest_bid: u64, start_price: u64) -> Result<u64> {
    if bid_count == 0 {
        Ok(start_price)
    } else {
        highest_bid.checked_add(min_increment(highest_bid)).ok_or_else(|| error!(DeedError::Overflow))
    }
}

/// `price x bps / 10_000`, floored. Charged to the seller only when a sale completes.
pub fn bps_of(amount: u64, bps: u64) -> u64 {
    ((amount as u128 * bps as u128) / BPS_DENOMINATOR as u128) as u64
}

/// Anti-sniping: a bid placed while 1..=300 seconds remain moves the end time out BY 300 seconds.
pub fn end_after_bid(end_time: i64, now: i64) -> (i64, bool) {
    let remaining = end_time - now;
    if remaining > 0 && remaining <= ANTI_SNIPE_SECS {
        (end_time + ANTI_SNIPE_SECS, true)
    } else {
        (end_time, false)
    }
}

// ------------------------------------------------------------------ OTC math

/// Lamports owed for filling `amount` of an offer that still has `remaining` tokens for `price_remaining` lamports.
/// SELL offer (taker buys): round UP. BUY bid (taker sells): round DOWN. Filling everything returns the exact remainder.
pub fn fill_lamports(kind: OfferKind, amount: u64, remaining: u64, price_remaining: u64) -> Result<u64> {
    require!(amount > 0, DeedError::ZeroAmount);
    require!(amount <= remaining, DeedError::FillTooLarge);
    if amount == remaining {
        return Ok(price_remaining);
    }
    let num = amount as u128 * price_remaining as u128;
    let den = remaining as u128;
    let v = match kind {
        OfferKind::Sell => (num + den - 1) / den,
        OfferKind::Buy => num / den,
    };
    u64::try_from(v).map_err(|_| error!(DeedError::Overflow))
}

// ------------------------------------------------------------------ Pump Fees SharingConfig

pub struct SharingConfigView {
    pub status: u8,
    pub mint: Pubkey,
    pub admin: Pubkey,
    pub admin_revoked: bool,
    pub shareholders: Vec<(Pubkey, u16)>,
}

/// Layout (Pump Fees IDL): disc(8) bump(1) version(1) status(1) mint(32) admin(32) admin_revoked(1)
/// shareholders: u32 length + N x { address(32), share_bps u16 }.
pub fn parse_sharing_config(data: &[u8]) -> Result<SharingConfigView> {
    require!(data.len() >= 80 && data[..8] == SHARING_CONFIG_DISCRIMINATOR, DeedError::InvalidSharingConfig);
    let status = data[10];
    let mint = Pubkey::try_from(&data[11..43]).map_err(|_| error!(DeedError::InvalidSharingConfig))?;
    let admin = Pubkey::try_from(&data[43..75]).map_err(|_| error!(DeedError::InvalidSharingConfig))?;
    let admin_revoked = data[75] != 0;
    let n = u32::from_le_bytes(data[76..80].try_into().unwrap()) as usize;
    require!(n <= 64 && data.len() >= 80 + n * 34, DeedError::InvalidSharingConfig);
    let mut shareholders = Vec::with_capacity(n);
    for i in 0..n {
        let o = 80 + i * 34;
        let addr = Pubkey::try_from(&data[o..o + 32]).map_err(|_| error!(DeedError::InvalidSharingConfig))?;
        let bps = u16::from_le_bytes(data[o + 32..o + 34].try_into().unwrap());
        shareholders.push((addr, bps));
    }
    Ok(SharingConfigView { status, mint, admin, admin_revoked, shareholders })
}

// ------------------------------------------------------------------ Token-2022 extension screening

/// Accepts a classic SPL Token mint (82 bytes, no extensions) and a Token-2022 mint whose extensions are limited to
/// MetadataPointer and TokenMetadata (what Pump.fun coins and Deeds use). Anything else is refused.
pub fn check_mint_extensions(data: &[u8]) -> Result<()> {
    if data.len() <= 82 {
        return Ok(());
    }
    // Token-2022: base mint (82) + zero padding up to 165, then the account-type byte (1 = Mint), then TLV entries.
    require!(data.len() > 166 && data[165] == 1, DeedError::UnsupportedMintExtension);
    let mut off = 166usize;
    while off + 4 <= data.len() {
        let ty = u16::from_le_bytes([data[off], data[off + 1]]);
        let len = u16::from_le_bytes([data[off + 2], data[off + 3]]) as usize;
        if ty == 0 {
            break; // uninitialised padding
        }
        require!(ty == EXT_METADATA_POINTER || ty == EXT_TOKEN_METADATA, DeedError::UnsupportedMintExtension);
        off += 4 + len;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const SOL: u64 = 1_000_000_000;

    #[test]
    fn min_increment_is_max_of_5pct_and_tenth_sol() {
        assert_eq!(min_increment(SOL), 100_000_000); // 5% = 0.05 SOL < 0.1 SOL
        assert_eq!(min_increment(2 * SOL), 100_000_000); // 5% = 0.1 SOL
        assert_eq!(min_increment(10 * SOL), 500_000_000); // 5% = 0.5 SOL
        assert_eq!(min_increment(2 * SOL + 1), 100_000_001); // rounded UP
    }

    #[test]
    fn next_bid_floor() {
        assert_eq!(min_next_bid(0, 0, 5 * SOL / 100).unwrap(), 5 * SOL / 100);
        assert_eq!(min_next_bid(1, SOL, 0).unwrap(), SOL + 100_000_000);
        assert_eq!(min_next_bid(3, 10 * SOL, 0).unwrap(), 10 * SOL + 500_000_000);
    }

    #[test]
    fn fee_is_floored() {
        assert_eq!(bps_of(SOL, AUCTION_FEE_BPS), 10_000_000);
        assert_eq!(bps_of(199, AUCTION_FEE_BPS), 1);
        assert_eq!(bps_of(99, AUCTION_FEE_BPS), 0);
        assert_eq!(bps_of(SOL, OTC_FEE_BPS), 5_000_000);
    }

    #[test]
    fn anti_snipe_only_in_last_five_minutes() {
        assert_eq!(end_after_bid(10_000, 0), (10_000, false)); // hours left
        assert_eq!(end_after_bid(10_000, 10_000 - 301), (10_000, false)); // 301s left
        assert_eq!(end_after_bid(10_000, 10_000 - 300), (10_300, true)); // exactly 300s
        assert_eq!(end_after_bid(10_000, 10_000 - 1), (10_300, true));
        assert_eq!(end_after_bid(10_000, 10_000), (10_000, false)); // ended
    }

    #[test]
    fn fill_rounding_buyer_ceil_seller_floor_last_exact() {
        // 3 tokens for 10 lamports. Filling 1: SELL offer rounds up (4), BUY bid rounds down (3).
        assert_eq!(fill_lamports(OfferKind::Sell, 1, 3, 10).unwrap(), 4);
        assert_eq!(fill_lamports(OfferKind::Buy, 1, 3, 10).unwrap(), 3);
        // the last fill takes exactly what is left, so the maker is never over- or under-paid in total
        assert_eq!(fill_lamports(OfferKind::Sell, 3, 3, 10).unwrap(), 10);
        assert_eq!(fill_lamports(OfferKind::Buy, 3, 3, 10).unwrap(), 10);
        assert!(fill_lamports(OfferKind::Sell, 4, 3, 10).is_err());
        assert!(fill_lamports(OfferKind::Sell, 0, 3, 10).is_err());
    }

    #[test]
    fn fills_never_pay_out_more_than_the_price() {
        // Greedy partial fills of a BUY bid (floor) never exceed the escrow; of a SELL offer (ceil) never go below price.
        let (mut rem, mut price) = (1_000_003u64, 777_777_777u64);
        let total = price;
        let mut paid = 0u64;
        for step in [123_456u64, 1, 99_999, 500_000, 276_547] {
            let l = fill_lamports(OfferKind::Buy, step, rem, price).unwrap();
            paid += l;
            rem -= step;
            price -= l;
        }
        assert_eq!(rem, 0);
        assert_eq!(price, 0);
        assert_eq!(paid, total);
    }

    fn sharing_config_bytes(admin_revoked: bool, holders: &[(Pubkey, u16)]) -> Vec<u8> {
        let mut d = SHARING_CONFIG_DISCRIMINATOR.to_vec();
        d.extend_from_slice(&[255, 0, SHARING_STATUS_ACTIVE]); // bump, version, status
        d.extend_from_slice(&Pubkey::new_unique().to_bytes()); // mint
        d.extend_from_slice(&Pubkey::new_unique().to_bytes()); // admin
        d.push(admin_revoked as u8);
        d.extend_from_slice(&(holders.len() as u32).to_le_bytes());
        for (a, b) in holders {
            d.extend_from_slice(&a.to_bytes());
            d.extend_from_slice(&b.to_le_bytes());
        }
        d.resize(1024, 0);
        d
    }

    #[test]
    fn parses_sharing_config() {
        let vault = Pubkey::new_unique();
        let v = parse_sharing_config(&sharing_config_bytes(true, &[(vault, 10_000)])).unwrap();
        assert!(v.admin_revoked);
        assert_eq!(v.status, SHARING_STATUS_ACTIVE);
        assert_eq!(v.shareholders, vec![(vault, 10_000)]);
        let mut bad = sharing_config_bytes(true, &[]);
        bad[0] ^= 1;
        assert!(parse_sharing_config(&bad).is_err());
        assert!(parse_sharing_config(&[0u8; 10]).is_err());
    }

    #[test]
    fn screens_mint_extensions() {
        assert!(check_mint_extensions(&[0u8; 82]).is_ok()); // classic mint
        let mut ok = vec![0u8; 166];
        ok[165] = 1;
        ok.extend_from_slice(&[18, 0, 64, 0]); // MetadataPointer, len 64
        ok.extend_from_slice(&[0u8; 64]);
        ok.extend_from_slice(&[19, 0, 8, 0]); // TokenMetadata, len 8
        ok.extend_from_slice(&[0u8; 8]);
        assert!(check_mint_extensions(&ok).is_ok());
        let mut bad = vec![0u8; 166];
        bad[165] = 1;
        bad.extend_from_slice(&[12, 0, 32, 0]); // PermanentDelegate
        bad.extend_from_slice(&[0u8; 32]);
        assert!(check_mint_extensions(&bad).is_err());
        let mut hook = vec![0u8; 166];
        hook[165] = 1;
        hook.extend_from_slice(&[14, 0, 64, 0]); // TransferHook
        hook.extend_from_slice(&[0u8; 64]);
        assert!(check_mint_extensions(&hook).is_err());
    }
}
