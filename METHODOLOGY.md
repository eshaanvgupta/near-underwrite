# Methodology and reproducibility

The instrument asks which observable conditions strengthen or invalidate persistent token demand. Its conclusion is conditional on explicit assumptions, with bearish, neutral, and bullish outcomes available.

## Arithmetic

All token atomic quantities are integer strings. Decimal.js uses 80-digit precision and half-even rounding. USD and fractions remain decimal strings. Bounded display colors may use Number; token/economic calculations do not.

- Observed net supply change = newest genuine supply observation − oldest genuine supply observation.
- Annual net monetary change = assumed gross issuance − assumed actual protocol burn.
- Projected year-end supply = starting supply + annual net monetary change; negative projected supply is rejected.
- Burn break-even = issuance assumption.
- Working-capital NEAR inventory = daily relevant settlement USD × NEAR-held fraction × holding duration days ÷ assumed NEAR USD price.
- Account concentration: sort current validator accounts by stake; accumulate until the selected fraction of total current stake is reached.

The working-capital result is an inventory illustration. It does not determine price, enterprise value, holder revenue, or complete token valuation. Missing price leaves this output unavailable.

Bear/base/bull defaults are labeled assumptions. The model uses simple transparent decision rules: non-positive scenario net change plus at least 1% capture and at least one-day inventory duration is bullish; positive net change with weaker capture/duration is bearish; other combinations are neutral, with an additional conditional historical signal documented in `model.ts`. These are research classification thresholds, not empirically calibrated return probabilities.

The four falsification rows in the app specify thresholds, windows, measurement sources, and insufficient-data handling. Current data does not automatically satisfy all of those measurement requirements.

## Collection

Public RPC and NearBlocks v3 endpoints are fetched once per shared scheduled collection. Each HTTP request has timeouts and bounded recovery attempts. The collector backs off after failures. It samples at most 10 blocks and 50 transactions by configuration; release defaults are three blocks and 12 transactions. Outcome IDs deduplicate transaction and receipt execution records.

The protocol configuration is requested at the finalized block hash. Validator RPC reports the current epoch; its account set can change around an epoch boundary, so source/epoch provenance is retained. Daily history is a public indexer series with provider-defined dates and explicit boundary limitations.

Execution-outcome costs, validator rewards, application fees, actual burns, gross settlement, and holder cash flows remain separate concepts. No arbitrary Intents capture fee is inserted. Neither staking yield nor a protocol inflation ceiling is treated as observed external revenue.

## Publication encoding

Canonical JSON recursively sorts object keys lexicographically, preserves array order, uses JSON string escaping, and has no whitespace. Exported numerical quantities use decimal strings. Canonicalization operates on the parsed bundle schema.

All three content hashes are lowercase SHA-256:

```text
report   = SHA256("NEAR_UNDERWRITE_PUBLICATION_V1\0REPORT\0"   || canonical_json(bundle))
evidence = SHA256("NEAR_UNDERWRITE_PUBLICATION_V1\0EVIDENCE\0" || canonical_json(manifest))
model    = SHA256("NEAR_UNDERWRITE_PUBLICATION_V1\0MODEL\0"    || canonical_json(descriptor))
```

Manifest: snapshot_id, source_digests, and ordered metric_id/raw_response_digest pairs. Descriptor: formula_version and assumptions.

The registry's publication ID hashes the publication domain, LP32 UTF-8 author, three raw 32-byte digests, LP32 schema version, a parent-presence byte and optional LP32 parent ID, then little-endian u64 block height and timestamp. LP32 is unsigned 32-bit little-endian byte length followed by bytes. The contract supplies author, block height, and timestamp.

A hash commits content and timing under the current code identity. It does not certify observation correctness.
