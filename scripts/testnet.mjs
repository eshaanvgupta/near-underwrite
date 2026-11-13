import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { Account, JsonRpcProvider, KeyPair, actions } from "near-api-js";
import { publicationDigests } from "../packages/shared/dist/index.js";

if (!process.argv.includes("--send")) { console.log("Plan: create one independent faucet-funded .testnet account; deploy and initialize registry; publish the saved public mainnet report and one linked revision; record code identity, access keys, and final transaction results. Run pnpm demo:testnet --send to execute. No mainnet writes or AI calls."); process.exit(0); }
const rpcUrl = "https://test.rpc.fastnear.com";
async function rpc(method, params) {
  const response = await fetch(rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: "underwrite", method, params }), signal: AbortSignal.timeout(20000) });
  const body = await response.json(); if (!response.ok || body.error) throw new Error(JSON.stringify(body.error ?? { status: response.status })); return body.result;
}
function base58(bytes) {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let n = BigInt("0x" + bytes.toString("hex")), result = "";
  while (n) { result = alphabet[Number(n % 58n)] + result; n /= 58n; }
  for (const byte of bytes) { if (byte) break; result = "1" + result; }
  return result;
}
await mkdir(new URL("../runtime/", import.meta.url), { recursive: true });
const secretPath = new URL("../runtime/testnet-credentials.json", import.meta.url);
let credentials;
if (existsSync(secretPath)) credentials = JSON.parse(await readFile(secretPath, "utf8"));
else {
  const pair = KeyPair.fromRandom("ed25519");
  credentials = { account_id: "underwrite-" + Date.now().toString(36) + ".testnet", public_key: pair.getPublicKey().toString(), private_key: pair.toString() };
  await writeFile(secretPath, JSON.stringify(credentials), { mode: 0o600 });
}
if ((await rpc("status", [])).chain_id !== "testnet") throw new Error("Wrong network");
let accountState;
try { accountState = await rpc("query", { request_type: "view_account", finality: "final", account_id: credentials.account_id }); }
catch (error) {
  if (!/UNKNOWN_ACCOUNT|does not exist/.test(error.message)) throw error;
  if (credentials.faucet_requested) throw new Error("Faucet was previously attempted; inspect runtime state before retrying");
  credentials.faucet_requested = true; await writeFile(secretPath, JSON.stringify(credentials), { mode: 0o600 });
  const response = await fetch("https://helper.nearprotocol.com/account", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ newAccountId: credentials.account_id, newAccountPublicKey: credentials.public_key }), signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error("Testnet faucet unavailable: HTTP " + response.status);
  accountState = await rpc("query", { request_type: "view_account", finality: "final", account_id: credentials.account_id });
}
const wasm = await readFile(new URL("../contracts/registry/target/wasm32-unknown-unknown/release/near_underwrite_registry.wasm", import.meta.url));
const wasmSha256 = createHash("sha256").update(wasm).digest("hex");
const codeHash = base58(Buffer.from(wasmSha256, "hex"));
const provider = new JsonRpcProvider({ url: rpcUrl });
const account = new Account(credentials.account_id, provider, credentials.private_key);
const outputPath = new URL("../evidence/deployment.json", import.meta.url);
const saved = existsSync(outputPath) ? JSON.parse(await readFile(outputPath, "utf8")) : {
  network: "testnet", rpc_url: rpcUrl, contract_id: credentials.account_id,
  source_commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  code_hash: codeHash, wasm_sha256: wasmSha256, transactions: [], publications: [],
};
async function send(method, txActions) {
  const result = await account.signAndSendTransaction({ receiverId: account.accountId, actions: txActions, waitUntil: "FINAL", throwOnFailure: false });
  const failures = [result.status, ...(result.receipts_outcome ?? []).map(item => item.outcome.status)].filter(status => status && typeof status === "object" && "Failure" in status);
  const record = { method, transaction_hash: result.transaction.hash, signer_id: account.accountId, status: failures.length ? "failed" : "confirmed", logs: (result.receipts_outcome ?? []).flatMap(item => item.outcome.logs), receipt_block_hashes: (result.receipts_outcome ?? []).map(item => item.block_hash) };
  saved.transactions.push(record); await writeFile(outputPath, JSON.stringify(saved, null, 2));
  if (failures.length) throw new Error("Testnet transaction failed: " + JSON.stringify(failures));
  console.log(JSON.stringify(record));
  return result.status.SuccessValue ? JSON.parse(Buffer.from(result.status.SuccessValue, "base64").toString()) : null;
}
if (accountState.code_hash !== codeHash) {
  if (saved.transactions.length) throw new Error("Existing transaction history requires manual inspection before replacing code");
  await send("deploy_and_initialize", [actions.deployContract(wasm), actions.functionCall("new", {}, 60000000000000n, 0n)]);
}
for (const revision of [1, 2]) {
  if (saved.publications.length >= revision) continue;
  const bundle = JSON.parse(await readFile(new URL("../evidence/report.json", import.meta.url), "utf8"));
  if (revision === 2) { bundle.parent_publication_id = saved.publications[0].publication_id; bundle.report_id = crypto.randomUUID(); bundle.created_at = new Date().toISOString(); bundle.notes += " Revision: the interpretation is explicitly conditional on measured capture; source observations and arithmetic remain unchanged."; }
  const manifest = { snapshot_id: bundle.snapshot.id, source_digests: bundle.snapshot.source_digests, observations: bundle.snapshot.observations.map(item => ({ metric_id: item.metric_id, raw_response_digest: item.raw_response_digest })) };
  const digests = await publicationDigests(bundle, manifest, { formula_version: bundle.formula_version, assumptions: bundle.assumptions });
  const publication = await send("publish_revision_" + revision, [actions.functionCall("publish", { ...digests, schema_version: bundle.schema_version, parent_id: bundle.parent_publication_id }, 60000000000000n, 100000000000000000000000n)]);
  saved.publications.push(publication);
  await writeFile(new URL("../evidence/report" + (revision === 2 ? "-v2" : "") + ".json", import.meta.url), JSON.stringify(bundle, null, 2) + "\n");
  await writeFile(outputPath, JSON.stringify(saved, null, 2));
}
const finalAccount = await rpc("query", { request_type: "view_account", finality: "final", account_id: account.accountId });
if (finalAccount.code_hash !== codeHash) throw new Error("Deployed code hash mismatch");
saved.access_keys = (await rpc("query", { request_type: "view_access_key_list", finality: "final", account_id: account.accountId })).keys;
saved.upgrade_authority = "The locally retained full-access deployment key can replace code and alter account keys. The release does not delete or renounce that authority.";
saved.verified_at = new Date().toISOString();
await writeFile(outputPath, JSON.stringify(saved, null, 2));
await mkdir(new URL("../apps/web/public/evidence/", import.meta.url), { recursive: true });
for (const file of ["deployment.json", "report.json", "report-v2.json"]) await copyFile(new URL("../evidence/" + file, import.meta.url), new URL("../apps/web/public/evidence/" + file, import.meta.url));
console.log(JSON.stringify({ status: "confirmed", contract_id: account.accountId, code_hash: codeHash, publications: saved.publications.map(item => item.publication_id) }));
