
---

# Solana SPL Token CLI (TypeScript)

A simple CLI tool to **create, transfer, and check balances** of SPL tokens on Solana devnet.
Built with **TypeScript, @solana/web3.js, @solana/spl-token, and yargs**.

---

## 📦 Prerequisites

* Node.js `>=18`
* Solana CLI installed & configured for devnet:

  ```sh
  solana config set --url https://api.devnet.solana.com
  ```
* Fund your wallet with some devnet SOL:

  ```sh
  solana airdrop 2
  ```

---

## ⚡ Setup

Clone and install:

```sh
git clone <your-repo-url>
cd solana-spl-ts
npm install
```

Create a `.env` file with your keypair path:

```env
KEYPAIR=./payer.json
```

Build the project:

```sh
npm run build
```

---

## 🚀 Usage

Run commands via:

```sh
npm run cli -- <command> [options]
```

### 1️⃣ Create Token

```sh
npm run cli -- create --supply 1000 --decimals 6 --disableMint false
```

* **supply** → Initial supply in human-readable units (e.g. `1000`)
* **decimals** → Token decimals (e.g. `6`)
* **disableMint** → Whether to disable future minting (`true` / `false`)

✅ Output:

* Mint address
* Associated Token Account (ATA) of payer
* Mint transaction ID
* Explorer link

---

### 2️⃣ Transfer Tokens

```sh
npm run cli -- transfer \
  --mint <MINT_ADDRESS> \
  --to <RECIPIENT_ADDRESS> \
  --amount 50 \
  --decimals 6
```

* **mint** → Token mint address
* **to** → Recipient wallet address
* **amount** → Tokens to send (in human-readable units)
* **decimals** → Same decimals as the token

✅ Output:

* Transaction signature (with explorer link)

---

### 3️⃣ Check Balances

```sh
npm run cli -- balance \
  --mint <MINT_ADDRESS> \
  --owner <OWNER_ADDRESS> \
  --decimals 6
```

* **mint** → Token mint address
* **owner** → Wallet address to check balance
* **decimals** → Same decimals as the token

✅ Output:

* Token supply
* Owner’s token account address (ATA)
* Owner’s balance (human-readable + raw base units)

---

## 🗂️ Project Structure

```
src/
 ├── cli.ts              # CLI entry point (yargs commands)
 ├── commands/
 │    ├── create.ts      # Create new SPL token
 │    ├── transfer.ts    # Transfer tokens
 │    └── balance.ts     # Check supply + balances
 └── utils/
      └── connection.ts  # Solana connection + helpers
```

---

## 🌐 Explorer

All actions can be verified on [Solana Explorer](https://explorer.solana.com/?cluster=devnet).

---

## 📜 License

MIT

---

