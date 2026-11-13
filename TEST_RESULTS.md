# Executed checks and acceptance matrix

Recorded on 13 November 2026. Source identity is the Git commit containing this file; deployed contract source is separately pinned in evidence/deployment.json.

## Executed results

| Command / check | Actual result |
|---|---|
| pnpm install --frozen-lockfile | Passed with pnpm 11.25.0 / Node 24.16.0 |
| pnpm test:unit | 22 passed: 5 model, 15 API/source/provider/security/storage, 2 web export |
| pnpm test:contract | 6 Rust unit tests passed; sandbox test is explicitly ignored in this command |
| pnpm test:sandbox | 1 actual compiled-WASM sandbox scenario passed: publish, revision, lineage, author history |
| pnpm test:browser | 11 passed, 1 intentionally skipped desktop duplicate of mobile-only check; desktop and 360px mobile |
| pnpm -r --if-present build | Shared module, API, and production web builds passed |
| pnpm contract:build | Compiled Rust WASM successfully in Ubuntu WSL |
| Docker Compose image build and startup | Passed; four services created and API/database health checks responded |
| PostgreSQL concurrent reservations | Exactly 3 of 10 concurrent attempts accepted under a cap of 3 |
| PostgreSQL restart/recovery | Workspace and full snapshot read back after database restart |
| pnpm collect | Public mainnet block 224307644, 30 historical observations, 66 sampled outcomes; optional reference quality flags preserved |
| Local Docker scheduled collection | Finalized height advanced 224307517 → 224307569; source time advanced; API readiness true |
| Read-only report verifier | Original and revision calculations/digests match final testnet registry and code hash |
| Tampered numeric result | Explicit mismatching result, exit 1 |
| Unreachable registry RPC | Explicit unavailable result, exit 1 |
| Desktop/mobile screenshots | Actual application with real mainnet data, no AI requests |

Initial failures were corrected before these results: Windows Application Control prevented Rust build-script execution, so contract tooling uses WSL; the sandbox WASM path was made absolute; mobile browser configuration was corrected; tests use a dedicated port to avoid a running Docker release; exact DOM labels and URL-to-filesystem conversion were corrected.

## Acceptance matrix

| Requirement | Evidence / status |
|---|---|
| No-key research workflow | Implemented; browser evidence/workbench/export journeys pass |
| Finalized mainnet block, validator accounts, pinned protocol config | Live adapters; source identities and raw response archives in latest snapshot |
| Bounded fees/activity and outcome deduplication | Implemented; fixture checks sharing a receipt produce exactly one count; live sample recorded |
| 30 daily observations | Verified public NearBlocks v3 series; exact intra-day block boundary attribution remains unavailable from this aggregate endpoint |
| Current reference supply/price checks | Implemented; circulating/total-supply equality and missing update time are flagged instead of silently accepted |
| Decimal economics, monetary balance, break-even, inventory, concentration | Shared pure module; unit tests and CLI reproduction pass |
| Bear/base/bull and sensitivity | Editable app assumptions and deterministic outputs |
| Falsification and causal limits | Four threshold/window/source/insufficient-data rows; claim drill-downs |
| Workspace persistence and comparison | PostgreSQL saves and restart recovery; local Scenario A persists; observations/assumptions compared separately |
| User-key NEAR AI/generic/local paths | Implemented; NEAR AI endpoint pinned, generic allowlist enforced, local mode operator-only |
| Live paid AI inference | Not run: no authorized user-supplied key was available; mock responses are limited to labeled tests |
| Budgeting, rejection, timeout, malformed/streaming output, key redaction | API tests pass; atomic PostgreSQL reservations tested; dollar mode disabled without verified pricing |
| Immutable evidence across roles and numerical citation validation | Analysis ID binds to an evidence digest; unsupported IDs/numbers/URLs rejected |
| Report JSON/CSV/HTML/PDF | Exports implemented; PDF uses browser print/save; JSON export browser journey passes |
| Registry authorization, invalid input, storage, revisions | Rust unit checks plus actual sandbox; testnet original and revision confirmed |
| Browser wallet connection/publication | My NEAR Wallet testnet adapter implemented; draft saved before signing and callback recovery provided. Live publication proof used the deployment signer; a human wallet approval is not claimed as an automated test |
| Browser bundle verification/tampering | Recorded report data plus explicitly mocked RPC state in browser tests; separate CLI verifier reads real testnet |
| Code identity and upgrade authority | Public code hash/access keys recorded; retained full-access key disclosed |
| Docker, migrations, non-root image, health/shutdown, backups | Implemented; local image/startup/recovery checks executed; backup/restore commands documented |
| Hosted web/API release | Free Render Blueprint prepared; no public hosting account connected, so no hosted URL is claimed |
| Submission eligibility | Materials prepared; no third application or X post sent |

## Reproducibility artifacts

- evidence/latest-snapshot.json: current genuine snapshot, source requests, quality flags, and raw responses.
- evidence/report.json and report-v2.json: immutable published research bundles.
- evidence/deployment.json: code identity, three final transactions, two publication records, public access keys.
- evidence/operations-check.json: shared collector progression and database readiness.
- evidence/verifier-failure-checks.json: fail-closed mismatch/unavailable checks.
- evidence/screenshots/: local desktop and 360px renderings.

The source/live providers, wallet availability, hosting availability, and operator key security remain operational dependencies. Test counts describe only the checks actually executed and do not imply independent security auditing or future uptime.
