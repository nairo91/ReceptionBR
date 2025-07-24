const express = require("express");
const router = express.Router();
const pool = require("../db");

// GET /api/rooms
router.get('/', async (req, res) => {
  // s’assurer d’avoir toujours un entier
  const raw = req.query.floor_id || '';
  const floorId = parseInt(raw.replace(/\D/g, ''), 10) || 0;
  // requête SQL qui filtre bien sur la colonne floor_id
  try {
    const { rows } = await pool.query(
      'SELECT id, name FROM rooms WHERE floor_id = $1 ORDER BY name',
      [floorId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
