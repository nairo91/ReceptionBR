const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/chantiers
// Renvoie la liste des chantiers depuis la base
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, nom AS name FROM chantiers ORDER BY id'
    );
    res.json(rows);
  } catch (err) {
    console.error('Erreur GET /api/chantiers', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
