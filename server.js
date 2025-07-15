require('dotenv').config();

const express = require("express");
const path = require("path");
const cors = require("cors");
const session = require("express-session");
const bullesRoutes = require("./routes/bulles");
const authRoutes = require("./routes/auth");
const interventionsRoutes = require("./routes/interventions");
const usersRoutes = require("./routes/users");
const floorsRoutes = require("./routes/floors");
const roomsRoutes = require("./routes/rooms");
const pool = require("./db");

(async () => {
  await pool.query(`
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
  `);
  await pool.query(`
      CREATE TABLE IF NOT EXISTS interventions_history (
        id              SERIAL      PRIMARY KEY,
        intervention_id INTEGER     NOT NULL REFERENCES interventions(id) ON DELETE CASCADE,
        user_id         TEXT        NOT NULL DEFAULT '',
        version         SERIAL      NOT NULL,
        lot             TEXT        NOT NULL,
        task            TEXT        NOT NULL,
        person          TEXT,
        status          TEXT        NOT NULL,
        floor_old       TEXT,
        floor_new       TEXT,
        room_old        TEXT,
        room_new        TEXT,
        lot_old         TEXT,
        lot_new         TEXT,
        task_old        TEXT,
        task_new        TEXT,
        state_old       TEXT,
        state_new       TEXT,
        action          TEXT        NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL
      );
  `);
  await pool.query(`
    ALTER TABLE interventions_history
      ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT '';
  `);
  await pool.query("ALTER TABLE interventions_history ADD COLUMN IF NOT EXISTS version SERIAL NOT NULL");
  await pool.query("ALTER TABLE interventions_history ADD COLUMN IF NOT EXISTS lot_old TEXT");
  await pool.query("ALTER TABLE interventions_history ADD COLUMN IF NOT EXISTS lot_new TEXT");
  await pool.query("ALTER TABLE interventions_history ADD COLUMN IF NOT EXISTS task_old TEXT");
  await pool.query("ALTER TABLE interventions_history ADD COLUMN IF NOT EXISTS task_new TEXT");
  await pool.query("ALTER TABLE interventions_history ADD COLUMN IF NOT EXISTS state_old TEXT");
  await pool.query("ALTER TABLE interventions_history ADD COLUMN IF NOT EXISTS state_new TEXT");
  await pool.query("ALTER TABLE interventions_history ADD COLUMN IF NOT EXISTS floor_old TEXT");
  await pool.query("ALTER TABLE interventions_history ADD COLUMN IF NOT EXISTS floor_new TEXT");
  await pool.query("ALTER TABLE interventions_history ADD COLUMN IF NOT EXISTS room_old TEXT");
  await pool.query("ALTER TABLE interventions_history ADD COLUMN IF NOT EXISTS room_new TEXT");
  await pool.query("ALTER TABLE interventions_history ADD COLUMN IF NOT EXISTS person_old TEXT");
  await pool.query("ALTER TABLE interventions_history ADD COLUMN IF NOT EXISTS person_new TEXT");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS interventions_comments (
      id              SERIAL      PRIMARY KEY,
      intervention_id INTEGER     NOT NULL REFERENCES interventions(id) ON DELETE CASCADE,
      text            TEXT        NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS interventions_photos (
      id              SERIAL      PRIMARY KEY,
      intervention_id INTEGER     NOT NULL REFERENCES interventions(id) ON DELETE CASCADE,
      url             TEXT        NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
})().catch(console.error);

const app = express();

// Configuration CORS pour autoriser les cookies/sessions
app.use(cors({
  origin: "http://localhost:3000", // Remplace par l'URL de ton frontend en prod
  credentials: true,
}));

app.use(express.json());

// Gestion des interventions (POST + GET /api/interventions)
app.use('/api/interventions', interventionsRoutes);
app.use('/uploads', express.static('uploads'));


// Configuration express-session
app.use(session({
  secret: "tonSecretUltraSecret", // Change cette clé en une valeur complexe
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // true si HTTPS, false en dev local
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24, // 1 jour
  },
}));

// Servir les fichiers uploadés
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
// Servir les fichiers statiques front (html, css, js)
app.use(express.static(path.join(__dirname, "public")));

// Routes API
app.use("/api/users", usersRoutes);
app.use("/api/floors", floorsRoutes);
app.use("/api/rooms", roomsRoutes);
app.use("/api/auth", authRoutes);
app.use('/api/bulles', bullesRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serveur en ligne sur le port ${PORT}`));
