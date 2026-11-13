import type { ModelAssumptions, ModelResult, ResearchClaim, Snapshot } from "./types.js";

export function buildDeterministicClaims(snapshot: Snapshot, assumptions: ModelAssumptions, result: ModelResult): ResearchClaim[] {
  return [
    {
      id: "claim.monetary-balance",
      title: "Current assumptions do not make usage equal value capture",
      conclusion: result.conclusion,
      statement: `The scenario produces ${result.annual_net_monetary_change_near} NEAR of annual net monetary change. Activity strengthens the thesis only when a measured mechanism converts it into persistent NEAR inventory or actual protocol burn.`,
      metric_ids: ["near.mainnet.finalized.total_supply", "nearblocks.daily.total_supply"],
      assumption_ids: ["annual_gross_issuance_near", "annual_actual_protocol_burn_near"],
      formula: "annual net monetary change = assumed gross issuance − assumed actual protocol burn",
      uncertainty: "The current public snapshot measures net supply and execution burn fields; it does not independently decompose all gross issuance and burn categories.",
      counterargument: "Protocol configuration places a ceiling on inflation and actual realized issuance may be lower; product-level buybacks may create demand outside base-protocol burn.",
      falsification_condition: "Over a rolling 90-day window, independently reconciled actual burns and retained token purchases fail to approach observed net issuance.",
    },
    {
      id: "claim.working-capital",
      title: "Holding duration is the bridge between settlement and token inventory",
      conclusion: result.working_capital_near === null ? "neutral" : result.conclusion,
      statement: result.working_capital_near === null
        ? "Working-capital demand is unavailable until a positive USD price assumption is supplied."
        : `The selected settlement, capture, duration, and price assumptions imply ${result.working_capital_near} NEAR of illustrative working-capital inventory.`,
      metric_ids: ["nearblocks.daily.transaction_volume_near"],
      assumption_ids: ["daily_relevant_settlement_usd", "near_held_fraction", "holding_duration_days", "near_price_usd"],
      formula: "(daily relevant settlement USD × NEAR-held fraction × holding days) ÷ assumed NEAR price USD",
      uncertainty: "The scenario does not establish that NearBlocks transaction volume is the relevant settlement volume or that any selected fraction is held in NEAR.",
      counterargument: "Users and solvers can settle rapidly, use alternate assets, or source NEAR just in time, collapsing holding duration.",
      falsification_condition: "For 90 days, measured median NEAR inventory duration attributable to settlement remains below the selected threshold or cannot be linked to activity.",
    },
    {
      id: "claim.concentration",
      title: "Validator-account concentration is measurable, operator concentration is not",
      conclusion: "neutral",
      statement: `${result.stake_concentration.minimum_accounts_for_threshold ?? "Unavailable"} validator accounts reach the selected ${assumptions.stake_threshold_fraction} stake threshold.`,
      metric_ids: ["near.mainnet.validators.current"],
      assumption_ids: ["stake_threshold_fraction"],
      formula: "sort current validator accounts by stake; accumulate until threshold × total current validator stake",
      uncertainty: result.stake_concentration.caveat,
      counterargument: "Delegation and common beneficial ownership can make account-level concentration understate or overstate operational concentration.",
      falsification_condition: "A verified operator mapping materially changes the threshold account count or top-10 concentration.",
    },
  ];
}
