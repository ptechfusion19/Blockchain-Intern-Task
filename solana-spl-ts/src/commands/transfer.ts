// src/commands/transfer.ts
import { Argv } from "yargs";
import { Connection, PublicKey,  VersionedTransaction, type SimulateTransactionConfig } from "@solana/web3.js";
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

  const base64Tx =
  "AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAEEjNmKiZGiOtSZ+g0//wH5kEQo3+UzictY+KlLV8hjXcs44M/Xnr+1SlZsqS6cFMQc46yj9PIsxqkycxJmXT+veJjIvefX4nhY9rY+B5qreeqTHu4mG6Xtxr5udn4MN8PnBt324e51j94YQl285GzN2rYa/E2DuQ0n/r35KNihi/zamQ6EeyeeVDvPVgUO2W3Lgt9hT+CfyqHvIa11egFPCgEDAwIBAAkDZAAAAAAAAAA=";

  let tx = VersionedTransaction.deserialize(Buffer.from(base64Tx, "base64"));


  let simulateTxConfig: SimulateTransactionConfig = {
    commitment: "finalized",
    replaceRecentBlockhash: true,
    sigVerify: false,
    minContextSlot: undefined,
    innerInstructions: undefined,
    accounts: undefined,
  };

  let simulateResult = await conn.simulateTransaction(tx, simulateTxConfig);

  console.log(simulateResult);

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

  console.log("This is a signature: ", sig);

};
