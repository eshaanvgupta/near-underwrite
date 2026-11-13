CREATE TABLE IF NOT EXISTS snapshots (
  id text PRIMARY KEY,
  created_at timestamptz NOT NULL,
  payload jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS snapshots_created_at_idx ON snapshots(created_at DESC);

CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY,
  updated_at timestamptz NOT NULL,
  payload jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS publications (
  publication_id text PRIMARY KEY,
  author text NOT NULL,
  chain_timestamp_ns numeric(30,0) NOT NULL,
  payload jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS publications_author_time_idx ON publications(author, chain_timestamp_ns DESC);

CREATE TABLE IF NOT EXISTS ai_reservations (
  confirmation_id text PRIMARY KEY,
  workspace_id uuid NOT NULL,
  reserved_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL CHECK (status IN ('reserved','completed','uncertain','failed')),
  reported_usage jsonb
);

CREATE INDEX IF NOT EXISTS ai_reservations_workspace_day_idx ON ai_reservations(workspace_id, reserved_at);

CREATE TABLE IF NOT EXISTS workspace_owners (id uuid PRIMARY KEY, owner text NOT NULL);
CREATE TABLE IF NOT EXISTS analyses (id uuid PRIMARY KEY, owner text NOT NULL, digest text NOT NULL);
