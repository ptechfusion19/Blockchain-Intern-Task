// src/cli.ts
import dotenv from "dotenv";
dotenv.config();

import yargs from "yargs";
import { hideBin } from "yargs/helpers";

// Import commands
import * as createCmd from "./commands/create";
import * as transferCmd from "./commands/transfer";
import * as balanceCmd from "./commands/balance";

yargs(hideBin(process.argv))
  .scriptName("solana-token")
  .command(createCmd)
  .command(transferCmd)
  .command(balanceCmd)
  .demandCommand(1, "Please specify a command")
  .help()
  .parse();
