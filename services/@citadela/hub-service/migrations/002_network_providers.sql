CREATE TABLE IF NOT EXISTS network_providers (
  mode TEXT PRIMARY KEY CHECK (mode IN ('lan', 'headscale')),
  enabled BOOLEAN NOT NULL,
  endpoint TEXT,
  control_plane_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO network_providers (mode, enabled) VALUES ('lan', TRUE), ('headscale', FALSE) ON CONFLICT (mode) DO NOTHING;
