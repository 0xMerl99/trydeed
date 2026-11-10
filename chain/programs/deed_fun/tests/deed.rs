//! Integration tests: the real compiled program (`target/deploy/deed_fun.so`) running inside LiteSVM, with the real
//! SPL Token, Token-2022 and Associated Token programs. Pump's `SharingConfig` is injected as raw account data in the
//! exact layout of the Pump Fees IDL; the full fork test against Pump's real programs lives in `chain/e2e`.
use anchor_lang::{
    prelude::Pubkey,
    solana_program::{bpf_loader_upgradeable, instruction::Instruction, system_instruction, system_program},
    AccountDeserialize, InstructionData, ToAccountMetas,
};
use litesvm::{
    types::{FailedTransactionMetadata, TransactionMetadata},
    LiteSVM,
};
use solana_account::Account;
use solana_keypair::Keypair;
use solana_message::{Message, VersionedMessage};
use solana_signer::Signer;
use solana_transaction::versioned::VersionedTransaction;

use anchor_lang::prelude::Clock;
use anchor_lang::Space;
use anchor_spl::associated_token::get_associated_token_address_with_program_id as ata_of;
use deed_fun::{constants::*, state::*};

const SOL: u64 = 1_000_000_000;
const T22: Pubkey = anchor_spl::token_2022::ID;
const SPL: Pubkey = anchor_spl::token::ID;
const ATA_PROGRAM: Pubkey = anchor_spl::associated_token::ID;

type Res = Result<TransactionMetadata, FailedTransactionMetadata>;

struct Env {
    svm: LiteSVM,
    pid: Pubkey,
    admin: Keypair,
    treasury: Keypair,
    config: Pubkey,
}

fn kp() -> Keypair {
    Keypair::new()
}

impl Env {
    fn new() -> Env {
        let pid = deed_fun::id();
        let mut svm = LiteSVM::new();
        let bytes = include_bytes!(concat!(env!("CARGO_TARGET_TMPDIR"), "/../deploy/deed_fun.so"));
        svm.add_program(pid, bytes).unwrap();
        let admin = kp();
        let treasury = kp();
        svm.airdrop(&admin.pubkey(), 100 * SOL).unwrap();
        svm.airdrop(&treasury.pubkey(), SOL).unwrap();
        // The ProgramData account that the loader would create on deployment (upgrade authority = admin).
        let pd = Pubkey::find_program_address(&[pid.as_ref()], &bpf_loader_upgradeable::ID).0;
        let mut data = vec![0u8; 45 + 16];
        data[0..4].copy_from_slice(&3u32.to_le_bytes());
        data[12] = 1;
        data[13..45].copy_from_slice(admin.pubkey().as_ref());
        svm.set_account(pd, Account { lamports: SOL, data, owner: bpf_loader_upgradeable::ID, executable: false, rent_epoch: 0 })
            .unwrap();
        let config = Pubkey::find_program_address(&[CONFIG_SEED], &pid).0;
        Env { svm, pid, admin, treasury, config }
    }

    fn send(&mut self, ixs: &[Instruction], signers: &[&Keypair]) -> Res {
        self.svm.expire_blockhash();
        let msg = Message::new_with_blockhash(ixs, Some(&signers[0].pubkey()), &self.svm.latest_blockhash());
        let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), signers).unwrap();
        self.svm.send_transaction(tx)
    }

    fn ok(&mut self, ixs: &[Instruction], signers: &[&Keypair]) -> TransactionMetadata {
        match self.send(ixs, signers) {
            Ok(m) => m,
            Err(e) => panic!("transaction failed: {:?}\n{}", e.err, e.meta.logs.join("\n")),
        }
    }

    /// Asserts the transaction failed with the named program error (or any substring of the logs).
    fn fails(&mut self, ixs: &[Instruction], signers: &[&Keypair], needle: &str) {
        match self.send(ixs, signers) {
            Ok(_) => panic!("expected failure containing {needle:?} but the transaction succeeded"),
            Err(e) => {
                let logs = e.meta.logs.join("\n");
                assert!(logs.contains(needle) || format!("{:?}", e.err).contains(needle), "expected {needle:?}, got {:?}\n{logs}", e.err);
            }
        }
    }

    fn fund(&mut self, who: &Pubkey, sol: u64) {
        self.svm.airdrop(who, sol).unwrap();
    }

    fn wallet(&mut self, sol: u64) -> Keypair {
        let k = kp();
        self.fund(&k.pubkey(), sol * SOL);
        k
    }

    fn balance(&self, who: &Pubkey) -> u64 {
        self.svm.get_account(who).map(|a| a.lamports).unwrap_or(0)
    }

    fn now(&self) -> i64 {
        self.svm.get_sysvar::<Clock>().unix_timestamp
    }

    fn warp(&mut self, unix: i64) {
        let mut c = self.svm.get_sysvar::<Clock>();
        c.unix_timestamp = unix;
        self.svm.set_sysvar(&c);
    }

    fn advance(&mut self, secs: i64) {
        let t = self.now();
        self.warp(t + secs);
    }

    fn rent(&self, space: usize) -> u64 {
        self.svm.minimum_balance_for_rent_exemption(space)
    }

    fn data<T: AccountDeserialize>(&self, key: &Pubkey) -> T {
        let acc = self.svm.get_account(key).unwrap_or_else(|| panic!("missing account {key}"));
        T::try_deserialize(&mut acc.data.as_slice()).unwrap()
    }

    fn exists(&self, key: &Pubkey) -> bool {
        self.svm.get_account(key).map(|a| a.lamports > 0).unwrap_or(false)
    }

    // ---------------------------------------------------------- tokens (raw instructions, no extra crates)

    /// Creates a mint. `ext` = Token-2022 extension to initialise first: None, Some("pointer") or Some("delegate").
    fn mint(&mut self, payer: &Keypair, token_program: Pubkey, decimals: u8, authority: &Pubkey, freeze: Option<&Pubkey>, ext: Option<&str>) -> Pubkey {
        let mint = kp();
        let space = match ext {
            None => 82,
            Some("pointer") => 165 + 1 + 4 + 64,
            Some("delegate") => 165 + 1 + 4 + 32,
            Some(other) => panic!("unknown ext {other}"),
        };
        let mut ixs = vec![system_instruction::create_account(&payer.pubkey(), &mint.pubkey(), self.rent(space), space as u64, &token_program)];
        match ext {
            Some("pointer") => {
                let mut d = vec![39u8, 0];
                d.extend_from_slice(authority.as_ref());
                d.extend_from_slice(mint.pubkey().as_ref());
                ixs.push(Instruction::new_with_bytes(token_program, &d, vec![anchor_lang::prelude::AccountMeta::new(mint.pubkey(), false)]));
            }
            Some("delegate") => {
                let mut d = vec![35u8];
                d.extend_from_slice(authority.as_ref());
                ixs.push(Instruction::new_with_bytes(token_program, &d, vec![anchor_lang::prelude::AccountMeta::new(mint.pubkey(), false)]));
            }
            _ => {}
        }
        let mut d = vec![20u8, decimals];
        d.extend_from_slice(authority.as_ref());
        match freeze {
            Some(f) => {
                d.push(1);
                d.extend_from_slice(f.as_ref());
            }
            None => d.push(0),
        }
        ixs.push(Instruction::new_with_bytes(token_program, &d, vec![anchor_lang::prelude::AccountMeta::new(mint.pubkey(), false)]));
        self.ok(&ixs, &[payer, &mint]);
        mint.pubkey()
    }

    fn create_ata(&mut self, payer: &Keypair, owner: &Pubkey, mint: &Pubkey, token_program: Pubkey) -> Pubkey {
        let ata = ata_of(owner, mint, &token_program);
        let ix = Instruction::new_with_bytes(
            ATA_PROGRAM,
            &[1u8],
            vec![
                anchor_lang::prelude::AccountMeta::new(payer.pubkey(), true),
                anchor_lang::prelude::AccountMeta::new(ata, false),
                anchor_lang::prelude::AccountMeta::new_readonly(*owner, false),
                anchor_lang::prelude::AccountMeta::new_readonly(*mint, false),
                anchor_lang::prelude::AccountMeta::new_readonly(system_program::ID, false),
                anchor_lang::prelude::AccountMeta::new_readonly(token_program, false),
            ],
        );
        self.ok(&[ix], &[payer]);
        ata
    }

    fn mint_to(&mut self, authority: &Keypair, token_program: Pubkey, mint: &Pubkey, dest: &Pubkey, amount: u64) {
        let mut d = vec![7u8];
        d.extend_from_slice(&amount.to_le_bytes());
        let ix = Instruction::new_with_bytes(
            token_program,
            &d,
            vec![
                anchor_lang::prelude::AccountMeta::new(*mint, false),
                anchor_lang::prelude::AccountMeta::new(*dest, false),
                anchor_lang::prelude::AccountMeta::new_readonly(authority.pubkey(), true),
            ],
        );
        self.ok(&[ix], &[authority]);
    }

    /// authority_type: 0 = MintTokens, 1 = FreezeAccount. Sets the authority to None.
    fn revoke(&mut self, current: &Keypair, token_program: Pubkey, mint: &Pubkey, authority_type: u8) {
        let ix = Instruction::new_with_bytes(
            token_program,
            &[6u8, authority_type, 0],
            vec![anchor_lang::prelude::AccountMeta::new(*mint, false), anchor_lang::prelude::AccountMeta::new_readonly(current.pubkey(), true)],
        );
        self.ok(&[ix], &[current]);
    }

    fn token_transfer(&mut self, owner: &Keypair, token_program: Pubkey, from: &Pubkey, mint: &Pubkey, to: &Pubkey, amount: u64, decimals: u8) {
        let mut d = vec![12u8];
        d.extend_from_slice(&amount.to_le_bytes());
        d.push(decimals);
        let ix = Instruction::new_with_bytes(
            token_program,
            &d,
            vec![
                anchor_lang::prelude::AccountMeta::new(*from, false),
                anchor_lang::prelude::AccountMeta::new_readonly(*mint, false),
                anchor_lang::prelude::AccountMeta::new(*to, false),
                anchor_lang::prelude::AccountMeta::new_readonly(owner.pubkey(), true),
            ],
        );
        self.ok(&[ix], &[owner]);
    }

    fn token_balance(&self, account: &Pubkey) -> u64 {
        match self.svm.get_account(account) {
            Some(a) if a.lamports > 0 && a.data.len() >= 72 => u64::from_le_bytes(a.data[64..72].try_into().unwrap()),
            _ => 0,
        }
    }

    // ---------------------------------------------------------- program instructions

    fn init(&mut self) {
        let ix = self.ix_initialize(&self.admin.pubkey(), &self.treasury.pubkey());
        let admin = self.admin.insecure_clone();
        self.ok(&[ix], &[&admin]);
    }

    fn ix_initialize(&self, admin: &Pubkey, treasury: &Pubkey) -> Instruction {
        Instruction::new_with_bytes(
            self.pid,
            &deed_fun::instruction::Initialize {}.data(),
            deed_fun::accounts::Initialize {
                admin: *admin,
                config: self.config,
                treasury: *treasury,
                program_data: Pubkey::find_program_address(&[self.pid.as_ref()], &bpf_loader_upgradeable::ID).0,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        )
    }
}

