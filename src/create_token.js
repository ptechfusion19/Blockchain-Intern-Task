// src/create_token.js
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
dotenv.config();

import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { irysUploader } from "@metaplex-foundation/umi-uploader-irys";
import { mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";
import { mplToolbox } from "@metaplex-foundation/mpl-toolbox";

import {
  generateSigner,
  signerIdentity,
  keypairIdentity,
  createGenericFile,
  percentAmount,
  sol,
} from "@metaplex-foundation/umi";

import { base58 } from "@metaplex-foundation/umi/serializers";

import bs58 from 'bs58';

import { Connection, Keypair} from "@solana/web3.js";
import {
  createMint, // convenience wrapper that creates+initializes mint
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_2022_PROGRAM_ID,
  createAccount
} from "@solana/spl-token";


// -------------------- config --------------------
const payer = process.env.WALLET; // expects base58 secret key (as you used)
if (!payer) {
  console.error("ERROR: set WALLET in .env to your base58 secret key");
  process.exit(1);
}
const secretKey = bs58.decode(payer);
const keypair = Keypair.fromSecretKey(new Uint8Array(secretKey));

const RPC = process.env.RPC_URL || "https://api.devnet.solana.com";
const IMAGE_FILE = path.resolve(process.cwd(), "./image.png"); // ensure this exists
const CLUSTER = "devnet"; // explorer cluster query param



// -------------------- helper --------------------
function pubKeyToString(pk) {
  if (!pk) return String(pk);
  if (Array.isArray(pk) && pk.length > 0) pk = pk[0];
  if (typeof pk === "string") return pk;
  if (pk && typeof pk.toBase58 === "function") return pk.toBase58();
  if (pk && typeof pk.toString === "function") return pk.toString();
  return String(pk);
}


async function main() {
  // 1) Umi client with token-metadata, toolbox and irys uploader
  const umi = createUmi(RPC)
    .use(mplTokenMetadata())
    .use(mplToolbox())
    .use(irysUploader());

  // 2) Wire UMI identity from the provided local web3 Keypair
  const kp = umi.eddsa.createKeypairFromSecretKey(keypair.secretKey);
  umi.use(keypairIdentity(kp));

  console.log("Using identity:", pubKeyToString(umi.identity.publicKey));


  // 3) Upload image to Arweave via Irys
  if (!fs.existsSync(IMAGE_FILE)) {
    throw new Error(`Image file not found at ${IMAGE_FILE} — please add image.png to project root.`);
  }
  const imageBytes = fs.readFileSync(IMAGE_FILE);
  const umiImageFile = createGenericFile(imageBytes, "image.png", {
    tags: [{ name: "Content-Type", value: "image/png" }],
  });

  console.log("Uploading image to Arweave (Irys)...");
  const imageUris = await umi.uploader.upload([umiImageFile]).catch((err) => { throw err; });
  const imageUri = Array.isArray(imageUris) ? imageUris[0] : imageUris;
  console.log("Image URI:", imageUri);

  // 4) Create metadata JSON and upload
  const metadata = {
    name: "Example Token (Token-2022)",
    symbol: "EXMPL2022",
    description: "An example Token-2022 token created via spl-token + Metaplex metadata (Devnet)",
    image: imageUri,
  };

  console.log("Uploading metadata JSON to Arweave...");
  const metadataUri = await umi.uploader.uploadJson(metadata).catch((err) => { throw err; });
  console.log("Metadata URI:", metadataUri);

  //-------------------- TOKEN-2022: create mint, ATA, mint tokens --------------------
  //We'll use @solana/spl-token helpers but instruct them to use TOKEN_2022_PROGRAM_ID

  const connection = new Connection(RPC, "confirmed");

  console.log("Creating Token-2022 mint (owned by TOKEN_2022_PROGRAM_ID)...");

  // createMint(connection, payer, mintAuthority, freezeAuthority, decimals, keypair?, confirmOptions?, programId?)
  // We pass the local Keypair (web3 Keypair) as the payer and as mintAuthority.

  const decimals = 9;
  const mintPubkey = await createMint(
    connection,
    keypair,                  // payer (Keypair)
    keypair.publicKey,        // mintAuthority
    null,                     // freezeAuthority
    decimals,                 // decimals
    undefined,                // keypair (let library create a random mint account keypair)
    undefined,                // confirm options
    TOKEN_2022_PROGRAM_ID     // IMPORTANT: create mint owned by Token-2022 program
  );

  console.log("Token-2022 mint created:", mintPubkey.toBase58());

  // Create (or get) associated token account for our payer using TOKEN_2022_PROGRAM_ID
  console.log("Creating/getting associated token account (ATA) for the mint (Token-2022 ATA)...");
  const ata = await createAccount(
    connection,
    keypair,             // payer
    mintPubkey,          // mint
    keypair.publicKey,   // owner
    undefined,           // keypair (let library create random account)
    undefined,           // confirm options
    TOKEN_2022_PROGRAM_ID // IMPORTANT: derive ATA for Token-2022
  );

  console.log("Associated Token Account (ATA):", ata.toBase58());

  // Mint tokens to ATA
  const AMOUNT_TOKENS = 1000n; // human-readable tokens
  const amountSmallest = AMOUNT_TOKENS * (10n ** BigInt(decimals));

  console.log(`Minting ${AMOUNT_TOKENS} tokens (${amountSmallest} smallest units) to ATA...`);
  const mintSig = await mintTo(
    connection,
    keypair,             // payer
    mintPubkey,          // mint
    ata,                 // destination
    keypair,             // authority (mint authority)
    amountSmallest,      // amount (BigInt supported)
    [],                  // multiSigners
    undefined,           // confirm options
    TOKEN_2022_PROGRAM_ID // IMPORTANT: mint using Token-2022 program
  );

  console.log("mintTo tx signature:", mintSig);
  console.log(`Explorer tx: https://explorer.solana.com/tx/${mintSig}?cluster=${CLUSTER}`);

  // -------------------- Metaplex metadata: create on-chain metadata account pointing to metadataUri --------------------
  // NOTE: This creates a Metaplex metadata account (Token Metadata program) that points to the off-chain JSON.
  // It is NOT the "on-mint metadata pointer extension" (that requires special mint initialization with extension space).
  console.log("Creating on-chain Metaplex Metadata (createV1) pointing to uploaded metadataUri...");
  // createV1 was provided by mpl-token-metadata library (UMI plugin). Use it with umi.
  // We rely on umi to sign & send the TX; the mint exists already (Token-2022 mint).
  const { createV1 } = await import("@metaplex-foundation/mpl-token-metadata");
  // Note: some packaging environments require calling createV1(umi, {...}). We'll build and send via umi.

  const createMetaIx = createV1(umi, {
    mint: mintPubkey,
    name: metadata.name,
    uri: metadataUri,
    symbol: metadata.symbol,
    sellerFeeBasisPoints: percentAmount(0),
    updateAuthority: umi.identity.publicKey,
    // tokenStandard: undefined // optionally set token standard if needed
  });

  // send metadata instruction via umi (we need to ensure umi uses our keypair identity)
  const metaTx = await createMetaIx.sendAndConfirm(umi);
  const metaSig = base58.deserialize(metaTx.signature)[0];
  console.log("Metadata create tx sig:", metaSig);
  console.log(`Metadata tx explorer: https://explorer.solana.com/tx/${metaSig}?cluster=${CLUSTER}`);


  // Print results
  console.log("=== RESULT ===");
  console.log("Mint address:", mintPubkey.toBase58());
  console.log("ATA:", ata.address.toBase58());
  console.log("Mint tx:", `https://explorer.solana.com/tx/${mintSig}?cluster=${CLUSTER}`);
  console.log("Metadata tx:", `https://explorer.solana.com/tx/${metaSig}?cluster=${CLUSTER}`);
  console.log("Metadata URI (off-chain JSON):", metadataUri);

  console.log("Done.");

}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
