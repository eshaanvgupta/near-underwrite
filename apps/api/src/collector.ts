import { createHash } from "node:crypto";
import {
  canonicalJson,
  type ActivitySample,
  type HistoricalDay,
  type Observation,
  type QualityFlag,
  type Snapshot,
  type ValidatorStake,
  yoctoToNear,
} from "@near-underwrite/shared";
import type { Config } from "./config.js";
import { boundedFetch } from "./http.js";
import { safeError } from "./redact.js";

const TRANSFORMATION = "near-underwrite.collector.v1";

export function parseLossless(text: string): unknown {
  return (JSON.parse as (text: string, reviver: (key: string, value: unknown, context?: { source?: string }) => unknown) => unknown)(
    text,
    (_key, value, context) => typeof value === "number" && Number.isInteger(value) && !Number.isSafeInteger(value) ? context?.source ?? String(value) : value,
  );
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

async function rpc<T>(url: string, method: string, params: unknown, fetchImpl = fetch): Promise<T> {
  const response = await boundedFetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "near-underwrite/1.0" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "near-underwrite", method, params }),
  }, { fetchImpl });
  const payload = parseLossless(await response.text()) as { result?: T; error?: { message?: string; data?: unknown } };
  if (payload.error || payload.result === undefined) throw new Error(`${method}: ${payload.error?.message ?? "missing result"}`);
  return payload.result;
}

function isoFromNs(timestamp: string | number): string {
  const ns = BigInt(String(timestamp));
  return new Date(Number(ns / 1_000_000n)).toISOString();
}

function observation<T>(
  metricId: string,
  value: T,
  unit: string,
  source: Observation["source"],
  retrievedAt: string,
  sourceTime: string | null,
  identity: { height?: string; hash?: string; epoch?: string },
  raw: unknown,
  flags: QualityFlag[] = [],
): Observation<T> {
  return {
    metric_id: metricId,
    network: "mainnet",
    status: value === null ? "unavailable" : "measured",
    value,
    unit,
    source,
    retrieved_at: retrievedAt,
    source_time: sourceTime,
    block_height: identity.height ?? null,
    block_hash: identity.hash ?? null,
    epoch_id: identity.epoch ?? null,
    raw_response_digest: digest(raw),
    transformation_version: TRANSFORMATION,
    quality_flags: flags,
  };
}

interface RpcBlock {
  header: {
    height: number;
    hash: string;
    timestamp: number | string;
    total_supply: string;
    gas_price: string;
    latest_protocol_version: number;
    epoch_id: string;
  };
  chunks: Array<{ chunk_hash: string; height_included: number }>;
}

interface RpcValidators {
  epoch_height: number;
  epoch_start_height: number;
  current_validators: Array<{ account_id: string; stake: string }>;
}

interface RpcProtocol {
  protocol_version: number;
  epoch_length: number | string;
  max_inflation_rate?: [number, number];
  protocol_reward_rate?: [number, number];
  num_blocks_per_year?: number | string;
}

interface RpcChunk {
  transactions: Array<{ hash: string; signer_id: string }>;
  receipts: Array<{ receipt_id: string }>;
}

interface RpcTxOutcome {
  transaction_outcome: { id: string; outcome: { gas_burnt: number | string; tokens_burnt: string } };
  receipts_outcome: Array<{ id: string; outcome: { gas_burnt: number | string; tokens_burnt: string } }>;
}

