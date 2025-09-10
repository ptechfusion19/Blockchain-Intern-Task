import 'dotenv/config';
import bs58 from 'bs58';
import {
  Connection,
  clusterApiUrl,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';

async function main() {
  // read args/env
  const toArg = process.argv[2] || process.env.TO_PUBLIC_KEY;
  const amountArg = process.argv[3] || process.env.AMOUNT_SOL || '0.001';
  if (!toArg) {
    console.error('Usage: node scripts/sendSol.js <TO_PUBLIC_KEY> <AMOUNT_SOL>');
    process.exit(1);
  }

  const payer = process.env.PHANTOM_PRIVATE_KEY_BASE58;
  if (!payer) {
    console.error('ERROR: set PHANTOM_PRIVATE_KEY_BASE58 in your .env file');
    process.exit(1);
  }

  // decode base58 -> Uint8Array
  const secretBytes = bs58.decode(payer);

  let keypair;
  if (secretBytes.length === 64) {
    // full secretKey (private + public)
    keypair = Keypair.fromSecretKey(secretBytes);
  } else if (secretBytes.length === 32) {
    // a 32-byte seed -> derive Keypair
    keypair = Keypair.fromSeed(secretBytes);
  } else {
    console.error('Unexpected private key length:', secretBytes.length);
    console.error('Expected 32 or 64 bytes after base58 decode.');
    process.exit(1);
  }

  console.log('Using wallet pubkey:', keypair.publicKey.toBase58());

  // prepare connection (devnet)
  const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');

  const toPublicKey = new PublicKey(toArg);
  const lamports = Math.round(parseFloat(amountArg) * LAMPORTS_PER_SOL);

  // build transfer instruction
  const instruction = SystemProgram.transfer({
    fromPubkey: keypair.publicKey,
    toPubkey: toPublicKey,
    lamports,
  });

  // get latest blockhash + lastValidBlockHeight
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');

  // create TransactionMessage and compile to V0 message
  const messageV0 = new TransactionMessage({
    payerKey: keypair.publicKey,
    recentBlockhash: blockhash,
    instructions: [instruction],
  }).compileToV0Message();

  // make a VersionedTransaction from messageV0
  const versionedTx = new VersionedTransaction(messageV0);

  // sign with your local Keypair
  versionedTx.sign([keypair]);

  // serialize and send
  const serialized = versionedTx.serialize();
  const signature = await connection.sendRawTransaction(serialized, {
    skipPreflight: false,
  });

  console.log('Submitted, signature:', signature);
  console.log('Waiting for confirmation...');

  // Confirm using blockhash + lastValidBlockHeight (recommended)
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');

  console.log(`Transaction confirmed: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
