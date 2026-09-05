ALTER TABLE hub_file_transfers
  ADD COLUMN IF NOT EXISTS checkpoints JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS verified_item_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
