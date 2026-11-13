import { loadConfig } from "./config.js";
import { createStore } from "./store.js";
import { collectSnapshot } from "./collector.js";

const config = loadConfig();
const store = await createStore(config.DATABASE_URL, config.ALLOW_MEMORY_DB);
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { stopping = true; });
let failures = 0;
while (!stopping) {
  const start = Date.now();
  try {
    const snapshot = await collectSnapshot(config);
    await store.saveSnapshot(snapshot);
    failures = 0;
    console.log(JSON.stringify({ event: "collected", snapshot_id: snapshot.id, completeness: snapshot.completeness }));
  } catch (error) {
    failures += 1;
    console.error(JSON.stringify({ event: "unavailable", message: error instanceof Error ? error.message : "collector error" }));
  }
  const wait = Math.max(1000, Math.min(config.COLLECT_INTERVAL_MS * 2 ** Math.min(failures, 4), 900000) - (Date.now() - start));
  for (let elapsed = 0; elapsed < wait && !stopping; elapsed += 1000) await new Promise(resolve => setTimeout(resolve, 1000));
}
await store.close();
