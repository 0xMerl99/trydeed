// Prints every non-user account that Pump's launch + fee-sharing + fee-distribution instructions touch, so the local
// validator can clone exactly those from mainnet (read-only copy). Run: node chain/e2e/pump-accounts.mjs > accounts.txt
import { Keypair, PublicKey } from "@solana/web3.js";
import { NATIVE_MINT, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import BN from "bn.js";
import * as sdk from "@pump-fun/pump-sdk";

const { PUMP_SDK } = sdk;
const creator = Keypair.generate().publicKey;
const mint = Keypair.generate().publicKey;
const vault = Keypair.generate().publicKey;

const ixs = [];
ixs.push(await PUMP_SDK.createV2Instruction({ mint, name: "T", symbol: "T", uri: "https://x", creator, user: creator, mayhemMode: false }));
ixs.push(await PUMP_SDK.createFeeSharingConfig({ creator, mint, pool: null }));
ixs.push(
  await PUMP_SDK.updateFeeSharesV2({
    authority: creator,
    mint,
    currentShareholders: [creator],
    newShareholders: [{ address: vault, shareBps: 10000 }],
    quoteMint: NATIVE_MINT,
    quoteTokenProgram: TOKEN_PROGRAM_ID,
    bondingCurveComplete: false,
  }),
);
const skip = new Set([creator.toBase58(), mint.toBase58(), vault.toBase58()]);
const out = new Set();
for (const ix of ixs) {
  out.add(ix.programId.toBase58());
  for (const k of ix.keys) if (!skip.has(k.pubkey.toBase58())) out.add(k.pubkey.toBase58());
}
// the extras the SDK's own tooling reads
for (const n of ["GLOBAL_PDA", "PUMP_FEE_CONFIG_PDA", "FEE_PROGRAM_GLOBAL_PDA", "AMM_GLOBAL_PDA", "AMM_GLOBAL_VOLUME_ACCUMULATOR_PDA", "GLOBAL_VOLUME_ACCUMULATOR_PDA", "QUOTE_CONTROL_PDA"]) {
  if (sdk[n]) out.add(sdk[n].toBase58());
}
console.log([...out].join("\n"));
