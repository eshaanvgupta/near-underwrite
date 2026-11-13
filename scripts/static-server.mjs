import { createServer, request } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
const root = resolve("apps/web/dist");
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".csv": "text/csv" };
const server = createServer(async (req, res) => {
  if (req.url?.startsWith("/api/")) {
    const target = new URL(process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8787");
    const upstream = request({ hostname: target.hostname, port: target.port, path: req.url.slice(4), method: req.method, headers: { ...req.headers, host: target.host } }, response => {
      res.writeHead(response.statusCode ?? 502, response.headers); response.pipe(res);
    });
    upstream.on("error", () => { res.writeHead(502); res.end('{"error":"API unavailable"}'); });
    req.pipe(upstream); return;
  }
  try {
    const path = resolve(root, "." + decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname));
    if (path !== root && !path.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
    const file = path === root ? resolve(root, "index.html") : path;
    const body = await readFile(file);
    res.writeHead(200, { "content-type": mime[extname(file)] ?? "application/octet-stream", "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin" });
    res.end(body);
  } catch { res.writeHead(404); res.end("Not found"); }
});
server.listen(4173, "0.0.0.0");
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => server.close());
