-- script SQL
CREATE TABLE IF NOT EXISTS bulles (
  id SERIAL PRIMARY KEY,
  etage TEXT NOT NULL,
  chambre TEXT NOT NULL,
  x REAL,
  y REAL,
  numero INTEGER,
  description TEXT,
  photo TEXT,
  created_by INTEGER REFERENCES users(id),
  modified_by INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user'
);
