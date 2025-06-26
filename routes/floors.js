const express = require("express");
const router = express.Router();
const pool = require("../db");

// GET /api/floors
// Sélectionne id et name depuis la table "floors"
router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT id, name FROM floors ORDER BY id');
  res.json(rows);
});

module.exports = router;
