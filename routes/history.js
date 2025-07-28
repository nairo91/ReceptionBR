const router = require('express').Router();
const pool = require('../db');

router.get('/', async (req, res) => {
  const { chantier_id, etage_id, lot } = req.query;
  const params = [];
  let idx = 1;
  let where = '1=1';
  if (chantier_id) {
    where += ` AND b.chantier_id = $${idx++}`;
    params.push(chantier_id);
  }
  if (etage_id) {
    where += ` AND b.etage_id = $${idx++}`;
    params.push(etage_id);
  }
  if (lot) {
    where += ` AND b.lot = $${idx++}`;
    params.push(lot);
  }
  try {
    const result = await pool.query(
      `SELECT
         rh.*,
        u.email       AS username,
         b.etat,
         b.intitule   AS intitule,
         f.name      AS etage,
         b.chambre,
         b.lot,
         b.numero    AS bulle_numero,
         e.nom       AS entreprise,
         b.localisation,
         b.observation,
         b.description
       FROM reserve_history rh
       JOIN bulles b   ON b.id = rh.bulle_id
       LEFT JOIN floors f ON b.etage_id = f.id
       LEFT JOIN entreprises e ON b.entreprise_id = e.id
       JOIN users u    ON u.id = rh.user_id
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
