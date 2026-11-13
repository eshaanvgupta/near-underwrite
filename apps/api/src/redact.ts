const SECRET_KEYS = /api[-_]?key|authorization|token|secret|password|credential/i;
const BEARER = /Bearer\s+[A-Za-z0-9._~+\/-]+/gi;

export function redactSecrets(value: unknown): unknown {
  if (typeof value === "string") return value.replace(BEARER, "Bearer [REDACTED]");
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      key,
      SECRET_KEYS.test(key) ? "[REDACTED]" : redactSecrets(child),
    ]));
  }
  return value;
}

export function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(BEARER, "Bearer [REDACTED]").slice(0, 800);
}
