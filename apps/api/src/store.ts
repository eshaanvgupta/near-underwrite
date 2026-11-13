import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import type { PublicationRecord, Snapshot, WorkspaceRecord } from "./store-types.js";

export interface Store {
  authorizeWorkspace(id: string, owner: string): Promise<boolean>;
  bindAnalysis(id: string, owner: string, digest: string): Promise<boolean>;
  ready(): Promise<boolean>;
  saveSnapshot(snapshot: Snapshot): Promise<void>;
  latestSnapshot(): Promise<Snapshot | null>;
  listSnapshots(limit: number): Promise<Snapshot[]>;
  getSnapshot(id: string): Promise<Snapshot | null>;
  saveWorkspace(workspace: WorkspaceRecord): Promise<void>;
  getWorkspace(id: string): Promise<WorkspaceRecord | null>;
  savePublication(publication: PublicationRecord): Promise<void>;
  getPublication(id: string): Promise<PublicationRecord | null>;
  listPublications(author: string, offset: number, limit: number): Promise<PublicationRecord[]>;
  reserveAI(workspaceId: string, confirmationId: string, dailyLimit: number): Promise<boolean>;
  reconcileAI(confirmationId: string, status: "completed" | "uncertain" | "failed", usage: unknown): Promise<void>;
  close(): Promise<void>;
}

export class MemoryStore implements Store {
  private owners = new Map<string, string>();
  private analyses = new Map<string, string>();
  async authorizeWorkspace(id: string, owner: string) {
    if (!this.owners.has(id)) this.owners.set(id, owner);
    return this.owners.get(id) === owner;
  }
  async bindAnalysis(id: string, owner: string, digest: string) {
    const key = owner + id;
    if (!this.analyses.has(key)) this.analyses.set(key, digest);
    return this.analyses.get(key) === digest;
  }
  private snapshots = new Map<string, Snapshot>();
  private workspaces = new Map<string, WorkspaceRecord>();
  private publications = new Map<string, PublicationRecord>();
  private reservations = new Map<string, { workspaceId: string; day: string; status: string }>();
  async ready() { return true; }
  async saveSnapshot(snapshot: Snapshot) { this.snapshots.set(snapshot.id, structuredClone(snapshot)); }
  async latestSnapshot() { return [...this.snapshots.values()].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null; }
  async listSnapshots(limit: number) { return [...this.snapshots.values()].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit); }
  async getSnapshot(id: string) { return this.snapshots.get(id) ?? null; }
  async saveWorkspace(workspace: WorkspaceRecord) { this.workspaces.set(workspace.id, structuredClone(workspace)); }
  async getWorkspace(id: string) { return this.workspaces.get(id) ?? null; }
  async savePublication(publication: PublicationRecord) { this.publications.set(publication.publication_id, structuredClone(publication)); }
  async getPublication(id: string) { return this.publications.get(id) ?? null; }
  async listPublications(author: string, offset: number, limit: number) {
    return [...this.publications.values()].filter((item) => item.author === author).sort((a, b) => b.chain_timestamp_ns.localeCompare(a.chain_timestamp_ns)).slice(offset, offset + limit);
  }
  async reserveAI(workspaceId: string, confirmationId: string, dailyLimit: number) {
    if (this.reservations.has(confirmationId)) return false;
    const day = new Date().toISOString().slice(0, 10);
    const used = [...this.reservations.values()].filter((item) => item.workspaceId === workspaceId && item.day === day && item.status !== "failed").length;
    if (used >= dailyLimit) return false;
    this.reservations.set(confirmationId, { workspaceId, day, status: "reserved" });
    return true;
  }
  async reconcileAI(confirmationId: string, status: string) {
    const item = this.reservations.get(confirmationId);
    if (item) item.status = status;
  }
  async close() {}
}

