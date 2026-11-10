"use client";
import { ConnectionProvider, WalletProvider, useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { PublicKey } from "@solana/web3.js";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useToast } from "@/components/ui/Toast";
import { config } from "@/lib/config";
import { friendlyError, isUserRejection } from "@/lib/errors";
import { short } from "@/lib/format";
import { getSolBalance } from "@/lib/solana";
import type { TxContext } from "@/services/types";
import { E2EBurnerWalletAdapter } from "./burner";

export interface WalletChoice {
  name: string;
  icon: string;
  state: "installed" | "installable" | "unavailable";
  url?: string;
}

interface Ctx {
  address: string | null;
  connected: boolean;
  connecting: boolean;
  walletName: string | null;
  balance: bigint | null;
  choices: WalletChoice[];
  pickerOpen: boolean;
  openPicker: () => void;
  closePicker: () => void;
  choose: (name: string) => Promise<void>;
  /** Resolves with the address once connected (opening the picker if needed). Rejects if the user closes it. */
  connect: () => Promise<string>;
  disconnect: () => Promise<void>;
  /** Everything a service write needs to act as the connected wallet. */
  txContext: () => TxContext | null;
}

const WalletCtx = createContext<Ctx | null>(null);
export const useDeedWallet = (): Ctx => {
  const c = useContext(WalletCtx);
  if (!c) throw new Error("useDeedWallet must be used inside <WalletProviders>");
  return c;
};

export function WalletProviders({ children }: { children: ReactNode }) {
  const toast = useToast();
  // Phantom + Solflare explicitly; any other Wallet-Standard wallet (Backpack, etc.) is auto-detected by the adapter.
  // The E2E burner exists only when a test key is configured, which `config` refuses on mainnet.
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter(), ...(config.e2eBurnerSecret ? [new E2EBurnerWalletAdapter(config.e2eBurnerSecret)] : [])],
    [],
  );
  return (
    <ConnectionProvider endpoint={config.rpcUrl}>
      <WalletProvider
        wallets={wallets}
        autoConnect
        localStorageKey="deed.wallet"
        onError={(e) => {
          // A closed popup is not an error worth shouting about.
          toast(isUserRejection(e) ? "Connection cancelled. Nothing was connected." : friendlyError(e), isUserRejection(e) ? "info" : "error");
        }}
      >
        <Bridge>{children}</Bridge>
      </WalletProvider>
    </ConnectionProvider>
  );
}

