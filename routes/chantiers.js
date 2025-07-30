const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/chantiers
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, nom FROM chantiers ORDER BY nom');
    res.json(rows);
  } catch (err) {
    console.error('Erreur GET /api/chantiers', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/chantiers - réservé à l'admin
router.post('/', async (req, res) => {
  if (!req.session.user ||
      !['launay.jeremy@batirenov.info','blot.valentin@batirenov.info']
        .includes(req.session.user.email)) {
    return res.status(403).json({ error: 'Interdit' });
  }
  const { nom } = req.body;
  try {
    const { rows } = await pool.query('INSERT INTO chantiers(nom) VALUES($1) RETURNING *', [nom]);
    res.json(rows[0]);
  } catch (err) {
    console.error('Erreur POST /api/chantiers', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
