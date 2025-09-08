// src/utils/helpers.ts
import fs from "fs";
import path from "path";
import { Keypair, Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";

export const DEFAULT_KEYPAIR =
  process.env.KEYPAIR_PATH || path.resolve(process.cwd(), "payer.json");
export const DEFAULT_RPC =
  process.env.RPC_URL || "https://api.devnet.solana.com";

// load or create a keypair file
export function loadOrCreateKeypair(file = DEFAULT_KEYPAIR): Keypair {
  if (fs.existsSync(file)) {
    const raw = fs.readFileSync(file, "utf8");
    const arr = JSON.parse(raw);
    return Keypair.fromSecretKey(Uint8Array.from(arr));
  } else {
    const kp = Keypair.generate();
    fs.writeFileSync(file, JSON.stringify(Array.from(kp.secretKey)));
    console.log(`Generated new keypair and saved to ${file}`);
    return kp;
  }
}

export async function airdropIfNeeded(conn: Connection, payer: Keypair) {
  const bal = await conn.getBalance(payer.publicKey);
  console.log(`SOL balance: ${(bal / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
  if (DEFAULT_RPC.includes("devnet") && bal < LAMPORTS_PER_SOL) {
    console.log("Airdropping 2 SOL (devnet)...");
    const sig = await conn.requestAirdrop(payer.publicKey, 2 * LAMPORTS_PER_SOL);
    await conn.confirmTransaction(sig, "confirmed");
    const newBal = await conn.getBalance(payer.publicKey);
    console.log(`New SOL balance: ${(newBal / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
  }
}
