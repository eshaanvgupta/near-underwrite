import { Decimal } from "decimal.js";
import type { ModelAssumptions, ModelResult, Snapshot, ValidatorStake } from "./types.js";

Decimal.set({ precision: 80, rounding: Decimal.ROUND_HALF_EVEN, toExpNeg: -80, toExpPos: 80 });

const YOCTO = new Decimal("1000000000000000000000000");

export function yoctoToNear(value: string): Decimal {
  if (!/^\d+$/.test(value)) throw new Error("Atomic token quantity must be an unsigned integer string");
  return new Decimal(value).div(YOCTO);
}

export function nearToYocto(value: string): string {
  const amount = new Decimal(value);
  if (!amount.isFinite() || amount.isNegative()) throw new Error("NEAR amount must be finite and non-negative");
  const atomic = amount.mul(YOCTO);
  if (!atomic.isInteger()) throw new Error("NEAR amount exceeds 24 decimal places");
  return atomic.toFixed(0);
}

function fixed(value: Decimal, places = 8): string {
  return value.toDecimalPlaces(places).toFixed();
}

export function stakeConcentration(validators: ValidatorStake[], thresholdText: string): ModelResult["stake_concentration"] {
  const threshold = new Decimal(thresholdText);
  if (threshold.lte(0) || threshold.gt(1)) throw new Error("Stake threshold fraction must be greater than 0 and at most 1");
  const sorted = validators
    .map((validator) => ({ ...validator, stake: new Decimal(validator.stake_yocto) }))
    .sort((a, b) => b.stake.comparedTo(a.stake));
  const total = sorted.reduce((sum, item) => sum.plus(item.stake), new Decimal(0));
  const fraction = (count: number) => total.isZero()
    ? new Decimal(0)
    : sorted.slice(0, count).reduce((sum, item) => sum.plus(item.stake), new Decimal(0)).div(total);
  let cumulative = new Decimal(0);
  let minimum: number | null = null;
  sorted.forEach((item, index) => {
    if (minimum !== null || total.isZero()) return;
    cumulative = cumulative.plus(item.stake);
    if (cumulative.div(total).gte(threshold)) minimum = index + 1;
  });
  return {
    top_1_fraction: fixed(fraction(1), 10),
    top_5_fraction: fixed(fraction(5), 10),
    top_10_fraction: fixed(fraction(10), 10),
    minimum_accounts_for_threshold: minimum,
    threshold_fraction: threshold.toFixed(),
    caveat: "Validator account IDs are not verified beneficial-owner identities; one operator can control multiple accounts and one account can aggregate delegators.",
  };
}

export function observedSupplyChange(snapshot: Snapshot): string | null {
  const points = snapshot.history.filter((point) => point.total_supply_yocto !== null);
  if (points.length < 2) return null;
  const newest = new Decimal(points[0]!.total_supply_yocto!);
  const oldest = new Decimal(points[points.length - 1]!.total_supply_yocto!);
  return fixed(newest.minus(oldest).div(YOCTO), 8);
}

