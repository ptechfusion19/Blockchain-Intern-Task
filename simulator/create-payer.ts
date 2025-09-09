import fs from "fs";
import path from "path";
import { Keypair } from "@solana/web3.js";

const OUT = path.resolve(process.cwd(), "payer.json");

if (fs.existsSync(OUT)) {
  console.log("payer.json already exists at", OUT);
  process.exit(0);
}

const kp = Keypair.generate();
fs.writeFileSync(OUT, JSON.stringify(Array.from(kp.secretKey)));
console.log("Generated new payer keypair ->", OUT);
console.log("Public key:", kp.publicKey.toBase58());
