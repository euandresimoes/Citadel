CREATE TABLE IF NOT EXISTS device_pairings (
  request_id UUID PRIMARY KEY,
  device_id TEXT NOT NULL,
  algorithm TEXT NOT NULL CHECK (algorithm = 'ed25519'),
  public_key TEXT NOT NULL,
  fingerprint CHAR(64) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'paired', 'rejected', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL,
  approved_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS device_pairings_pending_identity_idx
  ON device_pairings (device_id, fingerprint) WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS device_pairings_paired_device_idx
  ON device_pairings (device_id) WHERE status = 'paired';
