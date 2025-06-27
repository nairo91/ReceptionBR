CREATE TABLE IF NOT EXISTS interventions (
  id SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  floor_id   TEXT    NOT NULL,
  room_id    TEXT    NOT NULL,
  lot        TEXT    NOT NULL,
  task       TEXT    NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
