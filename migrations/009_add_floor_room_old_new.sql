ALTER TABLE interventions_history
  ADD COLUMN IF NOT EXISTS floor_old TEXT,
  ADD COLUMN IF NOT EXISTS floor_new TEXT,
  ADD COLUMN IF NOT EXISTS room_old TEXT,
  ADD COLUMN IF NOT EXISTS room_new TEXT;
ALTER TABLE interventions_history
  DROP COLUMN IF EXISTS floor_id,
  DROP COLUMN IF EXISTS room_id;
