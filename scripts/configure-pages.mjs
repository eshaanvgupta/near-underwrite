import { execFileSync } from "node:child_process";
const text = execFileSync("git", ["credential", "fill"], { input: "protocol=https\nhost=github.com\n\n", encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
const fields = Object.fromEntries(text.trim().split(/\r?\n/).map(line => { const index = line.indexOf("="); return [line.slice(0, index), line.slice(index + 1)]; }));
if (!fields.password) throw new Error("Existing GitHub authorization is unavailable");
const headers = { authorization: "Bearer " + fields.password, accept: "application/vnd.github+json", "content-type": "application/json", "x-github-api-version": "2022-11-28" };
const base = "https://api.github.com/repos/eshaanvgupta/near-underwrite";
const existing = await fetch(base + "/pages", { headers });
if (existing.status === 404) {
  const created = await fetch(base + "/pages", { method: "POST", headers, body: JSON.stringify({ build_type: "workflow" }) });
  if (!created.ok) throw new Error("GitHub Pages configuration failed: HTTP " + created.status);
} else if (!existing.ok) throw new Error("GitHub Pages permission check failed: HTTP " + existing.status);
else {
  const info = await existing.json();
  if (info.build_type !== "workflow") {
    const updated = await fetch(base + "/pages", { method: "PUT", headers, body: JSON.stringify({ build_type: "workflow" }) });
    if (!updated.ok) throw new Error("Cannot select GitHub Actions as Pages source: HTTP " + updated.status);
  }
}
const page = await fetch(base + "/pages", { headers }).then(response => response.json());
const updated = await fetch(base, { method: "PATCH", headers, body: JSON.stringify({ homepage: page.html_url }) });
if (!updated.ok) throw new Error("Pages is configured, but repository homepage update failed");
console.log(JSON.stringify({ status: "configured", url: page.html_url, build_type: page.build_type }));