// ====================================================================== Deed fixture

struct Deed {
    creator: Keypair,
    coin_mint: Pubkey,
    deed_mint: Pubkey,
    deed_state: Pubkey,
    vault: Pubkey,
    sharing_config: Pubkey,
    creator_ata: Pubkey,
}

/// Writes a Pump Fees `SharingConfig` account (exact IDL layout) at its PDA.
fn put_sharing_config(env: &mut Env, coin_mint: &Pubkey, admin: &Pubkey, revoked: bool, status: u8, holders: &[(Pubkey, u16)]) -> Pubkey {
    let key = Pubkey::find_program_address(&[SHARING_CONFIG_SEED, coin_mint.as_ref()], &PUMP_FEES_PROGRAM).0;
    let mut d = SHARING_CONFIG_DISCRIMINATOR.to_vec();
    d.extend_from_slice(&[254, 2, status]);
    d.extend_from_slice(coin_mint.as_ref());
    d.extend_from_slice(admin.as_ref());
    d.push(revoked as u8);
    d.extend_from_slice(&(holders.len() as u32).to_le_bytes());
    for (a, b) in holders {
        d.extend_from_slice(a.as_ref());
        d.extend_from_slice(&b.to_le_bytes());
    }
    d.resize(1024, 0);
    let lamports = env.rent(1024);
    env.svm.set_account(key, Account { lamports, data: d, owner: PUMP_FEES_PROGRAM, executable: false, rent_epoch: 0 }).unwrap();
    key
}

