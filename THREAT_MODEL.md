# Threat model

## Trust boundaries

Public RPC/indexer responses are untrusted research inputs. Finality is the provider's reported finalized state; this release does not run a light-client proof verifier. Multiple endpoints can disagree or lag. Raw-response archives, hashes, provenance, quality flags, and source times support independent inspection.

Economic conclusions depend on user assumptions and transparent decision thresholds. A positive activity count has no direct valuation multiplier. Beneficial operator ownership, actual cross-chain retention, gross issuance decomposition, and all burn categories cannot be inferred solely from the included bounded sample.

AI output is untrusted explanatory material. System instructions delimit evidence, prohibit tools/configuration changes/paid follow-up requests, require schema-valid claims and evidence IDs, and reject unsupported numbers and invented URLs. ID/numeral validation establishes reference consistency; it cannot guarantee a model's semantic interpretation. Users review counterarguments and deterministic outputs.

## Credentials and sessions

The server sees transient API keys. TLS, an allowlisted provider proxy, pinned DNS/IP connections, redirect rejection, redacted logs, and bounded requests reduce exposure. The browser's encrypted vault protects a remembered key at rest; XSS or an already compromised browser/server can access an unlocked key.

Workspace capabilities are unguessable bearer tokens stored in browser local storage, with ownership hashes in PostgreSQL. Origin checks and an explicit application header protect browser mutations. They are not verified human identity. Clearing a session or using another browser creates a separate identity; provider-side spending caps remain necessary.

## Availability and operations

Request, input, output, list, sample, and concurrency limits bound normal execution. One API process is the release's supported concurrency deployment. Public endpoints can throttle or fail; cached snapshots remain dated. Free hosting can sleep, suspend, or expire. Export and back up data before a provider's expiry.

The registry charges measured storage after collection flushes, validates hash/schema/parent sizes, and keeps append-only revision records. Only predecessor_account_id authors a publication. A parent must exist and belong to that author. A user can publish false research under their own name; integrity hashes do not prove truth.

The retained full-access deployment key can replace registry code and change keys. Verifiers compare the recorded code hash and return mismatch if code changes. The public interface has no edit/delete method, but upgrade authority can change future behavior.

## Release boundaries

This is a tested research release, not an independently audited financial service. It provides no trading, custody, brokerage, personalized buy/sell recommendation, or autonomous transaction/AI authority. Commercial operation requires operator-controlled HTTPS, database backup/retention, service monitoring, provider-cost controls, and a reviewed upgrade policy. The included deployment configuration supplies the application mechanics; an SLA is not implied.
