ALTER TABLE interventions
  ADD COLUMN IF NOT EXISTS action TEXT DEFAULT 'Création';
