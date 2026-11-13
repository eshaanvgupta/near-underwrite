import { execFileSync } from "node:child_process";
// Uses the already configured Git Credential Manager. Credentials remain in memory.
const credentialText = execFileSync("git", ["credential", "fill"], { input: "protocol=https\nhost=github.com\n\n", encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
const credentials = Object.fromEntries(credentialText.trim().split(/\r?\n/).map(line => { const split = line.indexOf("="); return [line.slice(0, split), line.slice(split + 1)]; }));
if (!credentials.password) throw new Error("Existing GitHub credential is unavailable; no repository created");
const headers = { authorization: "Bearer " + credentials.password, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "content-type": "application/json" };
const profile = await fetch("https://api.github.com/user", { headers }).then(response => response.json());
if (profile.login !== "eshaanvgupta") throw new Error("Authenticated GitHub account does not match the expected owner");
const exists = await fetch("https://api.github.com/repos/eshaanvgupta/near-underwrite", { headers });
if (exists.status === 404) {
  const response = await fetch("https://api.github.com/user/repos", { method: "POST", headers, body: JSON.stringify({ name: "near-underwrite", description: "Evidence-linked NEAR token-demand research: mainnet measurements, editable economics, user-key AI, and a testnet publication registry", private: false, auto_init: false }) });
  if (!response.ok) throw new Error("GitHub repository creation denied: HTTP " + response.status);
} else if (!exists.ok) throw new Error("Repository permission check failed: HTTP " + exists.status);
console.log("Confirmed repository: https://github.com/eshaanvgupta/near-underwrite");
