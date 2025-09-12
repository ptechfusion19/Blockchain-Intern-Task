// src/index.js
import dotenv from "dotenv";
dotenv.config();

import fetch from "node-fetch";
import bs58 from "bs58";
import {
  Keypair,
  Connection,
  clusterApiUrl,
  VersionedTransaction
} from "@solana/web3.js";

const LITE_API_BASE = "https://lite-api.jup.ag/swap/v1";

function exitWith(msg) {
  console.error(msg);
  process.exit(1);
}

/**
 * Attempt to build Keypair from PRIVATE_KEY env.
 * Supports:
 *  - JSON array string of bytes
 *  - base58 64-byte secret key
 *  - base58 32-byte seed
 */
function optionalKeypairFromEnv() {
  const raw = process.env.PRIVATE_KEY?.trim();
  if (!raw) return null;

  // try JSON array
  try {
    const maybeArray = JSON.parse(raw);
    if (Array.isArray(maybeArray)) {
      const u = Uint8Array.from(maybeArray);
      if (u.length === 64) return Keypair.fromSecretKey(u);
      if (u.length === 32) return Keypair.fromSeed(u);
      exitWith(`Provided PRIVATE_KEY JSON array length ${u.length} not 32 or 64.`);
    }
  } catch (e) {
    // not JSON, continue
  }

  // try base58
  try {
    const decoded = bs58.decode(raw);
    if (decoded.length === 64) return Keypair.fromSecretKey(decoded);
    if (decoded.length === 32) return Keypair.fromSeed(decoded);
    exitWith(`Decoded PRIVATE_KEY length ${decoded.length} not 32 or 64 bytes.`);
  } catch (e) {
    exitWith("Failed to decode PRIVATE_KEY as base58 or parse JSON array. Error: " + e.message);
  }
}

/**
 * convert human ui amount (string/number) to atomic BigInt using decimals
 */
function uiAmountToAmount(uiAmount, decimals) {
  const s = uiAmount.toString();
  const parts = s.split(".");
  const whole = parts[0] || "0";
  const frac = parts[1] || "";
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  const combined = whole + fracPadded;
  const normalized = combined.replace(/^0+(?=\d)|^$/, "0");
  return BigInt(normalized);
}

async function getQuote(params) {
  const q = new URL(`${LITE_API_BASE}/quote`);
  q.searchParams.append("inputMint", params.inputMint);
  q.searchParams.append("outputMint", params.outputMint);
  q.searchParams.append("amount", params.amount.toString());
  q.searchParams.append("slippageBps", String(params.slippageBps || 50));
  if (params.restrictIntermediateTokens) q.searchParams.append("restrictIntermediateTokens", "true");
  if (params.onlyDirectRoutes) q.searchParams.append("onlyDirectRoutes", "true");
  if (params.maxAccounts) q.searchParams.append("maxAccounts", String(params.maxAccounts));

  const res = await fetch(q.toString());
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Quote request failed: ${res.status} ${res.statusText} - ${txt}`);
  }
  return res.json();
}

async function buildSwap(quoteResponse, userPublicKey) {
  const url = `${LITE_API_BASE}/swap`;
  const body = {
    quoteResponse,
    userPublicKey
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Build swap failed: ${res.status} ${res.statusText} - ${txt}`);
  }
  return res.json();
}

/**
 * extract a top route from Jupiter's varying quote response shapes
 */
function extractTopRoute(quote) {
  if (!quote) return null;
  if (Array.isArray(quote.routes) && quote.routes.length > 0) return quote.routes[0];
  if (Array.isArray(quote.routePlan) && quote.routePlan.length > 0) return quote.routePlan[0];
  if (Array.isArray(quote.data?.routes) && quote.data.routes.length > 0) return quote.data.routes[0];
  return null;
}

/**
 * unsigned simulation via RPC: use the base64 tx returned by Jupiter and call simulateTransaction with sigVerify=false
 */
async function simulateUnsignedRpc(base64Tx, rpcUrl) {
  const rpcPayload = {
    jsonrpc: "2.0",
    id: 1,
    method: "simulateTransaction",
    params: [base64Tx, { "sigVerify": false, "commitment": "confirmed" }]
  };
  const r = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(rpcPayload)
  });
  return r.json();
}

