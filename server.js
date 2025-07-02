require('dotenv').config();
const { v2: cloudinary } = require('cloudinary');
cloudinary.config('cloudinary://523438194377183:yBZ99NdGjYMFNrkMHHjImF3RBi4@dyp93ivlg');

const express = require("express");
const multer = require("multer");
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const path = require("path");
const cors = require("cors");
const session = require("express-session");

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "receptionbr",
    allowed_formats: ["jpg","png"]
  }
});
const upload = multer({ storage });
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
      created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
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
app.use('/api/bulles', upload.single('photo'), bullesRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serveur en ligne sur le port ${PORT}`));
