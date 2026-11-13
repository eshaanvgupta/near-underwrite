import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { redactSecrets } from "../src/redact.js";
import { validateProviderEndpoint } from "../src/provider.js";

const config = loadConfig({
  ALLOW_MEMORY_DB: "true",
  GENERIC_AI_ALLOWED_HOSTS: "api.example.com",
  OPERATOR_LOCAL_AI_ENABLED: "false",
});

describe("credential and outbound-request controls", () => {
  it("redacts nested keys and bearer tokens", () => {
    expect(redactSecrets({ api_key: "sk-test", note: "Bearer abc.def", nested: { password: "x" } })).toEqual({
      api_key: "[REDACTED]",
      note: "Bearer [REDACTED]",
      nested: { password: "[REDACTED]" },
    });
  });

  it("pins the NEAR AI provider identity", async () => {
    await expect(validateProviderEndpoint("near-ai", "https://evil.example/v1", config)).rejects.toThrow(/must be/);
  });

  it("rejects unallowlisted and local hosted proxy destinations", async () => {
    await expect(validateProviderEndpoint("openai-compatible", "https://other.example/v1", config)).rejects.toThrow(/allowlist/);
    await expect(validateProviderEndpoint("local", "http://127.0.0.1:11434/v1", config)).rejects.toThrow(/disabled/);
  });
});
