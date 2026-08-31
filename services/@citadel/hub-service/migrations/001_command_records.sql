CREATE TABLE IF NOT EXISTS hub_commands (
  command_id UUID PRIMARY KEY,
  device_id TEXT NOT NULL,
  command_type TEXT NOT NULL,
  command_payload JSONB NOT NULL,
  actor_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('awaiting_confirmation', 'dispatched', 'succeeded', 'failed', 'expired')),
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  confirmed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error TEXT
);

CREATE INDEX IF NOT EXISTS hub_commands_device_created_idx
  ON hub_commands (device_id, created_at DESC);
