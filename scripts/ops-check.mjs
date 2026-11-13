import { mkdir, writeFile } from "node:fs/promises";
const base = process.env.CHECK_URL ?? "http://127.0.0.1:4173";
let first;
for (let attempt = 0; attempt < 180; attempt += 1) {
  const response = await fetch(base + "/api/v1/snapshots/latest");
  if (response.ok) {
    const snapshot = await response.json();
    if (!first) { first = snapshot; console.log(JSON.stringify({ event: "first_snapshot", height: snapshot.finalized_block.height })); }
    else if (snapshot.finalized_block.height !== first.finalized_block.height) {
      const evidence = { status: "confirmed", mode: "local-docker-compose", api_health: await fetch(base + "/api/health/ready").then(response => response.json()), first_height: first.finalized_block.height, next_height: snapshot.finalized_block.height, first_source_time: first.finalized_block.timestamp_iso, next_source_time: snapshot.finalized_block.timestamp_iso, history_days: snapshot.history.length, completeness: snapshot.completeness };
      await mkdir(new URL("../evidence/", import.meta.url), { recursive: true });
      await writeFile(new URL("../evidence/operations-check.json", import.meta.url), JSON.stringify(evidence, null, 2));
      console.log(JSON.stringify(evidence)); process.exit(0);
    }
  }
  await new Promise(resolve => setTimeout(resolve, 1000));
}
throw new Error("A second finalized snapshot did not arrive within the declared observation window");
