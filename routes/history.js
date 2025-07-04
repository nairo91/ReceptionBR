const router = require('express').Router();
const pool = require('../db');

router.get('/', async (req, res) => {
  const { etage, lot } = req.query;
  const clauses = ['1=1'];
  const params = [];
  let i = 1;
  if (etage) {
    clauses.push(`b.etage   = $${i++}`);
    params.push(etage);
  }
  if (lot) {
    clauses.push(`b.lot     = $${i++}`);
    params.push(lot);
  }
  const where = clauses.join(' AND ');

  try {
    const result = await pool.query(
      `SELECT 
        b.id,
        b.numero,
        b.intitule,
        b.description,
        b.lot,
        b.etage,
        b.chambre,

        u_cr.username    AS created_by,
        rh_cr.created_at AS created_at,

        u_up.username    AS modified_by,
        rh_up.created_at AS modified_at

      FROM bulles b

      LEFT JOIN LATERAL (
        SELECT user_id, created_at
        FROM reserve_history rh
        WHERE rh.bulle_id   = b.id
          AND rh.action_type = 'create'
        ORDER BY rh.created_at ASC
        LIMIT 1
      ) rh_cr ON TRUE
      LEFT JOIN users u_cr ON u_cr.id = rh_cr.user_id

      LEFT JOIN LATERAL (
        SELECT user_id, created_at
        FROM reserve_history rh
        WHERE rh.bulle_id   = b.id
          AND rh.action_type = 'update'
        ORDER BY rh.created_at DESC
        LIMIT 1
      ) rh_up ON TRUE
      LEFT JOIN users u_up ON u_up.id = rh_up.user_id

      WHERE ${where}
      ORDER BY b.numero
     `,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur historique' });
  }
});

module.exports = router;
