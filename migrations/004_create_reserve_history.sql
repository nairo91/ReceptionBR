CREATE TABLE IF NOT EXISTS reserve_history (
  id SERIAL PRIMARY KEY,
  bulle_id INTEGER NOT NULL REFERENCES bulles(id) ON DELETE CASCADE,
  user_id TEXT,
  action_type TEXT NOT NULL,
  old_values JSONB,
  new_values JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
