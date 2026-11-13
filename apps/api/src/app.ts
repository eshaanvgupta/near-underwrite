import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { aiRequestSchema, publicationSchema, workspaceSchema, canonicalJson } from "@near-underwrite/shared";
import type { Config } from "./config.js";
import { collectSnapshot } from "./collector.js";
import { discoverModels, runAIRole } from "./ai.js";
import { redactSecrets, safeError } from "./redact.js";
import type { Store } from "./store.js";

export function buildApp(config: Config, store: Store) {
  let activeAI = 0;
  const session = (headers: Record<string, unknown>) => {
    const token = headers["x-workspace-token"];
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) throw Object.assign(new Error("A valid browser session capability is required"), { statusCode: 401 });
    return createHash("sha256").update(token).digest("hex");
  };
  const uuidFrom = (value: string) => {
    const hex = createHash("sha256").update(value).digest("hex");
    return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-4" + hex.slice(13, 16) + "-8" + hex.slice(17, 20) + "-" + hex.slice(20, 32);
  };
  const app = Fastify({
    logger: {
      level: "info",
      redact: {
        paths: ["req.headers.authorization", "req.headers.x-workspace-token", "req.body.api_key", "req.body.apiKey", "headers.authorization"],
        censor: "[REDACTED]",
      },
    },
    trustProxy: config.TRUST_PROXY,
    bodyLimit: config.AI_MAX_INPUT_BYTES + 20_000,
  });

  app.register(cors, {
    origin: (origin, callback) => callback(null, !origin || origin === config.WEB_ORIGIN),
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["content-type", "x-near-underwrite", "x-workspace-token"],
  });
  app.register(rateLimit, { max: 120, timeWindow: "1 minute" });

  app.addHook("preHandler", async (request, reply) => {
    if (request.headers.origin && request.headers.origin !== config.WEB_ORIGIN) return reply.code(403).send({ error: "Origin is not authorized" });
    if (request.method !== "GET" && request.method !== "HEAD" && request.headers["x-near-underwrite"] !== "1") {
      await reply.code(403).send({ error: "Missing explicit application confirmation header" });
    }
  });

  app.setErrorHandler((error, _request, reply) => {
    app.log.error(redactSecrets({ error: safeError(error) }));
    const statusCode = typeof error === "object" && error !== null && "statusCode" in error && typeof error.statusCode === "number" && error.statusCode >= 400 ? error.statusCode : 500;
    void reply.code(statusCode).send({ error: safeError(error) });
  });

  app.get("/health/live", async () => ({ status: "live" }));
  app.get("/health/ready", async (_request, reply) => {
    const ready = await store.ready();
    return reply.code(ready ? 200 : 503).send({ status: ready ? "ready" : "unavailable", database: ready });
  });

  app.get("/v1/snapshots/latest", async (_request, reply) => {
    const snapshot = await store.latestSnapshot();
    return snapshot ? snapshot : reply.code(503).send({ error: "No successful public-source snapshot is cached yet" });
  });
  app.get("/v1/snapshots", async (request) => {
    const query = request.query as { limit?: string };
    const limit = Math.min(Math.max(Number(query.limit ?? 20), 1), 100);
    return { snapshots: await store.listSnapshots(limit) };
  });
  app.get<{ Params: { id: string } }>("/v1/snapshots/:id", async (request, reply) => {
    const snapshot = await store.getSnapshot(request.params.id);
    return snapshot ?? reply.code(404).send({ error: "Snapshot not found" });
  });
  app.post("/v1/snapshots/refresh", { config: { rateLimit: { max: 2, timeWindow: "1 minute" } } }, async () => {
    return { snapshot: await store.latestSnapshot(), message: "The shared scheduled collector owns source refreshes." };
  });

  app.post("/v1/workspaces", async (request) => {
    const workspace = workspaceSchema.parse(request.body);
    if (!await store.authorizeWorkspace(workspace.id, session(request.headers))) throw Object.assign(new Error("Workspace belongs to another session"), { statusCode: 403 });
    await store.saveWorkspace(workspace);
    return workspace;
  });
  app.get<{ Params: { id: string } }>("/v1/workspaces/:id", async (request, reply) => {
    if (!await store.authorizeWorkspace(request.params.id, session(request.headers))) return reply.code(403).send({ error: "Workspace belongs to another session" });
    const workspace = await store.getWorkspace(request.params.id);
    return workspace ?? reply.code(404).send({ error: "Workspace not found" });
  });

  app.post("/v1/ai/models", { config: { rateLimit: { max: 6, timeWindow: "1 minute" } } }, async (request) => {
    session(request.headers);
    const body = request.body as { provider?: string; endpoint?: string; api_key?: string };
    if (!["near-ai", "openai-compatible", "local"].includes(body.provider ?? "") || !body.endpoint || !body.api_key) throw new Error("Provider, endpoint, and transient API key are required");
    return discoverModels(body.provider as "near-ai" | "openai-compatible" | "local", body.endpoint, body.api_key, config);
  });

  app.post("/v1/ai/analyze", { config: { rateLimit: { max: 8, timeWindow: "1 minute" } } }, async (request, reply) => {
    const body = aiRequestSchema.parse(request.body);
    const owner = session(request.headers);
    if (!await store.authorizeWorkspace(body.workspace_id, owner)) return reply.code(403).send({ error: "Workspace belongs to another session" });
    if (!await store.bindAnalysis(body.analysis_id, owner, createHash("sha256").update(canonicalJson(body.evidence_bundle)).digest("hex"))) return reply.code(409).send({ error: "All roles must use the same frozen evidence bundle; start a new analysis to change it" });
    if (activeAI >= config.AI_MAX_CONCURRENCY) return reply.code(429).send({ error: "AI concurrency limit reached; no request dispatched" });
    activeAI += 1;
    const reserved = await store.reserveAI(uuidFrom(owner), body.confirmation_id, Math.min(body.daily_call_budget, config.AI_DAILY_REQUEST_LIMIT));
    if (!reserved) { activeAI -= 1; return reply.code(429).send({ error: "Duplicate confirmation or daily application request limit reached" }); }
    const analysisReserved = await store.reserveAI(body.analysis_id, body.confirmation_id + "-analysis", body.max_calls_per_analysis);
    if (!analysisReserved) { activeAI -= 1; return reply.code(429).send({ error: "Analysis call limit reached; no request dispatched; daily reservation retained conservatively" }); }
    try {
      const result = await runAIRole({
        provider: body.provider,
        endpoint: body.endpoint,
        apiKey: body.api_key,
        model: body.model,
        role: body.role,
        evidenceBundle: body.evidence_bundle,
        maxOutputTokens: body.max_output_tokens,
      }, config);
      const uncertain = result.reported_usage.total_tokens === null;
      await store.reconcileAI(body.confirmation_id, uncertain ? "uncertain" : "completed", result.reported_usage);
      return result;
    } catch (error) {
      await store.reconcileAI(body.confirmation_id, "uncertain", { error: safeError(error) });
      throw error;
    } finally {
      activeAI -= 1;
    }
  });

  app.post("/v1/publications", async (request) => {
    const publication = publicationSchema.parse(request.body);
    const deployment = JSON.parse(await readFile(new URL("../../../evidence/deployment.json", import.meta.url), "utf8")) as { network: string; rpc_url: string; contract_id: string; code_hash: string };
    if (deployment.network !== "testnet") throw new Error("Publication cache requires testnet");
    const rpc = async (method: string, params: unknown) => {
      const response = await fetch(deployment.rpc_url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: "publication-cache", method, params }), signal: AbortSignal.timeout(20000) });
      const body = await response.json() as { error?: unknown; result?: unknown };
      if (!response.ok || body.error) throw new Error("Testnet evidence unavailable");
      return body.result;
    };
    const account = await rpc("query", { request_type: "view_account", finality: "final", account_id: deployment.contract_id }) as { code_hash: string };
    if (account.code_hash !== deployment.code_hash) throw new Error("Registry code identity mismatch");
    const response = await rpc("query", { request_type: "call_function", finality: "final", account_id: deployment.contract_id, method_name: "get_publication", args_base64: Buffer.from(JSON.stringify({ publication_id: publication.publication_id })).toString("base64") }) as { result: number[] };
    const onChain = JSON.parse(Buffer.from(response.result).toString("utf8")) as Record<string, unknown> | null;
    if (!onChain || !["author", "report_digest", "evidence_digest", "model_digest", "schema_version", "parent_id", "block_height", "chain_timestamp_ns"].every(key => onChain[key] === publication[key as keyof typeof publication])) throw new Error("Publication does not match final registry state");
    await store.savePublication(publication);
    return publication;
  });
  app.get<{ Params: { id: string } }>("/v1/publications/:id", async (request, reply) => {
    const publication = await store.getPublication(request.params.id);
    return publication ?? reply.code(404).send({ error: "Publication not found" });
  });
  app.get<{ Params: { author: string } }>("/v1/publications/author/:author", async (request) => {
    const query = request.query as { offset?: string; limit?: string };
    const offset = Math.max(Number(query.offset ?? 0), 0);
    const limit = Math.min(Math.max(Number(query.limit ?? 20), 1), 100);
    return { publications: await store.listPublications(request.params.author, offset, limit), offset, limit };
  });

  return app;
}
