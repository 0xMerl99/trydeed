/**
 * Token facts straight from the chain: mint parameters, on-chain metadata (Token-2022 metadata extension or Metaplex
 * metadata account) and the off-chain JSON that metadata points to. Everything is cached, because metadata is immutable
 * enough for a page view and the RPC is the scarce resource.
 */
import { getTokenMetadata } from "@solana/spl-token";
import { PublicKey, type Connection } from "@solana/web3.js";
import { config } from "@/lib/config";

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
/** Metaplex Token Metadata program (the metadata standard of classic SPL tokens). */
const METAPLEX_METADATA = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

export interface TokenFacts {
  mint: string;
  decimals: number;
  supply: bigint;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  standard: "SPL Token" | "Token-2022";
  tokenProgram: string;
  /** Token-2022 extensions present on the mint (camelCase names from the RPC's jsonParsed output). */
  extensions: string[];
  name?: string;
  symbol?: string;
  uri?: string;
}

export interface OffchainMeta {
  description?: string;
  image?: string;
  twitter?: string;
  telegram?: string;
  website?: string;
}

const factsCache = new Map<string, Promise<TokenFacts | null>>();
const jsonCache = new Map<string, Promise<OffchainMeta>>();

/** `ipfs://CID/x`, `https://…/ipfs/CID`, bare CIDs → the configured gateway; https stays https; everything else is dropped. */
export function resolveUri(uri: string | undefined | null): string | undefined {
  if (!uri) return undefined;
  const u = uri.trim().replace(/\0/g, "");
  if (u.startsWith("ipfs://")) return `${config.ipfsGateway}/${u.slice(7).replace(/^ipfs\//, "")}`;
  if (/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{50,})/.test(u)) return `${config.ipfsGateway}/${u}`;
  if (u.startsWith("https://")) return u;
  return undefined;
}

function decodeMetaplex(data: Buffer): { name: string; symbol: string; uri: string } | null {
  try {
    let o = 1 + 32 + 32; // key, update authority, mint
    const str = (max: number) => {
      const len = data.readUInt32LE(o);
      o += 4;
      if (len > max * 4) throw new Error("bad string");
      const s = data.subarray(o, o + len).toString("utf8").replace(/\0+$/, "");
      o += len;
      return s;
    };
    return { name: str(32), symbol: str(10), uri: str(200) };
  } catch {
    return null;
  }
}

async function loadFacts(conn: Connection, mint: string): Promise<TokenFacts | null> {
  let key: PublicKey;
  try {
    key = new PublicKey(mint);
  } catch {
    return null;
  }
  const res = await conn.getParsedAccountInfo(key);
  const acc = res.value;
  if (!acc) return null;
  const owner = acc.owner.toBase58();
  if (owner !== TOKEN_PROGRAM && owner !== TOKEN_2022_PROGRAM) return null;
  const parsed = (acc.data as { parsed?: { type?: string; info?: Record<string, unknown> } }).parsed;
  if (parsed?.type !== "mint" || !parsed.info) return null;
  const i = parsed.info as { decimals: number; supply: string; mintAuthority: string | null; freezeAuthority: string | null; extensions?: { extension: string }[] };
  const facts: TokenFacts = {
    mint,
    decimals: i.decimals,
    supply: BigInt(i.supply),
    mintAuthority: i.mintAuthority ?? null,
    freezeAuthority: i.freezeAuthority ?? null,
    standard: owner === TOKEN_2022_PROGRAM ? "Token-2022" : "SPL Token",
    tokenProgram: owner,
    extensions: (i.extensions ?? []).map((e) => e.extension),
  };
  try {
    if (owner === TOKEN_2022_PROGRAM) {
      const m = await getTokenMetadata(conn, key, "confirmed");
      if (m) Object.assign(facts, { name: m.name, symbol: m.symbol, uri: m.uri });
    } else {
      const [pda] = PublicKey.findProgramAddressSync([Buffer.from("metadata"), METAPLEX_METADATA.toBuffer(), key.toBuffer()], METAPLEX_METADATA);
      const info = await conn.getAccountInfo(pda);
      const m = info && info.owner.equals(METAPLEX_METADATA) ? decodeMetaplex(info.data) : null;
      if (m) Object.assign(facts, m);
    }
  } catch {
    /* no metadata: the token is still real, just unnamed */
  }
  return facts;
}

export function tokenFacts(conn: Connection, mint: string): Promise<TokenFacts | null> {
  let p = factsCache.get(mint);
  if (!p) {
    p = loadFacts(conn, mint).catch(() => null);
    factsCache.set(mint, p);
    // do not cache failures for long: a token may simply not exist YET
    void p.then((v) => v === null && setTimeout(() => factsCache.delete(mint), 5_000));
  }
  return p;
}

/** Fetches the metadata JSON from the (resolved) URI with a timeout. Any failure yields an empty object. */
export function offchainMeta(uri: string | undefined): Promise<OffchainMeta> {
  const url = resolveUri(uri);
  if (!url) return Promise.resolve({});
  let p = jsonCache.get(url);
  if (!p) {
    p = (async () => {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 6_000);
      try {
        const res = await fetch(url, { signal: ctl.signal, referrerPolicy: "no-referrer", credentials: "omit" });
        if (!res.ok) return {};
        const j = (await res.json()) as Record<string, unknown>;
        const s = (v: unknown, max = 600) => (typeof v === "string" ? v.slice(0, max) : undefined);
        return {
          description: s(j.description),
          image: resolveUri(s(j.image, 300)),
          twitter: s(j.twitter, 200),
          telegram: s(j.telegram, 200),
          website: s(j.website, 200),
        } satisfies OffchainMeta;
      } catch {
        return {};
      } finally {
        clearTimeout(t);
      }
    })();
    jsonCache.set(url, p);
  }
  return p;
}

/** Token-2022 mint extensions the Deed program allows on escrowed tokens (see programs/deed_fun `check_mint_extensions`). */
export const ALLOWED_EXTENSIONS = new Set(["metadataPointer", "tokenMetadata"]);
