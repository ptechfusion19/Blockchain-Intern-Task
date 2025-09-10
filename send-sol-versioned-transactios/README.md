# send-sol-devnet

A Node.js project that demonstrates sending SOL on **Devnet** using a private key exported from the Phantom wallet (base58). The example builds a **versioned (v0) transaction**, signs it locally with the decoded private key, and submits it to a Devnet RPC.

> **Security: read this first**
>
> Exporting a private key from Phantom gives full control of that wallet. **Never** share the private key or commit it into source control. Use this project only for testing on Devnet or throwaway accounts. Prefer browser-based signing (Phantom extension) or a secure KMS for production.

---

## What this repo contains

* `scripts/sendSol.js` — main script that: reads a base58 private key from `.env`, decodes it into a Keypair, builds a VersionedTransaction (v0) for a `SystemProgram.transfer`, signs, sends and confirms the transaction.
* `.env` — **not included**; you must create it locally with your private key and optional defaults.

---

## Requirements

* Node.js 16+ (Node 18+ recommended)
* npm
* A Phantom-exported private key in **base58** format (Devnet/test use only)

---

## Quick setup

```bash
# create project folder & init (if you haven't already)
mkdir send-sol-devnet && cd send-sol-devnet
npm init -y

# install deps
npm install @solana/web3.js bs58 dotenv
```

Create a `scripts` folder and place `sendSol.js` there (the project script provided with the example).

---

## .env (example)

Create a `.env` file in the project root with these variables (DO NOT commit):

```text
# paste the base58 private key exported from Phantom (devnet/testing only)
PHANTOM_PRIVATE_KEY_BASE58=your_base58_private_key_here

# optional defaults used by the script
TO_PUBLIC_KEY=RecipientPublicKeyBase58
AMOUNT_SOL=0.001
```

Notes about the exported private key format:

* If the base58 decode yields **64 bytes**, it will be treated as a full `secretKey` (private + public) and used with `Keypair.fromSecretKey()`.
* If the base58 decode yields **32 bytes**, it will be treated as a seed and used with `Keypair.fromSeed()`.

If you exported a **mnemonic phrase** (12/24 words) instead, do not paste that here — derive a keypair securely using a proper mnemonic-to-key library if you must.

---

## File structure

```
send-sol-devnet/
├─ .env                # local, private (not in repo)
├─ package.json
├─ scripts/
│  └─ sendSol.js       # main script
└─ README.md           # this file
```

---

## Usage

Run the script either by passing the recipient and amount on the command line or using the `.env` values.

```bash
# example: send 0.002 SOL to a public key
node scripts/sendSol.js <RECIPIENT_PUBKEY> 0.002

# or rely on TO_PUBLIC_KEY and AMOUNT_SOL in .env
node scripts/sendSol.js
```

Expected output (example):

```
Using wallet pubkey: <SENDER_PUBLIC_KEY>
Submitted, signature: 5y...abc
Waiting for confirmation...
Transaction confirmed: https://explorer.solana.com/tx/5y...abc?cluster=devnet
```

---

## How it works (concise)

1. The script reads your `PHANTOM_PRIVATE_KEY_BASE58` and decodes it with `bs58` to a `Uint8Array`.
2. Depending on length (32 or 64 bytes) a `Keypair` is derived.
3. A `SystemProgram.transfer` instruction is created for the amount (converted to lamports).
4. The script fetches a recent blockhash with `getLatestBlockhash()` and compiles a `TransactionMessage`, then `.compileToV0Message()` to get `MessageV0`.
5. A `VersionedTransaction` is created and signed with the local `Keypair`.
6. The signed transaction is `serialize()`d and submitted via `sendRawTransaction`, then confirmed using `confirmTransaction` with the blockhash & `lastValidBlockHeight`.

This follows the modern **build → sign → send** flow and uses a versioned (v0) transaction so it is compatible with Address Lookup Tables.

---

## Troubleshooting & tips

* **Invalid key length**: If `bs58.decode` yields a length other than 32 or 64, you likely copied an incorrect string (extra spaces or a different format). Re-export and paste carefully.
* **Insufficient funds**: Make sure the sending account has SOL on Devnet (you can airdrop using Solana CLI or devnet faucet).
* **Invalid blockhash / expired blockhash**: Ensure you call `getLatestBlockhash()` immediately before sending; blockhashes expire rapidly.
* **Simulate before send**: For safer testing, modify the script to call `connection.simulateTransaction(...)` with the compiled (unsigned or partially signed) transaction to inspect logs and errors before broadcasting.
* **Transaction failed**: Use `connection.getTransaction(signature)` and `connection.getSignatureStatuses([signature])` to inspect failure reasons and logs.

---

## License

MIT

---