async function collectActivity(config: Config, latest: RpcBlock, fetchImpl: typeof fetch): Promise<{ sample: ActivitySample; flags: QualityFlag[] }> {
  const flags: QualityFlag[] = [];
  const blocks: RpcBlock[] = [];
  const requested = config.ACTIVITY_SAMPLE_BLOCKS;
  for (let offset = 0; offset < requested; offset += 1) {
    const height = latest.header.height - offset;
    try {
      blocks.push(offset === 0 ? latest : await rpc<RpcBlock>(config.MAINNET_RPC_URL, "block", { block_id: height }, fetchImpl));
    } catch (error) {
      flags.push({ code: "activity.block_missing", severity: "warning", detail: `Block ${height}: ${safeError(error)}` });
    }
  }
  const chunkIds: string[] = [];
  const transactions: Array<{ hash: string; signer_id: string }> = [];
  const receiptIds = new Set<string>();
  for (const block of blocks) {
    for (const chunkRef of block.chunks) {
      if (transactions.length >= config.ACTIVITY_MAX_TRANSACTIONS) break;
      try {
        const chunk = await rpc<RpcChunk>(config.MAINNET_RPC_URL, "chunk", { chunk_id: chunkRef.chunk_hash }, fetchImpl);
        chunkIds.push(chunkRef.chunk_hash);
        chunk.receipts.forEach((receipt) => receiptIds.add(receipt.receipt_id));
        for (const transaction of chunk.transactions) {
          if (transactions.length >= config.ACTIVITY_MAX_TRANSACTIONS) break;
          if (!transactions.some((item) => item.hash === transaction.hash)) transactions.push(transaction);
        }
      } catch (error) {
        flags.push({ code: "activity.chunk_missing", severity: "warning", detail: `Chunk ${chunkRef.chunk_hash}: ${safeError(error)}` });
      }
    }
  }
  const outcomes = new Map<string, { gas: bigint; burnt: bigint }>();
  for (const transaction of transactions) {
    try {
      const result = await rpc<RpcTxOutcome>(config.MAINNET_RPC_URL, "tx", { tx_hash: transaction.hash, sender_account_id: transaction.signer_id, wait_until: "FINAL" }, fetchImpl);
      const all = [result.transaction_outcome, ...result.receipts_outcome];
      for (const outcome of all) {
        if (outcomes.has(outcome.id)) continue;
        outcomes.set(outcome.id, {
          gas: BigInt(String(outcome.outcome.gas_burnt)),
          burnt: BigInt(outcome.outcome.tokens_burnt),
        });
        if (outcome !== result.transaction_outcome) receiptIds.add(outcome.id);
      }
    } catch (error) {
      flags.push({ code: "activity.outcome_missing", severity: "warning", detail: `Transaction ${transaction.hash}: ${safeError(error)}` });
    }
  }
  const totalGas = [...outcomes.values()].reduce((sum, outcome) => sum + outcome.gas, 0n);
  const totalBurnt = [...outcomes.values()].reduce((sum, outcome) => sum + outcome.burnt, 0n);
  const heights = blocks.map((block) => block.header.height);
  return {
    sample: {
      from_height: String(heights.length ? Math.min(...heights) : latest.header.height),
      to_height: String(latest.header.height),
      requested_blocks: requested,
      processed_blocks: blocks.length,
      missing_blocks: requested - blocks.length,
      chunk_ids: chunkIds,
      transaction_ids: transactions.map((transaction) => transaction.hash),
      receipt_ids: [...receiptIds].sort(),
      outcome_ids: [...outcomes.keys()].sort(),
      transactions_seen: transactions.length,
      outcomes_processed: outcomes.size,
      total_gas_burnt: totalGas.toString(),
      execution_tokens_burnt_yocto: totalBurnt.toString(),
      note: "A bounded sample of finalized blocks. tokens_burnt is the execution-outcome field returned by the NEAR RPC for the sampled transaction and receipt outcomes; it is not validator rewards, application revenue, or total protocol burn.",
    },
    flags,
  };
}

async function nearBlocks<T>(base: string, path: string, fetchImpl: typeof fetch): Promise<T> {
  const response = await boundedFetch(new URL(path, base).toString(), {
    headers: { accept: "application/json", "user-agent": "near-underwrite/1.0" },
  }, { fetchImpl });
  return parseLossless(await response.text()) as T;
}

interface TxnDay {
  date: string;
  txns: number | string;
  receipts: number | string;
  txn_fee: string;
  txn_volume: string;
}

interface BlockDay {
  date: string;
  total_supply: string;
}

interface PriceDay {
  date: string;
  near_price: string;
  market_cap: string;
}

async function collectHistory(config: Config, fetchImpl: typeof fetch): Promise<{ history: HistoricalDay[]; raws: Record<string, unknown>; flags: QualityFlag[] }> {
  const flags: QualityFlag[] = [];
  try {
    const [transactions, blocks, prices] = await Promise.all([
      nearBlocks<{ data: TxnDay[] }>(config.NEARBLOCKS_BASE_URL, "/v3/txn-stats?limit=30", fetchImpl),
      nearBlocks<{ data: BlockDay[] }>(config.NEARBLOCKS_BASE_URL, "/v3/block-stats?limit=30", fetchImpl),
      nearBlocks<{ data: PriceDay[] }>(config.NEARBLOCKS_BASE_URL, "/v3/price-stats?limit=30", fetchImpl),
    ]);
    const blockByDate = new Map(blocks.data.map((item) => [item.date, item]));
    const priceByDate = new Map(prices.data.map((item) => [item.date, item]));
    const history = transactions.data.map((item): HistoricalDay => {
      const block = blockByDate.get(item.date);
      const price = priceByDate.get(item.date);
      const dayFlags: QualityFlag[] = [];
      if (!block) dayFlags.push({ code: "history.supply_missing", severity: "warning", detail: "No same-date block-stat supply record." });
      if (!price) dayFlags.push({ code: "history.price_missing", severity: "info", detail: "No same-date price record." });
      return {
        date: item.date,
        total_supply_yocto: block?.total_supply ?? null,
        transactions: String(item.txns),
        receipts: String(item.receipts),
        transaction_fees_near: item.txn_fee,
        transaction_volume_near: item.txn_volume,
        price_usd: price?.near_price ?? null,
        market_cap_usd: price?.market_cap ?? null,
        source_digest: digest({ transaction: item, block: block ?? null, price: price ?? null }),
        quality_flags: dayFlags,
      };
    });
    return { history, raws: { transactions, blocks, prices }, flags };
  } catch (error) {
    flags.push({ code: "history.unavailable", severity: "error", detail: safeError(error) });
    return { history: [], raws: {}, flags };
  }
}

