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

import {
  createFungible,
} from "@metaplex-foundation/mpl-token-metadata";

import {
  createTokenIfMissing,
  findAssociatedTokenPda,
  getSplAssociatedTokenProgramId,
  mintTokensTo,
} from "@metaplex-foundation/mpl-toolbox";

import { base58 } from "@metaplex-foundation/umi/serializers";
import {Keypair} from "@solana/web3.js";
import bs58 from 'bs58';

const payer = process.env.WALLET;
const secretKey = bs58.decode(payer);
const keypair = Keypair.fromSecretKey(new Uint8Array(secretKey));
console.log(keypair);
const RPC = "https://api.devnet.solana.com";
const IMAGE_FILE = path.resolve(process.cwd(), "./image.png"); // ensure this exists


async function main() {
  // 1) Umi client with token-metadata, toolbox and irys uploader
  const umi = createUmi(RPC)
  .use(mplTokenMetadata())
  .use(mplToolbox())
  .use(irysUploader());
  const kp = umi.eddsa.createKeypairFromSecretKey(keypair.secretKey);
umi.use(keypairIdentity(kp));

    // robust helper to stringify public keys / addresses
  function pubKeyToString(pk) {
    if (!pk) return String(pk);
    if (typeof pk === "string") return pk;
    if (typeof pk.toBase58 === "function") return pk.toBase58();
    if (typeof pk.toString === "function") return pk.toString();
    return String(pk);
  }

  console.log("Using identity:", pubKeyToString(umi.identity.publicKey));


  // 4) Upload image to Arweave via Irys
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

  // 5) Create metadata JSON and upload
  const metadata = {
    name: "Example Token",
    symbol: "EXMPL",
    description: "An example token created via Metaplex Umi + Irys uploader",
    image: imageUri,
  };

  console.log("Uploading metadata JSON to Arweave...");
  const metadataUri = await umi.uploader.uploadJson(metadata).catch((err) => { throw err; });
  console.log("Metadata URI:", metadataUri);

  // 6) Create mint + token metadata on-chain
  console.log("Generating mint signer and preparing createFungible instruction...");
  const mintSigner = generateSigner(umi);

  const createFungibleIx = createFungible(umi, {
    mint: mintSigner,
    name: metadata.name,
    uri: metadataUri,
    sellerFeeBasisPoints: percentAmount(0),
    decimals: 9,
  });

  // 7) Ensure ATA exists
  const createTokenIx = createTokenIfMissing(umi, {
    mint: mintSigner.publicKey,
    owner: umi.identity.publicKey,
    ataProgram: getSplAssociatedTokenProgramId(umi),
  });

  // 8) Mint tokens to ATA (example: 1000 tokens -> amounts in smallest units: amount * 10**decimals)
  const AMOUNT = 1000n; // tokens
  const decimals = 9n;
  const amountSmallest = AMOUNT * (10n ** decimals);

  const mintTokensIx = mintTokensTo(umi, {
    mint: mintSigner.publicKey,
    token: findAssociatedTokenPda(umi, {
      mint: mintSigner.publicKey,
      owner: umi.identity.publicKey,
    }),
    amount: amountSmallest,
  });

  // 9) Chain instructions and send
  console.log("Chaining instructions and sending transaction...");
  const tx = await createFungibleIx
    .add(createTokenIx)
    .add(mintTokensIx)
    .sendAndConfirm(umi);

  // 10) Print tx signature and explorer URL
  const sig = base58.deserialize(tx.signature)[0];
  console.log("Transaction signature (raw base58):", sig);
  const explorerUrl = `https://explorer.solana.com/tx/${sig}?cluster=Devnet`;
  console.log("Explorer URL:", explorerUrl);

  // Also print new mint address and ATA (robust to different publicKey shapes)
  console.log("Mint address:", pubKeyToString(mintSigner.publicKey));
  const ata = findAssociatedTokenPda(umi, { mint: mintSigner.publicKey, owner: umi.identity.publicKey });
  console.log("Associated Token Account (ATA):", pubKeyToString(ata));

}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
