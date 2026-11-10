/**
 * Pins a new coin's image and metadata to IPFS (through Pinata's documented pinning API) and returns the two URIs that the
 * launch transactions store on chain: the coin's metadata JSON (Pump.fun) and the Deed's metadata JSON (Token-2022).
 *
 * This is the ONE thing in the app that needs a server secret: PINATA_JWT (never exposed to the browser). `PINATA_API_URL`
 * (default https://api.pinata.cloud) exists so the browser test suite can point it at a local stand-in for the pinning service. Without it the
 * route answers 501 and the launch form says so. It writes nothing to the chain and holds no keys.
 */
import { PublicKey } from "@solana/web3.js";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 1_500_000;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const hits = new Map<string, number[]>();

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5_000) for (const [k, v] of hits) if (!v.some((t) => now - t < 10 * 60_000)) hits.delete(k);
  return recent.length > 6;
}

const https = (v: unknown, max = 200) => (typeof v === "string" && v.trim() === "" ? "" : typeof v === "string" && /^https:\/\/\S+$/.test(v.trim()) && v.trim().length <= max ? v.trim() : null);

async function pin(jwt: string, path: string, init: RequestInit): Promise<string> {
  const res = await fetch(`${process.env.PINATA_API_URL ?? "https://api.pinata.cloud"}/pinning/${path}`, { ...init, headers: { ...(init.headers as Record<string, string>), authorization: `Bearer ${jwt}` } });
  if (!res.ok) throw new Error(`The pinning service refused the upload (${res.status}).`);
  const body = (await res.json()) as { IpfsHash?: string };
  if (!body.IpfsHash) throw new Error("The pinning service returned no content id.");
  return body.IpfsHash;
}

export async function POST(request: Request) {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) return json({ error: "Metadata hosting is not configured on this deployment (the server needs PINATA_JWT). Nothing was created." }, 501);

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) return json({ error: "Too many launches from this address. Try again in a few minutes." }, 429);

  let b: Record<string, unknown>;
  try {
    b = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const name = typeof b.name === "string" ? b.name.trim() : "";
  const symbol = typeof b.symbol === "string" ? b.symbol.trim() : "";
  const description = typeof b.description === "string" ? b.description.slice(0, 500) : "";
  const twitter = https(b.twitter);
  const telegram = https(b.telegram);
  let coinMint = "";
  try {
    coinMint = new PublicKey(String(b.coinMint)).toBase58();
  } catch {
    return json({ error: "Invalid coin mint." }, 400);
  }
  if (!name || name.length > 32) return json({ error: "Coin name must be 1–32 characters." }, 400);
  if (!/^[A-Z0-9]{1,10}$/.test(symbol)) return json({ error: "Ticker must be 1–10 letters or numbers." }, 400);
  if (twitter === null || telegram === null) return json({ error: "Social links must start with https://." }, 400);

  const m = typeof b.image === "string" ? /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)$/.exec(b.image) : null;
  if (!m || !IMAGE_TYPES.has(m[1])) return json({ error: "Upload a PNG, JPG, GIF or WEBP image." }, 400);
  const bytes = Buffer.from(m[2], "base64");
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return json({ error: "Image must be under 1.5 MB." }, 400);

  const gateway = (process.env.NEXT_PUBLIC_IPFS_GATEWAY ?? "https://ipfs.io/ipfs").replace(/\/$/, "");
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://deed.fun";

  try {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(bytes)], { type: m[1] }), `${symbol}.${m[1].split("/")[1]}`);
    form.append("pinataMetadata", JSON.stringify({ name: `${symbol} image` }));
    const imageCid = await pin(jwt, "pinFileToIPFS", { method: "POST", body: form });
    const image = `${gateway}/${imageCid}`;

    const jsonPin = (content: unknown, label: string) =>
      pin(jwt, "pinJSONToIPFS", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pinataContent: content, pinataMetadata: { name: label } }) });

    const coinCid = await jsonPin(
      { name, symbol, description, image, showName: true, createdOn: site, website: site, ...(twitter ? { twitter } : {}), ...(telegram ? { telegram } : {}) },
      `${symbol} metadata`,
    );
    const deedCid = await jsonPin(
      {
        name: `Deed: ${name}`.slice(0, 32),
        symbol: "DEED",
        description: `Ownership NFT of ${name} ($${symbol}). Whoever holds it controls 100% of the coin's Pump.fun creator fees. Coin mint: ${coinMint}.`,
        image,
        external_url: site,
        attributes: [
          { trait_type: "Coin", value: coinMint },
          { trait_type: "Rights", value: "100% of creator fees" },
        ],
      },
      `${symbol} deed metadata`,
    );
    return json({ uri: `${gateway}/${coinCid}`, deedUri: `${gateway}/${deedCid}` });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Upload failed." }, 502);
  }
}
