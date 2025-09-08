// solana-token-cli.ts
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
dotenv.config();

import yargs, { Argv } from "yargs";
import { hideBin } from "yargs/helpers";

import {
  Connection,
  Keypair,
  clusterApiUrl,
  PublicKey,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
  setAuthority,
  AuthorityType,
  transfer as splTransfer,
  getMint,
} from "@solana/spl-token";

/* ---------------------- helpers ---------------------- */

const DEFAULT_KEYPAIR = process.env.KEYPAIR_PATH || path.resolve(process.cwd(), "payer.json");
const DEFAULT_RPC = process.env.RPC_URL || clusterApiUrl("devnet");

// load or create a keypair file
function loadOrCreateKeypair(file = DEFAULT_KEYPAIR): Keypair {
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

async function airdropIfNeeded(conn: Connection, payer: Keypair) {
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

/* ---------------------- commands ---------------------- */

yargs(hideBin(process.argv))
  .scriptName("solana-token")
  .command(
    "create",
    "Create a new SPL token mint and mint initial supply to payer (optionally disable minting)",
    (y: Argv) =>
      y
        .option("key", { type: "string", describe: "path to payer keypair JSON", default: DEFAULT_KEYPAIR })
        .option("rpc", { type: "string", describe: "RPC URL", default: DEFAULT_RPC })
        .option("decimals", { type: "number", describe: "decimals", default: 9 })
        .option("supply", { type: "string", describe: "human supply to mint (integer)", default: "1000" })
        .option("disableMint", { type: "boolean", describe: "revoke mint authority after minting", default: true }),
    async (args: Record<string, any>) => {
      const conn = new Connection(args.rpc, "confirmed");
      const payer = loadOrCreateKeypair(args.key as string);
      await airdropIfNeeded(conn, payer);

      const decimals = Number(args.decimals);
      const humanSupply = BigInt(args.supply);

      console.log(`Creating mint (decimals=${decimals})...`);
      const mint = await createMint(conn, payer, payer.publicKey, null, decimals);
      console.log("Mint address:", mint.toBase58());

      const ata = await getOrCreateAssociatedTokenAccount(conn, payer, mint, payer.publicKey);
      console.log("Payer ATA:", ata.address.toBase58());

      const amount = humanSupply * (BigInt(10) ** BigInt(decimals));
      const sig = await mintTo(conn, payer, mint, ata.address, payer, amount);
      await conn.confirmTransaction(sig, "confirmed");
      console.log(`Minted ${humanSupply.toString()} tokens -> tx: ${sig}`);

      const acct = await getAccount(conn, ata.address);
      console.log("ATA balance (base units):", acct.amount.toString());

      if (args.disableMint) {
        const tx = await setAuthority(conn, payer, mint, payer, AuthorityType.MintTokens, null as any);
        await conn.confirmTransaction(tx, "confirmed");
        console.log("Mint authority revoked. Minting disabled. tx:", tx);
      }

      console.log(`\nExplorer (devnet): https://explorer.solana.com/address/${mint.toBase58()}?cluster=devnet`);
    }
  )
  .command(
    "transfer",
    "Transfer tokens from payer to destination wallet (creates destination ATA if missing)",
    (y: Argv) =>
      y
        .option("key", { type: "string", default: DEFAULT_KEYPAIR })
        .option("rpc", { type: "string", default: DEFAULT_RPC })
        .option("mint", { type: "string", demandOption: true, describe: "mint address" })
        .option("to", { type: "string", demandOption: true, describe: "destination wallet pubkey" })
        .option("amount", { type: "string", demandOption: true, describe: "human amount to send (e.g., 10)" })
        .option("decimals", { type: "number", default: 9 }),
    async (args: Record<string, any>) => {
      const conn = new Connection(args.rpc, "confirmed");
      const payer = loadOrCreateKeypair(args.key as string);
      const mintPub = new PublicKey(args.mint as string);
      const destPub = new PublicKey(args.to as string);
      const payerAta = await getOrCreateAssociatedTokenAccount(conn, payer, mintPub, payer.publicKey);
      const destAta = await getOrCreateAssociatedTokenAccount(conn, payer, mintPub, destPub);
      const amount = BigInt(args.amount) * (BigInt(10) ** BigInt(args.decimals));
      const sig = await splTransfer(conn, payer, payerAta.address, destAta.address, payer.publicKey, amount);
      await conn.confirmTransaction(sig, "confirmed");
      console.log("Transfer tx:", sig);
    }
  )
  .command(
    "balance",
    "Show token supply and token account balance for owner",
    (y: Argv) =>
      y
        .option("rpc", { type: "string", default: DEFAULT_RPC })
        .option("mint", { type: "string", demandOption: true, describe: "mint address" })
        .option("owner", { type: "string", describe: "owner public key (if omitted shows payer's ATA if payer exists)" })
        .option("key", { type: "string", default: DEFAULT_KEYPAIR })
        .option("decimals", { type: "number", default: 9 }),
    async (args: Record<string, any>) => {
      const conn = new Connection(args.rpc, "confirmed");
      const mintPub = new PublicKey(args.mint as string);
      const mintInfo = await getMint(conn, mintPub);
      const supplyBase = mintInfo.supply; // bigint
      const decimals = Number(mintInfo.decimals ?? args.decimals);
      const supplyHuman = supplyBase / (BigInt(10) ** BigInt(decimals));
      console.log(`Mint supply (human): ${supplyHuman.toString()} (decimals=${decimals})`);

      let ownerPub: PublicKey;
      if (args.owner) {
        ownerPub = new PublicKey(args.owner as string);
      } else {
        const payer = loadOrCreateKeypair(args.key as string);
        ownerPub = payer.publicKey;
      }

      const ata = await getOrCreateAssociatedTokenAccount(conn, loadOrCreateKeypair(args.key as string), mintPub, ownerPub);
      try {
        const acct = await getAccount(conn, ata.address);
        const humanBal = acct.amount / (BigInt(10) ** BigInt(decimals));
        console.log(`Token account: ${ata.address.toBase58()}`);
        console.log(`Owner: ${ownerPub.toBase58()}`);
        console.log(`Balance (human): ${humanBal.toString()}`);
        console.log(`Balance (base units): ${acct.amount.toString()}`);
      } catch (err) {
        console.error("Could not fetch token account:", err);
      }
    }
  )
  .demandCommand(1, "Please specify a command")
  .help()
  .parse();
