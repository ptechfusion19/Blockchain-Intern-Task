import fs from "fs";
import { Connection, Keypair, SystemProgram, Transaction, clusterApiUrl, LAMPORTS_PER_SOL } from "@solana/web3.js";

function loadKeypair(path = "./payer.json"): Keypair {
  const raw = fs.readFileSync(path, "utf8");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

async function maybeAirdrop(conn: Connection, payer: Keypair) {
  const bal = await conn.getBalance(payer.publicKey);
  console.log(`Current SOL balance: ${(bal / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
  if (conn.rpcEndpoint.includes("devnet") && bal < LAMPORTS_PER_SOL) {
    console.log("Airdropping 2 SOL (devnet) for fees");
    const sig = await conn.requestAirdrop(payer.publicKey, 2 * LAMPORTS_PER_SOL);
    await conn.confirmTransaction(sig, "confirmed");
    console.log("Airdrop confirmed.");
  }
}

async function main() {
  const conn = new Connection(clusterApiUrl("devnet"), "confirmed");
  const payer = loadKeypair();

  await maybeAirdrop(conn, payer);

  const recipient = Keypair.generate().publicKey;

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: recipient,
      lamports: 1_000_000 // 0.001 SOL
    })
  );

  tx.feePayer = payer.publicKey;
  const { blockhash } = await conn.getLatestBlockhash();
  tx.recentBlockhash = blockhash;

  // Sign (simulation with correct signer is more realistic)
  tx.sign(payer);

  const sim = await conn.simulateTransaction(tx);
  console.log("=== SIMULATION RESULT ===");
  console.log(JSON.stringify(sim.value, null, 2));

  if (sim.value.err) {
    console.log("Simulation indicates failure:", sim.value.err);
  } else {
    console.log("Simulation succeeded. Logs:");
    (sim.value.logs || []).forEach(l => console.log("  ", l));
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
