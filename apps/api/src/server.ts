import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { collectSnapshot } from "./collector.js";
import { createStore } from "./store.js";

const config = loadConfig();
const store = await createStore(config.DATABASE_URL, config.ALLOW_MEMORY_DB);
const app = buildApp(config, store);
let collecting = false;

async function refresh() {
  if (collecting) return;
  collecting = true;
  try {
    const snapshot = await collectSnapshot(config);
    await store.saveSnapshot(snapshot);
    app.log.info({ snapshot_id: snapshot.id, completeness: snapshot.completeness.status }, "public-source snapshot collected");
  } catch (error) {
    app.log.error({ error }, "public-source refresh failed; no success state was written");
  } finally {
    collecting = false;
  }
}

if (config.COLLECTOR_EMBEDDED) void refresh();
const interval = setInterval(() => { if (config.COLLECTOR_EMBEDDED) void refresh(); }, config.COLLECT_INTERVAL_MS);
interval.unref();

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "graceful shutdown");
  clearInterval(interval);
  await app.close();
  await store.close();
  process.exit(0);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

await app.listen({ host: config.HOST, port: config.PORT });
