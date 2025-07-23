const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/floors
// Renvoie la liste des étages depuis la table `floors`
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name FROM floors ORDER BY id'
    );
    res.json(rows);
  } catch (err) {
    console.error('Erreur GET /api/floors', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
