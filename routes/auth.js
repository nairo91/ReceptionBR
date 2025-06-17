const express = require("express");
const router = express.Router();
const pool = require("../db");
const bcrypt = require("bcrypt");

router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: "Username et mot de passe requis" });
  }

  try {
    const result = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Utilisateur non trouvé" });
    }
    const user = result.rows[0];

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ message: "Mot de passe incorrect" });
    }

    req.session.user = { id: user.id, username: user.username };
    res.json({ message: "Connecté avec succès", user: req.session.user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

router.post("/logout", (req, res) => {
  req.session.destroy();
  res.json({ message: "Déconnecté avec succès" });
});

module.exports = router;
