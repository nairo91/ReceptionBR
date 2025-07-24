BEGIN;

CREATE TABLE IF NOT EXISTS entreprises (
  id SERIAL PRIMARY KEY,
  nom TEXT UNIQUE NOT NULL
);

INSERT INTO entreprises (nom)
  VALUES ('Entreprise A'), ('Entreprise B'), ('Entreprise C')
  ON CONFLICT DO NOTHING;

ALTER TABLE bulles
  ADD COLUMN IF NOT EXISTS entreprise_id INTEGER REFERENCES entreprises(id);

ALTER TABLE bulles
  DROP COLUMN IF EXISTS entreprise;

COMMIT;
