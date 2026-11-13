import { z } from "zod";

const booleanText = z.enum(["true", "false"]).transform((value) => value === "true");

export const configSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().optional(),
  ALLOW_MEMORY_DB: booleanText.default(false),
  WEB_ORIGIN: z.string().url().default("http://localhost:4173"),
  TRUST_PROXY: booleanText.default(false),
  COLLECTOR_EMBEDDED: booleanText.default(true),
  MAINNET_RPC_URL: z.string().url().default("https://free.rpc.fastnear.com"),
  NEARBLOCKS_BASE_URL: z.string().url().default("https://api.nearblocks.io"),
  COLLECT_INTERVAL_MS: z.coerce.number().int().min(30_000).max(86_400_000).default(60_000),
  ACTIVITY_SAMPLE_BLOCKS: z.coerce.number().int().min(1).max(10).default(3),
  ACTIVITY_MAX_TRANSACTIONS: z.coerce.number().int().min(1).max(50).default(12),
  GENERIC_AI_ALLOWED_HOSTS: z.string().default(""),
  OPERATOR_LOCAL_AI_ENABLED: booleanText.default(false),
  OPERATOR_LOCAL_AI_ENDPOINT: z.string().url().optional(),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(120_000).default(45_000),
  AI_MAX_INPUT_BYTES: z.coerce.number().int().min(10_000).max(1_000_000).default(180_000),
  AI_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
  AI_DAILY_REQUEST_LIMIT: z.coerce.number().int().min(1).max(100).default(24),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): Config {
  return configSchema.parse(environment);
}
