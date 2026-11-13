# NEAR UNDERWRITE

**What observable conditions would strengthen or invalidate NEAR's long-term token-demand thesis?**

NEAR UNDERWRITE is a research application with a React interface, Node API, PostgreSQL persistence, a shared decimal economic model, user-key AI analysis, and an append-only NEAR testnet publication registry.

Open a claim, inspect its evidence and counterargument, change its assumptions, export the report, and verify its content against an on-chain commitment.

**Public research preview:** https://iamfrankyyy.github.io/near-underwrite/

GitHub Pages serves the React application, saved real mainnet evidence, scenario tools, exports, and live testnet wallet/verification features. Shared PostgreSQL workspaces and proxied AI requests require the separate API. The page labels this mode explicitly. Each deployment attempts a bounded public-source refresh and retains the saved snapshot with its original timestamps if sources are unavailable.

## Run it

Requirements: Docker Compose; or Node 24.16.0, pnpm 11.25.0, and PostgreSQL. Rust 1.97.0 is used for contract checks. Windows contract commands use Ubuntu-24.04 in WSL.

```sh
cp .env.example .env
# Set POSTGRES_PASSWORD to a long random value.
docker compose up -d --build
```

Open **http://localhost:4173**. The web server proxies the real API under `/api`; the shared collector fetches public mainnet data on a bounded one-minute schedule. PostgreSQL owns snapshots, workspaces, publication metadata, and request reservations.

For a free hosted preview, use the repository's [Render Blueprint](https://dashboard.render.com/blueprint/new?repo=https://github.com/iamfrankyyy/near-underwrite). Both configured plans are `free`. Review the plan screen before creating resources. No hosted API URL is claimed until the deployment succeeds. Free hosting has sleep, storage, and expiry limits; [DEPLOYMENT.md](DEPLOYMENT.md) explains these and the commercial deployment path.

## Do X, see Y

1. Open **Evidence board** without a wallet or AI key. See a real finalized mainnet snapshot, source time, completeness, raw-response digests, bounded sample identities, and 30 daily observations.
2. Open a claim. See measurements, explicit assumptions, formula, uncertainty, counterargument, and falsification condition.
3. Open **Scenario workbench**. Change annual actual protocol burn from 10,000,000 to 30,000,000 NEAR. Annual scenario net monetary change moves from +10,000,000 to −10,000,000 NEAR; working-capital inventory remains governed by separate assumptions.
4. Save the workspace. Reload to restore it. Save Scenario A, change a duration, and compare observation changes separately from assumption changes.
5. Open **AI settings**. Supply your own provider, key, model, output limit, and call budget. Test model discovery. The three analysis buttons each authorize one visible request. Without a key, deterministic research and export remain available.
6. Freeze the report and export JSON, CSV, HTML, or print/save PDF.
7. Open **Publication registry**. Connect a testnet wallet and preview the exact public commitment fields. A later revision names an existing publication by the same author.
8. Download either recorded report below and verify it read-only.

## Reproduce the recorded proof

```sh
pnpm install --frozen-lockfile
pnpm build:shared
pnpm verify:bundle evidence/report.json evidence/deployment.json 56e4078379bdd86fdc54bb71ae89047d74282a6243bcaee071f446ffa6e6f79b
pnpm verify:bundle evidence/report-v2.json evidence/deployment.json 1c3a2a24bdb595dbca63db0a687726f72ec4765638bb3f3e75c9cad6b51008c4
```

Expected: `status: matching`, `calculations: matching`, `registry: matching`. The verifier checks source-response byte digests, deterministic calculations, report/evidence/model hashes, testnet identity, and deployed code identity. RPC failure exits unsuccessfully as `unavailable`.

Registry: [underwrite-mweetqnk.testnet](https://testnet.nearblocks.io/address/underwrite-mweetqnk.testnet).

| Action | Final testnet transaction |
|---|---|
| Deploy + initialize | [FZSpDev…](https://testnet.nearblocks.io/txns/FZSpDevctBMH8JjThrZX1FtciF3mdmoZeLepa4h9QyXD) |
| Original report | [Cq7V64…](https://testnet.nearblocks.io/txns/Cq7V64isvHxoUan2ZfPF5FqxLeXgh2H58juTaduPmKiZ) |
| Linked revision | [FmzF3B…](https://testnet.nearblocks.io/txns/FmzF3Bugj9scnYvnYpATQy2x6XPpPoz9ECMcfeLSKu3i) |

[evidence/deployment.json](evidence/deployment.json) records full hashes, source commit, code hash, WASM SHA-256, public access keys, and immutable records. A full-access deployment key remains in an ignored local runtime file and can upgrade code.

## What the populated report concludes

The base scenario is **neutral**. The fetched daily supply series rises by **2,566,919.04470298 NEAR** from its oldest to newest observation. That is net supply change, not a decomposition of gross issuance and burns. The chosen annual issuance/burn assumptions imply +10,000,000 NEAR of net monetary change; settlement, capture, duration, and price imply an illustrative 285,714.28571429 NEAR inventory. Those quantities are assumptions and derived scenarios, not a token price target.

Activity alone does not prove durable NEAR inventory, retained revenue, protocol burn, or token-holder cash flow. Bear/base/bull presets can yield different conclusions, and every claim includes a way to challenge it.

## Commands

```sh
pnpm test:unit       # shared model, API/provider/security, web export checks
pnpm test:contract   # Rust unit checks
pnpm test:sandbox    # compile and run WASM publications/revisions in NEAR sandbox
pnpm test:browser    # desktop/mobile browser journeys
pnpm build          # web, API, shared module, and contract WASM
pnpm collect        # one bounded public mainnet refresh; updates current snapshot files
pnpm report         # create a NEW report from the current snapshot
pnpm testnet:prepare # print exact testnet action plan; sends nothing
pnpm demo:testnet --send # explicitly execute testnet plan with local ignored key
```

Do not regenerate a report and expect it to match an older publication. Old content remains bound to its original digest. Keep exported bundles.

## Release evidence and documents

[TEST_RESULTS.md](TEST_RESULTS.md) contains the feature acceptance matrix and executed results. [ARCHITECTURE.md](ARCHITECTURE.md), [DATA_DICTIONARY.md](DATA_DICTIONARY.md), [METHODOLOGY.md](METHODOLOGY.md), [THREAT_MODEL.md](THREAT_MODEL.md), [KEY_HANDLING.md](KEY_HANDLING.md), [PRIOR_ART.md](PRIOR_ART.md), [DEPLOYMENT.md](DEPLOYMENT.md), [DEMO.md](DEMO.md), and [SUBMISSION.md](SUBMISSION.md) cover reproduction and operational boundaries.

## Independent-project disclosure and eligibility

The author also has two independent entries: [AEGIS // COUNTERFACTUAL](https://github.com/eshaanvgupta/aegis-counterfactual) and [BAG HEIST](https://github.com/eshaanvgupta/bag-heist). NEAR UNDERWRITE has its own repository, application, database, and registry. This development does **not** create a third hackathon application. The live guide permits at most two projects per person; any replacement or exception requires organizer agreement. No identity change, replacement, submission, or X post is performed by this repository.

## Attribution

Original application code and docs were developed with AI coding assistance. The public SDKs supply wallet, RPC, contract, UI, validation, and test primitives. See [ATTRIBUTION.md](ATTRIBUTION.md) and [LICENSE](LICENSE). Public history and reference data are powered by [NearBlocks APIs](https://nearblocks.io). Prior-art comparisons are limited to inspected source/readmes; no first/only claim is made.
