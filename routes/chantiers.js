const router = require('express').Router();
const pool = require('../db');
const { isAuthenticated, isAdmin } = require('../middlewares/auth');

router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM chantiers ORDER BY id');
  res.json(rows);
});

router.post('/', isAuthenticated, isAdmin, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name requis' });
  const { rows } = await pool.query(
    'INSERT INTO chantiers(name) VALUES($1) RETURNING *',
    [name]
  );
  res.json(rows[0]);
});

router.put('/:id', isAuthenticated, isAdmin, async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  const { rows } = await pool.query(
    'UPDATE chantiers SET name=$1 WHERE id=$2 RETURNING *',
    [name, id]
  );
  if (!rows.length) return res.status(404).json({});
  res.json(rows[0]);
});

router.delete('/:id', isAuthenticated, isAdmin, async (req, res) => {
  const { id } = req.params;
  await pool.query('DELETE FROM chantiers WHERE id=$1', [id]);
  res.json({ success: true });
});

module.exports = router;
