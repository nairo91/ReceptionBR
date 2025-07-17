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
      `SELECT c.text, c.created_at, u.username
        FROM interventions_comments c
        LEFT JOIN users u ON c.user_id::int = u.id
        WHERE c.intervention_id = $1
         ORDER BY c.created_at DESC`,
      [intervention_id]
    );
    const result = rows.map(r => ({
      text: r.text,
      created_at: r.created_at,
      username: r.username || 'Anonyme'
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
