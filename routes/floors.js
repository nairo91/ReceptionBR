const express = require('express');
const router = express.Router();
const pool = require('../db');
const upload = require('../middlewares/upload');

// GET /api/floors?chantier_id=...
router.get('/', async (req, res) => {
  const { chantier_id } = req.query;
  const sql = chantier_id
    ? 'SELECT id, name, plan_path FROM floors WHERE chantier_id = $1 ORDER BY id'
    : 'SELECT id, name, plan_path FROM floors ORDER BY id';
  const params = chantier_id ? [chantier_id] : [];
  try {
    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('Erreur GET /api/floors', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/floors - créer un étage
router.post('/', async (req, res) => {
  if (!req.session.user ||
      !['launay.jeremy@batirenov.info','blot.valentin@batirenov.info']
        .includes(req.session.user.email)) {
    return res.status(403).json({ error: 'Interdit' });
  }
  const { chantier_id, name } = req.body;
  try {
    const { rows } = await pool.query(
      'INSERT INTO floors(chantier_id, name) VALUES($1,$2) RETURNING *',
      [chantier_id, name]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('Erreur POST /api/floors', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Upload d'un plan pour un étage
router.post('/:id/plan', upload.single('plan'), async (req, res) => {
  if (!req.session.user ||
      !['launay.jeremy@batirenov.info','blot.valentin@batirenov.info']
        .includes(req.session.user.email)) {
    return res.status(403).json({ error: 'Interdit' });
  }
  const { id } = req.params;
  const path = req.file ? req.file.path : null;
  try {
    await pool.query('UPDATE floors SET plan_path = $1 WHERE id = $2', [path, id]);
    res.json({ path });
  } catch (err) {
    console.error('Erreur upload plan', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET du plan
router.get('/:id/plan', async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query('SELECT plan_path FROM floors WHERE id=$1', [id]);
    if (!rows.length || !rows[0].plan_path) return res.status(404).end();
    res.json({ path: rows[0].plan_path });
  } catch (err) {
    console.error('Erreur get plan', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
