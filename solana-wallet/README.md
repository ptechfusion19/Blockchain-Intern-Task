# Solana Wallet (Devnet)

A command-line wallet for the [Solana blockchain](https://solana.com/), built with [@solana/web3.js](https://github.com/solana-labs/solana-web3.js).  
This wallet works on **devnet** for learning and testing purposes.  

⚠️ **Not for production use**. The `keypairs/*.json` files contain raw private keys — never commit or share them.  

---

## Features
- Generate new Solana keypairs
- Request SOL airdrops on devnet
- Send SOL between wallets
- Check balances
- View recent transaction history

---

## Prerequisites
- Node.js **v16+**
- NPM (comes with Node)

---

## Setup

```bash
# clone or create the project
mkdir solana-min-wallet
cd solana-min-wallet
```

# initialize and install dependencies
```
npm init -y
npm install @solana/web3.js
```

### Enable ES modules (required for import/export)
## Open package.json and add this line at the top level:
```
"type": "module",
```

Save the wallet script as `wallet.js` (see [wallet.js](./wallet.js)).

---

## Usage

Run commands with:

```bash
node wallet.js <command> [args]
```

### Commands

#### 1. Generate a new wallet

```bash
node wallet.js generate <name>
```

* Creates `./keypairs/<name>.json`
* Prints the public key

#### 2. Check balance

```bash
node wallet.js balance ./keypairs/<name>.json
```

#### 3. Airdrop SOL (devnet only)

```bash
node wallet.js airdrop ./keypairs/<name>.json 2
```

Requests 2 SOL's from the devnet faucet.

#### 4. Send SOL

```bash
node wallet.js send ./keypairs/<name>.json <recipient-pubkey> 0.25
```

Sends 0.25 SOL from sender to the recipient.

#### 5. Transaction history

```bash
node wallet.js history ./keypairs/<name>.json 5
```

Shows the last 5 transactions for Wallet Address.

---

## Explorer Links

* Account: [https://explorer.solana.com/address/\<PUBLIC\_KEY>?cluster=devnet](https://explorer.solana.com/?cluster=devnet)
* Transaction: [https://explorer.solana.com/tx/<SIGNATURE>?cluster=devnet](https://explorer.solana.com/?cluster=devnet)

---

## Security

* `keypairs/*.json` contain **raw secret keys**.
* For real funds, use a hardware wallet (Ledger, etc.).

---

## Example Workflow

```bash
# generate wallets
node wallet.js generate Ehtasham
node wallet.js generate Usama

# airdrop to Ehtasham
node wallet.js airdrop ./keypairs/Ehtasham.json 2

# check balances
node wallet.js balance ./keypairs/Ehtasham.json
node wallet.js balance ./keypairs/Usama.json

# send SOL
node wallet.js send ./keypairs/Ehtasham.json <Usama-public-key> 0.5

# verify balances again
node wallet.js balance ./keypairs/Ehtasham.json
node wallet.js balance ./keypairs/Usama.json

# view history
node wallet.js history ./keypairs/Ehtasham.json 5
```

## License

MIT — use freely for learning and testing.
