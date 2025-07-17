const router = require('express').Router();
const pool = require('../db');

// GET /api/comments?intervention_id=123
router.get('/', async (req, res) => {
  const { intervention_id } = req.query;
  if (!intervention_id) {
    return res.status(400).json({ error: 'intervention_id requis' });
  }
  try {
    const { rows } = await pool.query(
      `SELECT user_id, text, created_at
         FROM interventions_comments
        WHERE intervention_id = $1
        ORDER BY created_at DESC`,
      [intervention_id]
    );

    // Charge le mapping [id -> username] depuis users.csv
    const loadUsersMap = () => {
      const fs = require('fs');
      const path = require('path');
      const csv = fs.readFileSync(path.join(__dirname, '../db/users.csv'), 'latin1');
      const lines = csv.split(/\r?\n/).slice(1).filter(l => l.trim());
      const map = {};
      for (const line of lines) {
        const [id, name] = line.split(';').map(s => s.trim());
        if (id) map[id] = name;
      }
      return map;
    };
    const userMap = loadUsersMap();
    const result = rows.map(r => ({
      text: r.text,
      created_at: r.created_at,
      username: userMap[r.user_id] || 'Anonyme'
    }));
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/comments
router.post('/', async (req, res) => {
  const { intervention_id, text, user_id } = req.body;
  if (!intervention_id || !text) {
    return res.status(400).json({ error: 'Données manquantes' });
  }
  try {
    await pool.query(
      `INSERT INTO interventions_comments (intervention_id, user_id, text, created_at)
       VALUES ($1, $2, $3, now())`,
      [intervention_id, user_id || null, text]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
