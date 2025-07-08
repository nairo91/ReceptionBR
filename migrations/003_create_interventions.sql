CREATE TABLE IF NOT EXISTS interventions (
  id         SERIAL       PRIMARY KEY,
  user_id    TEXT         NOT NULL,
  floor_id   TEXT         NOT NULL,
  room_id    TEXT         NOT NULL,
  lot        TEXT         NOT NULL,
  task       TEXT         NOT NULL,
  status     TEXT         NOT NULL DEFAULT 'ouvert',
  person     TEXT,
  action     TEXT         NOT NULL DEFAULT 'Création',
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);
