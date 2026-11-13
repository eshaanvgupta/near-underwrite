# Architecture

The monorepo contains:

- `apps/web`: React + TypeScript + Vite research UI and browser credential vault.
- `apps/api`: Fastify API, bounded collector, PostgreSQL store, and transient provider adapters.
- `packages/shared`: schemas, deterministic decimal arithmetic, claims, comparison, and canonical hashes.
- `contracts/registry`: Rust NEAR append-only publication commitments.
- `db/migrations`: idempotent initial schema.
- `scripts`: reproducible collection, reports, verification, deployment, and database checks.

The shared collector writes one cached mainnet snapshot for all visitors. Browser refresh reads the cache. Public visitors do not cause chain crawls. Compose runs API, collector, PostgreSQL, and web as separate services; the free preview launcher combines API and web processes, with the collector embedded while the service runs.

Every report freezes its snapshot and assumptions. Calculation code is shared by browser and CLI verifier. AI receives the same frozen bundle across roles and cannot mutate source data or invoke tools. API sessions use an unguessable browser capability; the database stores its SHA-256 ownership identity. API keys are separate transient request fields.

AI reservations are persisted before dispatch. PostgreSQL advisory transaction locks serialize a session's daily reservations, and the analysis ID binds to an immutable evidence digest. Failed/unknown provider requests retain their budget reservation. A conservative retained daily reservation can remain when a later analysis-limit check rejects dispatch. Request concurrency is bounded per API process; run one API instance for this release.

Workspaces and publication metadata survive process/database restarts. Snapshot retention keeps the latest 30 captures, one per day over 32 days, and snapshots referenced by saved workspaces. Saved reports carry their full evidence independently of cache retention.

The registry is authoritative for published hashes. Its state is immutable through its public interface. The retained full-access account key is separate upgrade authority; code identity is checked during verification.

The deployment image runs as the non-root `node` user. Readiness checks PostgreSQL; liveness checks the API process. SIGTERM stops listeners and closes pools. A collector already completing a bounded request can take up to its timeout to stop.
