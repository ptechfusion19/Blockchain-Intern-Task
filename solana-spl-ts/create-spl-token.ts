// create-spl-token.ts
import fs from "fs";
import path from "path";
import {
  Connection,
  Keypair,
  clusterApiUrl,
  PublicKey,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
  setAuthority,
  AuthorityType,
} from "@solana/spl-token";
import dotenv from "dotenv";
dotenv.config();

const KEYPAIR_PATH = process.env.KEYPAIR_PATH || path.resolve(process.cwd(), "payer.json");
const RPC_URL = process.env.RPC_URL || clusterApiUrl("devnet");

async function loadOrCreateKeypair(): Promise<Keypair> {
  if (fs.existsSync(KEYPAIR_PATH)) {
    const raw = fs.readFileSync(KEYPAIR_PATH, "utf8");
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) throw new Error("payer.json must be a secret-key array");
    return Keypair.fromSecretKey(Uint8Array.from(arr));
  } else {
    const kp = Keypair.generate();
    fs.writeFileSync(KEYPAIR_PATH, JSON.stringify(Array.from(kp.secretKey)));
    console.log(`Generated new keypair and saved to ${KEYPAIR_PATH}`);
    return kp;
  }
}

async function airdropIfNeeded(conn: Connection, payer: Keypair) {
  const balance = await conn.getBalance(payer.publicKey);
  console.log(`Current SOL balance: ${(balance / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
  if (RPC_URL.includes("devnet") && balance < 1 * LAMPORTS_PER_SOL) {
    console.log("Airdropping 2 SOL on devnet...");
    const sig = await conn.requestAirdrop(payer.publicKey, 2 * LAMPORTS_PER_SOL);
    await conn.confirmTransaction(sig, "confirmed");
    const newBal = await conn.getBalance(payer.publicKey);
    console.log(`New SOL balance: ${(newBal / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
  } else if (!RPC_URL.includes("devnet") && balance === 0) {
    console.warn("Warning: payer has 0 SOL and you're not on devnet. Fund the payer before running.");
  }
}

async function main() {
  // Config (edit these or use env vars)
  const decimals = Number(process.env.DECIMALS ?? 9); // token decimals
  const humanSupply = BigInt(process.env.SUPPLY ?? "1000"); // token units (human number)
  const disableMintAfter = (process.env.DISABLE_MINT ?? "true") === "true"; // revoke mint authority after minting

  const conn = new Connection(RPC_URL, "confirmed");
  const payer = await loadOrCreateKeypair();

  console.log("RPC:", RPC_URL);
  console.log("Payer:", payer.publicKey.toBase58());
  await airdropIfNeeded(conn, payer);

  console.log(`\n== Creating mint (decimals=${decimals}) ==`);
  // createMint returns the mint PublicKey
  // payer is used to pay fees and as the transaction signer
  const mint = await createMint(
    conn,
    payer, // payer (signs tx)
    payer.publicKey, // mint authority
    null, // freeze authority (null = none)
    decimals
  );
  console.log("Mint created:", mint.toBase58());

  console.log("\n== Creating associated token account for payer ==");
  const payerAta = await getOrCreateAssociatedTokenAccount(conn, payer, mint, payer.publicKey);
  console.log("Payer ATA:", payerAta.address.toBase58());

  console.log("\n== Minting tokens ==");
  // amount to mint in base units = humanSupply * 10^decimals
  const amount = humanSupply * (BigInt(10) ** BigInt(decimals));
  const sig = await mintTo(conn, payer, mint, payerAta.address, payer, amount);
  await conn.confirmTransaction(sig, "confirmed");
  console.log(`Minted ${humanSupply.toString()} tokens -> tx: ${sig}`);

  // fetch token account info to show balance
  const ataAccount = await getAccount(conn, payerAta.address);
  // ataAccount.amount is bigint of base units
  // convert to human readable:
  const humanBalance = ataAccount.amount / (BigInt(10) ** BigInt(decimals));
  console.log(`ATA balance (human): ${humanBalance.toString()}`);

  if (disableMintAfter) {
    console.log("\n== Disabling mint authority (irreversible) ==");
    // setAuthority with newAuthority = null will disable minting
    // note: setAuthority types may require casting for null in TS
    try {
      const tx = await setAuthority(
        conn,
        payer,
        mint, // the mint account
        payer, // current authority (Keypair)
        AuthorityType.MintTokens,
        null as unknown as PublicKey // revoke (disable)
      );
      await conn.confirmTransaction(tx, "confirmed");
      console.log("Mint authority revoked. Minting disabled. tx:", tx);
    } catch (err) {
      console.error("Failed to disable mint authority:", err);
    }
  } else {
    console.log("\nMint authority left enabled (you can mint more tokens later).");
  }

  console.log("\n== Summary ==");
  console.log("Mint address:", mint.toBase58());
  console.log("Payer ATA:", payerAta.address.toBase58());
  console.log(
    `Explorer (devnet): https://explorer.solana.com/address/${mint.toBase58()}?cluster=devnet`
  );
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
