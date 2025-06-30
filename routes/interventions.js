const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET list of floors
router.get('/floors', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name FROM floors ORDER BY id');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET rooms for a floor
router.get('/rooms', async (req, res) => {
  const { floorId } = req.query;
  if (!floorId) {
    return res.status(400).json({ error: 'floorId requis' });
  }
  try {
    const result = await pool.query('SELECT id, name FROM rooms WHERE floor_id = $1 ORDER BY id', [floorId]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET users
router.get('/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username FROM users ORDER BY username');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST new intervention
router.post('/', async (req, res) => {
  const { floorId, roomId, userId, lot, task, status } = req.body;
  if (!floorId || !roomId || !userId || !lot || !task) {
    return res.status(400).json({ error: 'Données manquantes' });
  }
  try {
    await pool.query(
      'INSERT INTO interventions (floor_id, room_id, user_id, lot, task, status) VALUES ($1,$2,$3,$4,$5,$6)',
      [floorId, roomId, userId, lot, task, status]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});


// GET /api/interventions — liste toutes les interventions
router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, user_id, floor_id, room_id, lot, task, status, created_at FROM interventions ORDER BY created_at DESC'
  );
  res.json(rows);
});

module.exports = router;
