-- script SQL
CREATE TABLE IF NOT EXISTS bulles (
  id SERIAL PRIMARY KEY,
  etage TEXT NOT NULL,
  chambre TEXT NOT NULL,
  x INTEGER,
  y INTEGER,
  numero INTEGER,
  description TEXT,
  photo TEXT
);
