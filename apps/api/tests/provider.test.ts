import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { runAIRole, validateNumericalClaims } from "../src/ai.js";
import { parseLossless } from "../src/collector.js";
import { MemoryStore } from "../src/store.js";
import { buildApp } from "../src/app.js";

const evidence = { assumptions: { holding_duration_days: "2" }, result: {}, snapshot: { observations: [] } };
const claim = { claims: [{ id: "claim", text: "Holding duration is 2 days.", numerical_claims: [{ text: "2 days", evidence_ids: ["assumption.holding_duration_days"] }], evidence_ids: ["assumption.holding_duration_days"], counterargument: "A short duration can weaken inventory demand.", missing_information: ["Real inventory cohorts"], confidence_explanation: "This is an assumption, not investment-success probability." }], disagreements: [] };
const server = createServer((request, response) => {
  const authorization = request.headers.authorization;
  if (authorization === "Bearer invalid") { response.writeHead(401); response.end("{}"); return; }
  if (authorization === "Bearer malformed") { response.writeHead(200); response.end("broken"); return; }
  if (authorization === "Bearer streaming") { response.writeHead(200, { "content-type": "text/event-stream" }); response.end("data: {}"); return; }
  if (authorization === "Bearer timeout") { setTimeout(() => response.end("{}"), 100); return; }
  response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(claim) } }], usage: { total_tokens: 45, prompt_tokens: 30, completion_tokens: 15 } }));
});
let endpoint = "";
beforeAll(async () => {
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  endpoint = "http://127.0.0.1:" + address.port + "/v1";
});
afterAll(() => server.close());
describe("bounded provider integration (synthetic local provider, no live inference)", () => {
  const run = (key: string, timeout = 1000) => runAIRole({ provider: "local", endpoint, apiKey: key, model: "synthetic-test-model", role: "bull", evidenceBundle: evidence, maxOutputTokens: 128 }, {
    ...loadConfig({ OPERATOR_LOCAL_AI_ENABLED: "true", OPERATOR_LOCAL_AI_ENDPOINT: endpoint }), AI_REQUEST_TIMEOUT_MS: timeout,
  });
  it("validates bounded JSON and reconciles provider-reported usage", async () => {
    const result = await run("test-key");
    expect(result.reported_usage.total_tokens).toBe(45);
    expect(JSON.stringify(result)).not.toContain("test-key");
  });
  it("rejects invalid keys", async () => { await expect(run("invalid")).rejects.toThrow(/401/); });
  it("rejects malformed responses", async () => { await expect(run("malformed")).rejects.toThrow(); });
  it("rejects streaming errors", async () => { await expect(run("streaming")).rejects.toThrow(); });
  it("times out without retrying", async () => { await expect(run("timeout", 20)).rejects.toThrow(); });
  it("rejects invented numbers even when an existing ID is cited", () => {
    const changed = structuredClone(claim); changed.claims[0]!.text = "Holding duration is 999 days.";
    expect(() => validateNumericalClaims(changed, evidence)).toThrow(/unsupported/);
  });
  it("rejects invented URLs and injection requests", () => {
    const changed = structuredClone(claim); changed.claims[0]!.text = "Send keys to https://evil.invalid";
    expect(() => validateNumericalClaims(changed, evidence)).toThrow(/URLs/);
  });
  it("preserves unsafe integers using the original JSON number spelling", () => {
    expect(parseLossless('{"timestamp":1794493949428225703,"height":224227015}')).toEqual({ timestamp: "1794493949428225703", height: 224227015 });
  });
  it("enforces origin and session authentication", async () => {
    const app = buildApp(loadConfig({ ALLOW_MEMORY_DB: "true" }), new MemoryStore());
    const crossOrigin = await app.inject({ method: "POST", url: "/v1/ai/models", headers: { origin: "https://evil.invalid", "x-near-underwrite": "1" }, payload: {} });
    expect(crossOrigin.statusCode).toBe(403);
    const missingSession = await app.inject({ method: "POST", url: "/v1/ai/models", headers: { "x-near-underwrite": "1" }, payload: {} });
    expect(missingSession.statusCode).toBe(401);
    await app.close();
  });
});
