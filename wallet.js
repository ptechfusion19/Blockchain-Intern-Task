import fs from 'fs/promises';
import path from 'path';
import {
  Keypair,
  Connection,
  clusterApiUrl,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction
} from '@solana/web3.js';

const KEYPAIRS_DIR = path.join(process.cwd(), 'keypairs');
const CLUSTER = 'devnet';

async function ensureKeypairDir() {
  await fs.mkdir(KEYPAIRS_DIR, { recursive: true });
}

async function saveKeypair(kp, name) {
  await ensureKeypairDir();
  const outPath = path.join(KEYPAIRS_DIR, `${name}.json`);
  await fs.writeFile(outPath, JSON.stringify(Array.from(kp.secretKey)));
  return outPath;
}

async function loadKeypairFromFile(filePath) {
  const raw = await fs.readFile(path.resolve(filePath), 'utf8');
  const arr = JSON.parse(raw);
  return Keypair.fromSecretKey(Uint8Array.from(arr));
}

// try load keypair file; if fails, return null
async function tryLoadKeypair(fileOrString) {
  try {
    const maybePath = path.resolve(fileOrString);
    const raw = await fs.readFile(maybePath, 'utf8');
    const arr = JSON.parse(raw);
    return Keypair.fromSecretKey(Uint8Array.from(arr));
  } catch (e) {
    return null;
  }
}

// convert argument to PublicKey; accepts either path-to-keypair or pubkey string
async function toPublicKey(arg) {
  const kp = await tryLoadKeypair(arg);
  if (kp) return kp.publicKey;
  return new PublicKey(arg);
}

function solConn() {
  return new Connection(clusterApiUrl(CLUSTER), 'confirmed');
}

async function cmdGenerate(name = 'wallet') {
  const kp = Keypair.generate();
  const outPath = await saveKeypair(kp, name);
  console.log(`Saved keypair to ${outPath}`);
  console.log(`Public key: ${kp.publicKey.toBase58()}`);
  console.log('Keep this file safe. It contains your private key.');
}

async function cmdAirdrop(targetArg, amountSol = 1) {
  if (!targetArg) {
    console.error('Usage: node wallet.js airdrop <pubkey-or-keypair-path> [amountSOL]');
    process.exit(1);
  }
  const conn = solConn();
  const pubkey = await toPublicKey(targetArg);
  const lamports = Math.floor(Number(amountSol) * LAMPORTS_PER_SOL);
  console.log(`Requesting airdrop of ${amountSol} SOL (${lamports} lamports) to ${pubkey.toBase58()} on ${CLUSTER}...`);
  const sig = await conn.requestAirdrop(pubkey, lamports);
  // confirm using latest blockhash
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('finalized');
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight });
  console.log('Airdrop confirmed. Signature:', sig);
}

async function cmdSend(senderPath, recipientArg, amountSol = 0.01) {
  if (!senderPath || !recipientArg) {
    console.error('Usage: node wallet.js send <sender-keypair-path> <recipient-pubkey> [amountSOL]');
    process.exit(1);
  }

  const sender = await loadKeypairFromFile(senderPath);
  const conn = solConn();
  const recipient = await toPublicKey(recipientArg);
  const lamports = Math.floor(Number(amountSol) * LAMPORTS_PER_SOL);

  console.log(`Sending ${amountSol} SOL (${lamports} lamports) from ${sender.publicKey.toBase58()} to ${recipient.toBase58()}...`);

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: sender.publicKey,
      toPubkey: recipient,
      lamports,
    })
  );

  const sig = await sendAndConfirmTransaction(conn, tx, [sender]);
  console.log('Transaction confirmed. Signature:', sig);
}

async function cmdBalance(arg) {
  if (!arg) {
    console.error('Usage: node wallet.js balance <pubkey-or-keypair-path>');
    process.exit(1);
  }
  const conn = solConn();
  const pubkey = await toPublicKey(arg);
  const bal = await conn.getBalance(pubkey, 'confirmed');
  console.log(`${pubkey.toBase58()} balance: ${bal} lamports = ${bal / LAMPORTS_PER_SOL} SOL`);
}

async function cmdHistory(arg, limit = 10) {
  if (!arg) {
    console.error('Usage: node wallet.js history <pubkey-or-keypair-path> [limit]');
    process.exit(1);
  }
  const conn = solConn();
  const pubkey = await toPublicKey(arg);
  const sigInfos = await conn.getSignaturesForAddress(pubkey, { limit: Number(limit) });
  if (!sigInfos || sigInfos.length === 0) {
    console.log('No recent transactions found for', pubkey.toBase58());
    return;
  }

  console.log(`Last ${sigInfos.length} signatures for ${pubkey.toBase58()}:`);
  for (const info of sigInfos) {
    const sig = info.signature;
    // try to fetch parsed transaction for human readable info
    const parsed = await conn.getParsedTransaction(sig, 'confirmed');
    const when = info.blockTime ? new Date(info.blockTime * 1000).toISOString() : 'unknown';
    const status = info.err ? 'failed' : 'success';
    // simple description
    let desc = '';
    if (parsed && parsed.transaction && parsed.transaction.message.instructions) {
      const ix = parsed.transaction.message.instructions[0];
      if (ix.program === 'system' && ix.parsed && ix.parsed.type === 'transfer') {
        const transfer = ix.parsed.info;
        desc = `transfer ${transfer.lamports} lamports from ${transfer.source} to ${transfer.destination}`;
      } else {
        desc = `${ix.program} instruction`;
      }
    } else {
      desc = 'could not parse instruction (maybe non-parsed)';
    }

    console.log(`- ${sig} | ${when} | ${status} | ${desc}`);
  }
}

async function showHelp() {
  console.log(`
Usage: node wallet.js <command> [args]

Commands:
  generate <name>                       Create keypair and save to ./keypairs/<name>.json
  airdrop <pubkey-or-keypair-path> [amtSOL]
                                        Request devnet airdrop (default 1 SOL)
  send <sender-keypair-path> <recipient-pubkey> [amtSOL]
                                        Send SOL (signed locally)
  balance <pubkey-or-keypair-path>      Show balance for pubkey or saved keypair
  history <pubkey-or-keypair-path> [n]  Show last n transactions (default 10)
  help                                  Show this help

Examples:
  node wallet.js generate alice
  node wallet.js airdrop ./keypairs/alice.json 2
  node wallet.js balance ./keypairs/alice.json
  node wallet.js send ./keypairs/alice.json <recipientPubKey> 0.25
  node wallet.js history ./keypairs/alice.json 5
`);
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  try {
    switch ((cmd || 'help').toLowerCase()) {
      case 'generate':
        await cmdGenerate(rest[0] ?? 'wallet');
        break;
      case 'airdrop':
        await cmdAirdrop(rest[0], rest[1] ?? 1);
        break;
      case 'send':
        await cmdSend(rest[0], rest[1], rest[2] ?? 0.01);
        break;
      case 'balance':
        await cmdBalance(rest[0]);
        break;
      case 'history':
        await cmdHistory(rest[0], rest[1] ?? 10);
        break;
      default:
        await showHelp();
    }
  } catch (err) {
    console.error('Error:', err.message ?? err);
    process.exit(1);
  }
}

main();
