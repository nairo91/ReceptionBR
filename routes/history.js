const router = require('express').Router();
const pool = require('../db');

router.get('/', async (req, res) => {
  const { etage, lot } = req.query;
  const params = [];
  let idx = 1;
  let where = '1=1';
  if (etage) {
    where += ` AND b.etage = $${idx++}`;
    params.push(etage);
  }
  if (lot) {
    where += ` AND b.lot = $${idx++}`;
    params.push(lot);
  }
  try {
    const result = await pool.query(
      `SELECT rh.*, u.username, b.etage, b.chambre, b.lot, b.numero AS bulle_numero
       FROM reserve_history rh
       JOIN bulles b ON b.id = rh.bulle_id
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
