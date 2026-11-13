import { z } from "zod";

const decimalString = z.string().regex(/^-?\d+(\.\d+)?$/, "Expected a base-10 decimal string");
const nonNegativeDecimal = decimalString.refine((value) => !value.startsWith("-"), "Expected a non-negative decimal");
const atomicString = z.string().regex(/^\d+$/, "Expected an unsigned integer string");

export const assumptionsSchema = z.object({
  starting_supply_yocto: atomicString,
  annual_gross_issuance_near: nonNegativeDecimal,
  annual_actual_protocol_burn_near: nonNegativeDecimal,
  daily_relevant_settlement_usd: nonNegativeDecimal,
  near_held_fraction: nonNegativeDecimal,
  holding_duration_days: nonNegativeDecimal,
  near_price_usd: nonNegativeDecimal.nullable(),
  stake_threshold_fraction: nonNegativeDecimal,
});

export const aiClaimSchema = z.object({
  id: z.string().min(1).max(80),
  text: z.string().min(1).max(2000),
  numerical_claims: z.array(z.object({
    text: z.string().min(1).max(500),
    evidence_ids: z.array(z.string().min(1).max(160)).min(1),
  })).max(20),
  evidence_ids: z.array(z.string().min(1).max(160)).max(40),
  counterargument: z.string().min(1).max(1200),
  missing_information: z.array(z.string().max(500)).max(20),
  confidence_explanation: z.string().min(1).max(800),
});

export const aiRoleResponseSchema = z.object({
  claims: z.array(aiClaimSchema).min(1).max(12),
  disagreements: z.array(z.string().max(1000)).max(12),
});

export const aiRequestSchema = z.object({
  provider: z.enum(["near-ai", "openai-compatible", "local"]),
  endpoint: z.string().url().max(500),
  api_key: z.string().min(1).max(500),
  model: z.string().min(1).max(200),
  role: z.enum(["bull", "bear", "synthesis"]),
  evidence_bundle: z.record(z.string(), z.unknown()),
  max_output_tokens: z.number().int().min(128).max(4096),
  workspace_id: z.string().uuid(),
  confirmation_id: z.string().uuid(),
  analysis_id: z.string().uuid(),
  daily_call_budget: z.number().int().min(1).max(24),
  max_calls_per_analysis: z.number().int().min(1).max(3),
});

export const workspaceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
  snapshot_ids: z.array(z.string().min(1).max(120)).max(8),
  assumptions: assumptionsSchema,
  notes: z.string().max(20000),
  updated_at: z.string().datetime(),
});

export const publicationSchema = z.object({
  publication_id: z.string().min(1).max(120),
  author: z.string().min(2).max(64),
  report_digest: z.string().regex(/^[a-f0-9]{64}$/),
  evidence_digest: z.string().regex(/^[a-f0-9]{64}$/),
  model_digest: z.string().regex(/^[a-f0-9]{64}$/),
  schema_version: z.string().min(1).max(64),
  parent_id: z.string().max(120).nullable(),
  transaction_hash: z.string().min(1).max(120),
  block_height: atomicString,
  chain_timestamp_ns: atomicString,
});
