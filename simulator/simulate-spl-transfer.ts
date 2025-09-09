import fs from "fs";
import { Connection, Keypair, Transaction, clusterApiUrl, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress, createTransferInstruction, getAccount } from "@solana/spl-token";

function loadKeypair(path = "./payer.json"): Keypair {
  const raw = fs.readFileSync(path, "utf8");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

/**
 * Replace these with your values before running:
 * - MINT_PUBKEY: the token mint address you want to test
 * - RECIPIENT_WALLET: the recipient wallet public key (not ATA)
 */
const MINT_PUBKEY = process.env.MINT_PUBKEY || "REPLACE_WITH_MINT_PUBKEY";
const RECIPIENT_WALLET = process.env.RECIPIENT_WALLET || "REPLACE_WITH_RECIPIENT_PUBKEY";

async function main() {
  if (MINT_PUBKEY.startsWith("REPLACE_")) {
    console.error("Please set MINT_PUBKEY and RECIPIENT_WALLET env vars or edit the file.");
    process.exit(1);
  }

  const conn = new Connection(clusterApiUrl("devnet"), "confirmed");
  const payer = loadKeypair();

  // derive ATAs
  const mint = new PublicKey(MINT_PUBKEY);
  const recipientWallet = new PublicKey(RECIPIENT_WALLET);

  const fromAta = await getAssociatedTokenAddress(mint, payer.publicKey);
  const toAta = await getAssociatedTokenAddress(mint, recipientWallet);

  console.log("From ATA:", fromAta.toBase58());
  console.log("To ATA:", toAta.toBase58());

  // Build transfer instruction (1 token in base units depends on decimals)
  // For example if token has 6 decimals, sending 1 token = 1 * 10**6 base units
  const amountBase = BigInt(1) * BigInt(10 ** 6); // adjust decimals accordingly

  const ix = createTransferInstruction(fromAta, toAta, payer.publicKey, amountBase);

  const tx = new Transaction().add(ix);
  tx.feePayer = payer.publicKey;
  const { blockhash } = await conn.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.sign(payer);

  // Optionally fetch the ATA account snapshot (helps debugging)
  try {
    const fromAccount = await getAccount(conn, fromAta);
    console.log("From ATA amount:", fromAccount.amount.toString());
  } catch (e) {
  if (e instanceof Error) {
    console.warn("Could not fetch from ATA (may not exist or RPC issue):", e.message);
  } else {
    console.warn("Could not fetch from ATA (may not exist or RPC issue):", String(e));
  }
}

  const sim = await conn.simulateTransaction(tx);
  console.log("=== SIMULATION RESULT (SPL transfer) ===");
  console.log(JSON.stringify(sim.value, null, 2));
  if (sim.value.err) {
    console.log("Simulation error:");
    (sim.value.logs || []).forEach(l => console.log("  ", l));
    console.log("Error:", JSON.stringify(sim.value.err));
  } else {
    console.log("Simulation succeeded. Logs:");
    (sim.value.logs || []).forEach(l => console.log("  ", l));
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
