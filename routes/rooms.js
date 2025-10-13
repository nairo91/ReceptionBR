const express = require("express");
const router = express.Router();
const pool = require("../db");

// GET /api/rooms
router.get('/', async (req, res) => {
  // accepter floorId ou floor_id pour compatibilite
  const fidRaw = req.query.floorId ?? req.query.floor_id ?? '';
  const floorId = parseInt(String(fidRaw).replace(/\D/g, ''), 10) || 0;
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

// POST /api/rooms — créer une nouvelle chambre
router.post('/', async (req, res) => {
  if (!req.session?.user) {
    return res.status(401).json({ error: 'Authentification requise' });
  }
  const { floor_id, name } = req.body;
  if (!floor_id || !name) {
    return res.status(400).json({ error: 'floor_id et name sont requis' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO rooms (floor_id, name, created_by, created_at)
       VALUES ($1, $2, $3, now())
       RETURNING id, name`,
      [floor_id, name, req.session.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Impossible de créer la chambre' });
  }
});

module.exports = router;
