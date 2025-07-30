const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/entreprises -> liste des entreprises
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, nom FROM entreprises ORDER BY nom');
    res.json(rows);
  } catch (err) {
    console.error('Erreur GET /api/entreprises', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/entreprises -> ajout d'une entreprise
router.post('/', async (req, res) => {
  try {
    if (!req.session.user ||
        !['launay.jeremy@batirenov.info','blot.valentin@batirenov.info']
          .includes(req.session.user.email)) {
      return res.status(403).json({ error: 'Interdit' });
    }
    const { nom } = req.body;
    if (!nom) return res.status(400).json({ error: 'Nom manquant' });
    const { rows } = await pool.query('INSERT INTO entreprises (nom) VALUES ($1) RETURNING id, nom', [nom]);
    res.json(rows[0]);
  } catch (err) {
    console.error('Erreur POST /api/entreprises', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
