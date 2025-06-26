const express = require("express");
const router = express.Router();
const pool = require("../db");

// GET /api/users
// Sélectionne id et fullName depuis la table "users"
router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT id, fullName FROM users');
  res.json(rows);
});

module.exports = router;
