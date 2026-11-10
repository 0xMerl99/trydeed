/**
 * TEST-ONLY wallet adapter: signs with a keypair taken from NEXT_PUBLIC_E2E_BURNER_SECRET so automated browser tests can
 * drive the REAL app against a local validator. It signs real transactions with a real key; it is not a simulation.
 * `config.e2eBurnerSecret` is undefined on mainnet-beta, so this adapter can never be offered on mainnet.
 */
import { BaseSignerWalletAdapter, WalletReadyState, type WalletName } from "@solana/wallet-adapter-base";
import { utils } from "@coral-xyz/anchor";
import { Keypair, type PublicKey, type Transaction, type TransactionVersion, type VersionedTransaction } from "@solana/web3.js";

const ICON =
  "data:image/svg+xml;base64," +
  (typeof btoa === "function"
    ? btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#131e18"/><text x="16" y="21" font-size="14" text-anchor="middle" fill="#d4a017" font-family="monospace">E2E</text></svg>')
    : "");

export class E2EBurnerWalletAdapter extends BaseSignerWalletAdapter {
  name = "E2E Burner" as WalletName<"E2E Burner">;
  url = "https://deed.fun";
  icon = ICON;
  supportedTransactionVersions: ReadonlySet<TransactionVersion> = new Set(["legacy", 0]);

  private _keypair: Keypair;
  private _connected = false;

  constructor(secretBase58: string) {
    super();
    this._keypair = Keypair.fromSecretKey(utils.bytes.bs58.decode(secretBase58));
  }

  get publicKey(): PublicKey | null {
    return this._connected ? this._keypair.publicKey : null;
  }
  get connecting() {
    return false;
  }
  get readyState() {
    return WalletReadyState.Installed;
  }

  async connect() {
    // A real wallet answers asynchronously (a popup). The provider registers its 'connect' listener in an effect that runs
    // AFTER the effect that called connect(), so an event emitted synchronously here would be lost: yield first.
    await new Promise((r) => setTimeout(r, 0));
    this._connected = true;
    this.emit("connect", this._keypair.publicKey);
  }
  async disconnect() {
    this._connected = false;
    this.emit("disconnect");
  }
  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    if ("version" in tx) tx.sign([this._keypair]);
    else tx.partialSign(this._keypair);
    return tx;
  }
  async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
    return Promise.all(txs.map((t) => this.signTransaction(t)));
  }
}