async function main() {
  console.log("Jupiter Swap simulation (signed OR unsigned/public-key-only)");

  const kp = optionalKeypairFromEnv(); // may be null
  const hasPrivateKey = !!kp;
  const publicKeyFromEnv = (process.env.PUBLIC_KEY || "").trim();

  if (!hasPrivateKey && !publicKeyFromEnv) {
    exitWith("No PRIVATE_KEY and no PUBLIC_KEY provided in .env. Provide either PRIVATE_KEY (to sign) or PUBLIC_KEY (to simulate unsigned).");
  }

  const userPublicKey = hasPrivateKey ? kp.publicKey.toBase58() : publicKeyFromEnv;
  console.log("Using userPublicKey:", userPublicKey);
  console.log("Signing enabled:", hasPrivateKey);

  const RPC_URL = process.env.RPC_URL || clusterApiUrl("mainnet-beta");
  const connection = new Connection(RPC_URL, "confirmed");
  console.log("RPC:", RPC_URL);

  // swap params from env
  const inputMint = process.env.INPUT_MINT;
  const outputMint = process.env.OUTPUT_MINT;
  const uiAmountStr = process.env.AMOUNT_UI;
  const inputDecimals = parseInt(process.env.INPUT_DECIMALS || "9");
  const slippageBps = parseInt(process.env.SLIPPAGE_BPS || "50");
  const restrictIntermediate = (process.env.RESTRICT_INTERMEDIATE || "true") === "true";

  if (!inputMint || !outputMint || !uiAmountStr) {
    exitWith("Please set INPUT_MINT, OUTPUT_MINT, and AMOUNT_UI in .env");
  }

  const amount = uiAmountToAmount(uiAmountStr, inputDecimals);
  console.log(`Requesting quote: ${uiAmountStr} (atomic: ${amount.toString()}) from ${inputMint} -> ${outputMint}`);

  // 1) get quote
  const quote = await getQuote({
    inputMint,
    outputMint,
    amount,
    slippageBps,
    restrictIntermediateTokens: restrictIntermediate
  });

  const top = extractTopRoute(quote);
  if (!top) {
    console.error("No route found in quote. Full quote response:");
    console.log(JSON.stringify(quote, null, 2));
    return;
  }

  // unwrap route plan shape if needed
  const routeInfo = top.swapInfo ? top.swapInfo : top;

  console.log("=== Top route summary ===");
  console.log("inAmount:", quote.inAmount ?? routeInfo.inAmount);
  console.log("outAmount:", quote.outAmount ?? routeInfo.outAmount);
  console.log("swapUsdValue:", quote.swapUsdValue ?? "N/A");
  if (routeInfo.ammKey) console.log("AMM:", routeInfo.ammKey);
  if (routeInfo.label) console.log("Label:", routeInfo.label);
  if (top.percent !== undefined) console.log("Percent routed here:", top.percent);
  console.log("priceImpactPct:", quote.priceImpactPct ?? "N/A");
  console.log("=========================");

  // 2) build swap (Jupiter). Provide the selected userPublicKey
  const swapResp = await buildSwap(quote, userPublicKey);

  if (!swapResp || (!swapResp.swapTransaction && !swapResp.swapInstructions)) {
    console.error("Build swap response missing swapTransaction or swapInstructions. Full response:");
    console.log(JSON.stringify(swapResp, null, 2));
    return;
  }

  // Prefer full serialized transaction if provided
  if (swapResp.swapTransaction) {
    const txBase64 = swapResp.swapTransaction;

    if (hasPrivateKey) {
      // Signed flow: deserialize, sign locally, then simulate signed transaction (best fidelity)
      console.log("swapTransaction received. Deserializing and signing locally...");

      let vtx;
      try {
        const buf = Buffer.from(txBase64, "base64");
        vtx = VersionedTransaction.deserialize(buf);
      } catch (e) {
        console.error("Failed to deserialize VersionedTransaction:", e.message);
        return;
      }

      try {
        vtx.sign([kp]);
      } catch (e) {
        console.error("Failed to sign transaction:", e.message);
        return;
      }

      console.log("Signed locally. Attempting connection.simulateTransaction...");
      try {
        const sim = await connection.simulateTransaction(vtx);
        console.log("=== Simulation result (signed) ===");
        console.log(JSON.stringify(sim, null, 2));
        if (sim.value?.logs) {
          console.log("=== Logs ===");
          for (const l of sim.value.logs) console.log(l);
        }
      } catch (e) {
        console.warn("connection.simulateTransaction failed:", e.message);
        // fallback to raw RPC simulate with signed serialized tx
        try {
          const signedB64 = vtx.serialize().toString("base64");
          const j = await simulateUnsignedRpc(signedB64, RPC_URL); // note: using same helper; when signed, sigVerify false not required
          console.log("=== RPC simulate (signed fallback) ===");
          console.log(JSON.stringify(j, null, 2));
          const logs = j.result?.value?.logs ?? j?.result?.logs ?? j?.value?.logs;
          if (logs) {
            console.log("=== Logs ===");
            for (const l of logs) console.log(l);
          }
        } catch (e2) {
          console.error("Signed fallback simulation failed:", e2.message);
        }
      }

    } else {
      // Unsigned/public-key mode: Prefer deserializing to VersionedTransaction
      // and using connection.simulateTransaction(vtx) which sets the RPC payload properly.
      console.log("swapTransaction received. Attempting unsigned simulation via connection.simulateTransaction (preferred)...");

      try {
        // try to deserialize into VersionedTransaction
        const buf = Buffer.from(txBase64, "base64");
        const vtxUnsigned = VersionedTransaction.deserialize(buf);

        // NOTE: this transaction has no valid signatures; some RPCs will still verify
        // signatures and fail. However using connection.simulateTransaction lets web3
        // set the right encoding and fields.
        const sim = await connection.simulateTransaction(vtxUnsigned);
        console.log("=== Simulation result (via connection.simulateTransaction) ===");
        console.log(JSON.stringify(sim, null, 2));
        const logs = sim.value?.logs ?? sim?.logs ?? null;
        if (logs) {
          console.log("=== Logs ===");
          for (const l of logs) console.log(l);
        } else {
          console.log("No logs returned by connection.simulateTransaction.");
        }
      } catch (e) {
        console.warn("connection.simulateTransaction failed or returned no logs:", e?.message ?? e);
        console.log("Falling back to raw RPC simulateTransaction with sigVerify=false (may be blocked by some providers).");

        try {
          const j = await simulateUnsignedRpc(txBase64, RPC_URL);
          console.log("=== RPC simulate (unsigned) response (fallback) ===");
          console.log(JSON.stringify(j, null, 2));
          const logs = j.result?.value?.logs ?? j?.result?.logs ?? j?.value?.logs;
          if (logs) {
            console.log("=== Logs ===");
            for (const l of logs) console.log(l);
          } else {
            console.log("No logs returned in unsigned RPC simulation. This RPC provider may not support sigVerify=false or may require different payloads.");
            console.log("Try using a standard Solana RPC (https://api.mainnet-beta.solana.com) or other providers (QuickNode, Alchemy, Helius with the correct method).");
          }
        } catch (e2) {
          console.error("Unsigned RPC simulate fallback also failed:", e2?.message ?? e2);
          console.log("Recommendation: try a different RPC_URL (e.g., https://api.mainnet-beta.solana.com) in your .env and re-run.");
        }
      }
    }

  } else if (swapResp.swapInstructions) {
    // In case Jupiter returned instructions rather than a full tx.
    console.log("swapInstructions returned instead of a serialized transaction.");
    console.log("You can compose a VersionedTransaction locally from these instructions, add ALTs if provided, sign (if you have key) and simulate.");
    console.log("swapInstructions (truncated):");
    console.log(JSON.stringify(swapResp.swapInstructions, null, 2).slice(0, 800));
    console.log("\nIf you want, I can provide code to compose VersionedTransaction from swapInstructions and simulate (signed or unsigned).");
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
