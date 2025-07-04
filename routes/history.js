const router = require('express').Router();
const pool = require('../db');

router.get('/', async (req, res) => {
  const { etage, lot } = req.query;
  const clauses = ['1=1'];
  const params = [];
  let i = 1;
  if (etage) {
    clauses.push(`b.etage = $${i++}`);
    params.push(etage);
  }
  if (lot) {
    clauses.push(`b.lot   = $${i++}`);
    params.push(lot);
  }
  const where = clauses.join(' AND ');

  try {
    const result = await pool.query(
      `SELECT
         u.username         AS username,
         rh.action_type     AS action_type,
         b.etage            AS etage,
         b.chambre          AS chambre,
         b.numero           AS bulle_numero,
         b.intitule         AS bulle_intitule,
         b.lot              AS lot,
         rh.description     AS description,
         rh.created_at      AS created_at
       FROM reserve_history rh
       JOIN bulles b ON b.id = rh.bulle_id
       JOIN users  u ON u.id = rh.user_id
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