impl Env {
    fn ix_register(&self, d: &Deed, signer: &Pubkey) -> Instruction {
        Instruction::new_with_bytes(
            self.pid,
            &deed_fun::instruction::RegisterDeed {}.data(),
            deed_fun::accounts::RegisterDeed {
                creator: *signer,
                coin_mint: d.coin_mint,
                sharing_config: d.sharing_config,
                vault: d.vault,
                deed_mint: d.deed_mint,
                creator_deed_account: d.creator_ata,
                deed_state: d.deed_state,
                token_program: T22,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        )
    }

    /// Everything up to (not including) `register_deed`: coin mint, a clean 1/1 Deed mint minted to the creator,
    /// a funded vault and a correct, locked sharing config.
    fn prepare_deed(&mut self) -> Deed {
        let creator = self.wallet(50);
        let coin_mint = self.mint(&creator.insecure_clone(), T22, 6, &creator.pubkey(), None, None);
        let deed_mint = self.mint(&creator.insecure_clone(), T22, 0, &creator.pubkey(), None, Some("pointer"));
        let creator_ata = self.create_ata(&creator.insecure_clone(), &creator.pubkey(), &deed_mint, T22);
        self.mint_to(&creator.insecure_clone(), T22, &deed_mint, &creator_ata, 1);
        self.revoke(&creator.insecure_clone(), T22, &deed_mint, 0);
        let vault = Pubkey::find_program_address(&[VAULT_SEED, coin_mint.as_ref()], &self.pid).0;
        let rent0 = self.rent(0);
        self.fund(&vault, rent0);
        let sharing_config = put_sharing_config(self, &coin_mint, &creator.pubkey(), true, SHARING_STATUS_ACTIVE, &[(vault, 10_000)]);
        let deed_state = Pubkey::find_program_address(&[DEED_SEED, coin_mint.as_ref()], &self.pid).0;
        Deed { creator, coin_mint, deed_mint, deed_state, vault, sharing_config, creator_ata }
    }

    fn registered_deed(&mut self) -> Deed {
        let d = self.prepare_deed();
        let ix = self.ix_register(&d, &d.creator.pubkey());
        self.ok(&[ix], &[&d.creator.insecure_clone()]);
        d
    }
}

// ====================================================================== tests: config

#[test]
fn only_the_upgrade_authority_can_initialize_and_only_once() {
    let mut env = Env::new();
    let attacker = env.wallet(5);
    let ix = env.ix_initialize(&attacker.pubkey(), &attacker.pubkey());
    env.fails(&[ix], &[&attacker], "NotUpgradeAuthority");

    // an empty (unfunded) treasury is refused: a 1% fee credit to it could fail the rent check and block settlement
    let empty = kp().pubkey();
    let ix = env.ix_initialize(&env.admin.pubkey(), &empty);
    let admin = env.admin.insecure_clone();
    env.fails(&[ix], &[&admin], "WrongTreasury");

    env.init();
    let cfg: Config = env.data(&env.config);
    assert_eq!(cfg.admin, env.admin.pubkey());
    assert_eq!(cfg.treasury, env.treasury.pubkey());

    let ix = env.ix_initialize(&env.admin.pubkey(), &env.treasury.pubkey());
    env.fails(&[ix], &[&admin], "InvalidInstructionData"); // the config account already exists
}

// ====================================================================== tests: register / claim

#[test]
fn register_deed_happy_path() {
    let mut env = Env::new();
    let d = env.registered_deed();
    let st: DeedState = env.data(&d.deed_state);
    assert_eq!(st.coin_mint, d.coin_mint);
    assert_eq!(st.deed_mint, d.deed_mint);
    assert_eq!(st.creator, d.creator.pubkey());
    assert_eq!(st.sharing_config, d.sharing_config);
    assert_eq!(st.auction_count, 0);
    // registering twice is impossible
    let ix = env.ix_register(&d, &d.creator.pubkey());
    env.fails(&[ix], &[&d.creator.insecure_clone()], "InvalidInstructionData"); // the registry entry already exists
}

#[test]
fn register_deed_refuses_anything_that_is_not_a_locked_100_percent_split() {
    // not the creator
    let mut env = Env::new();
    let d = env.prepare_deed();
    // a thief with their OWN clean 1/1 Deed mint tries to register the victim's coin
    let thief = env.wallet(5);
    let t_mint = env.mint(&thief, T22, 0, &thief.pubkey(), None, Some("pointer"));
    let t_ata = env.create_ata(&thief, &thief.pubkey(), &t_mint, T22);
    env.mint_to(&thief, T22, &t_mint, &t_ata, 1);
    env.revoke(&thief, T22, &t_mint, 0);
    let mut ix = env.ix_register(&d, &thief.pubkey());
    ix.accounts[4].pubkey = t_mint; // deed_mint
    ix.accounts[5].pubkey = t_ata; // creator_deed_account
    env.fails(&[ix], &[&thief], "NotCoinCreator");

    // admin authority not revoked: the split could still change
    let mut env = Env::new();
    let d = env.prepare_deed();
    put_sharing_config(&mut env, &d.coin_mint, &d.creator.pubkey(), false, SHARING_STATUS_ACTIVE, &[(d.vault, 10_000)]);
    let ix = env.ix_register(&d, &d.creator.pubkey());
    env.fails(&[ix], &[&d.creator.insecure_clone()], "FeeAuthorityNotRevoked");

    // split not 100% to the vault: another shareholder, a different address, or a partial share
    for holders in [
        vec![(d.vault, 9_000u16), (Pubkey::new_unique(), 1_000)],
        vec![(Pubkey::new_unique(), 10_000)],
        vec![(d.vault, 5_000)],
        vec![],
    ] {
        put_sharing_config(&mut env, &d.coin_mint, &d.creator.pubkey(), true, SHARING_STATUS_ACTIVE, &holders);
        let ix = env.ix_register(&d, &d.creator.pubkey());
        env.fails(&[ix], &[&d.creator.insecure_clone()], "FeesNotLockedToVault");
    }

    // paused config
    put_sharing_config(&mut env, &d.coin_mint, &d.creator.pubkey(), true, 0, &[(d.vault, 10_000)]);
    let ix = env.ix_register(&d, &d.creator.pubkey());
    env.fails(&[ix], &[&d.creator.insecure_clone()], "SharingConfigNotActive");

    // a config account not owned by Pump Fees is not a sharing config
    let key = d.sharing_config;
    let mut acc = env.svm.get_account(&key).unwrap();
    acc.owner = system_program::ID;
    env.svm.set_account(key, acc).unwrap();
    let ix = env.ix_register(&d, &d.creator.pubkey());
    env.fails(&[ix], &[&d.creator.insecure_clone()], "InvalidSharingConfig");
}

#[test]
fn register_deed_requires_a_funded_vault_and_a_true_one_of_one_mint() {
    let mut env = Env::new();

    // vault not pre-funded
    let d = env.prepare_deed();
    env.svm.set_account(d.vault, Account::default()).unwrap();
    let ix = env.ix_register(&d, &d.creator.pubkey());
    env.fails(&[ix], &[&d.creator.insecure_clone()], "VaultNotFunded");

    // supply 2
    let mut env = Env::new();
    let creator = env.wallet(50);
    let coin = env.mint(&creator, T22, 6, &creator.pubkey(), None, None);
    let deed_mint = env.mint(&creator, T22, 0, &creator.pubkey(), None, Some("pointer"));
    let ata = env.create_ata(&creator, &creator.pubkey(), &deed_mint, T22);
    env.mint_to(&creator, T22, &deed_mint, &ata, 2);
    env.revoke(&creator, T22, &deed_mint, 0);
    let d = env.deed_with(creator.insecure_clone(), coin, deed_mint, ata);
    let ix = env.ix_register(&d, &d.creator.pubkey());
    env.fails(&[ix], &[&d.creator.insecure_clone()], "InvalidDeedMint");

    // mint authority still present (more could be minted)
    let mut env = Env::new();
    let creator = env.wallet(50);
    let coin = env.mint(&creator, T22, 6, &creator.pubkey(), None, None);
    let deed_mint = env.mint(&creator, T22, 0, &creator.pubkey(), None, Some("pointer"));
    let ata = env.create_ata(&creator, &creator.pubkey(), &deed_mint, T22);
    env.mint_to(&creator, T22, &deed_mint, &ata, 1);
    let d = env.deed_with(creator.insecure_clone(), coin, deed_mint, ata);
    let ix = env.ix_register(&d, &d.creator.pubkey());
    env.fails(&[ix], &[&d.creator.insecure_clone()], "DeedMintAuthoritiesPresent");

    // freeze authority present (the holder could be frozen out)
    let mut env = Env::new();
    let creator = env.wallet(50);
    let coin = env.mint(&creator, T22, 6, &creator.pubkey(), None, None);
    let deed_mint = env.mint(&creator, T22, 0, &creator.pubkey(), Some(&creator.pubkey()), Some("pointer"));
    let ata = env.create_ata(&creator, &creator.pubkey(), &deed_mint, T22);
    env.mint_to(&creator, T22, &deed_mint, &ata, 1);
    env.revoke(&creator, T22, &deed_mint, 0);
    let d = env.deed_with(creator.insecure_clone(), coin, deed_mint, ata);
    let ix = env.ix_register(&d, &d.creator.pubkey());
    env.fails(&[ix], &[&d.creator.insecure_clone()], "DeedMintAuthoritiesPresent");

    // 9 decimals is not an NFT
    let mut env = Env::new();
    let creator = env.wallet(50);
    let coin = env.mint(&creator, T22, 6, &creator.pubkey(), None, None);
    let deed_mint = env.mint(&creator, T22, 9, &creator.pubkey(), None, Some("pointer"));
    let ata = env.create_ata(&creator, &creator.pubkey(), &deed_mint, T22);
    env.mint_to(&creator, T22, &deed_mint, &ata, 1);
    env.revoke(&creator, T22, &deed_mint, 0);
    let d = env.deed_with(creator.insecure_clone(), coin, deed_mint, ata);
    let ix = env.ix_register(&d, &d.creator.pubkey());
    env.fails(&[ix], &[&d.creator.insecure_clone()], "ConstraintMintDecimals");

    // a Token-2022 mint with a PermanentDelegate could be confiscated by someone else
    let mut env = Env::new();
    let creator = env.wallet(50);
    let coin = env.mint(&creator, T22, 6, &creator.pubkey(), None, None);
    let deed_mint = env.mint(&creator, T22, 0, &creator.pubkey(), None, Some("delegate"));
    let ata = env.create_ata(&creator, &creator.pubkey(), &deed_mint, T22);
    env.mint_to(&creator, T22, &deed_mint, &ata, 1);
    env.revoke(&creator, T22, &deed_mint, 0);
    let d = env.deed_with(creator.insecure_clone(), coin, deed_mint, ata);
    let ix = env.ix_register(&d, &d.creator.pubkey());
    env.fails(&[ix], &[&d.creator.insecure_clone()], "UnsupportedMintExtension");
}

impl Env {
    /// Builds the Deed fixture around an already-created (possibly flawed) Deed mint.
    fn deed_with(&mut self, creator: Keypair, coin_mint: Pubkey, deed_mint: Pubkey, creator_ata: Pubkey) -> Deed {
        let vault = Pubkey::find_program_address(&[VAULT_SEED, coin_mint.as_ref()], &self.pid).0;
        let rent0 = self.rent(0);
        self.fund(&vault, rent0);
        let sharing_config = put_sharing_config(self, &coin_mint, &creator.pubkey(), true, SHARING_STATUS_ACTIVE, &[(vault, 10_000)]);
        let deed_state = Pubkey::find_program_address(&[DEED_SEED, coin_mint.as_ref()], &self.pid).0;
        Deed { creator, coin_mint, deed_mint, deed_state, vault, sharing_config, creator_ata }
    }

