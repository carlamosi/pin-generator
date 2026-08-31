-- 20260831130000_stamp_visual_hash.sql
-- Adds visual fingerprint column to stamp_designs only.
-- physical_stamps stores individual impressions; canonical hash lives on the design.

ALTER TABLE stamp_designs
  ADD COLUMN IF NOT EXISTS visual_hash text;

-- Index for fast equality lookups during duplicate detection
CREATE INDEX IF NOT EXISTS idx_stamp_designs_visual_hash
  ON stamp_designs (visual_hash)
  WHERE visual_hash IS NOT NULL;
