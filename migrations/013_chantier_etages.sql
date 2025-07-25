BEGIN;

CREATE TABLE IF NOT EXISTS chantiers (
  id SERIAL PRIMARY KEY,
  nom TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS floors (
  id SERIAL PRIMARY KEY,
  chantier_id INTEGER REFERENCES chantiers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  plan_path TEXT
);

ALTER TABLE bulles
  ADD COLUMN IF NOT EXISTS chantier_id INTEGER REFERENCES chantiers(id),
  ADD COLUMN IF NOT EXISTS etage_id INTEGER REFERENCES floors(id);

-- Migration des anciennes valeurs d'etage dans la nouvelle structure
INSERT INTO chantiers (nom)
  VALUES ('Chantier par defaut')
  ON CONFLICT (nom) DO NOTHING;

WITH c AS (SELECT id FROM chantiers WHERE nom='Chantier par defaut' LIMIT 1),
     dist AS (SELECT DISTINCT etage FROM bulles)
INSERT INTO floors (chantier_id, name)
SELECT c.id, d.etage FROM c CROSS JOIN dist d
ON CONFLICT DO NOTHING;

UPDATE bulles b
SET chantier_id = c.id,
    etage_id = f.id
FROM chantiers c
JOIN floors f ON f.chantier_id = c.id AND f.name = b.etage
WHERE c.nom='Chantier par defaut' AND b.chantier_id IS NULL;

COMMIT;
