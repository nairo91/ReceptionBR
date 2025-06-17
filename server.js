const express = require("express");
const multer = require("multer");
const path = require("path");
const cors = require("cors");
const session = require("express-session");
const bullesRoutes = require("./routes/bulles");
const authRoutes = require("./routes/auth");

const app = express();

// Configuration CORS pour autoriser les cookies/sessions
app.use(cors({
  origin: "http://localhost:3000", // Remplace par l'URL de ton frontend en prod
  credentials: true,
}));

app.use(express.json());

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
app.use("/api/auth", authRoutes);
app.use("/api/bulles", bullesRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serveur en ligne sur le port ${PORT}`));
