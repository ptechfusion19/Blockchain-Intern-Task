import fs from "fs";
import { Connection, Keypair, SystemProgram, Transaction, clusterApiUrl } from "@solana/web3.js";

function loadKeypair(path = "./payer.json"): Keypair {
  const raw = fs.readFileSync(path, "utf8");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

async function main() {
  const conn = new Connection(clusterApiUrl("devnet"), "confirmed");
  const payer = loadKeypair();
    
  // huge transfer amount to force insufficient funds
  const recipient = Keypair.generate().publicKey;
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: recipient,
      lamports: 10_000_000_000_000 // extremely large; will fail
    })
  );

  tx.feePayer = payer.publicKey;
  const { blockhash } = await conn.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.sign(payer);

  const sim = await conn.simulateTransaction(tx);
  console.log("=== SIMULATION RESULT (expected failure) ===");
  console.log(JSON.stringify(sim.value, null, 2));

  if (sim.value.err) {
    console.log("Simulation failed as expected. Logs & error:");
    (sim.value.logs || []).forEach(l => console.log("  ", l));
    console.log("Error:", JSON.stringify(sim.value.err));
  } else {
    console.log("Simulation unexpectedly succeeded.");
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
