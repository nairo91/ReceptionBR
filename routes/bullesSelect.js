const pool = require('../db');

async function selectBullesWithEmails({ chantier_id, etage_id, chambre }) {
  const params = [];
  const conds = [];
  if (chantier_id) {
    params.push(chantier_id);
    conds.push(`b.chantier_id = $${params.length}`);
  }
  if (etage_id) {
    params.push(etage_id);
    conds.push(`b.etage_id = $${params.length}`);
  }
  if (chambre && chambre !== 'total') {
    params.push(chambre);
    conds.push(`(b.chambre = $${params.length} OR (b.chambre ~ '^[0-9]+$' AND (b.chambre)::int = $${params.length}::int))`);
  }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  const { rows } = await pool.query(
    `SELECT
       b.*,
       e.nom  AS entreprise,
       f.name AS etage,
       COALESCE(r.name, b.chambre) AS chambre,
       b.chambre AS chambre_id,
     u.email AS created_by_email,
      m.email AS modified_by_email,
      lu.email AS levee_fait_par_email,
      COALESCE(mm.media, '[]'::json) AS media
    FROM bulles b
    LEFT JOIN entreprises e ON b.entreprise_id = e.id
    LEFT JOIN floors f       ON b.etage_id       = f.id
    LEFT JOIN rooms r
      ON r.id = CASE WHEN b.chambre ~ '^[0-9]+$' THEN (b.chambre)::int END
    LEFT JOIN users u ON u.id = b.created_by
    LEFT JOIN users m ON m.id = b.modified_by
    LEFT JOIN users lu ON lu.id = b.levee_fait_par
    LEFT JOIN (
      SELECT bulle_id,
             json_agg(json_build_object('type', type, 'path', path) ORDER BY created_at) AS media
      FROM bulle_media
      GROUP BY bulle_id
     ) mm ON mm.bulle_id = b.id
     ${where}
     ORDER BY b.id`,
    params
  );
  return rows.map(b => {
    const raw = b.media;
    const arr = Array.isArray(raw) ? raw : JSON.parse(raw || '[]');
    return {
      ...b,
      media: Array.from(new Map(arr.map(m => [m.path, m])).values())
    };
  });
}

module.exports = { selectBullesWithEmails };
