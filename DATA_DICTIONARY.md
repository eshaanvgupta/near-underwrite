# Data dictionary

Research data is **mainnet**. Publication writes are **testnet**.

Each observation includes metric_id, network, measured/derived/assumed/estimated/unavailable status, value/unit, URL/method/request parameters, retrieval/source time, optional block/epoch identity, response digest, transformation version, and quality flags.

| Metric / field | Meaning |
|---|---|
| near.mainnet.finalized.height | Finalized block height from `block {finality:"final"}` |
| finalized_block.total_supply_yocto | Exact block-reported total supply; 10^24 yoctoNEAR per NEAR |
| finalized_block.gas_price_yocto | Reported block gas price in yoctoNEAR per gas |
| finalized_block.protocol_version | Active version from configuration pinned to the snapshot block hash |
| epoch.validator_accounts | Current validator account IDs and exact stake; not beneficial-owner identities |
| protocol.max_inflation_rate | Exact rational protocol ceiling, not observed realized gross issuance |
| protocol.protocol_reward_rate | Reported rational configuration parameter |
| activity.execution_tokens_burnt_yocto | Sum of deduplicated RPC execution-outcome `tokens_burnt` fields in the declared sample |
| activity.total_gas_burnt | Deduplicated execution-outcome gas, preserving integer precision |
| history.total_supply_yocto | NearBlocks v3 daily block-stat supply observation |
| history.transaction_fees_near | NearBlocks v3 daily transaction fee field, in NEAR; not identified as total actual protocol burn |
| history.transaction_volume_near | Provider-reported transaction volume in NEAR; not gross cross-chain settlement USD |
| history.price_usd / market_cap_usd | Provider references; never silently substituted for scenario price or supply |

The activity adapter declares requested/processed/missing block counts, height bounds, chunk IDs, transaction IDs, receipt IDs, and deduplicated outcome IDs. It caps transaction work and does not estimate whole-chain annual economics from a short sample.

Daily records use the indexer's date labels. Exact intra-day block boundaries are not exposed by these aggregate endpoints, and the application does not infer them from a constant block interval. This boundary uncertainty limits precise cross-source time matching.

`raw_responses` preserves fetched response text, request, URL, method, retrieval time, and exact response-text SHA-256. `raw_response_digest` on transformed observations is the canonical JSON digest of the adapter input object; it is distinct from the archived raw-byte digest. Large JSON integer tokens are recovered from their original lexical spelling before arithmetic.

Unavailable optional values are null. A failed primary source does not create a successful new snapshot; the previous cached snapshot remains visibly dated.

References: [RPC](https://docs.near.org/api/rpc), [block/chunk](https://docs.near.org/api/rpc/block-chunk), [protocol](https://docs.near.org/api/rpc/protocol), [providers](https://docs.near.org/api/rpc/providers), [NearBlocks v3](https://api.nearblocks.io/api-docs/ui/).
