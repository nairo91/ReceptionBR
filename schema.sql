-- script SQL
CREATE TABLE IF NOT EXISTS bulles (
  id SERIAL PRIMARY KEY,
  etage TEXT NOT NULL,
  chambre TEXT NOT NULL,
  x REAL,
  y REAL,
  numero INTEGER,
  description TEXT,
  photo TEXT
);
