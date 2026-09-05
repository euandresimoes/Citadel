CREATE TABLE IF NOT EXISTS hub_file_transfers (
  transfer_id TEXT PRIMARY KEY,
  source_device_id TEXT NOT NULL,
  destination_device_id TEXT NOT NULL,
  source_root_id TEXT NOT NULL,
  source_path TEXT NOT NULL,
  destination_root_id TEXT NOT NULL,
  destination_path TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('copy', 'move')),
  items JSONB NOT NULL,
  total_bytes BIGINT NOT NULL CHECK (total_bytes >= 0),
  completed_bytes BIGINT NOT NULL CHECK (completed_bytes >= 0 AND completed_bytes <= total_bytes),
  mode TEXT NOT NULL CHECK (mode IN ('hub-mediated', 'direct')),
  conflict_policy TEXT NOT NULL CHECK (conflict_policy IN ('ask', 'overwrite', 'skip', 'rename', 'resume', 'fail')),
  state TEXT NOT NULL CHECK (state IN ('created', 'preparing', 'transferring', 'paused', 'verifying', 'committing', 'completed', 'cancelled', 'failed', 'expired')),
  retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  manifest_digest TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  actor_id TEXT NOT NULL,
  error JSONB
);

CREATE INDEX IF NOT EXISTS hub_file_transfers_device_created_idx
  ON hub_file_transfers (source_device_id, created_at DESC);

ALTER TABLE hub_file_transfers
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0);
