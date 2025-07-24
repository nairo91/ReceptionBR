const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/users
// Sélectionne id et email depuis la table "users"
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, email AS username FROM users ORDER BY email');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
