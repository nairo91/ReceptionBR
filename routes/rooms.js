const express = require("express");
const router = express.Router();
const pool = require("../db");

// GET /api/rooms
// Renvoie les chambres d'un étage depuis la base de données
router.get('/', async (req, res) => {
  const { floorId } = req.query;
  if (!floorId) {
    return res.status(400).json({ error: 'floorId requis' });
  }
  // on s’assure que floorId est un entier
  const fid = parseInt(floorId, 10);
  if (Number.isNaN(fid)) {
    return res.status(400).json({ error: 'floorId doit être un entier' });
  }
  try {
    const result = await pool.query(
      // on cast $1 en entier pour éviter integer = text
      'SELECT id, name FROM rooms WHERE floor_id = $1::int ORDER BY id',
      [fid]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
