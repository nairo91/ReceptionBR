const express = require("express");
const router = express.Router();
const pool = require("../db");

// GET /api/rooms
router.get('/', async (req, res) => {
  const floorId = req.query.floor_id;
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
