import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { calculateModel, buildDeterministicClaims, publicationDigests } from "../packages/shared/dist/index.js";
const snapshot = JSON.parse(await readFile(new URL("../evidence/latest-snapshot.json", import.meta.url), "utf8"));
const assumptions = {
  starting_supply_yocto: snapshot.finalized_block.total_supply_yocto,
  annual_gross_issuance_near: "20000000", annual_actual_protocol_burn_near: "10000000",
  daily_relevant_settlement_usd: "50000000", near_held_fraction: "0.01",
  holding_duration_days: "2", near_price_usd: "3.5", stake_threshold_fraction: "0.67",
};
const result = calculateModel(snapshot, assumptions);
const bundle = {
  schema_version: "near-underwrite.bundle.v1", report_id: randomUUID(), created_at: new Date().toISOString(),
  parent_publication_id: process.argv[2] ?? null, snapshot, assumptions, result,
  claims: buildDeterministicClaims(snapshot, assumptions, result), ai_results: [],
  notes: "Mainnet history and bounded execution outcomes provide reproducible observations. The selected base scenario is neutral: net supply growth and assumed positive issuance do not establish durable token demand. Persistent demand requires independently measured capture and inventory holding. These settlement and burn quantities are scenario assumptions. No AI inference was requested for this report.",
  formula_version: "near-underwrite.model.v1", credential_material_included: false,
};
await writeFile(new URL("../evidence/report.json", import.meta.url), JSON.stringify(bundle, null, 2) + "\n");
console.log(JSON.stringify({ report_id: bundle.report_id, conclusion: result.conclusion, observed_net_supply_change_near: result.observed_supply_change_near, annual_scenario_net_near: result.annual_net_monetary_change_near, history_days: snapshot.history.length }));