export class PostgresStore implements Store {
  constructor(private readonly pool: Pool) {}
  async authorizeWorkspace(id: string, owner: string) {
    await this.pool.query("INSERT INTO workspace_owners(id,owner) VALUES ($1,$2) ON CONFLICT DO NOTHING", [id, owner]);
    const result = await this.pool.query("SELECT 1 FROM workspace_owners WHERE id=$1 AND owner=$2", [id, owner]);
    return result.rowCount === 1;
  }
  async bindAnalysis(id: string, owner: string, digest: string) {
    await this.pool.query("INSERT INTO analyses(id,owner,digest) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [id, owner, digest]);
    const result = await this.pool.query("SELECT 1 FROM analyses WHERE id=$1 AND owner=$2 AND digest=$3", [id, owner, digest]);
    return result.rowCount === 1;
  }

  async migrate() {
    const path = fileURLToPath(new URL("../../../db/migrations/001_initial.sql", import.meta.url));
    await this.pool.query(await readFile(path, "utf8"));
  }
  async ready() {
    try { await this.pool.query("SELECT 1"); return true; } catch { return false; }
  }
  async saveSnapshot(snapshot: Snapshot) {
    await this.pool.query("INSERT INTO snapshots(id, created_at, payload) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING", [snapshot.id, snapshot.created_at, snapshot]);
  }
  async latestSnapshot() {
    const result = await this.pool.query<{ payload: Snapshot }>("SELECT payload FROM snapshots ORDER BY created_at DESC LIMIT 1");
    return result.rows[0]?.payload ?? null;
  }
  async listSnapshots(limit: number) {
    const result = await this.pool.query<{ payload: Snapshot }>("SELECT payload FROM snapshots ORDER BY created_at DESC LIMIT $1", [limit]);
    return result.rows.map((row) => row.payload);
  }
  async getSnapshot(id: string) {
    const result = await this.pool.query<{ payload: Snapshot }>("SELECT payload FROM snapshots WHERE id=$1", [id]);
    return result.rows[0]?.payload ?? null;
  }
  async saveWorkspace(workspace: WorkspaceRecord) {
    await this.pool.query("INSERT INTO workspaces(id, updated_at, payload) VALUES ($1,$2,$3) ON CONFLICT (id) DO UPDATE SET updated_at=EXCLUDED.updated_at,payload=EXCLUDED.payload", [workspace.id, workspace.updated_at, workspace]);
  }
  async getWorkspace(id: string) {
    const result = await this.pool.query<{ payload: WorkspaceRecord }>("SELECT payload FROM workspaces WHERE id=$1", [id]);
    return result.rows[0]?.payload ?? null;
  }
  async savePublication(publication: PublicationRecord) {
    await this.pool.query("INSERT INTO publications(publication_id,author,chain_timestamp_ns,payload) VALUES ($1,$2,$3,$4) ON CONFLICT (publication_id) DO NOTHING", [publication.publication_id, publication.author, publication.chain_timestamp_ns, publication]);
  }
  async getPublication(id: string) {
    const result = await this.pool.query<{ payload: PublicationRecord }>("SELECT payload FROM publications WHERE publication_id=$1", [id]);
    return result.rows[0]?.payload ?? null;
  }
  async listPublications(author: string, offset: number, limit: number) {
    const result = await this.pool.query<{ payload: PublicationRecord }>("SELECT payload FROM publications WHERE author=$1 ORDER BY chain_timestamp_ns::numeric DESC OFFSET $2 LIMIT $3", [author, offset, limit]);
    return result.rows.map((row) => row.payload);
  }
  async reserveAI(workspaceId: string, confirmationId: string, dailyLimit: number) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [workspaceId]);
      const count = await client.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM ai_reservations WHERE workspace_id=$1 AND reserved_at >= date_trunc('day', now()) AND status <> 'failed'", [workspaceId]);
      if (Number(count.rows[0]?.count ?? 0) >= dailyLimit) { await client.query("ROLLBACK"); return false; }
      const insert = await client.query("INSERT INTO ai_reservations(confirmation_id,workspace_id,status) VALUES ($1,$2,'reserved') ON CONFLICT DO NOTHING RETURNING confirmation_id", [confirmationId, workspaceId]);
      await client.query("COMMIT");
      return insert.rowCount === 1;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async reconcileAI(confirmationId: string, status: string, usage: unknown) {
    await this.pool.query("UPDATE ai_reservations SET status=$2,reported_usage=$3 WHERE confirmation_id=$1", [confirmationId, status, usage]);
  }
  async close() { await this.pool.end(); }
}

export async function createStore(databaseUrl: string | undefined, allowMemory: boolean): Promise<Store> {
  if (databaseUrl) {
    const store = new PostgresStore(new Pool({ connectionString: databaseUrl, max: 10, connectionTimeoutMillis: 5_000 }));
    await store.migrate();
    return store;
  }
  if (!allowMemory) throw new Error("DATABASE_URL is required unless ALLOW_MEMORY_DB=true; production must use PostgreSQL");
  return new MemoryStore();
}
