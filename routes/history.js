const router = require('express').Router();
const pool = require('../db');

router.get('/', async (req, res) => {
  const { etage, lot } = req.query;
  const clauses = ['1=1'];
  const params = [];
  let i = 1;
  if (etage) {
    clauses.push(`rh.etage = $${i++}`);
    params.push(etage);
  }
  if (lot) {
    clauses.push(`rh.lot   = $${i++}`);
    params.push(lot);
  }
  const where = clauses.join(' AND ');
  try {
    const result = await pool.query(
      `SELECT rh.*, u.username
       FROM reserve_history rh
       JOIN users u ON u.id = rh.user_id
       WHERE ${where}
       ORDER BY rh.created_at DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur historique' });
  }
});

module.exports = router;
