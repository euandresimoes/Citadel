CREATE TABLE IF NOT EXISTS devices (
  device_id TEXT PRIMARY KEY,
  algorithm TEXT NOT NULL CHECK (algorithm = 'ed25519'),
  public_key TEXT NOT NULL,
  fingerprint CHAR(64) NOT NULL,
  network_mode TEXT NOT NULL CHECK (network_mode IN ('lan', 'headscale')),
  connection_id UUID,
  status TEXT NOT NULL CHECK (status IN ('online', 'offline')),
  connected_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ NOT NULL,
  system_info JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS devices_status_idx ON devices (status);
