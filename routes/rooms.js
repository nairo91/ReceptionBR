const router = require('express').Router();
const pool = require('../db');
const { isAuthenticated, isAdmin } = require('../middlewares/auth');

router.get('/', async (req, res) => {
  const { floor_id } = req.query;
  if (!floor_id) return res.status(400).json({ error: 'floor_id requis' });
  const { rows } = await pool.query(
    'SELECT * FROM rooms WHERE floor_id=$1 ORDER BY id',
    [floor_id]
  );
  res.json(rows);
});

router.post('/', isAuthenticated, isAdmin, async (req, res) => {
  const { name, floor_id } = req.body;
  if (!name || !floor_id) return res.status(400).json({ error: 'données manquantes' });
  const { rows } = await pool.query(
    'INSERT INTO rooms(name, floor_id) VALUES($1,$2) RETURNING *',
    [name, floor_id]
  );
  res.json(rows[0]);
});

module.exports = router;
