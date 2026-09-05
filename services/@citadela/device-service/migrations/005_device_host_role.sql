ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS host_role TEXT NOT NULL DEFAULT 'standalone'
  CHECK (host_role IN ('standalone', 'hub-host'));
