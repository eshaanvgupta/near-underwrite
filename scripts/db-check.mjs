import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createStore } from "../apps/api/dist/store.js";
const store = await createStore(process.env.DATABASE_URL ?? "postgresql://underwrite:local-development-only@127.0.0.1:54328/underwrite", false);
const path = new URL("../runtime/db-check.json", import.meta.url);
try {
  if (process.argv[2] === "verify") {
    const expected = JSON.parse(await readFile(path, "utf8"));
    const restored = await store.getWorkspace(expected.workspace.id);
    if (JSON.stringify(restored?.assumptions) !== JSON.stringify(expected.workspace.assumptions)) {
      // PostgreSQL JSONB sorts object keys; compare key/value pairs.
      if (!Object.entries(expected.workspace.assumptions).every(([key, value]) => restored?.assumptions[key] === value)) throw new Error("Workspace recovery mismatch");
    }
    if (!await store.getSnapshot(expected.snapshot_id)) throw new Error("Snapshot did not survive restart");
    console.log(JSON.stringify({ status: "confirmed", test: "postgres-restart-recovery", workspace_id: restored.id, snapshot_id: expected.snapshot_id }));
  } else {
    const report = JSON.parse(await readFile(new URL("../evidence/report.json", import.meta.url), "utf8"));
    const workspace = { id: crypto.randomUUID(), name: "Persistence integration check", snapshot_ids: [report.snapshot.id], assumptions: report.assumptions, notes: "Public integration check", updated_at: new Date().toISOString() };
    await store.saveSnapshot(report.snapshot); await store.saveWorkspace(workspace);
    const id = crypto.randomUUID();
    const reservations = await Promise.all(Array.from({ length: 10 }, () => store.reserveAI(id, crypto.randomUUID(), 3)));
    if (reservations.filter(Boolean).length !== 3) throw new Error("Concurrent budget reservations were not atomic");
    if (!await store.authorizeWorkspace(workspace.id, "owner-a") || await store.authorizeWorkspace(workspace.id, "owner-b")) throw new Error("Owner authorization failed");
    await mkdir(new URL("../runtime/", import.meta.url), { recursive: true });
    await writeFile(path, JSON.stringify({ workspace, snapshot_id: report.snapshot.id }));
    console.log(JSON.stringify({ status: "confirmed", test: "postgres-write-and-concurrency", concurrent_accepted: 3, concurrent_attempted: 10, snapshot_id: report.snapshot.id }));
  }
} finally { await store.close(); }
