import { describe, expect, it } from "vitest";
import { calculateModel, compareResearch, nearToYocto, stakeConcentration, yoctoToNear } from "../src/index.js";
import type { ModelAssumptions, Snapshot } from "../src/index.js";

const snapshot: Snapshot = {
  schema_version: "near-underwrite.snapshot.v1",
  id: "s1",
  network: "mainnet",
  created_at: "2026-11-12T00:00:00.000Z",
  finalized_block: {
    height: "100", hash: "h", timestamp_ns: "1", timestamp_iso: "2026-11-12T00:00:00.000Z",
    total_supply_yocto: "1000000000000000000000000000000", gas_price_yocto: "100000000", protocol_version: 88, chunk_ids: [],
  },
  epoch: {
    epoch_height: "2", epoch_start_height: "90",
    validator_accounts: [
      { account_id: "a.near", stake_yocto: "600" },
      { account_id: "b.near", stake_yocto: "300" },
      { account_id: "c.near", stake_yocto: "100" },
    ],
    beneficial_operator_caveat: "Accounts are not owners.",
  },
  protocol: { protocol_version: 88, epoch_length: "43200", max_inflation_rate: [1, 40], protocol_reward_rate: [0, 1], num_blocks_per_year: null, configuration_digest: "d" },
  activity: { from_height: "98", to_height: "100", requested_blocks: 3, processed_blocks: 3, missing_blocks: 0, chunk_ids: [], transaction_ids: [], receipt_ids: [], outcome_ids: [], transactions_seen: 0, outcomes_processed: 0, total_gas_burnt: "0", execution_tokens_burnt_yocto: "0", note: "sample" },
  history: [
    { date: "2026-11-11", total_supply_yocto: "1001000000000000000000000000000", transactions: "10", receipts: "20", transaction_fees_near: "1", transaction_volume_near: "2", price_usd: "3", market_cap_usd: "4", source_digest: "a", quality_flags: [] },
    { date: "2026-11-10", total_supply_yocto: "1000000000000000000000000000000", transactions: "9", receipts: "19", transaction_fees_near: "1", transaction_volume_near: "2", price_usd: "3", market_cap_usd: "4", source_digest: "b", quality_flags: [] },
  ],
  observations: [],
  completeness: { status: "complete", problems: [] },
  source_digests: {},
};

const assumptions: ModelAssumptions = {
  starting_supply_yocto: snapshot.finalized_block.total_supply_yocto,
  annual_gross_issuance_near: "25000000",
  annual_actual_protocol_burn_near: "10000000",
  daily_relevant_settlement_usd: "100000000",
  near_held_fraction: "0.01",
  holding_duration_days: "2",
  near_price_usd: "4",
  stake_threshold_fraction: "0.67",
};

describe("deterministic economic model", () => {
  it("keeps atomic token amounts out of floating point", () => {
    expect(nearToYocto("1.000000000000000000000001")).toBe("1000000000000000000000001");
    expect(yoctoToNear("1000000000000000000000001").toFixed()).toBe("1.000000000000000000000001");
  });

  it("computes monetary and working-capital scenarios", () => {
    const result = calculateModel(snapshot, assumptions);
    expect(result.annual_net_monetary_change_near).toBe("15000000");
    expect(result.working_capital_near).toBe("500000");
    expect(result.observed_supply_change_near).toBe("1000");
    expect(result.stake_concentration.minimum_accounts_for_threshold).toBe(2);
  });

  it("propagates missing price and rejects impossible inputs", () => {
    expect(calculateModel(snapshot, { ...assumptions, near_price_usd: null }).working_capital_near).toBeNull();
    expect(() => calculateModel(snapshot, { ...assumptions, near_held_fraction: "1.1" })).toThrow(/cannot exceed/);
    expect(() => calculateModel(snapshot, { ...assumptions, annual_actual_protocol_burn_near: "999999999999999" })).toThrow(/negative/);
  });

  it("does not treat validator accounts as beneficial operators", () => {
    const concentration = stakeConcentration(snapshot.epoch.validator_accounts, "0.67");
    expect(concentration.minimum_accounts_for_threshold).toBe(2);
    expect(concentration.caveat).toMatch(/beneficial-owner/);
  });

  it("separates observation changes from assumption changes", () => {
    const current = structuredClone(snapshot);
    current.finalized_block.height = "101";
    const comparison = compareResearch(
      { snapshot, assumptions },
      { snapshot: current, assumptions: { ...assumptions, holding_duration_days: "3" } },
    );
    expect(comparison.observation_changes.map((change) => change.metric)).toContain("finalized_block.height");
    expect(comparison.assumption_changes.map((change) => change.assumption)).toEqual(["holding_duration_days"]);
  });
});
