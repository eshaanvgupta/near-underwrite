# Dependency attribution

Pinned direct versions and complete resolved graphs are in pnpm-lock.yaml and contracts/registry/Cargo.lock.

| Dependency | Origin | License |
|---|---|---|
| React / React DOM | https://github.com/facebook/react | MIT |
| Vite / React plugin | https://github.com/vitejs/vite | MIT |
| TypeScript | https://github.com/microsoft/TypeScript | Apache-2.0 |
| Fastify / CORS / rate limit | https://github.com/fastify | MIT |
| node-postgres | https://github.com/brianc/node-postgres | MIT |
| Decimal.js | https://github.com/MikeMcl/decimal.js | MIT |
| Zod | https://github.com/colinhacks/zod | MIT |
| NEAR Wallet Selector / My NEAR Wallet adapter | https://github.com/near/wallet-selector | MIT OR Apache-2.0 |
| near-api-js | https://github.com/near/near-api-js | MIT OR Apache-2.0 |
| near-sdk / near-workspaces | https://github.com/near/near-sdk-rs and https://github.com/near/near-workspaces-rs | MIT OR Apache-2.0 |
| Playwright | https://github.com/microsoft/playwright | Apache-2.0 |
| Vitest | https://github.com/vitest-dev/vitest | MIT |
| PostgreSQL | https://www.postgresql.org | PostgreSQL License |
| Node.js | https://nodejs.org | MIT with third-party notices |

The selected wallet-selector release remains supported in the documented transition to HOT Connect. Its current provider-specific behavior and wallet availability are external dependencies. The application uses the documented testnet adapter; no wallet keys are stored by this app.

Fonts use installed platform fallbacks: Baskerville/Iowan/Palatino/Georgia for display; Aptos/Segoe UI/system-ui for body; Cascadia/Consolas/system monospace for data. No font asset with uncertain redistribution rights is bundled.

NearBlocks data is attributed in the app and README. NEAR RPC schemas, the current near-sdk docs (5.30.1), NEAR AI docs, pnpm build-permission docs, and Render free-tier/Blueprint docs informed implementation. Own AEGIS/BAG HEIST repositories were inspected for local tooling and compatible SDK patterns; their game/security product state, accounts, and contracts remain independent.
