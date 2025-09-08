// src/commands/balance.ts
import { Argv } from "yargs";
import { Connection, PublicKey } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, getAccount, getMint } from "@solana/spl-token";
import { loadOrCreateKeypair, DEFAULT_KEYPAIR, DEFAULT_RPC } from "../utils/helpers";

export const command = "balance";
export const desc = "Show token supply and account balance";

export const builder = (y: Argv) =>
  y
    .option("rpc", { type: "string", default: DEFAULT_RPC })
    .option("mint", { type: "string", demandOption: true })
    .option("owner", { type: "string" })
    .option("key", { type: "string", default: DEFAULT_KEYPAIR })
    .option("decimals", { type: "number", default: 9 });

export const handler = async (args: any) => {
  const conn = new Connection(args.rpc, "confirmed");
  const mintPub = new PublicKey(args.mint as string);
  const mintInfo = await getMint(conn, mintPub);

  const decimals = Number(mintInfo.decimals ?? args.decimals);
  const supplyBase = mintInfo.supply;
  const supplyHuman = supplyBase / (BigInt(10) ** BigInt(decimals));
  console.log(`Mint supply (human): ${supplyHuman.toString()} (decimals=${decimals})`);

  let ownerPub: PublicKey;
  if (args.owner) {
    ownerPub = new PublicKey(args.owner as string);
  } else {
    const payer = loadOrCreateKeypair(args.key as string);
    ownerPub = payer.publicKey;
  }

  const ata = await getOrCreateAssociatedTokenAccount(
    conn,
    loadOrCreateKeypair(args.key as string),
    mintPub,
    ownerPub
  );

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
};
