const express = require("express");
const router = express.Router();
const pool = require("../db");

// GET /api/rooms
// Exige un paramètre floorId en query
// Sélectionne id et name depuis "rooms" WHERE floor_id = $1
router.get('/', async (req, res) => {
  const floorId = req.query.floorId;
  const { rows } = await pool.query(
    'SELECT id, name FROM rooms WHERE floor_id = $1 ORDER BY id',
    [floorId]
  );
  res.json(rows);
});

module.exports = router;
