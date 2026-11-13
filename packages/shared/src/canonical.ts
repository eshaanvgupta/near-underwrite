export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`;
}

export async function sha256Hex(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function digestCanonical(value: unknown): Promise<string> {
  return sha256Hex(canonicalJson(value));
}

export const PUBLICATION_DOMAIN = "NEAR_UNDERWRITE_PUBLICATION_V1\0";

export async function publicationDigests(bundle: unknown, evidenceManifest: unknown, modelDescriptor: unknown) {
  return {
    report_digest: await sha256Hex(PUBLICATION_DOMAIN + "REPORT\0" + canonicalJson(bundle)),
    evidence_digest: await sha256Hex(PUBLICATION_DOMAIN + "EVIDENCE\0" + canonicalJson(evidenceManifest)),
    model_digest: await sha256Hex(PUBLICATION_DOMAIN + "MODEL\0" + canonicalJson(modelDescriptor)),
  };
}
