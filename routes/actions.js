const express = require('express');
const pool = require('../db');
const router = express.Router();

// POST /api/bulles/actions
// body = { user, action, etage, chambre, x, y, nomBulle, description,
//          lot, entreprise, localisation, observation, timestamp }
router.post('/', async (req, res) => {
  try {
    const {
      user, action, etage, chambre, x, y, nomBulle, description,
      lot, entreprise, localisation, observation, timestamp
    } = req.body;
    await pool.query(
      `INSERT INTO local_actions (user_id, action, etage, chambre, x, y, nom_bulle, description, lot, entreprise, localisation, observation, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [user, action, etage, chambre, x, y, nomBulle, description, lot, entreprise, localisation, observation, timestamp]
    );
    res.status(201).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/bulles/actions
// facultatif ?user=… pour filtrer
router.get('/', async (req, res) => {
  try {
    const { user } = req.query;
    const q = user
      ? `SELECT * FROM local_actions WHERE user_id=$1 ORDER BY created_at DESC`
      : `SELECT * FROM local_actions ORDER BY created_at DESC`;
    const params = user ? [user] : [];
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
