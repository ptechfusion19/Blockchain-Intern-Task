# Solana SPL Token CLI + Simulator

A small TypeScript toolkit to create, transfer and inspect SPL tokens on Solana (devnet), plus transaction **simulation** examples for safe testing.

This repo contains:
- A CLI to `create`, `transfer`, and `balance` SPL tokens (`src/cli.ts` + `src/commands/*`)
- Simple simulator scripts for sandboxing transactions (`simulator/*`)
- Helpers to manage a local `payer.json` for devnet testing

> **Warning:** `payer.json` contains a private key. **Never** commit it or publish it. Add it to `.gitignore`.

---

## Quick start

### Prerequisites
- Node.js >= 18
- (Optional) Solana CLI (`solana`) for manual key management / airdrops
- Recommended: connect to **devnet** while testing

### Install
```bash
git clone <your-repo-url>
cd solana-spl-ts
npm install
