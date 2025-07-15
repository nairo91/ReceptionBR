ALTER TABLE interventions_history
  ADD COLUMN IF NOT EXISTS person_old TEXT,
  ADD COLUMN IF NOT EXISTS person_new TEXT;
