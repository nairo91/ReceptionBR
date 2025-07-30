-- script SQL
CREATE TABLE IF NOT EXISTS entreprises (
  id SERIAL PRIMARY KEY,
  nom TEXT UNIQUE NOT NULL
);

INSERT INTO entreprises (nom)
  VALUES ('Entreprise A'), ('Entreprise B'), ('Entreprise C');

-- Table des bulles de reserve
CREATE TABLE IF NOT EXISTS bulles (
  id SERIAL PRIMARY KEY,
  etage TEXT NOT NULL,
  chambre TEXT NOT NULL,
  x REAL,
  y REAL,
  numero INTEGER,
  description TEXT,
  photo TEXT,
  intitule TEXT,
  etat TEXT,
  lot TEXT,
  entreprise_id INTEGER REFERENCES entreprises(id),
  localisation TEXT,
  observation TEXT,
  date_butoir DATE,
  created_by INTEGER REFERENCES users(id),
  modified_by INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user'
);

CREATE TABLE bulle_media (
  id SERIAL PRIMARY KEY,
  bulle_id INTEGER NOT NULL REFERENCES bulles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('photo','video')),
  path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

