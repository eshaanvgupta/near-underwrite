# Prior art inspected

Inspected on 13 November 2026. Comparisons refer to retrieved public README/source descriptions and do not assert that uninspected code lacks a feature.

| Project and inspected source | Concrete overlap | NEAR UNDERWRITE implementation focus |
|---|---|---|
| [NEAR FeeLens](https://github.com/3Nerion7/near-feelens/blob/main/README.md), README blob 860532a65a7858f54a9170b418e2486f34f433c1 | Reproducible finalized block evidence, integer/decimal economics, user-editable assumptions, explicit flow/stock distinction. Its README documents 24 frozen ancestor blocks and gas/storage workload scenarios. | Shared scheduled mainnet collection, PostgreSQL workspaces, daily supply history, token working-capital inventory assumptions, and a testnet revision registry. |
| [Tune Up Research Desk](https://github.com/tuneupargentina/tuneup-research-desk/blob/main/README.md), README blob 92b182854dbb56aa0eb75904604247201d6aeedc | SHA-256 research report receipts on NEAR testnet and browser file verification. Its documented workflow binds delivered Markdown to an order ID through an authorized agent. | Caller-authored report/evidence/model commitments, parent-linked append-only revisions, and an integrated evidence-to-scenario-to-export workflow. Hash receipts themselves are established prior art. |
| [NEAR Stats](https://github.com/near/near-stats/blob/main/README.md), README blob 284eaa313d228ef7ef1e1474acb81ed23c151801 | Public usage dashboards, an API, database-backed analytics, and shared caching; the README describes NEAR Analytics/Ecosystem data and Redis caching. | Explicit claim lineage and falsification, scenario arithmetic, user-owned AI credentials, portable reproducibility bundles, and publication integrity. |

Current directory entries also include Usage Thesis and usage-versus-value-capture work. Their public X pages returned access errors during inspection, so this document does not make code-level comparisons against those entries.

There is no first/only thesis-dashboard or report-hashing claim. Differentiation is the implemented combined workflow and its reproducibility, not the mere existence of dashboards, AI roles, or SHA-256 receipts. No code was copied from these three projects.
