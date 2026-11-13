export class SourceUnavailableError extends Error {
  constructor(public readonly source: string, message: string) {
    super(message);
    this.name = "SourceUnavailableError";
  }
}

export async function boundedFetch(
  url: string,
  init: RequestInit = {},
  options: { timeoutMs?: number; attempts?: number; fetchImpl?: typeof fetch } = {},
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const attempts = options.attempts ?? 2;
  const fetchImpl = options.fetchImpl ?? fetch;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { ...init, signal: controller.signal, redirect: "manual" });
      if (response.status >= 300 && response.status < 400) throw new Error("Redirects are not followed");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
