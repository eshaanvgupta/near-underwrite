export type EvidenceStatus = "measured" | "derived" | "assumed" | "estimated" | "unavailable";

export interface QualityFlag {
  code: string;
  severity: "info" | "warning" | "error";
  detail: string;
}

export interface Observation<T = unknown> {
  metric_id: string;
  network: "mainnet" | "testnet";
  status: EvidenceStatus;
  value: T | null;
  unit: string;
  source: {
    url: string;
    method: string;
    parameters: Record<string, unknown>;
  };
  retrieved_at: string;
  source_time: string | null;
  block_height: string | null;
  block_hash: string | null;
  epoch_id: string | null;
  raw_response_digest: string;
  transformation_version: string;
  quality_flags: QualityFlag[];
}

export interface ValidatorStake {
  account_id: string;
  stake_yocto: string;
}

export interface HistoricalDay {
  date: string;
  total_supply_yocto: string | null;
  transactions: string | null;
  receipts: string | null;
  transaction_fees_near: string | null;
  transaction_volume_near: string | null;
  price_usd: string | null;
  market_cap_usd: string | null;
  source_digest: string;
  quality_flags: QualityFlag[];
}

export interface ActivitySample {
  from_height: string;
  to_height: string;
  requested_blocks: number;
  processed_blocks: number;
  missing_blocks: number;
  chunk_ids: string[];
  transaction_ids: string[];
  receipt_ids: string[];
  outcome_ids: string[];
  transactions_seen: number;
  outcomes_processed: number;
  total_gas_burnt: string;
  execution_tokens_burnt_yocto: string;
  note: string;
}

export interface Snapshot {
  schema_version: "near-underwrite.snapshot.v1";
  id: string;
  network: "mainnet";
  created_at: string;
  finalized_block: {
    height: string;
    hash: string;
    timestamp_ns: string;
    timestamp_iso: string;
    total_supply_yocto: string;
    gas_price_yocto: string;
    protocol_version: number;
    chunk_ids: string[];
  };
  epoch: {
    epoch_height: string;
    epoch_start_height: string;
    validator_accounts: ValidatorStake[];
    beneficial_operator_caveat: string;
  };
  protocol: {
    protocol_version: number;
    epoch_length: string;
    max_inflation_rate: [number, number] | null;
    protocol_reward_rate: [number, number] | null;
    num_blocks_per_year: string | null;
    configuration_digest: string;
  };
  activity: ActivitySample;
  history: HistoricalDay[];
  observations: Observation[];
  completeness: {
    status: "complete" | "partial" | "unavailable";
    problems: QualityFlag[];
  };
  source_digests: Record<string, string>;
  raw_responses?: Array<{ url: string; method: string; request: string | null; retrieved_at: string; sha256: string; body: string }>;
}

export interface ModelAssumptions {
  starting_supply_yocto: string;
  annual_gross_issuance_near: string;
  annual_actual_protocol_burn_near: string;
  daily_relevant_settlement_usd: string;
  near_held_fraction: string;
  holding_duration_days: string;
  near_price_usd: string | null;
  stake_threshold_fraction: string;
}

export interface ModelResult {
  annual_net_monetary_change_near: string;
  projected_year_end_supply_near: string;
  burn_break_even_near: string;
  working_capital_near: string | null;
  working_capital_status: "derived" | "unavailable";
  stake_concentration: {
    top_1_fraction: string;
    top_5_fraction: string;
    top_10_fraction: string;
    minimum_accounts_for_threshold: number | null;
    threshold_fraction: string;
    caveat: string;
  };
  observed_supply_change_near: string | null;
  conclusion: "bearish" | "neutral" | "bullish";
  conclusion_reasons: string[];
  limits: string[];
}

export interface ResearchClaim {
  id: string;
  title: string;
  conclusion: "bearish" | "neutral" | "bullish";
  statement: string;
  metric_ids: string[];
  assumption_ids: string[];
  formula: string;
  uncertainty: string;
  counterargument: string;
  falsification_condition: string;
}

export interface AIClaim {
  id: string;
  text: string;
  numerical_claims: Array<{ text: string; evidence_ids: string[] }>;
  evidence_ids: string[];
  counterargument: string;
  missing_information: string[];
  confidence_explanation: string;
}

export interface AIRoleResult {
  role: "bull" | "bear" | "synthesis";
  provider: string;
  model: string;
  request_id: string;
  created_at: string;
  claims: AIClaim[];
  disagreements: string[];
  reported_usage: { prompt_tokens: number | null; completion_tokens: number | null; total_tokens: number | null };
  estimated_usage: { input_tokens_upper_bound: number; output_tokens_limit: number };
  validation_flags: QualityFlag[];
}

export interface ResearchBundle {
  schema_version: "near-underwrite.bundle.v1";
  report_id: string;
  created_at: string;
  parent_publication_id: string | null;
  snapshot: Snapshot;
  assumptions: ModelAssumptions;
  result: ModelResult;
  claims: ResearchClaim[];
  ai_results: AIRoleResult[];
  notes: string;
  formula_version: "near-underwrite.model.v1";
  credential_material_included: false;
}
