CREATE TABLE IF NOT EXISTS hub_file_transfer_audit (
  audit_id TEXT PRIMARY KEY,
  transfer_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  state TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS hub_file_transfer_audit_transfer_idx
  ON hub_file_transfer_audit (transfer_id, created_at DESC);
