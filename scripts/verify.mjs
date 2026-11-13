import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { calculateModel, canonicalJson, publicationDigests } from "../packages/shared/dist/index.js";
const args = process.argv.slice(2).filter(value => value !== "--");
async function rpc(url, method, params) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: "verify", method, params }), signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error("RPC HTTP " + response.status);
  const body = await response.json(); if (body.error) throw new Error(JSON.stringify(body.error)); return body.result;
}
try {
  if (!args[0]) throw new Error("Usage: pnpm verify:bundle path/to/bundle.json [deployment.json publication_id]");
  const bundle = JSON.parse(await readFile(args[0], "utf8"));
  if (bundle.schema_version !== "near-underwrite.bundle.v1" || bundle.credential_material_included !== false) throw new Error("Unsupported bundle schema");
  const recalculated = calculateModel(bundle.snapshot, bundle.assumptions);
  if (canonicalJson(recalculated) !== canonicalJson(bundle.result)) {
    console.log(JSON.stringify({ status: "mismatching", detail: "Deterministic calculations differ" })); process.exit(1);
  }
  for (const raw of bundle.snapshot.raw_responses ?? []) {
    if (createHash("sha256").update(raw.body).digest("hex") !== raw.sha256) throw new Error("Raw response digest mismatch");
  }
  const manifest = { snapshot_id: bundle.snapshot.id, source_digests: bundle.snapshot.source_digests, observations: bundle.snapshot.observations.map(item => ({ metric_id: item.metric_id, raw_response_digest: item.raw_response_digest })) };
  const digests = await publicationDigests(bundle, manifest, { formula_version: bundle.formula_version, assumptions: bundle.assumptions });
  const result = { status: "matching", calculations: "matching", raw_responses: bundle.snapshot.raw_responses?.length ?? 0, ...digests, registry: "not_requested" };
  if (args[1]) {
    const deployment = JSON.parse(await readFile(args[1], "utf8"));
    if (deployment.network !== "testnet" || !deployment.contract_id.endsWith(".testnet") || !deployment.code_hash || !args[2]) throw new Error("Explicit testnet registry/code identity and publication ID required");
    const status = await rpc(deployment.rpc_url, "status", []);
    if (status.chain_id !== "testnet") throw new Error("Wrong publication network");
    const account = await rpc(deployment.rpc_url, "query", { request_type: "view_account", finality: "final", account_id: deployment.contract_id });
    if (account.code_hash !== deployment.code_hash) { result.status = "mismatching"; result.registry = "code_hash_mismatch"; }
    else {
      const response = await rpc(deployment.rpc_url, "query", { request_type: "call_function", finality: "final", account_id: deployment.contract_id, method_name: "get_publication", args_base64: Buffer.from(JSON.stringify({ publication_id: args[2] })).toString("base64") });
      const record = JSON.parse(Buffer.from(response.result).toString());
      const matches = record && Object.entries(digests).every(([key, digest]) => record[key] === digest) && (record.parent_id ?? null) === bundle.parent_publication_id && record.schema_version === bundle.schema_version;
      result.status = matches ? "matching" : "mismatching";
      result.registry = matches ? "matching" : "digest_or_lineage_mismatch";
    }
  }
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.status === "matching" ? 0 : 1;
} catch (error) { console.error(JSON.stringify({ status: "unavailable", error: error.message })); process.exitCode = 1; }
