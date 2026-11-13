import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { canonicalJson, publicationDigests, type ResearchBundle } from "@near-underwrite/shared";

const path = process.argv[2];
if (!path) {
  console.error("Usage: pnpm verify:bundle -- path/to/bundle.json [registry-record.json]");
  process.exit(2);
}

try {
  const bundle = JSON.parse(await readFile(resolve(path), "utf8")) as ResearchBundle & {
    evidence_manifest?: unknown;
    model_descriptor?: unknown;
  };
  if (bundle.schema_version !== "near-underwrite.bundle.v1" || bundle.credential_material_included !== false) throw new Error("Unsupported bundle schema or credential exclusion marker");
  const evidenceManifest = bundle.evidence_manifest ?? {
    snapshot_id: bundle.snapshot.id,
    source_digests: bundle.snapshot.source_digests,
    observations: bundle.snapshot.observations.map((item) => ({ metric_id: item.metric_id, raw_response_digest: item.raw_response_digest })),
  };
  const modelDescriptor = bundle.model_descriptor ?? { formula_version: bundle.formula_version, assumptions: bundle.assumptions };
  const digests = await publicationDigests(bundle, evidenceManifest, modelDescriptor);
  const result: Record<string, unknown> = {
    status: "confirmed",
    canonical_bytes: Buffer.byteLength(canonicalJson(bundle)),
    report_id: bundle.report_id,
    ...digests,
    registry: "not_requested",
  };
  if (process.argv[3]) {
    const record = JSON.parse(await readFile(resolve(process.argv[3]), "utf8")) as Record<string, unknown>;
    const matching = record.report_digest === digests.report_digest && record.evidence_digest === digests.evidence_digest && record.model_digest === digests.model_digest;
    result.registry = matching ? "matching" : "mismatching";
    if (!matching) process.exitCode = 1;
  }
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: "unavailable", error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exit(1);
}
