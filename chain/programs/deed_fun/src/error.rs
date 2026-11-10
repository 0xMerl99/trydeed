use anchor_lang::prelude::*;

#[error_code]
pub enum DeedError {
    // ---- admin
    #[msg("Only the program's upgrade authority may initialise the config")]
    NotUpgradeAuthority,

    // ---- deed registry
    #[msg("This is not the Pump Fees sharing-config account of that coin")]
    InvalidSharingConfig,
    #[msg("The sharing config is not active")]
    SharingConfigNotActive,
    #[msg("Only the creator (sharing-config admin) of the coin may register its Deed")]
    NotCoinCreator,
    #[msg("The creator-fee authority has not been revoked, so the fee split could still change")]
    FeeAuthorityNotRevoked,
    #[msg("The coin's fees are not 100% locked to the Deed vault")]
    FeesNotLockedToVault,
    #[msg("The Deed vault must be pre-funded with the rent-exempt minimum")]
    VaultNotFunded,
    #[msg("The Deed mint must be a 0-decimal mint with a supply of exactly 1")]
    InvalidDeedMint,
    #[msg("The Deed mint can still be minted from or frozen: authorities must be revoked")]
    DeedMintAuthoritiesPresent,
    #[msg("The Deed token must be held by the registrant")]
    DeedNotHeldByRegistrant,
    #[msg("This mint carries a Token-2022 extension that is not allowed")]
    UnsupportedMintExtension,
    #[msg("Mints with a freeze authority cannot be escrowed")]
    FreezeAuthorityPresent,
    #[msg("This token program is not supported")]
    UnsupportedTokenProgram,

    // ---- claiming
    #[msg("You do not hold the Deed")]
    NotDeedHolder,
    #[msg("There are no fees to claim yet")]
    NothingToClaim,

    // ---- auctions
    #[msg("The auction is not live")]
    AuctionNotLive,
    #[msg("The auction has ended")]
    AuctionEnded,
    #[msg("The auction has not ended yet")]
    AuctionNotEnded,
    #[msg("Starting price is below the minimum")]
    StartPriceTooLow,
    #[msg("Duration is outside the allowed range")]
    InvalidDuration,
    #[msg("A seller cannot bid on their own auction")]
    SellerCannotBid,
    #[msg("You already hold the highest bid")]
    AlreadyHighestBidder,
    #[msg("The bid is below the minimum next bid")]
    BidTooLow,
    #[msg("The bid is above the supported maximum")]
    BidTooHigh,
    #[msg("The previous bidder account does not match the highest bidder")]
    PreviousBidderMismatch,
    #[msg("An auction that has bids can no longer be cancelled")]
    AuctionHasBids,
    #[msg("The auction has no bids, so there is nothing to settle: cancel it to return the Deed")]
    AuctionHasNoBids,
    #[msg("The auction is still live and cannot be closed")]
    AuctionStillOpen,
    #[msg("Only the seller may do this")]
    NotSeller,

    // ---- OTC
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Price is below the minimum")]
    PriceTooLow,
    #[msg("Expiry is outside the allowed range")]
    InvalidExpiry,
    #[msg("Minimum fill is invalid")]
    InvalidMinFill,
    #[msg("The offer is not active")]
    OfferNotActive,
    #[msg("The offer has expired")]
    OfferExpired,
    #[msg("This offer is private to another wallet")]
    NotCounterparty,
    #[msg("You cannot fill your own offer")]
    OwnOffer,
    #[msg("Fill amount exceeds what remains")]
    FillTooLarge,
    #[msg("Fill is below the offer's minimum fill")]
    FillBelowMinimum,
    #[msg("The fill rounds to zero lamports")]
    FillRoundsToZero,
    #[msg("Only the maker may do this")]
    NotMaker,
    #[msg("Only the maker or the named counterparty may close this offer")]
    NotAuthorizedToClose,
    #[msg("The offer is still open and cannot be closed")]
    OfferStillOpen,
    #[msg("Wrong treasury account")]
    WrongTreasury,
    #[msg("Arithmetic overflow")]
    Overflow,
}
