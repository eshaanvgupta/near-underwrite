import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import type { Config } from "./config.js";

function isPrivateAddress(address: string): boolean {
  if (address === "::1" || address === "::" || address.toLowerCase().startsWith("fe80:") || address.toLowerCase().startsWith("fc") || address.toLowerCase().startsWith("fd")) return true;
  if (address.startsWith("::ffff:")) return isPrivateAddress(address.slice(7));
  if (isIP(address) !== 4) return false;
  const parts = address.split(".").map(Number);
  const [a = 0, b = 0] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19));
}

export interface ValidatedEndpoint {
  url: URL;
  addresses: Array<{ address: string; family: number }>;
  localOperatorMode: boolean;
}

export async function validateProviderEndpoint(
  provider: "near-ai" | "openai-compatible" | "local",
  endpointText: string,
  config: Config,
): Promise<ValidatedEndpoint> {
  const url = new URL(endpointText);
  if (url.username || url.password) throw new Error("Provider URL cannot include credentials");
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/$/, "");
  if (provider === "near-ai") {
    if (url.origin !== "https://cloud-api.near.ai" || url.pathname !== "/v1") throw new Error("NEAR AI endpoint must be https://cloud-api.near.ai/v1");
  } else if (provider === "local") {
    if (!config.OPERATOR_LOCAL_AI_ENABLED || !config.OPERATOR_LOCAL_AI_ENDPOINT) throw new Error("Local inference is disabled on this server");
    const configured = new URL(config.OPERATOR_LOCAL_AI_ENDPOINT);
    if (url.origin !== configured.origin || url.pathname !== configured.pathname.replace(/\/$/, "")) throw new Error("Local endpoint must match the operator-configured endpoint");
    return { url, addresses: [], localOperatorMode: true };
  } else {
    if (url.protocol !== "https:") throw new Error("Hosted generic providers must use HTTPS");
    const allowed = config.GENERIC_AI_ALLOWED_HOSTS.split(",").map((host) => host.trim().toLowerCase()).filter(Boolean);
    if (!allowed.includes(url.hostname.toLowerCase())) throw new Error("Provider host is not on the operator allowlist");
  }
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) throw new Error("Provider DNS resolved to a private, link-local, metadata, or reserved address");
  return { url, addresses, localOperatorMode: false };
}

export async function pinnedJsonRequest(
  endpoint: ValidatedEndpoint,
  path: string,
  init: { method: "GET" | "POST"; apiKey: string; body?: unknown; timeoutMs: number },
): Promise<{ status: number; body: unknown; headers: Record<string, string | string[] | undefined> }> {
  if (endpoint.localOperatorMode) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), init.timeoutMs);
    try {
      const response = await fetch(new URL(endpoint.url.pathname + path, endpoint.url.origin), {
        method: init.method,
        headers: { authorization: `Bearer ${init.apiKey}`, "content-type": "application/json" },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
        signal: controller.signal,
        redirect: "manual",
      });
      if (response.status >= 300 && response.status < 400) throw new Error("Provider redirects are rejected");
      return { status: response.status, body: await response.json(), headers: Object.fromEntries(response.headers.entries()) };
    } finally {
      clearTimeout(timer);
    }
  }
  const target = endpoint.addresses[0]!;
  const finalPath = `${endpoint.url.pathname}${path}`;
  const body = init.body === undefined ? undefined : JSON.stringify(init.body);
  const transport = endpoint.url.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const request = transport({
      hostname: target.address,
      family: target.family,
      port: endpoint.url.port || (endpoint.url.protocol === "https:" ? 443 : 80),
      path: finalPath,
      method: init.method,
      servername: endpoint.url.hostname,
      headers: {
        host: endpoint.url.host,
        authorization: `Bearer ${init.apiKey}`,
        accept: "application/json",
        "content-type": "application/json",
        ...(body ? { "content-length": Buffer.byteLength(body) } : {}),
      },
      timeout: init.timeoutMs,
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk) => {
        chunks.push(Buffer.from(chunk));
        if (chunks.reduce((sum, item) => sum + item.length, 0) > 2_000_000) request.destroy(new Error("Provider response exceeded 2 MB"));
      });
      response.on("end", () => {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400) return reject(new Error("Provider redirects are rejected"));
        if (response.headers["content-type"]?.includes("text/event-stream")) return reject(new Error("Streaming responses are unsupported; request remains uncertain"));
        try {
          resolve({ status, body: JSON.parse(Buffer.concat(chunks).toString("utf8")), headers: response.headers });
        } catch {
          reject(new Error("Provider returned malformed JSON"));
        }
      });
    });
    request.on("timeout", () => request.destroy(new Error("Provider request timed out")));
    request.on("error", reject);
    if (body) request.write(body);
    request.end();
  });
}
