import type { AIRoleResult, Snapshot } from "@near-underwrite/shared";

const API_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "http://localhost:8787" : "");
export const hasBackend = API_URL.length > 0;

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!hasBackend) throw new Error("The shared backend is not connected on this Pages preview. Use the Docker release or connect a hosted API.");
  let capability = localStorage.getItem("near-underwrite.session");
  if (!capability) {
    capability = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
    localStorage.setItem("near-underwrite.session", capability);
  }
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(20000),
    headers: {
      "content-type": "application/json",
      "x-near-underwrite": "1",
      "x-workspace-token": capability,
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(body.error ?? `API request failed with HTTP ${response.status}`);
  return body as T;
}

export async function latestSnapshot(): Promise<{ snapshot: Snapshot; origin: "api" | "bundled" }> {
  try {
    return { snapshot: await request<Snapshot>("/v1/snapshots/latest"), origin: "api" };
  } catch {
    const response = await fetch("./evidence/latest-snapshot.json", { cache: "no-store" });
    if (!response.ok) throw new Error("The hosted API and bundled verified snapshot are unavailable");
    return { snapshot: await response.json() as Snapshot, origin: "bundled" };
  }
}

export function listSnapshots() {
  return request<{ snapshots: Snapshot[] }>("/v1/snapshots?limit=30");
}

export function saveWorkspace(body: unknown) {
  return request("/v1/workspaces", { method: "POST", body: JSON.stringify(body) });
}

export function getWorkspace(id: string) {
  return request<{ assumptions: import("@near-underwrite/shared").ModelAssumptions; notes: string }>("/v1/workspaces/" + id);
}

export function discoverModels(body: unknown) {
  return request<unknown>("/v1/ai/models", { method: "POST", body: JSON.stringify(body) });
}

export function runRole(body: unknown, signal?: AbortSignal) {
  return request<AIRoleResult>("/v1/ai/analyze", { method: "POST", body: JSON.stringify(body), ...(signal ? { signal } : {}) });
}

export function savePublication(body: unknown) {
  return request("/v1/publications", { method: "POST", body: JSON.stringify(body) });
}
