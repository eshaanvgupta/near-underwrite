import { describe, expect, it } from "vitest";
import { collectSnapshot } from "../src/collector.js";
import { loadConfig } from "../src/config.js";
const config = loadConfig({ ACTIVITY_SAMPLE_BLOCKS: "1", ACTIVITY_MAX_TRANSACTIONS: "2" });
const block = { header: { height: 100, hash: "blockhash", timestamp: "1794493949428225703", total_supply: "1000000000000000000000000000", gas_price: "100000000", latest_protocol_version: 88, epoch_id: "epoch" }, chunks: [{ chunk_hash: "chunk", height_included: 100 }] };
function fixture(missing = false): typeof fetch {
  return async (input, init) => {
    const request = init?.body ? JSON.parse(String(init.body)) : null;
    if (request?.method === "block") return Response.json({ result: block });
    if (request?.method === "validators") return Response.json({ result: { epoch_height: 1, epoch_start_height: 90, current_validators: [{ account_id: "a.near", stake: "100" }] } });
    if (request?.method === "EXPERIMENTAL_protocol_config") return Response.json({ result: { protocol_version: 88, epoch_length: 43200, max_inflation_rate: [1, 40] } });
    if (request?.method === "chunk") return Response.json({ result: { transactions: [{ hash: "txA", signer_id: "a.near" }, { hash: "txB", signer_id: "b.near" }], receipts: [] } });
    if (request?.method === "tx") {
      if (missing) return Response.json({ error: { message: "outcome unavailable" } });
      const outcome = { gas_burnt: "1", tokens_burnt: "3" };
      return Response.json({ result: { transaction_outcome: { id: request.params.tx_hash, outcome }, receipts_outcome: [{ id: "shared-receipt", outcome }] } });
    }
    const url = String(input);
    if (url.includes("/v3/stats")) return Response.json({ data: { total_supply: "1000000000000000000000000000", circulating_supply: "900000000000000000000000000", near_price: "1", market_cap: "900" } });
    if (url.includes("txn-stats")) return Response.json({ data: [{ date: "2026-11-11", txns: "2", receipts: "3", txn_fee: "1", txn_volume: "2" }] });
    if (url.includes("block-stats")) return Response.json({ data: [{ date: "2026-11-11", total_supply: block.header.total_supply }] });
    return Response.json({ data: [{ date: "2026-11-11", near_price: "1", market_cap: "900" }] });
  };
}
describe("bounded source adapters", () => {
  it("deduplicates shared receipt outcomes and records exact sample IDs", async () => {
    const snapshot = await collectSnapshot(config, fixture());
    expect(snapshot.activity.outcomes_processed).toBe(3);
    expect(snapshot.activity.execution_tokens_burnt_yocto).toBe("9");
    expect(snapshot.activity.outcome_ids).toEqual(["shared-receipt", "txA", "txB"]);
    expect(snapshot.raw_responses!.every(response => response.sha256.length === 64)).toBe(true);
    expect(snapshot.finalized_block.timestamp_ns).toBe("1794493949428225703");
  });
  it("propagates unavailable outcomes as quality problems", async () => {
    const snapshot = await collectSnapshot(config, fixture(true));
    expect(snapshot.completeness.status).toBe("partial");
    expect(snapshot.completeness.problems.some(problem => problem.code === "activity.outcome_missing")).toBe(true);
    expect(snapshot.observations.find(item => item.metric_id === "near.mainnet.activity.execution_tokens_burnt")?.value).toBeNull();
  });
});
