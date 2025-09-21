require('dotenv').config();

const express = require("express");
const path = require("path");
const cors = require("cors");
const session = require("express-session");
const bullesRoutes = require("./routes/bulles");
const authRoutes = require("./routes/auth");
const interventionsRoutes = require("./routes/interventions");
const interventionsExportRoutes  = require('./routes/interventionsExport');
const usersRoutes = require("./routes/users");
const historyRoutes = require("./routes/history");
const roomsRoutes = require("./routes/rooms");
const commentsRoutes = require("./routes/comments");
const actionsRoutes = require('./routes/actions');
const chantiersRoutes = require('./routes/chantiers');
const floorsRoutes  = require('./routes/floors');
const entreprisesRoutes = require('./routes/entreprises');
const pool = require("./db");
const { isAuthenticated } = require("./middlewares/auth");

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
      user_id         TEXT,
      text            TEXT        NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query("ALTER TABLE interventions_comments ADD COLUMN IF NOT EXISTS user_id TEXT");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS interventions_photos (
      id              SERIAL      PRIMARY KEY,
      intervention_id INTEGER     NOT NULL REFERENCES interventions(id) ON DELETE CASCADE,
      url             TEXT        NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user'
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS local_actions (
      id SERIAL PRIMARY KEY,
      user_id TEXT,
      action TEXT,
      etage TEXT,
      chambre TEXT,
      x REAL,
      y REAL,
      nom_bulle TEXT,
      description TEXT,
      lot TEXT,
      entreprise TEXT,
      localisation TEXT,
      observation TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query("ALTER TABLE local_actions ADD COLUMN IF NOT EXISTS lot TEXT");
  await pool.query("ALTER TABLE local_actions ADD COLUMN IF NOT EXISTS entreprise TEXT");
  await pool.query("ALTER TABLE local_actions ADD COLUMN IF NOT EXISTS localisation TEXT");
  await pool.query("ALTER TABLE local_actions ADD COLUMN IF NOT EXISTS observation TEXT");
})().catch(console.error);

const app = express();

// Configuration CORS pour autoriser les cookies/sessions
app.use(cors({
  origin: [
    "http://localhost:3000",
    "https://receptionbr.onrender.com",
  ],
  credentials: true,
}));

app.use(express.json());

// Configuration express-session
app.use(session({
  secret: process.env.SESSION_SECRET || "changeMe",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24,
  },
}));

// Routes authentification

app.use("/api/auth", authRoutes);

// Servir les fichiers uploadés sans authentification
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
// Servir les fichiers statiques front (html, css, js) sans authentification
app.use(express.static(path.join(__dirname, "public")));

// Toutes les routes suivantes nécessitent l'authentification
app.use(isAuthenticated);
app.get('/admin/phases', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-phases.html'));
});
// Route pour récupérer la liste des chantiers
app.use('/api/chantiers', chantiersRoutes);

// Gestion des interventions (POST + GET /api/interventions)
// Monter d'abord la route d'export pour qu'elle ne soit pas capturée par la
// route générique ci-dessous
app.use('/api/interventions/export', interventionsExportRoutes);
app.use('/api/interventions', interventionsRoutes);


// Routes API
app.use("/api/users", usersRoutes);
app.use("/api/history", historyRoutes);
app.use("/api/floors", floorsRoutes);
app.use("/api/rooms", roomsRoutes);
app.use('/api/entreprises', entreprisesRoutes);
// Monter d'abord la route "actions"
app.use('/api/bulles/actions', actionsRoutes);

// Export CSV / XLSX / PDF des bulles
app.use('/api/bulles/export', require('./routes/export'));

// Toutes les autres routes bulles (UI, CRUD, etc.)
app.use('/api/bulles', bullesRoutes);
app.use('/api/comments', commentsRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serveur en ligne sur le port ${PORT}`));
