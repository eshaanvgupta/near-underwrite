# Deployment and operations

## Local launch with no paid account

```sh
cp .env.example .env
# Set POSTGRES_PASSWORD; keep the file ignored.
docker compose up -d --build
docker compose ps
curl http://localhost:4173/api/health/ready
curl http://localhost:4173/api/v1/snapshots/latest
```

Open http://localhost:4173. Readiness returns ready after PostgreSQL responds. The collector creates a fresh mainnet snapshot; if public data is unavailable, the UI can show the bundled dated snapshot with its delivery mode. API, database, collector, and web are real separate containers. The database volume persists across container restarts.

On Windows, Docker in Ubuntu WSL is supported; run the compose commands inside that distribution. Node 24.16.0 and pnpm 11.25.0 are pinned. Contract commands use Rust 1.97.0 with wasm32-unknown-unknown; the current SDK requires Rust >=1.95.

## Free hosted preview

The [Render Blueprint](https://dashboard.render.com/blueprint/new?repo=https://github.com/eshaanvgupta/near-underwrite) configures one **free** Docker web service and one **free** PostgreSQL database. The operator must sign into their own Render account and approve creation. No account or deployment URL is fabricated.

The combined host launcher binds Render's PORT for web, proxies API requests internally, derives the allowed web origin from RENDER_EXTERNAL_URL, and runs the shared collector while the service is active. The Docker image builds the web application with /api as its API path.

The free plan is a preview path: [Render's current documentation](https://render.com/docs/free) states that services sleep after inactivity, databases expire after 30 days, and free PostgreSQL lacks managed backups. Sleeping services do not provide continuous collection. Review bandwidth/build quotas; keep payment methods absent and do not enable paid upgrades when a zero-spend limit is required. A preview created on 13 November can cover 25 November only if the operator keeps it active and within limits; this is not an uptime guarantee.

The repository includes no paid resource. A commercial operator can use the same Docker images with a durable PostgreSQL service and HTTPS reverse proxy on infrastructure they control. Choosing that infrastructure and its billing remains a separate decision.

## Production deployment

Use a single API process in this release; set the exact public WEB_ORIGIN, terminate HTTPS, keep PostgreSQL private, configure backup retention, monitor readiness and source age, and set provider-side AI spend controls. The default generic-provider allowlist is empty. Never expose operator-local inference on a shared hosted deployment without its explicit fixed endpoint.

Readiness checks database connectivity, not evidence freshness. Monitor finalized source timestamp separately. Snapshot retention keeps recent captures and daily anchors; workspaces can retain their referenced snapshots. Monitor database size as saved workspaces grow.

## Backup and restore

Run from a shell with PostgreSQL client tooling:

```sh
pg_dump --format=custom --file=underwrite.dump "$DATABASE_URL"
# Restore into a NEW empty database, then point DATABASE_URL at that database.
pg_restore --no-owner --dbname="$RESTORE_DATABASE_URL" underwrite.dump
```

Database backups include workspaces and session ownership hashes, but no AI provider key. Keep backups private because notes may be private. Export reports independently. Never run restore against the active database without reviewing the exact target.

`docker compose restart db api` preserves the named volume. Do not use `down --volumes` when preserving data. The executed recovery check wrote a workspace and snapshot, restarted PostgreSQL, then read both successfully.

## Testnet registry

Current registry: `underwrite-mweetqnk.testnet`; network: testnet; RPC: https://test.rpc.fastnear.com.

Code hash: `DePfxj1596uZE3N5GWYSmN5AMEu3svvuxXoK2h4RXcUB`.

WASM SHA-256: `bbe05e39a48136801d504b9ff19f177be118833ca75b5c9d6faaf668c56f4fa4`.

Contract source commit: `09b1ea69add491199a5cd2bb3a7a8ae8893e1839`.

```sh
pnpm testnet:prepare
pnpm demo:testnet --send
```

The first command prints a concrete plan. The second uses an independent faucet-funded testnet account, stores its key only under ignored runtime/, deploys and initializes atomically, and publishes the saved report plus a revision. Existing runtime/evidence records prevent casual redeployment or duplicate script publication. Unknown faucet/transaction results require inspection before retrying. No mainnet account or transfer is created.

Attached publication deposit is 0.1 testnet NEAR; the contract retains measured storage cost and refunds excess. Public fields are shown before browser signing. The retained full-access key can upgrade code; no key is deleted automatically.

## Hosting status

Source and testnet commitments can be independently used now. A stable hosted web/API deployment requires the owner's free hosting account authorization. A static GitHub Pages deployment is not presented as the backend release.
