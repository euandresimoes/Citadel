CREATE TABLE IF NOT EXISTS hub_profile (
  profile_id TEXT PRIMARY KEY CHECK (profile_id = 'local-profile'),
  display_name TEXT NOT NULL,
  avatar_base64 TEXT,
  password_hash TEXT NOT NULL,
  totp_secret_encrypted TEXT,
  pending_totp_secret_encrypted TEXT,
  recovery_code_hashes JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
