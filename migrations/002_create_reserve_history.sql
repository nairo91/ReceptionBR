CREATE TABLE reserve_history (
  id SERIAL PRIMARY KEY,
  bulle_id INTEGER REFERENCES bulles(id),
  user_id INTEGER,
  action_type TEXT,
  old_values JSONB,
  new_values JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
