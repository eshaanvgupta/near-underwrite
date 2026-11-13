import type { Snapshot, ModelAssumptions } from "@near-underwrite/shared";

export type { Snapshot };

export interface WorkspaceRecord {
  id: string;
  name: string;
  snapshot_ids: string[];
  assumptions: ModelAssumptions;
  notes: string;
  updated_at: string;
}

export interface PublicationRecord {
  publication_id: string;
  author: string;
  report_digest: string;
  evidence_digest: string;
  model_digest: string;
  schema_version: string;
  parent_id: string | null;
  transaction_hash: string;
  block_height: string;
  chain_timestamp_ns: string;
}