export function calculateModel(snapshot: Snapshot, assumptions: ModelAssumptions): ModelResult {
  const startingSupply = yoctoToNear(assumptions.starting_supply_yocto);
  const issuance = new Decimal(assumptions.annual_gross_issuance_near);
  const burn = new Decimal(assumptions.annual_actual_protocol_burn_near);
  const dailySettlement = new Decimal(assumptions.daily_relevant_settlement_usd);
  const heldFraction = new Decimal(assumptions.near_held_fraction);
  const holdingDays = new Decimal(assumptions.holding_duration_days);
  for (const [name, value] of Object.entries({ issuance, burn, dailySettlement, heldFraction, holdingDays })) {
    if (!value.isFinite() || value.isNegative()) throw new Error(`${name} must be finite and non-negative`);
  }
  if (heldFraction.gt(1)) throw new Error("NEAR-held fraction cannot exceed 1");
  const net = issuance.minus(burn);
  const projected = startingSupply.plus(net);
  if (projected.isNegative()) throw new Error("Projected supply cannot be negative");
  let workingCapital: string | null = null;
  if (assumptions.near_price_usd !== null) {
    const price = new Decimal(assumptions.near_price_usd);
    if (!price.isFinite() || price.lte(0)) throw new Error("Price must be positive when supplied");
    workingCapital = fixed(dailySettlement.mul(heldFraction).mul(holdingDays).div(price), 8);
  }
  const observed = observedSupplyChange(snapshot);
  const captureIsMeaningful = heldFraction.gte("0.01") && holdingDays.gte("1");
  const netDeflationary = net.lte(0);
  const historySupports = observed !== null && new Decimal(observed).lte(0);
  const conclusion: ModelResult["conclusion"] = netDeflationary && captureIsMeaningful
    ? "bullish"
    : !captureIsMeaningful && net.gt(0)
      ? "bearish"
      : historySupports && captureIsMeaningful
        ? "bullish"
        : "neutral";
  return {
    annual_net_monetary_change_near: fixed(net),
    projected_year_end_supply_near: fixed(projected),
    burn_break_even_near: fixed(issuance),
    working_capital_near: workingCapital,
    working_capital_status: workingCapital === null ? "unavailable" : "derived",
    stake_concentration: stakeConcentration(snapshot.epoch.validator_accounts, assumptions.stake_threshold_fraction),
    observed_supply_change_near: observed,
    conclusion,
    conclusion_reasons: [
      `Assumed annual net monetary change is ${fixed(net)} NEAR; this is scenario arithmetic, not an observed gross-issuance measurement.`,
      workingCapital === null
        ? "Working-capital demand is unavailable because no positive USD price assumption was supplied."
        : `Illustrative working-capital inventory is ${workingCapital} NEAR under the selected capture and holding-duration assumptions.`,
      observed === null
        ? "Fewer than two genuine supply observations are available, so observed net supply change is unavailable."
        : `The available historical series shows a net supply change of ${observed} NEAR from oldest to newest point; it does not separate issuance from burns.`,
    ],
    limits: [
      "Settlement activity is not protocol revenue, burn, token-holder cash flow, or proof that users hold NEAR.",
      "The working-capital output is an inventory scenario, not a price target or complete token valuation.",
      "Staking rewards are protocol issuance to participants and are not automatically external revenue.",
      "Validator-account concentration does not identify unique beneficial operators.",
    ],
  };
}

export interface SnapshotComparison {
  observation_changes: Array<{ metric: string; before: string | null; after: string | null }>;
  assumption_changes: Array<{ assumption: keyof ModelAssumptions; before: string | null; after: string | null }>;
}

export function compareResearch(
  previous: { snapshot: Snapshot; assumptions: ModelAssumptions },
  current: { snapshot: Snapshot; assumptions: ModelAssumptions },
): SnapshotComparison {
  const observationChanges = [
    ["finalized_block.height", previous.snapshot.finalized_block.height, current.snapshot.finalized_block.height],
    ["finalized_block.total_supply_yocto", previous.snapshot.finalized_block.total_supply_yocto, current.snapshot.finalized_block.total_supply_yocto],
    ["activity.transactions_seen", String(previous.snapshot.activity.transactions_seen), String(current.snapshot.activity.transactions_seen)],
    ["activity.execution_tokens_burnt_yocto", previous.snapshot.activity.execution_tokens_burnt_yocto, current.snapshot.activity.execution_tokens_burnt_yocto],
  ] as const;
  const keys = Object.keys(current.assumptions) as Array<keyof ModelAssumptions>;
  return {
    observation_changes: observationChanges
      .filter(([, before, after]) => before !== after)
      .map(([metric, before, after]) => ({ metric, before, after })),
    assumption_changes: keys
      .filter((key) => previous.assumptions[key] !== current.assumptions[key])
      .map((assumption) => ({ assumption, before: previous.assumptions[assumption], after: current.assumptions[assumption] })),
  };
}