    fn ix_claim(&self, d: &Deed, claimant: &Pubkey, token_account: &Pubkey) -> Instruction {
        Instruction::new_with_bytes(
            self.pid,
            &deed_fun::instruction::ClaimFees {}.data(),
            deed_fun::accounts::ClaimFees {
                claimant: *claimant,
                deed_state: d.deed_state,
                vault: d.vault,
                deed_token: *token_account,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        )
    }
}

#[test]
fn claim_fees_pays_the_current_deed_holder_and_follows_the_deed() {
    let mut env = Env::new();
    let d = env.registered_deed();
    let c = d.creator.insecure_clone();
    let floor = env.rent(0);

    // nothing yet
    let ix = env.ix_claim(&d, &c.pubkey(), &d.creator_ata);
    env.fails(&[ix], &[&c], "NothingToClaim");

    // Pump pays creator fees into the vault (simulated here by a direct credit; the fork test uses Pump itself)
    env.fund(&d.vault, 3 * SOL);
    let before = env.balance(&c.pubkey());
    let ix = env.ix_claim(&d, &c.pubkey(), &d.creator_ata);
    env.ok(&[ix], &[&c]);
    assert!(env.balance(&c.pubkey()) > before + 3 * SOL - 20_000, "claimant received the fees");
    assert_eq!(env.balance(&d.vault), floor, "vault keeps only its rent-exempt floor");
    let st: DeedState = env.data(&d.deed_state);
    assert_eq!(st.claimed_total, 3 * SOL);

    // someone who does not hold the Deed cannot claim, even with the creator's token account
    env.fund(&d.vault, SOL);
    let thief = env.wallet(5);
    let ix = env.ix_claim(&d, &thief.pubkey(), &d.creator_ata);
    env.fails(&[ix], &[&thief], "NotDeedHolder");

    // the Deed moves => the right to the fees moves with it
    let buyer = env.wallet(5);
    let buyer_ata = env.create_ata(&buyer, &buyer.pubkey(), &d.deed_mint, T22);
    env.token_transfer(&c, T22, &d.creator_ata, &d.deed_mint, &buyer_ata, 1, 0);
    let ix = env.ix_claim(&d, &c.pubkey(), &d.creator_ata);
    env.fails(&[ix], &[&c], "NotDeedHolder"); // the old holder is out
    let before = env.balance(&buyer.pubkey());
    let ix = env.ix_claim(&d, &buyer.pubkey(), &buyer_ata);
    env.ok(&[ix], &[&buyer]);
    assert!(env.balance(&buyer.pubkey()) > before + SOL - 20_000);
}

// ====================================================================== tests: auctions

struct Sale {
    d: Deed,
    auction: Pubkey,
    escrow: Pubkey,
    seller: Keypair,
}

impl Env {
    fn ix_create_auction(&self, d: &Deed, seller: &Pubkey, seller_ata: &Pubkey, nonce: u64, start: u64, secs: i64) -> (Instruction, Pubkey, Pubkey) {
        let auction = Pubkey::find_program_address(&[AUCTION_SEED, d.deed_mint.as_ref(), &nonce.to_le_bytes()], &self.pid).0;
        let escrow = ata_of(&auction, &d.deed_mint, &T22);
        let ix = Instruction::new_with_bytes(
            self.pid,
            &deed_fun::instruction::CreateAuction { start_price: start, duration_secs: secs }.data(),
            deed_fun::accounts::CreateAuction {
                seller: *seller,
                deed_state: d.deed_state,
                deed_mint: d.deed_mint,
                seller_deed_account: *seller_ata,
                auction,
                escrow,
                token_program: T22,
                associated_token_program: ATA_PROGRAM,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        );
        (ix, auction, escrow)
    }

    fn new_sale(&mut self, start: u64, secs: i64) -> Sale {
        self.init();
        let d = self.registered_deed();
        let seller = d.creator.insecure_clone();
        let (ix, auction, escrow) = self.ix_create_auction(&d, &seller.pubkey(), &d.creator_ata, 0, start, secs);
        self.ok(&[ix], &[&seller]);
        Sale { d, auction, escrow, seller }
    }

    fn ix_bid(&self, s: &Sale, bidder: &Pubkey, previous: &Pubkey, amount: u64) -> Instruction {
        Instruction::new_with_bytes(
            self.pid,
            &deed_fun::instruction::PlaceBid { amount }.data(),
            deed_fun::accounts::PlaceBid { bidder: *bidder, auction: s.auction, previous_bidder: *previous, system_program: system_program::ID }
                .to_account_metas(None),
        )
    }

    fn ix_settle(&self, s: &Sale, caller: &Pubkey, seller: &Pubkey, winner: &Pubkey) -> Instruction {
        Instruction::new_with_bytes(
            self.pid,
            &deed_fun::instruction::SettleAuction {}.data(),
            deed_fun::accounts::SettleAuction {
                caller: *caller,
                config: self.config,
                treasury: self.treasury.pubkey(),
                auction: s.auction,
                seller: *seller,
                winner: *winner,
                deed_mint: s.d.deed_mint,
                escrow: s.escrow,
                winner_deed_account: ata_of(winner, &s.d.deed_mint, &T22),
                token_program: T22,
                associated_token_program: ATA_PROGRAM,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        )
    }

    fn ix_cancel(&self, s: &Sale) -> Instruction {
        Instruction::new_with_bytes(
            self.pid,
            &deed_fun::instruction::CancelAuction {}.data(),
            deed_fun::accounts::CancelAuction {
                seller: s.seller.pubkey(),
                auction: s.auction,
                deed_mint: s.d.deed_mint,
                escrow: s.escrow,
                seller_deed_account: ata_of(&s.seller.pubkey(), &s.d.deed_mint, &T22),
                token_program: T22,
                associated_token_program: ATA_PROGRAM,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        )
    }
}

#[test]
fn creating_an_auction_escrows_the_deed_and_enforces_limits() {
    let mut env = Env::new();
    env.init();
    let d = env.registered_deed();
    let seller = d.creator.insecure_clone();

    let (ix, _, _) = env.ix_create_auction(&d, &seller.pubkey(), &d.creator_ata, 0, SOL / 100 - 1, 3600);
    env.fails(&[ix], &[&seller], "StartPriceTooLow");
    let (ix, _, _) = env.ix_create_auction(&d, &seller.pubkey(), &d.creator_ata, 0, SOL, 599);
    env.fails(&[ix], &[&seller], "InvalidDuration");
    let (ix, _, _) = env.ix_create_auction(&d, &seller.pubkey(), &d.creator_ata, 0, SOL, 604_801);
    env.fails(&[ix], &[&seller], "InvalidDuration");

    // somebody who does not hold the Deed cannot list it
    let thief = env.wallet(5);
    let thief_ata = env.create_ata(&thief, &thief.pubkey(), &d.deed_mint, T22);
    let (ix, _, _) = env.ix_create_auction(&d, &thief.pubkey(), &thief_ata, 0, SOL, 3600);
    env.fails(&[ix], &[&thief], "NotDeedHolder");

    let now = env.now();
    let (ix, auction, escrow) = env.ix_create_auction(&d, &seller.pubkey(), &d.creator_ata, 0, SOL, 3600);
    env.ok(&[ix], &[&seller]);
    assert_eq!(env.token_balance(&d.creator_ata), 0, "the Deed left the seller");
    assert_eq!(env.token_balance(&escrow), 1, "the Deed is in the auction's escrow");
    let a: Auction = env.data(&auction);
    assert_eq!(a.seller, seller.pubkey());
    assert_eq!(a.end_time, now + 3600);
    assert_eq!(a.status, AuctionStatus::Live);
    assert_eq!(a.bid_count, 0);
    let st: DeedState = env.data(&d.deed_state);
    assert_eq!(st.auction_count, 1);
    // fees cannot be claimed while the Deed is in escrow: nobody holds it
    env.fund(&d.vault, SOL);
    let ix = env.ix_claim(&d, &seller.pubkey(), &d.creator_ata);
    env.fails(&[ix], &[&seller], "NotDeedHolder");
}

#[test]
fn bids_enforce_the_rules_and_refund_the_previous_bidder_atomically() {
    let mut env = Env::new();
    let s = env.new_sale(SOL, 3600);
    let alice = env.wallet(100);
    let bob = env.wallet(100);
    let seller = s.seller.pubkey();
    let rent_a = env.rent(8 + Auction::INIT_SPACE);

    // first bid >= start price
    let ix = env.ix_bid(&s, &alice.pubkey(), &alice.pubkey(), SOL - 1);
    env.fails(&[ix], &[&alice], "BidTooLow");
    // the seller cannot bid on their own auction
    let ix = env.ix_bid(&s, &seller, &seller, 2 * SOL);
    env.fails(&[ix], &[&s.seller.insecure_clone()], "SellerCannotBid");

    let a0 = env.balance(&alice.pubkey());
    let ix = env.ix_bid(&s, &alice.pubkey(), &alice.pubkey(), SOL);
    env.ok(&[ix], &[&alice]);
    assert_eq!(env.balance(&s.auction), rent_a + SOL, "the bid sits in the auction PDA");
    assert!(a0 - env.balance(&alice.pubkey()) >= SOL);

    // the highest bidder cannot bid against themselves
    let ix = env.ix_bid(&s, &alice.pubkey(), &alice.pubkey(), 2 * SOL);
    env.fails(&[ix], &[&alice], "AlreadyHighestBidder");

    // next bid must be >= 1 + MAX(5%, 0.1 SOL) = 1.1 SOL
    let ix = env.ix_bid(&s, &bob.pubkey(), &alice.pubkey(), SOL + 100_000_000 - 1);
    env.fails(&[ix], &[&bob], "BidTooLow");
    // wrong "previous bidder" account is rejected: it would otherwise let a bidder redirect the refund
    let ix = env.ix_bid(&s, &bob.pubkey(), &bob.pubkey(), SOL + 100_000_000);
    env.fails(&[ix], &[&bob], "PreviousBidderMismatch");

    let alice_before = env.balance(&alice.pubkey());
    let ix = env.ix_bid(&s, &bob.pubkey(), &alice.pubkey(), SOL + 100_000_000);
    env.ok(&[ix], &[&bob]);
    assert_eq!(env.balance(&alice.pubkey()), alice_before + SOL, "outbid bidder refunded in the same transaction");
    assert_eq!(env.balance(&s.auction), rent_a + SOL + 100_000_000, "only the highest bid stays escrowed");
    let a: Auction = env.data(&s.auction);
    assert_eq!(a.highest_bidder, bob.pubkey());
    assert_eq!(a.highest_bid, SOL + 100_000_000);
    assert_eq!(a.bid_count, 2);

    // at 10 SOL the 5% rule (0.5 SOL) beats the 0.1 SOL floor
    let ix = env.ix_bid(&s, &alice.pubkey(), &bob.pubkey(), 10 * SOL);
    env.ok(&[ix], &[&alice]);
    let ix = env.ix_bid(&s, &bob.pubkey(), &alice.pubkey(), 10 * SOL + 499_999_999);
    env.fails(&[ix], &[&bob], "BidTooLow");
    let ix = env.ix_bid(&s, &bob.pubkey(), &alice.pubkey(), 10 * SOL + 500_000_000);
    env.ok(&[ix], &[&bob]);

    // after the end time no bid is accepted
    env.advance(3601);
    let ix = env.ix_bid(&s, &alice.pubkey(), &bob.pubkey(), 20 * SOL);
    env.fails(&[ix], &[&alice], "AuctionEnded");
}

#[test]
fn anti_sniping_extends_by_five_minutes_only_inside_the_last_five_minutes() {
    let mut env = Env::new();
    let s = env.new_sale(SOL, 3600);
    let start = env.now();
    let end = start + 3600;
    let alice = env.wallet(100);
    let bob = env.wallet(100);

    // hours left: no extension
    let ix = env.ix_bid(&s, &alice.pubkey(), &alice.pubkey(), SOL);
    env.ok(&[ix], &[&alice]);
    assert_eq!(env.data::<Auction>(&s.auction).end_time, end);

    // 301 s left: no extension
    env.warp(end - 301);
    let ix = env.ix_bid(&s, &bob.pubkey(), &alice.pubkey(), 2 * SOL);
    env.ok(&[ix], &[&bob]);
    assert_eq!(env.data::<Auction>(&s.auction).end_time, end);

    // exactly 300 s left: pushed out by 300 s
    env.warp(end - 300);
    let ix = env.ix_bid(&s, &alice.pubkey(), &bob.pubkey(), 3 * SOL);
    let meta = env.ok(&[ix], &[&alice]);
    assert_eq!(env.data::<Auction>(&s.auction).end_time, end + 300);
    assert!(meta.logs.iter().any(|l| l.starts_with("Program data:")), "BidPlaced event emitted");

    // sniping again keeps extending
    env.warp(end + 300 - 10);
    let ix = env.ix_bid(&s, &bob.pubkey(), &alice.pubkey(), 4 * SOL);
    env.ok(&[ix], &[&bob]);
    assert_eq!(env.data::<Auction>(&s.auction).end_time, end + 600);
}

#[test]
fn settlement_pays_seller_minus_one_percent_and_delivers_the_deed() {
    let mut env = Env::new();
    let s = env.new_sale(SOL, 3600);
    let alice = env.wallet(100);
    let seller = s.seller.pubkey();
    let treasury = env.treasury.pubkey();
    let price = 5 * SOL;
    let ix = env.ix_bid(&s, &alice.pubkey(), &alice.pubkey(), price);
    env.ok(&[ix], &[&alice]);

    // not before the on-chain end time
    let anyone = env.wallet(5);
    let ix = env.ix_settle(&s, &anyone.pubkey(), &seller, &alice.pubkey());
    env.fails(&[ix], &[&anyone], "AuctionNotEnded");
    // a live auction with bids cannot be cancelled
    let ix = env.ix_cancel(&s);
    env.fails(&[ix], &[&s.seller.insecure_clone()], "AuctionHasBids");

    env.advance(3601);
    // a settler cannot redirect the payout
    let evil = env.wallet(1).pubkey();
    let ix = env.ix_settle(&s, &anyone.pubkey(), &evil, &alice.pubkey());
    env.fails(&[ix], &[&anyone], "NotSeller");

    let (seller_before, treasury_before) = (env.balance(&seller), env.balance(&treasury));
    let escrow_rent = env.rent(165 + 8); // token-2022 account with the ImmutableOwner extension
    let _ = escrow_rent;
    let ix = env.ix_settle(&s, &anyone.pubkey(), &seller, &alice.pubkey());
    env.ok(&[ix], &[&anyone]); // permissionless: a third party finishes it

    let fee = price / 100;
    assert_eq!(env.balance(&treasury), treasury_before + fee, "1% to the treasury");
    // the seller gets price - fee, plus the escrow token account's rent back
    assert!(env.balance(&seller) >= seller_before + price - fee);
    assert!(env.balance(&seller) < seller_before + price - fee + SOL / 100);
    let alice_ata = ata_of(&alice.pubkey(), &s.d.deed_mint, &T22);
    assert_eq!(env.token_balance(&alice_ata), 1, "the winner holds the Deed");
    assert!(!env.exists(&s.escrow), "escrow closed");
    let a: Auction = env.data(&s.auction);
    assert_eq!(a.status, AuctionStatus::Settled);
    assert_eq!(a.final_price, price);
    assert_eq!(a.final_fee, fee);
    assert_eq!(env.balance(&s.auction), env.rent(8 + Auction::INIT_SPACE), "no SOL left in the auction");

    // settling twice is impossible
    let ix = env.ix_settle(&s, &anyone.pubkey(), &seller, &alice.pubkey());
    env.fails(&[ix], &[&anyone], "AccountNotInitialized"); // the escrow is closed: there is nothing left to settle

    // the new owner can now claim the fees; the old owner cannot
    env.fund(&s.d.vault, 2 * SOL);
    let ix = env.ix_claim(&s.d, &seller, &s.d.creator_ata);
    env.fails(&[ix], &[&s.seller.insecure_clone()], "");
    let before = env.balance(&alice.pubkey());
    let ix = env.ix_claim(&s.d, &alice.pubkey(), &alice_ata);
    env.ok(&[ix], &[&alice]);
    assert!(env.balance(&alice.pubkey()) > before + 2 * SOL - 20_000);

    // the seller reclaims the auction account's rent
    let ix = Instruction::new_with_bytes(
        env.pid,
        &deed_fun::instruction::CloseAuction {}.data(),
        deed_fun::accounts::CloseAuction { seller, auction: s.auction }.to_account_metas(None),
    );
    env.ok(&[ix], &[&s.seller.insecure_clone()]);
    assert!(!env.exists(&s.auction));
}

#[test]
fn an_auction_without_bids_can_be_cancelled_and_costs_nothing() {
    let mut env = Env::new();
    let s = env.new_sale(SOL, 3600);
    let treasury_before = env.balance(&env.treasury.pubkey());

    // only the seller can cancel
    let thief = env.wallet(5);
    let mut ix = env.ix_cancel(&s);
    ix.accounts[0].pubkey = thief.pubkey();
    env.fails(&[ix], &[&thief], "");

    // nothing to settle when there are no bids
    env.advance(4000);
    let ix = env.ix_settle(&s, &thief.pubkey(), &s.seller.pubkey(), &Pubkey::default());
    env.fails(&[ix], &[&thief], "");

    let ix = env.ix_cancel(&s);
    env.ok(&[ix], &[&s.seller.insecure_clone()]);
    assert_eq!(env.token_balance(&s.d.creator_ata), 1, "the Deed came back");
    assert!(!env.exists(&s.escrow));
    assert_eq!(env.data::<Auction>(&s.auction).status, AuctionStatus::Cancelled);
    assert_eq!(env.balance(&env.treasury.pubkey()), treasury_before, "no fee on an auction that did not complete");

    // a cancelled auction cannot take bids and the Deed can be listed again (next nonce)
    let alice = env.wallet(10);
    let ix = env.ix_bid(&s, &alice.pubkey(), &alice.pubkey(), SOL);
    env.fails(&[ix], &[&alice], "AuctionNotLive");
    let (ix, auction2, _) = env.ix_create_auction(&s.d, &s.seller.pubkey(), &s.d.creator_ata, 1, 2 * SOL, 7200);
    env.ok(&[ix], &[&s.seller.insecure_clone()]);
    assert_eq!(env.data::<Auction>(&auction2).nonce, 1);
}

// ====================================================================== tests: OTC

struct Otc {
    maker: Keypair,
    taker: Keypair,
    mint: Pubkey,
    maker_ata: Pubkey,
    taker_ata: Pubkey,
}

impl Env {
    /// A 6-decimals token: 1,000 tokens to the maker and to the taker.
    fn otc(&mut self, token_program: Pubkey) -> Otc {
        self.init();
        let maker = self.wallet(100);
        let taker = self.wallet(100);
        let authority = self.wallet(5);
        let ext = if token_program == T22 { Some("pointer") } else { None };
        let mint = self.mint(&authority, token_program, 6, &authority.pubkey(), None, ext);
        let maker_ata = self.create_ata(&maker, &maker.pubkey(), &mint, token_program);
        let taker_ata = self.create_ata(&taker, &taker.pubkey(), &mint, token_program);
        self.mint_to(&authority, token_program, &mint, &maker_ata, 1_000_000_000);
        self.mint_to(&authority, token_program, &mint, &taker_ata, 1_000_000_000);
        Otc { maker, taker, mint, maker_ata, taker_ata }
    }

    fn offer_pda(&self, maker: &Pubkey, nonce: u64) -> Pubkey {
        Pubkey::find_program_address(&[OFFER_SEED, maker.as_ref(), &nonce.to_le_bytes()], &self.pid).0
    }

    fn ix_create_sell(&self, o: &Otc, tp: Pubkey, args: deed_fun::CreateOfferArgs) -> (Instruction, Pubkey, Pubkey) {
        let offer = self.offer_pda(&o.maker.pubkey(), args.nonce);
        let escrow = ata_of(&offer, &o.mint, &tp);
        let ix = Instruction::new_with_bytes(
            self.pid,
            &deed_fun::instruction::CreateSellOffer { args }.data(),
            deed_fun::accounts::CreateSellOffer {
                maker: o.maker.pubkey(),
                mint: o.mint,
                maker_token_account: o.maker_ata,
                offer,
                escrow,
                token_program: tp,
                associated_token_program: ATA_PROGRAM,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        );
        (ix, offer, escrow)
    }

    fn ix_create_buy(&self, o: &Otc, tp: Pubkey, args: deed_fun::CreateOfferArgs) -> (Instruction, Pubkey) {
        let offer = self.offer_pda(&o.maker.pubkey(), args.nonce);
        let ix = Instruction::new_with_bytes(
            self.pid,
            &deed_fun::instruction::CreateBuyOffer { args }.data(),
            deed_fun::accounts::CreateBuyOffer { maker: o.maker.pubkey(), mint: o.mint, offer, token_program: tp, system_program: system_program::ID }
                .to_account_metas(None),
        );
        (ix, offer)
    }

    fn ix_fill_sell(&self, o: &Otc, tp: Pubkey, taker: &Pubkey, offer: &Pubkey, escrow: &Pubkey, amount: u64) -> Instruction {
        Instruction::new_with_bytes(
            self.pid,
            &deed_fun::instruction::FillSellOffer { amount }.data(),
            deed_fun::accounts::FillSellOffer {
                taker: *taker,
                config: self.config,
                treasury: self.treasury.pubkey(),
                maker: o.maker.pubkey(),
                offer: *offer,
                mint: o.mint,
                escrow: *escrow,
                taker_token_account: ata_of(taker, &o.mint, &tp),
                token_program: tp,
                associated_token_program: ATA_PROGRAM,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        )
    }

    fn ix_fill_buy(&self, o: &Otc, tp: Pubkey, taker: &Pubkey, taker_ata: &Pubkey, offer: &Pubkey, amount: u64) -> Instruction {
        Instruction::new_with_bytes(
            self.pid,
            &deed_fun::instruction::FillBuyOffer { amount }.data(),
            deed_fun::accounts::FillBuyOffer {
                taker: *taker,
                config: self.config,
                treasury: self.treasury.pubkey(),
                maker: o.maker.pubkey(),
                offer: *offer,
                mint: o.mint,
                taker_token_account: *taker_ata,
                maker_token_account: ata_of(&o.maker.pubkey(), &o.mint, &tp),
                token_program: tp,
                associated_token_program: ATA_PROGRAM,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        )
    }

    fn ix_close_sell(&self, o: &Otc, tp: Pubkey, closer: &Pubkey, offer: &Pubkey, escrow: &Pubkey) -> Instruction {
        Instruction::new_with_bytes(
            self.pid,
            &deed_fun::instruction::CloseSellOffer {}.data(),
            deed_fun::accounts::CloseSellOffer {
                closer: *closer,
                maker: o.maker.pubkey(),
                offer: *offer,
                mint: o.mint,
                escrow: *escrow,
                maker_token_account: ata_of(&o.maker.pubkey(), &o.mint, &tp),
                token_program: tp,
                associated_token_program: ATA_PROGRAM,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        )
    }

    fn ix_close_buy(&self, o: &Otc, closer: &Pubkey, offer: &Pubkey) -> Instruction {
        Instruction::new_with_bytes(
            self.pid,
            &deed_fun::instruction::CloseBuyOffer {}.data(),
            deed_fun::accounts::CloseBuyOffer { closer: *closer, maker: o.maker.pubkey(), offer: *offer }.to_account_metas(None),
        )
    }
}

fn args(nonce: u64, amount: u64, price: u64, min_fill: u64, counterparty: Pubkey) -> deed_fun::CreateOfferArgs {
    deed_fun::CreateOfferArgs { nonce, amount, price_total: price, min_fill, expires_in_secs: 3600, counterparty, parent: Pubkey::default() }
}

#[test]
fn sell_offer_partial_fills_round_in_favour_of_the_seller_and_charge_the_seller_half_a_percent() {
    for tp in [SPL, T22] {
        let mut env = Env::new();
        let o = env.otc(tp);
        let treasury = env.treasury.pubkey();
        // 3 tokens (base units) for 10 lamports... too small; use 3_000_000 base units for 1_000_000_001 lamports
        let (amount, price) = (3_000_000u64, 1_000_000_001u64);
        let (ix, offer, escrow) = env.ix_create_sell(&o, tp, args(7, amount, price, 1_000_000, Pubkey::default()));
        env.ok(&[ix], &[&o.maker]);
        assert_eq!(env.token_balance(&escrow), amount);
        assert_eq!(env.token_balance(&o.maker_ata), 1_000_000_000 - amount);

        // below the minimum fill
        let ix = env.ix_fill_sell(&o, tp, &o.taker.pubkey(), &offer, &escrow, 999_999);
        env.fails(&[ix], &[&o.taker], "FillBelowMinimum");
        // the maker cannot fill their own offer
        let ix = env.ix_fill_sell(&o, tp, &o.maker.pubkey(), &offer, &escrow, 1_000_000);
        env.fails(&[ix], &[&o.maker], "OwnOffer");
        // more than what remains
        let ix = env.ix_fill_sell(&o, tp, &o.taker.pubkey(), &offer, &escrow, amount + 1);
        env.fails(&[ix], &[&o.taker], "FillTooLarge");

        // fill 1/3: owes ceil(1e6 * 1_000_000_001 / 3e6) = 333_333_334 lamports
        let (maker_b, treasury_b, taker_b) = (env.balance(&o.maker.pubkey()), env.balance(&treasury), env.balance(&o.taker.pubkey()));
        let ix = env.ix_fill_sell(&o, tp, &o.taker.pubkey(), &offer, &escrow, 1_000_000);
        env.ok(&[ix], &[&o.taker]);
        let owed = 333_333_334u64;
        let fee = owed * 50 / 10_000;
        assert_eq!(env.balance(&treasury), treasury_b + fee);
        assert_eq!(env.balance(&o.maker.pubkey()), maker_b + owed - fee, "maker receives the price minus the fee");
        assert!(taker_b - env.balance(&o.taker.pubkey()) >= owed, "taker paid at least the rounded-up price");
        assert_eq!(env.token_balance(&o.taker_ata), 1_000_000_000 + 1_000_000);
        let of: Offer = env.data(&offer);
        assert_eq!(of.remaining, 2_000_000);
        assert_eq!(of.price_remaining, price - owed);
        assert_eq!(of.status, OfferStatus::Active);

        // the last fill takes exactly the remainder, so the total paid equals the total price
        let maker_b = env.balance(&o.maker.pubkey());
        let ix = env.ix_fill_sell(&o, tp, &o.taker.pubkey(), &offer, &escrow, 2_000_000);
        env.ok(&[ix], &[&o.taker]);
        let owed2 = price - owed;
        let fee2 = owed2 * 50 / 10_000;
        // maker gets owed2 - fee2 plus the rent of the closed escrow and offer accounts
        assert!(env.balance(&o.maker.pubkey()) >= maker_b + owed2 - fee2);
        assert_eq!(env.token_balance(&o.taker_ata), 1_000_000_000 + 3_000_000);
        assert!(!env.exists(&offer), "a fully filled offer closes itself");
        assert!(!env.exists(&escrow));
        // nothing is left locked
        assert_eq!(env.balance(&offer), 0);
    }
}

#[test]
fn private_offers_can_only_be_filled_or_rejected_by_the_named_wallet() {
    let mut env = Env::new();
    let o = env.otc(SPL);
    let stranger = env.wallet(50);
    let stranger_ata = env.create_ata(&stranger, &stranger.pubkey(), &o.mint, SPL);
    let _ = stranger_ata;
    let (ix, offer, escrow) = env.ix_create_sell(&o, SPL, args(1, 1_000_000, SOL, 1_000_000, o.taker.pubkey()));
    env.ok(&[ix], &[&o.maker]);

    let ix = env.ix_fill_sell(&o, SPL, &stranger.pubkey(), &offer, &escrow, 1_000_000);
    env.fails(&[ix], &[&stranger], "NotCounterparty");
    let ix = env.ix_close_sell(&o, SPL, &stranger.pubkey(), &offer, &escrow);
    env.fails(&[ix], &[&stranger], "NotAuthorizedToClose");

    // the named counterparty can reject: tokens return to the maker
    let ix = env.ix_close_sell(&o, SPL, &o.taker.pubkey(), &offer, &escrow);
    env.ok(&[ix], &[&o.taker]);
    assert_eq!(env.token_balance(&o.maker_ata), 1_000_000_000, "escrowed tokens returned");
    assert!(!env.exists(&offer) && !env.exists(&escrow));

    // and fills it when asked
    let (ix, offer, escrow) = env.ix_create_sell(&o, SPL, args(2, 1_000_000, SOL, 1_000_000, o.taker.pubkey()));
    env.ok(&[ix], &[&o.maker]);
    let ix = env.ix_fill_sell(&o, SPL, &o.taker.pubkey(), &offer, &escrow, 1_000_000);
    env.ok(&[ix], &[&o.taker]);
    assert_eq!(env.token_balance(&o.taker_ata), 1_000_000_000 + 1_000_000);
}

#[test]
fn makers_can_cancel_and_expired_offers_cannot_be_filled() {
    let mut env = Env::new();
    let o = env.otc(SPL);
    let (ix, offer, escrow) = env.ix_create_sell(&o, SPL, args(1, 5_000_000, SOL, 5_000_000, Pubkey::default()));
    env.ok(&[ix], &[&o.maker]);
    // all-or-nothing: a partial amount is below min_fill
    let ix = env.ix_fill_sell(&o, SPL, &o.taker.pubkey(), &offer, &escrow, 1_000_000);
    env.fails(&[ix], &[&o.taker], "FillBelowMinimum");
    env.advance(3601);
    let ix = env.ix_fill_sell(&o, SPL, &o.taker.pubkey(), &offer, &escrow, 5_000_000);
    env.fails(&[ix], &[&o.taker], "OfferExpired");
    // the maker can always take their tokens back, expired or not, and nobody else can
    let ix = env.ix_close_sell(&o, SPL, &o.taker.pubkey(), &offer, &escrow);
    env.fails(&[ix], &[&o.taker], "NotAuthorizedToClose");
    let ix = env.ix_close_sell(&o, SPL, &o.maker.pubkey(), &offer, &escrow);
    env.ok(&[ix], &[&o.maker]);
    assert_eq!(env.token_balance(&o.maker_ata), 1_000_000_000);
    assert!(!env.exists(&offer));
}

#[test]
fn buy_offers_escrow_sol_and_pay_the_token_seller_minus_the_fee() {
    for tp in [SPL, T22] {
        let mut env = Env::new();
        let o = env.otc(tp);
        let treasury = env.treasury.pubkey();
        let maker_b = env.balance(&o.maker.pubkey());
        let (amount, price) = (3_000_000u64, 2 * SOL + 1);
        let (ix, offer) = env.ix_create_buy(&o, tp, args(9, amount, price, 1_000_000, Pubkey::default()));
        env.ok(&[ix], &[&o.maker]);
        assert!(maker_b - env.balance(&o.maker.pubkey()) >= price, "SOL escrowed");
        assert_eq!(env.balance(&offer), env.rent(8 + Offer::INIT_SPACE) + price);

        // maker cannot sell into their own bid
        let maker_ata = o.maker_ata;
        let ix = env.ix_fill_buy(&o, tp, &o.maker.pubkey(), &maker_ata, &offer, 1_000_000);
        env.fails(&[ix], &[&o.maker], "ConstraintDuplicateMutableAccount"); // maker == taker: refused before the handler runs

        // taker sells 1/3: receives floor(1e6 * (2e9+1) / 3e6) = 666_666_667 (floor of 666_666_667.0...) lamports, minus 0.5%
        let remaining_price = price;
        let owed = (1_000_000u128 * remaining_price as u128 / 3_000_000u128) as u64;
        let fee = owed * 50 / 10_000;
        let (taker_b, treasury_b) = (env.balance(&o.taker.pubkey()), env.balance(&treasury));
        let ix = env.ix_fill_buy(&o, tp, &o.taker.pubkey(), &o.taker_ata, &offer, 1_000_000);
        env.ok(&[ix], &[&o.taker]);
        let gained = env.balance(&o.taker.pubkey()) as i64 - taker_b as i64;
        // gained = owed - fee - tx fee - rent of the maker's ATA if it had to be created (it exists here)
        assert!(gained > (owed - fee) as i64 - 20_000 && gained <= (owed - fee) as i64);
        assert_eq!(env.balance(&treasury), treasury_b + fee);
        assert_eq!(env.token_balance(&o.maker_ata), 1_000_000_000 + 1_000_000, "tokens delivered straight to the maker");
        let of: Offer = env.data(&offer);
        assert_eq!(of.remaining, 2_000_000);
        assert_eq!(of.price_remaining, price - owed);

        // final fill: exact remainder; the offer closes and the maker gets the rent back
        let maker_b = env.balance(&o.maker.pubkey());
        let ix = env.ix_fill_buy(&o, tp, &o.taker.pubkey(), &o.taker_ata, &offer, 2_000_000);
        env.ok(&[ix], &[&o.taker]);
        assert!(!env.exists(&offer));
        assert_eq!(env.balance(&offer), 0, "no lamports stranded");
        assert!(env.balance(&o.maker.pubkey()) > maker_b, "maker got the offer's rent back");
        assert_eq!(env.token_balance(&o.maker_ata), 1_000_000_000 + 3_000_000);
    }
}

#[test]
fn cancelling_a_buy_offer_returns_all_escrowed_sol() {
    let mut env = Env::new();
    let o = env.otc(SPL);
    let (ix, offer) = env.ix_create_buy(&o, SPL, args(3, 1_000_000, 4 * SOL, 1_000_000, Pubkey::default()));
    let before = env.balance(&o.maker.pubkey());
    env.ok(&[ix], &[&o.maker]);
    let ix = env.ix_close_buy(&o, &o.taker.pubkey(), &offer);
    env.fails(&[ix], &[&o.taker], "NotAuthorizedToClose");
    let ix = env.ix_close_buy(&o, &o.maker.pubkey(), &offer);
    env.ok(&[ix], &[&o.maker]);
    // only transaction fees were spent
    assert!(before - env.balance(&o.maker.pubkey()) < 30_000);
    assert!(!env.exists(&offer));
}

#[test]
fn offers_validate_their_inputs_and_refuse_unsafe_mints() {
    let mut env = Env::new();
    let o = env.otc(SPL);
    let bad = |a: deed_fun::CreateOfferArgs| a;
    for (a, needle) in [
        (bad(args(1, 0, SOL, 1, Pubkey::default())), "ZeroAmount"),
        (bad(args(1, 1_000, 99_999, 1, Pubkey::default())), "PriceTooLow"),
        (bad(args(1, 1_000, SOL, 0, Pubkey::default())), "InvalidMinFill"),
        (bad(args(1, 1_000, SOL, 1_001, Pubkey::default())), "InvalidMinFill"),
        (bad(args(1, 1_000, SOL, 1, o.maker.pubkey())), "OwnOffer"),
        (deed_fun::CreateOfferArgs { expires_in_secs: 59, ..args(1, 1_000, SOL, 1, Pubkey::default()) }, "InvalidExpiry"),
    ] {
        let (ix, _, _) = env.ix_create_sell(&o, SPL, a);
        env.fails(&[ix], &[&o.maker], needle);
    }

    // a mint with a freeze authority could freeze the escrow account: refused
    let authority = env.wallet(5);
    let frozen = env.mint(&authority, SPL, 6, &authority.pubkey(), Some(&authority.pubkey()), None);
    let maker_ata = env.create_ata(&o.maker, &o.maker.pubkey(), &frozen, SPL);
    env.mint_to(&authority, SPL, &frozen, &maker_ata, 1_000_000);
    let o2 = Otc { maker: o.maker.insecure_clone(), taker: o.taker.insecure_clone(), mint: frozen, maker_ata, taker_ata: o.taker_ata };
    let (ix, _, _) = env.ix_create_sell(&o2, SPL, args(2, 1_000, SOL, 1, Pubkey::default()));
    env.fails(&[ix], &[&o.maker], "FreezeAuthorityPresent");

    // a Token-2022 mint with a PermanentDelegate could drain the escrow: refused
    let bad_mint = env.mint(&authority, T22, 6, &authority.pubkey(), None, Some("delegate"));
    let maker_ata = env.create_ata(&o.maker, &o.maker.pubkey(), &bad_mint, T22);
    env.mint_to(&authority, T22, &bad_mint, &maker_ata, 1_000_000);
    let o3 = Otc { maker: o.maker.insecure_clone(), taker: o.taker.insecure_clone(), mint: bad_mint, maker_ata, taker_ata: o.taker_ata };
    let (ix, _, _) = env.ix_create_sell(&o3, T22, args(3, 1_000, SOL, 1, Pubkey::default()));
    env.fails(&[ix], &[&o.maker], "UnsupportedMintExtension");
}
