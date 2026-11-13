import {
  buildDeterministicClaims,
  calculateModel,
  canonicalJson,
  type AIRoleResult,
  type ModelAssumptions,
  type ResearchBundle,
  type Snapshot,
} from "@near-underwrite/shared";

export const cases: Record<"bear" | "base" | "bull", Omit<ModelAssumptions, "starting_supply_yocto">> = {
  bear: {
    annual_gross_issuance_near: "25000000",
    annual_actual_protocol_burn_near: "3000000",
    daily_relevant_settlement_usd: "10000000",
    near_held_fraction: "0.001",
    holding_duration_days: "0.25",
    near_price_usd: "3.5",
    stake_threshold_fraction: "0.67",
  },
  base: {
    annual_gross_issuance_near: "20000000",
    annual_actual_protocol_burn_near: "10000000",
    daily_relevant_settlement_usd: "50000000",
    near_held_fraction: "0.01",
    holding_duration_days: "2",
    near_price_usd: "3.5",
    stake_threshold_fraction: "0.67",
  },
  bull: {
    annual_gross_issuance_near: "15000000",
    annual_actual_protocol_burn_near: "20000000",
    daily_relevant_settlement_usd: "150000000",
    near_held_fraction: "0.04",
    holding_duration_days: "5",
    near_price_usd: "3.5",
    stake_threshold_fraction: "0.67",
  },
};

export function assumptionsFor(snapshot: Snapshot, name: keyof typeof cases): ModelAssumptions {
  return { starting_supply_yocto: snapshot.finalized_block.total_supply_yocto, ...cases[name] };
}

export function makeBundle(
  snapshot: Snapshot,
  assumptions: ModelAssumptions,
  aiResults: AIRoleResult[],
  notes: string,
  parentPublicationId: string | null,
): ResearchBundle {
  const result = calculateModel(snapshot, assumptions);
  return {
    schema_version: "near-underwrite.bundle.v1",
    report_id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    parent_publication_id: parentPublicationId,
    snapshot,
    assumptions,
    result,
    claims: buildDeterministicClaims(snapshot, assumptions, result),
    ai_results: aiResults,
    notes,
    formula_version: "near-underwrite.model.v1",
    credential_material_included: false,
  };
}

export function evidenceCsv(snapshot: Snapshot): string {
  const header = ["metric_id", "status", "unit", "value", "source", "retrieved_at", "source_time", "block_height", "raw_response_digest", "quality_flags"];
  const quote = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [
    header.join(","),
    ...snapshot.observations.map((item) => [
      item.metric_id,
      item.status,
      item.unit,
      canonicalJson(item.value),
      `${item.source.method} ${item.source.url}`,
      item.retrieved_at,
      item.source_time,
      item.block_height,
      item.raw_response_digest,
      item.quality_flags.map((flag) => `${flag.code}: ${flag.detail}`).join(" | "),
    ].map(quote).join(",")),
  ].join("\n");
}

export function reportHtml(bundle: ResearchBundle): string {
  const claims = bundle.claims.map((claim) => `<section><h2>${escapeHtml(claim.title)}</h2><p><strong>${claim.conclusion.toUpperCase()}</strong> — ${escapeHtml(claim.statement)}</p><p><b>Formula:</b> ${escapeHtml(claim.formula)}</p><p><b>Uncertainty:</b> ${escapeHtml(claim.uncertainty)}</p><p><b>Counterargument:</b> ${escapeHtml(claim.counterargument)}</p><p><b>Falsification:</b> ${escapeHtml(claim.falsification_condition)}</p></section>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>NEAR UNDERWRITE report</title><style>body{font:16px system-ui;max-width:900px;margin:40px auto;line-height:1.55;color:#1d211d}code{background:#eee;padding:2px 5px}section{border-top:1px solid #bbb;padding:18px 0}</style></head><body><h1>NEAR UNDERWRITE</h1><p>Report ${escapeHtml(bundle.report_id)} · ${escapeHtml(bundle.created_at)}</p><p>Finalized mainnet block <code>${escapeHtml(bundle.snapshot.finalized_block.height)}</code>. Conclusion: <b>${bundle.result.conclusion.toUpperCase()}</b>.</p>${claims}<h2>Limits</h2><ul>${bundle.result.limits.map((limit) => `<li>${escapeHtml(limit)}</li>`).join("")}</ul><p>This research is not personalized investment advice. Publication hashes establish integrity and timing, not truth.</p></body></html>`;
  const appendix = "<h2>Assumptions, formulas and results</h2><pre style=\"white-space:pre-wrap;overflow-wrap:anywhere\">" + escapeHtml(JSON.stringify({ assumptions: bundle.assumptions, result: bundle.result, formula_version: bundle.formula_version }, null, 2)) + "</pre><h2>Research notes</h2><p>" + escapeHtml(bundle.notes) + "</p><h2>Evidence lineage</h2><pre style=\"white-space:pre-wrap;overflow-wrap:anywhere\">" + escapeHtml(JSON.stringify(bundle.snapshot.observations.map(item => ({ metric_id: item.metric_id, status: item.status, unit: item.unit, source: item.source, retrieved_at: item.retrieved_at, source_time: item.source_time, digest: item.raw_response_digest, quality_flags: item.quality_flags })), null, 2)) + "</pre><h2>AI analysis</h2><pre style=\"white-space:pre-wrap;overflow-wrap:anywhere\">" + escapeHtml(bundle.ai_results.length ? JSON.stringify(bundle.ai_results, null, 2) : "No AI inference included.") + "</pre>";
  return html.replace("</body>", appendix + "</body>");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

export function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function falsificationRows() {
  return [
    { id: "F-01", threshold: "90-day actual burn + reconciled token purchases < 50% of observed net issuance", window: "rolling 90 days", source: "Mainnet supply history plus independently verified burn/buyback flows", insufficient: "Inconclusive; never substitute zero." },
    { id: "F-02", threshold: "Median attributable NEAR inventory duration < 1 day", window: "90 consecutive days", source: "Settlement-flow address cohort with documented attribution", insufficient: "Inconclusive if attribution or holding cohort is unavailable." },
    { id: "F-03", threshold: "NEAR-specific retained capture < 1% of relevant settlement value", window: "two consecutive quarters", source: "Reconciled settlement, gross fee, partner payout, and retained-token flow", insufficient: "Inconclusive until all waterfall legs share one time basis." },
    { id: "F-04", threshold: "Top 10 verified beneficial operators exceed 67% current validator stake", window: "two epochs", source: "RPC validator stakes plus verified operator mapping", insufficient: "Report account concentration only; do not infer operators." },
  ];
}
