# Key handling and spending boundaries

AI keys are empty by default and remain only in React browser memory. Each explicit model-discovery or inference request sends the key to the application backend over HTTPS in hosted deployments. The backend processes it transiently and forwards it only to the selected, validated provider. The backend therefore sees the key during the request.

No owner-funded AI key is required. No key is placed in PostgreSQL, the request ledger, report exports, chain state, logs, or URLs. Browser session capabilities are separate authentication material and are persisted locally for workspace recovery.

Optional device storage encrypts the API key with AES-256-GCM, a fresh 128-bit salt, a fresh 96-bit nonce, and PBKDF2-SHA-256 at 310,000 iterations. A minimum 12-character passphrase is required. The passphrase and derived key are not persisted. Lock clears the memory key; inactivity locks after 15 minutes; Forget removes the encrypted envelope.

Users choose provider, base URL, model, output token limit, per-analysis call limit, daily call budget, and confirmation threshold. NEAR AI uses `https://cloud-api.near.ai/v1`; model discovery calls `/models`, and manual selection is supported.

The application reserves calls before dispatch using PostgreSQL locks. Concurrent tabs sharing a session cannot bypass the session's cap by changing workspace IDs. Clearing browser authentication starts another identity; application limits are not provider-account-wide limits. Use the provider's account/API-key spend controls as the authoritative wider boundary.

Dollar-budget mode is disabled because no independently verified live price/token-bound table is configured. Input token counts are estimates; provider-reported usage is recorded separately. Missing usage, timeout, cancellation, and malformed results retain uncertain reservations. Retry is a new potential spend. Browser cancellation cannot reverse provider processing or charges.

Generic provider hosts require the operator allowlist and HTTPS. DNS results are checked for private/link-local/metadata/reserved destinations, then the selected public IP is pinned while TLS validates the original hostname. Redirects are rejected. Operator-local mode is disabled by default and accepts only one fixed configured endpoint.

NEAR AI documentation: [quickstart](https://docs.near.ai/cloud/quickstart), [API reference and API-key spend-limit endpoint](https://docs.near.ai/api-reference/introduction). Set provider-side spending controls in the provider dashboard before using a paid credential.

Testnet deployment credentials are separate and live in ignored `runtime/testnet-credentials.json`. Public evidence includes only public keys and account IDs. The full-access key remains upgrade authority; no automatic key deletion occurs.
