const STORAGE_KEY = "near-underwrite.encrypted-ai-key.v1";
const ITERATIONS = 310_000;

interface VaultEnvelope {
  version: 1;
  kdf: "PBKDF2-SHA-256";
  iterations: number;
  cipher: "AES-256-GCM";
  salt: string;
  nonce: string;
  ciphertext: string;
}

function encode(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function decode(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (character) => character.charCodeAt(0));
}

async function derive(passphrase: string, salt: Uint8Array, usages: KeyUsage[]) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: Uint8Array.from(salt).buffer, iterations: ITERATIONS },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    usages,
  );
}

export async function rememberKey(apiKey: string, passphrase: string): Promise<void> {
  if (passphrase.length < 12) throw new Error("Use a passphrase of at least 12 characters");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const key = await derive(passphrase, salt, ["encrypt"]);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: Uint8Array.from(nonce).buffer }, key, new TextEncoder().encode(apiKey));
  const envelope: VaultEnvelope = {
    version: 1,
    kdf: "PBKDF2-SHA-256",
    iterations: ITERATIONS,
    cipher: "AES-256-GCM",
    salt: encode(salt),
    nonce: encode(nonce),
    ciphertext: encode(new Uint8Array(ciphertext)),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
}

export async function unlockKey(passphrase: string): Promise<string> {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) throw new Error("No encrypted key is stored on this device");
  const envelope = JSON.parse(stored) as VaultEnvelope;
  if (envelope.version !== 1 || envelope.kdf !== "PBKDF2-SHA-256" || envelope.cipher !== "AES-256-GCM" || envelope.iterations !== ITERATIONS) throw new Error("Unsupported key vault format");
  const salt = decode(envelope.salt);
  const key = await derive(passphrase, salt, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: Uint8Array.from(decode(envelope.nonce)).buffer }, key, Uint8Array.from(decode(envelope.ciphertext)).buffer);
  return new TextDecoder().decode(plaintext);
}

export function forgetKey(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function hasRememberedKey(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== null;
}
