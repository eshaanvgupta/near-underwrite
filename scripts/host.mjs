import { spawn } from "node:child_process";
const origin = process.env.WEB_ORIGIN ?? process.env.RENDER_EXTERNAL_URL ?? "http://localhost:4173";
const api = spawn(process.execPath, ["apps/api/dist/server.js"], { stdio: "inherit", env: { ...process.env, PORT: "8787", WEB_ORIGIN: origin, COLLECTOR_EMBEDDED: "true" } });
const web = spawn(process.execPath, ["scripts/static-server.mjs"], { stdio: "inherit", env: { ...process.env, WEB_PORT: process.env.PORT ?? "4173", API_PROXY_TARGET: "http://127.0.0.1:8787" } });
let stopping = false;
const stop = () => { if (stopping) return; stopping = true; api.kill("SIGTERM"); web.kill("SIGTERM"); };
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, stop);
for (const child of [api, web]) child.on("exit", code => { stop(); process.exitCode = code ?? 1; });
