/**
 * Runtime configuration. Everything comes from NEXT_PUBLIC_* env vars: see `.env.example`.
 * Every value is public (it ships to the browser): never put a secret here.
 */
export type Cluster = "mainnet-beta" | "devnet" | "testnet" | "localnet";

const env = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);

const CLUSTERS: Cluster[] = ["mainnet-beta", "devnet", "testnet", "localnet"];
const rawCluster = env(process.env.NEXT_PUBLIC_SOLANA_CLUSTER) as Cluster | undefined;

/** Public RPC defaults are rate-limited and often block browsers: set NEXT_PUBLIC_SOLANA_RPC_URL for production. */
const DEFAULT_RPC: Record<Cluster, string> = {
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
  devnet: "https://api.devnet.solana.com",
  testnet: "https://api.testnet.solana.com",
  localnet: "http://127.0.0.1:8899",
};

const cluster: Cluster = rawCluster && CLUSTERS.includes(rawCluster) ? rawCluster : "mainnet-beta";

export const config = {
  cluster,
  rpcUrl: env(process.env.NEXT_PUBLIC_SOLANA_RPC_URL) ?? DEFAULT_RPC[cluster],
  /**
   * Optional sanity check. The program id is compiled into the program and shipped in the IDL (`src/chain/idl`); if this
   * is set it must equal it, otherwise the app refuses to start rather than talk to the wrong program.
   */
  programId: env(process.env.NEXT_PUBLIC_DEED_PROGRAM_ID),
  /** Priority fee in micro-lamports per compute unit (0 = none). Keeps transactions landing when the network is busy. */
  priorityFee: Number(env(process.env.NEXT_PUBLIC_PRIORITY_FEE_MICROLAMPORTS) ?? 20_000),
  /** Public IPFS gateway used to render coin images and metadata (`ipfs://…` and bare CIDs are rewritten to it). */
  ipfsGateway: (env(process.env.NEXT_PUBLIC_IPFS_GATEWAY) ?? "https://ipfs.io/ipfs").replace(/\/$/, ""),
  siteUrl: env(process.env.NEXT_PUBLIC_SITE_URL) ?? "https://deed.fun",
  /**
   * TEST ONLY. A base58 secret key that the in-browser "E2E Burner" wallet signs with, so automated browser tests can
   * drive the real UI against a local validator. It is ignored on mainnet-beta: a key in an env var must never be able to
   * sign real-money transactions.
   */
  e2eBurnerSecret: cluster === "mainnet-beta" ? undefined : env(process.env.NEXT_PUBLIC_E2E_BURNER_SECRET),
} as const;

/** Public genesis hashes: used to verify the RPC really is the cluster the app is configured for. */
export const GENESIS_HASH: Partial<Record<Cluster, string>> = {
  "mainnet-beta": "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
  devnet: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
  testnet: "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NYmY",
};

export const clusterLabel = (c: Cluster) => (c === "mainnet-beta" ? "Solana mainnet" : c === "localnet" ? "Local validator" : `Solana ${c}`);
