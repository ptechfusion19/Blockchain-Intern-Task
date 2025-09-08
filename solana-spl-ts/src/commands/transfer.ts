// src/commands/transfer.ts
import { Argv } from "yargs";
import { Connection, PublicKey } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, transfer as splTransfer } from "@solana/spl-token";
import { loadOrCreateKeypair, DEFAULT_KEYPAIR, DEFAULT_RPC } from "../utils/helpers";

export const command = "transfer";
export const desc = "Transfer tokens from payer to destination wallet";

export const builder = (y: Argv) =>
  y
    .option("key", { type: "string", default: DEFAULT_KEYPAIR })
    .option("rpc", { type: "string", default: DEFAULT_RPC })
    .option("mint", { type: "string", demandOption: true })
    .option("to", { type: "string", demandOption: true })
    .option("amount", { type: "string", demandOption: true })
    .option("decimals", { type: "number", default: 9 });

export const handler = async (args: any) => {
  const conn = new Connection(args.rpc, "confirmed");
  const payer = loadOrCreateKeypair(args.key as string);
  const mintPub = new PublicKey(args.mint as string);
  const destPub = new PublicKey(args.to as string);

  const payerAta = await getOrCreateAssociatedTokenAccount(
    conn,
    payer,
    mintPub,
    payer.publicKey
  );
  const destAta = await getOrCreateAssociatedTokenAccount(
    conn,
    payer,
    mintPub,
    destPub
  );

  const amount = BigInt(args.amount) * (BigInt(10) ** BigInt(args.decimals));
  const sig = await splTransfer(
    conn,
    payer,
    payerAta.address,
    destAta.address,
    payer.publicKey,
    amount
  );
  await conn.confirmTransaction(sig, "confirmed");
  console.log("Transfer tx:", sig);
};
