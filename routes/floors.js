const router = require('express').Router();
const pool = require('../db');
const { isAuthenticated, isAdmin } = require('../middlewares/auth');
const uploadPlan = require('../middlewares/planUpload');
const path = require('path');

router.get('/', async (req, res) => {
  const { chantier_id } = req.query;
  if (!chantier_id) return res.status(400).json({ error: 'chantier_id requis' });
  const { rows } = await pool.query(
    'SELECT * FROM floors WHERE chantier_id=$1 ORDER BY id',
    [chantier_id]
  );
  res.json(rows);
});

router.post('/', isAuthenticated, isAdmin, uploadPlan.single('plan'), async (req, res) => {
  const { name, chantier_id } = req.body;
  if (!name || !chantier_id) return res.status(400).json({ error: 'données manquantes' });
  const filename = req.file ? req.file.filename : null;
  const { rows } = await pool.query(
    'INSERT INTO floors(name, chantier_id, plan_filename) VALUES($1,$2,$3) RETURNING *',
    [name, chantier_id, filename]
  );
  res.json(rows[0]);
});

module.exports = router;