function Bridge({ children }: { children: ReactNode }) {
  const toast = useToast();
  const { connection } = useConnection();
  const { wallets, wallet, publicKey, connected, connecting, select, connect: adapterConnect, disconnect: adapterDisconnect, sendTransaction } = useWallet();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [wanted, setWanted] = useState<string | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const pending = useRef<{ res: (a: string) => void; rej: (e: Error) => void } | null>(null);

  const address = connected && publicKey ? publicKey.toBase58() : null;

  // finish the connect after `select()` has taken effect
  useEffect(() => {
    if (!wanted || !wallet || wallet.adapter.name !== wanted || connected || connecting) return;
    adapterConnect()
      .catch((e) => {
        // a closed popup is silent (WalletProvider.onError already says so); anything else is shown
        if (!isUserRejection(e)) toast(friendlyError(e), "error");
      })
      .finally(() => setWanted(null));
  }, [wanted, wallet, connected, connecting, adapterConnect, toast]);

  // The moment a wallet is connected: resolve anyone awaiting `connect()` AND close the picker, however it was opened
  // (header button, a gated page, or a write that needed a wallet).
  useEffect(() => {
    if (!address) return;
    if (pending.current) {
      pending.current.res(address);
      pending.current = null;
    }
    setPickerOpen(false);
  }, [address]);

  // announce account switches (Phantom "accountChanged") instead of silently changing identity
  const prev = useRef<string | null>(null);
  useEffect(() => {
    if (prev.current && address && prev.current !== address) toast(`Wallet changed to ${short(address)}.`);
    prev.current = address;
  }, [address, toast]);

  // best-effort real balance (never blocks anything)
  useEffect(() => {
    setBalance(null);
    if (!address) return;
    let live = true;
    getSolBalance(address).then((b) => live && setBalance(b)).catch(() => {});
    return () => {
      live = false;
    };
  }, [address]);

  const choices = useMemo<WalletChoice[]>(
    () =>
      wallets
        .map((w) => ({
          name: w.adapter.name as string,
          icon: w.adapter.icon,
          url: w.adapter.url,
          state: (w.readyState === WalletReadyState.Installed || w.readyState === WalletReadyState.Loadable
            ? "installed"
            : w.readyState === WalletReadyState.NotDetected
              ? "installable"
              : "unavailable") as WalletChoice["state"],
        }))
        .filter((c) => c.state !== "unavailable")
        .sort((a, b) => Number(b.state === "installed") - Number(a.state === "installed")),
    [wallets],
  );

  const closePicker = useCallback(() => {
    setPickerOpen(false);
    if (pending.current) {
      pending.current.rej(new Error("Wallet connection cancelled."));
      pending.current = null;
    }
  }, []);

  const choose = useCallback(
    async (name: string) => {
      const c = choices.find((x) => x.name === name);
      if (c?.state === "installable") {
        window.open(c.url ?? "https://phantom.app/", "_blank", "noopener,noreferrer");
        toast(`${name} isn’t installed. Install it, then refresh this page.`);
        return;
      }
      setWanted(name);
      select(name as never);
    },
    [choices, select, toast],
  );

  // `connect` is deliberately STABLE and reads the current address from a ref. Callers (confirm dialogs, queued actions)
  // often hold an older copy of it; a closure over `address` would think "no wallet" and re-open the picker.
  const live = useRef({ address, sendTransaction, connection });
  live.current = { address, sendTransaction, connection };
  const connect = useCallback(() => {
    const a = live.current.address;
    if (a) return Promise.resolve(a);
    return new Promise<string>((res, rej) => {
      pending.current?.rej(new Error("Wallet connection cancelled."));
      pending.current = { res, rej };
      setPickerOpen(true);
    });
  }, []);

  const disconnect = useCallback(async () => {
    try {
      await adapterDisconnect();
    } catch {
      /* already disconnected */
    }
    toast("Wallet disconnected.");
  }, [adapterDisconnect, toast]);

  // Read through the same ref so a caller that just awaited `connect()` never sees the previous render's (empty) wallet.
  const txContext = useCallback((): TxContext | null => {
    const { address: a, sendTransaction: sendTx, connection: conn } = live.current;
    if (!a) return null;
    return {
      wallet: a,
      connection: conn,
      // Signs with the wallet (plus extra keypairs such as a new mint), sends, and resolves only once the transaction is
      // CONFIRMED on chain: a failed transaction rejects instead of looking like success.
      send: async (tx, opts) => {
        const bh = await conn.getLatestBlockhash("confirmed");
        tx.feePayer = new PublicKey(a);
        tx.recentBlockhash = bh.blockhash;
        const signature = await sendTx(tx, conn, { signers: opts?.signers, preflightCommitment: "confirmed" });
        const res = await conn.confirmTransaction({ signature, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight }, "confirmed");
        if (res.value.err) throw new Error(`The transaction failed on chain: ${JSON.stringify(res.value.err)}`);
        return signature;
      },
    };
  }, []);

  const value: Ctx = {
    address, connected: !!address, connecting, walletName: wallet?.adapter.name ?? null, balance,
    choices, pickerOpen, openPicker: () => setPickerOpen(true), closePicker, choose, connect, disconnect, txContext,
  };
  return <WalletCtx.Provider value={value}>{children}</WalletCtx.Provider>;
}