export async function collectSnapshot(config: Config, fetchImpl: typeof fetch = fetch): Promise<Snapshot> {
  const retrievedAt = new Date().toISOString();
  const rawResponses: NonNullable<Snapshot["raw_responses"]> = [];
  const upstream = fetchImpl;
  fetchImpl = async (input, init) => {
    const response = await upstream(input, init);
    const body = await response.clone().text();
    rawResponses.push({
      url: String(input), method: init?.method ?? "GET", request: typeof init?.body === "string" ? init.body : null,
      retrieved_at: new Date().toISOString(), sha256: createHash("sha256").update(body).digest("hex"), body,
    });
    return response;
  };
  const block = await rpc<RpcBlock>(config.MAINNET_RPC_URL, "block", { finality: "final" }, fetchImpl);
  const [validators, protocol, historyResult] = await Promise.all([
    rpc<RpcValidators>(config.MAINNET_RPC_URL, "validators", [null], fetchImpl),
    rpc<RpcProtocol>(config.MAINNET_RPC_URL, "EXPERIMENTAL_protocol_config", { block_id: block.header.hash }, fetchImpl),
    collectHistory(config, fetchImpl),
  ]);
  const activityResult = await collectActivity(config, block, fetchImpl);
  const sourceTime = isoFromNs(block.header.timestamp);
  const validatorAccounts: ValidatorStake[] = validators.current_validators.map((validator) => ({
    account_id: validator.account_id,
    stake_yocto: validator.stake,
  }));
  const identity = { height: String(block.header.height), hash: block.header.hash, epoch: block.header.epoch_id };
  const rpcSource = (method: string, parameters: Record<string, unknown>) => ({
    url: config.MAINNET_RPC_URL,
    method,
    parameters,
  });
  const observations: Observation[] = [
    observation("near.mainnet.finalized.height", String(block.header.height), "block", rpcSource("block", { finality: "final" }), retrievedAt, sourceTime, identity, block),
    observation("near.mainnet.finalized.total_supply", block.header.total_supply, "yoctoNEAR", rpcSource("block", { finality: "final" }), retrievedAt, sourceTime, identity, block),
    observation("near.mainnet.finalized.gas_price", block.header.gas_price, "yoctoNEAR/gas", rpcSource("block", { finality: "final" }), retrievedAt, sourceTime, identity, block),
    observation("near.mainnet.validators.current", validatorAccounts, "validator accounts", rpcSource("validators", { epoch_reference: null }), retrievedAt, sourceTime, identity, validators, [{
      code: "validators.account_not_operator",
      severity: "warning",
      detail: "Account names do not establish unique beneficial ownership or operational independence.",
    }]),
    observation("near.mainnet.protocol.max_inflation_rate", protocol.max_inflation_rate ?? null, "rational ceiling", rpcSource("EXPERIMENTAL_protocol_config", { finality: "final" }), retrievedAt, sourceTime, identity, protocol),
    observation("near.mainnet.activity.execution_tokens_burnt", activityResult.sample.execution_tokens_burnt_yocto, "yoctoNEAR in sampled outcome fields", rpcSource("tx", { bounded_sample: true }), retrievedAt, sourceTime, identity, activityResult.sample, activityResult.flags),
    observation("nearblocks.daily.history", historyResult.history, "daily records", {
      url: new URL("/v3/txn-stats?limit=30", config.NEARBLOCKS_BASE_URL).toString(),
      method: "GET",
      parameters: { limit: 30, joined_with: ["/v3/block-stats", "/v3/price-stats"] },
    }, retrievedAt, historyResult.history[0]?.date ?? null, {}, historyResult.raws, historyResult.flags),
  ];
  if (activityResult.sample.transactions_seen > 0 && activityResult.sample.outcomes_processed === 0) {
    const metric = observations.find(item => item.metric_id === "near.mainnet.activity.execution_tokens_burnt");
    if (metric) { metric.status = "unavailable"; metric.value = null; }
  }
  for (const [id, field, unit] of [
    ["nearblocks.daily.total_supply", "total_supply_yocto", "yoctoNEAR"],
    ["nearblocks.daily.transaction_volume_near", "transaction_volume_near", "NEAR"],
    ["nearblocks.daily.transaction_fees_near", "transaction_fees_near", "NEAR"],
  ] as const) observations.push(observation(id, historyResult.history.map(day => ({ date: day.date, value: day[field] })), unit, {
    url: config.NEARBLOCKS_BASE_URL + "/v3/" + (field === "total_supply_yocto" ? "block-stats" : "txn-stats"),
    method: "GET", parameters: { limit: 30 },
  }, retrievedAt, historyResult.history[0]?.date ?? null, {}, historyResult.raws, historyResult.flags));
  try {
    const reference = await nearBlocks<{ data: { total_supply: string; circulating_supply: string; near_price: string; market_cap: string } }>(config.NEARBLOCKS_BASE_URL, "/v3/stats", fetchImpl);
    const value = reference.data;
    const flags: QualityFlag[] = [{ code: "price.update_time_unavailable", severity: "info", detail: "Reference retrieval time is known; source update time is not exposed." }];
    const expectedCap = yoctoToNear(value.circulating_supply).mul(value.near_price);
    if (!expectedCap.isZero() && expectedCap.minus(value.market_cap).abs().div(expectedCap).gt("0.01")) flags.push({ code: "price.market_cap_mismatch", severity: "warning", detail: "Reported market cap differs by more than 1% from circulating supply × price." });
    if (BigInt(value.circulating_supply) > BigInt(value.total_supply)) flags.push({ code: "price.supply_mismatch", severity: "warning", detail: "Provider circulating supply exceeds total supply." });
    if (value.circulating_supply === value.total_supply) flags.push({ code: "price.supply_labels_equal", severity: "warning", detail: "Provider reports equal circulating and total supply; both labels are retained with this quality flag." });
    observations.push(observation("nearblocks.reference", value, "provider reference: yoctoNEAR and USD", { url: config.NEARBLOCKS_BASE_URL + "/v3/stats", method: "GET", parameters: {} }, retrievedAt, null, {}, reference, flags));
  } catch (error) {
    observations.push(observation("nearblocks.reference", null, "provider reference", { url: config.NEARBLOCKS_BASE_URL + "/v3/stats", method: "GET", parameters: {} }, retrievedAt, null, {}, null, [{ code: "reference.unavailable", severity: "warning", detail: safeError(error) }]));
  }
  const problems = [...activityResult.flags, ...historyResult.flags, ...observations.filter(item => item.metric_id === "nearblocks.reference").flatMap(item => item.quality_flags)];
  return {
    schema_version: "near-underwrite.snapshot.v1",
    id: `mainnet-${block.header.height}-${block.header.hash.slice(0, 10)}`,
    network: "mainnet",
    created_at: retrievedAt,
    finalized_block: {
      height: String(block.header.height),
      hash: block.header.hash,
      timestamp_ns: String(block.header.timestamp),
      timestamp_iso: sourceTime,
      total_supply_yocto: block.header.total_supply,
      gas_price_yocto: block.header.gas_price,
      protocol_version: protocol.protocol_version,
      chunk_ids: block.chunks.map((chunk) => chunk.chunk_hash),
    },
    epoch: {
      epoch_height: String(validators.epoch_height),
      epoch_start_height: String(validators.epoch_start_height),
      validator_accounts: validatorAccounts,
      beneficial_operator_caveat: "The adapter measures validator accounts and stake reported by RPC. It does not infer unique beneficial operators.",
    },
    protocol: {
      protocol_version: protocol.protocol_version,
      epoch_length: String(protocol.epoch_length),
      max_inflation_rate: protocol.max_inflation_rate ?? null,
      protocol_reward_rate: protocol.protocol_reward_rate ?? null,
      num_blocks_per_year: protocol.num_blocks_per_year === undefined ? null : String(protocol.num_blocks_per_year),
      configuration_digest: digest(protocol),
    },
    activity: activityResult.sample,
    history: historyResult.history,
    observations,
    completeness: {
      status: problems.some((problem) => problem.severity === "error") ? "partial" : problems.length ? "partial" : "complete",
      problems,
    },
    source_digests: {
      finalized_block: digest(block),
      validators: digest(validators),
      protocol_config: digest(protocol),
      history: digest(historyResult.raws),
      activity_sample: digest(activityResult.sample),
    },
    raw_responses: rawResponses,
  };
}
