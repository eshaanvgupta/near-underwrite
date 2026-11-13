import { execFileSync } from "node:child_process";
// Uses the already configured Git Credential Manager. Credentials remain in memory.
const credentialText = execFileSync("git", ["credential", "fill"], { input: "protocol=https\nhost=github.com\n\n", encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
const credentials = Object.fromEntries(credentialText.trim().split(/\r?\n/).map(line => { const split = line.indexOf("="); return [line.slice(0, split), line.slice(split + 1)]; }));
if (!credentials.password) throw new Error("Existing GitHub credential is unavailable; no repository created");
const headers = { authorization: "Bearer " + credentials.password, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "content-type": "application/json" };
const repository = "iamfrankyyy/near-underwrite";
const exists = await fetch("https://api.github.com/repos/" + repository, { headers, redirect: "manual" });
if (!exists.ok) throw new Error("Transferred repository access check failed: HTTP " + exists.status + "; no replacement repository created");
const info = await exists.json();
if (info.id !== 1456099345 || info.full_name !== repository || !info.permissions?.push) throw new Error("Transferred repository identity or push permission check failed");
console.log("Confirmed repository: https://github.com/" + repository);
