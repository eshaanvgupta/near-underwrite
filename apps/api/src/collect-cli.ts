import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import { collectSnapshot } from "./collector.js";

const config = loadConfig({ ...process.env, ALLOW_MEMORY_DB: "true" });
const snapshot = await collectSnapshot(config);
const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
const output = resolve(projectRoot, process.argv[2] ?? "evidence/latest-snapshot.json");
await mkdir(dirname(output), { recursive: true });
const serialized = JSON.stringify(snapshot, null, 2) + "\n";
await writeFile(output, serialized, { encoding: "utf8", flag: "w" });
const webEvidence = resolve(projectRoot, "apps/web/public/evidence/latest-snapshot.json");
await mkdir(dirname(webEvidence), { recursive: true });
await writeFile(webEvidence, serialized, { encoding: "utf8", flag: "w" });
console.log(JSON.stringify({
  status: "confirmed",
  output,
  web_evidence: webEvidence,
  snapshot_id: snapshot.id,
  finalized_height: snapshot.finalized_block.height,
  finalized_hash: snapshot.finalized_block.hash,
  source_time: snapshot.finalized_block.timestamp_iso,
  history_days: snapshot.history.length,
  activity_outcomes: snapshot.activity.outcomes_processed,
  completeness: snapshot.completeness,
}, null, 2));
