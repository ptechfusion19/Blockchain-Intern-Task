// src/commands/create.ts
import { Argv } from "yargs";
import {
  Connection,
  PublicKey,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
  setAuthority,
  AuthorityType,
} from "@solana/spl-token";
import { loadOrCreateKeypair, airdropIfNeeded, DEFAULT_KEYPAIR, DEFAULT_RPC } from "../utils/helpers";

export const command = "create";
export const desc = "Create a new SPL token mint and mint initial supply";

export const builder = (y: Argv) =>
  y
    .option("key", { type: "string", default: DEFAULT_KEYPAIR })
    .option("rpc", { type: "string", default: DEFAULT_RPC })
    .option("decimals", { type: "number", default: 9 })
    .option("supply", { type: "string", default: "1000" })
    .option("disableMint", { type: "boolean", default: true });

export const handler = async (args: any) => {
  const conn = new Connection(args.rpc, "confirmed");
  const payer = loadOrCreateKeypair(args.key as string);
  await airdropIfNeeded(conn, payer);

  const decimals = Number(args.decimals);
  const humanSupply = BigInt(args.supply);

  console.log(`Creating mint (decimals=${decimals})...`);
  const mint = await createMint(conn, payer, payer.publicKey, null, decimals);
  console.log("Mint address:", mint.toBase58());

  const ata = await getOrCreateAssociatedTokenAccount(
    conn,
    payer,
    mint,
    payer.publicKey
  );
  console.log("Payer ATA:", ata.address.toBase58());

  const amount = humanSupply * (BigInt(10) ** BigInt(decimals));
  const sig = await mintTo(conn, payer, mint, ata.address, payer, amount);
  await conn.confirmTransaction(sig, "confirmed");
  console.log(`Minted ${humanSupply.toString()} tokens -> tx: ${sig}`);

  const acct = await getAccount(conn, ata.address);
  console.log("ATA balance (base units):", acct.amount.toString());

  if (args.disableMint) {
    const tx = await setAuthority(
      conn,
      payer,
      mint,
      payer,
      AuthorityType.MintTokens,
      null as any
    );
    await conn.confirmTransaction(tx, "confirmed");
    console.log("Mint authority revoked. tx:", tx);
  }

  console.log(
    `\nExplorer (devnet): https://explorer.solana.com/address/${mint.toBase58()}?cluster=devnet`
  );
};
