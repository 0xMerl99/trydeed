// Initialises the Deed config on a network where the program is deployed. Only the program's UPGRADE AUTHORITY can run it
// (the program checks that on chain). Sets the fee treasury, the wallet that receives the 1% auction fee and the 0.5% OTC fee.
//
//   node chain/scripts/initialize.mjs --rpc <url> --authority <keypair.json> --treasury <pubkey>
//
// The treasury must already exist and hold at least the rent-exempt minimum (0.00089 SOL): fund it first.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram } from "@solana/web3.js";

const arg = (n) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const rpc = arg("rpc");
const authorityPath = arg("authority");
const treasuryStr = arg("treasury");
if (!rpc || !authorityPath || !treasuryStr) {
  console.error("usage: node chain/scripts/initialize.mjs --rpc <url> --authority <keypair.json> --treasury <pubkey>");
  process.exit(2);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const idl = JSON.parse(readFileSync(path.resolve(here, "../../src/chain/idl/deed_fun.json"), "utf8"));
const programId = new PublicKey(idl.address);
const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(authorityPath, "utf8"))));
const treasury = new PublicKey(treasuryStr);
const conn = new Connection(rpc, "confirmed");

const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], programId);
const [programData] = PublicKey.findProgramAddressSync([programId.toBuffer()], new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111"));
const def = idl.instructions.find((i) => i.name === "initialize");

if (await conn.getAccountInfo(config)) {
  console.error(`Config ${config.toBase58()} already exists: nothing to do.`);
  process.exit(0);
}
const t = await conn.getAccountInfo(treasury);
const floor = await conn.getMinimumBalanceForRentExemption(0);
if (!t || t.lamports < floor) {
  console.error(`The treasury ${treasury.toBase58()} must hold at least ${floor} lamports before initialising. Send it a little SOL first.`);
  process.exit(1);
}
const accounts = { admin: authority.publicKey, config, treasury, program_data: programData };
const keys = def.accounts.map((a) => ({
  pubkey: accounts[a.name] ?? new PublicKey(a.address),
  isSigner: !!a.signer,
  isWritable: !!a.writable,
}));
const tx = new Transaction().add(new TransactionInstruction({ programId, keys, data: Buffer.from(def.discriminator) }));
tx.feePayer = authority.publicKey;
const bh = await conn.getLatestBlockhash("confirmed");
tx.recentBlockhash = bh.blockhash;
tx.sign(authority);
const sig = await conn.sendRawTransaction(tx.serialize());
await conn.confirmTransaction({ signature: sig, ...bh }, "confirmed");
console.log(`Initialised. config ${config.toBase58()}, treasury ${treasury.toBase58()}, admin ${authority.publicKey.toBase58()}\nsignature ${sig}`);
void SystemProgram;
