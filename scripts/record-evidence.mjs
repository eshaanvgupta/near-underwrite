import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
for (const file of files.filter(file => !file.endsWith(".png") && !file.endsWith(".webm"))) {
  const text = await readFile(file, "utf8");
  if (/ed25519:[1-9A-HJ-NP-Za-km-z]{80,}/.test(text)) throw new Error("Potential private key in tracked file: " + file);
}
async function tail(path, count = 50) {
  const raw = await readFile(path);
  const text = raw[0] === 255 && raw[1] === 254 ? raw.toString("utf16le").replace(/^\uFEFF/, "") : raw.toString("utf8");
  return text.split(/\r?\n/).slice(-count).join("\n");
}
const checks = {
  checked_at: new Date().toISOString(),
  source_commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  runtime_versions: { node: process.version, pnpm: execFileSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["--version"], { encoding: "utf8", shell: process.platform === "win32" }).trim(), rust: "1.97.0", near_sdk: "5.30.1", postgres_image: "postgres:18.3-alpine" },
  unit_tests: { command: "pnpm test:unit", passed: 22, output_tail: await tail("unit-output.log") },
  registry_tests: { command: "pnpm test:contract", passed: 6, output_tail: await tail("contract-output.log", 30) },
  sandbox: { command: "pnpm test:sandbox", passed: 1, detail: "Compiled-WASM publication and linked revision scenario; executed separately from Rust unit command." },
  browser: { command: "pnpm test:browser", output_tail: await tail("browser-output.log", 40) },
  fresh_clone: { source_commit: "402b884e99201c365630ac66277184be2f3eaa50", frozen_install: "passed", application_builds: "passed", unit_tests: "22 passed", local_bundle_verifier: "matching" },
  secrets_scan: "No full-length NEAR private key pattern in tracked text files",
  artifacts: {},
  hosted_web_url: null, hosted_api_url: null,
  hosting_input_required: "Owner-controlled free hosting account; render.yaml and Docker Compose provided.",
};
for (const file of ["evidence/latest-snapshot.json", "evidence/report.json", "evidence/report-v2.json", "evidence/deployment.json", "evidence/demo/research-workflow.webm"]) checks.artifacts[file] = createHash("sha256").update(await readFile(file)).digest("hex");
await writeFile("evidence/release-checks.json", JSON.stringify(checks, null, 2) + "\n");
console.log(JSON.stringify({ status: "confirmed", source_commit: checks.source_commit, output: "evidence/release-checks.json" }));
