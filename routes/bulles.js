const express = require("express");
const router = express.Router();
const pool = require("../db");
const { Parser } = require("json2csv");
const upload = require('../middlewares/upload');
const { selectBullesWithEmails } = require("./bullesSelect");

function parseIntOrNull(v) {
  if (Array.isArray(v)) v = v[0];
  if (v === '' || v == null) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}
function toNullIfEmpty(v) {
  return (v === '' || v == null) ? null : v;
}

// Middleware d'authentification désactivé (dev)
function isAuthenticated(req, res, next) {
  // Toujours passer, sans vérifier la session
  next();
}

// POST : création bulle avec created_by = l'utilisateur en session
router.post("/", /* isAuthenticated, */ upload.any(), async (req, res) => {
  try {
    const {
      chantier_id, etage_id,
      chambre, x, y, numero, description,
      intitule, etat, lot, entreprise_id, localisation, observation
    } = req.body;

    const userId = req.session.user.id;
    const leveeFaitLe = toNullIfEmpty(req.body.levee_fait_le);
    const leveeCommentaire = toNullIfEmpty(req.body.levee_commentaire);
    const safeDate = toNullIfEmpty(req.body.date_butoir);
    const files = req.files || [];
    // ne garder qu’une seule entrée par URL Cloudinary (evite les doublons)
    const uniqueFiles = Array.from(new Map(files.map(f => [f.path, f])).values());
    const leveeFiles = uniqueFiles.filter(f => f.fieldname === 'levee_media' || f.fieldname === 'levee_media[]');
    const mediaFiles = uniqueFiles.filter(f => f.fieldname !== 'levee_media' && f.fieldname !== 'levee_media[]');
    const firstPhoto = mediaFiles.find(f => f.mimetype.startsWith('image/'));
    const photo = firstPhoto ? firstPhoto.path : null;
    let leveeFaitPar = parseIntOrNull(req.body.levee_fait_par);
    if (leveeFaitPar == null && (leveeFaitLe || leveeCommentaire || leveeFiles.length)) {
      leveeFaitPar = userId;
    }

    const insertRes = await pool.query(
      `INSERT INTO bulles
      (chantier_id, etage_id, chambre, x, y, numero, description, photo, intitule, etat, lot, entreprise_id, localisation, observation, date_butoir, created_by, levee_fait_par, levee_fait_le, levee_commentaire)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
      [chantier_id || null, etage_id || null, chambre, x, y, numero, description || null, photo, intitule || null, etat, lot || null, entreprise_id || null, localisation || null, observation || null, safeDate, userId, leveeFaitPar, leveeFaitLe, leveeCommentaire]
    );

    const newBulle = insertRes.rows[0];
    for (const file of mediaFiles) {
      await pool.query(
        'INSERT INTO bulle_media(bulle_id,type,path) VALUES($1,$2,$3)',
        [
          newBulle.id,
          file.mimetype.startsWith('video/') ? 'video' : 'photo',
          file.path
        ]
      );
    }
    for (const f of leveeFiles) {
      await pool.query(
        'INSERT INTO bulle_media(bulle_id,type,path) VALUES($1,$2,$3)',
        [newBulle.id, 'levee_photo', f.path]
      );
    }
    await pool.query(
      `INSERT INTO reserve_history (bulle_id, user_id, action_type, old_values, new_values)
       VALUES ($1,$2,$3,$4,$5)`,
      [newBulle.id, userId, 'create', null, JSON.stringify(newBulle)]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur création bulle" });
  }
});

// GET bulles
router.get("/", async (req, res) => {
  try {
    const rows = await selectBullesWithEmails(req.query);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur récupération bulles" });
  }
});

// DELETE bulle (sans authentification)
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  await pool.query("DELETE FROM bulles WHERE id = $1", [id]);
  res.json({ success: true });
});

// PUT : modification bulle sans authentification, modified_by et levee_par à null
router.put("/:id", /* isAuthenticated, */ upload.any(), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      chantier_id, etage_id,
      description, intitule, etat, lot, entreprise_id, localisation, observation
    } = req.body;

    const userId = req.session.user.id;
    const leveeFaitLe = toNullIfEmpty(req.body.levee_fait_le);
    const leveeCommentaire = toNullIfEmpty(req.body.levee_commentaire);
    const safeDate = toNullIfEmpty(req.body.date_butoir);
    const files = req.files || [];
    // ne garder qu’une seule entrée par URL Cloudinary (evite les doublons)
    const uniqueFiles = Array.from(new Map(files.map(f => [f.path, f])).values());
    const leveeFiles = uniqueFiles.filter(f => f.fieldname === 'levee_media' || f.fieldname === 'levee_media[]');
    const mediaFiles = uniqueFiles.filter(f => f.fieldname !== 'levee_media' && f.fieldname !== 'levee_media[]');
    const firstPhoto = mediaFiles.find(f => f.mimetype.startsWith('image/'));
    const photo = firstPhoto ? firstPhoto.path : null;

    // Récupérer l'état actuel complet pour l'historique
    const oldRes = await pool.query('SELECT * FROM bulles WHERE id = $1', [id]);
    if (oldRes.rowCount === 0) return res.status(404).json({ error: 'Bulle non trouvée' });
    const oldRow = oldRes.rows[0];
    let leveeFaitPar = parseIntOrNull(req.body.levee_fait_par);
    if (leveeFaitPar == null) {
      if (leveeFaitLe || leveeCommentaire || leveeFiles.length) {
        leveeFaitPar = userId;
      } else {
        leveeFaitPar = oldRow.levee_fait_par;
      }
    }

    if (photo) {
      await pool.query(
        `UPDATE bulles
         SET chantier_id=$1, etage_id=$2, description = $3, photo = $4, intitule = $5, etat = $6, lot = $7, entreprise_id = $8, localisation = $9, observation = $10, date_butoir = $11, modified_by = $12, levee_fait_par = $13, levee_fait_le = $14, levee_commentaire = $15
         WHERE id = $16`,
        [chantier_id || null, etage_id || null, description || null, photo, intitule || null, etat, lot || null, entreprise_id || null, localisation || null, observation || null, safeDate, userId, leveeFaitPar, leveeFaitLe, leveeCommentaire, id]
      );
    } else {
      await pool.query(
        `UPDATE bulles
         SET chantier_id=$1, etage_id=$2, description = $3, intitule = $4, etat = $5, lot = $6, entreprise_id = $7, localisation = $8, observation = $9, date_butoir = $10, modified_by = $11, levee_fait_par = $12, levee_fait_le = $13, levee_commentaire = $14
         WHERE id = $15`,
        [chantier_id || null, etage_id || null, description || null, intitule || null, etat, lot || null, entreprise_id || null, localisation || null, observation || null, safeDate, userId, leveeFaitPar, leveeFaitLe, leveeCommentaire, id]
      );
    }

    const { rows: existing } = await pool.query(
      'SELECT path FROM bulle_media WHERE bulle_id = $1', [id]
    );
    const existingPaths = new Set(existing.map(r => r.path));
    for (const file of mediaFiles) {
      if (!existingPaths.has(file.path)) {
        const type = file.mimetype.startsWith('video/') ? 'video' : 'photo';
        await pool.query(
          'INSERT INTO bulle_media(bulle_id,type,path) VALUES($1,$2,$3)',
          [id, type, file.path]
        );
      }
    }
    for (const f of leveeFiles) {
      if (!existingPaths.has(f.path)) {
        await pool.query(
          'INSERT INTO bulle_media(bulle_id,type,path) VALUES($1,$2,$3)',
          [id, 'levee_photo', f.path]
        );
      }
    }

    const newRes = await pool.query('SELECT * FROM bulles WHERE id = $1', [id]);
    const newRow = newRes.rows[0];
    await pool.query(
      `INSERT INTO reserve_history (bulle_id, user_id, action_type, old_values, new_values)
       VALUES ($1,$2,$3,$4,$5)`,
      [id, userId, 'update', JSON.stringify(oldRow), JSON.stringify(newRow)]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur modification bulle" });
  }
});

// Export CSV complet
router.get("/export/csv/all", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT b.id, b.numero, b.intitule, b.description, b.etat,
              b.lot, e.nom AS entreprise, b.localisation, b.observation,
              b.date_butoir, b.photo, b.x, b.y, f.name AS etage, b.chambre,
              u1.username AS created_by,
              u2.username AS modified_by,
              b.levee_par,
              pm.photos,
              vm.videos
       FROM bulles b
       LEFT JOIN entreprises e ON b.entreprise_id = e.id
       LEFT JOIN floors f ON b.etage_id = f.id
       LEFT JOIN LATERAL (
         SELECT user_id
         FROM reserve_history rh
         WHERE rh.bulle_id = b.id
           AND rh.action_type = 'create'
         ORDER BY rh.created_at ASC
         LIMIT 1
       ) rh_create ON TRUE
       LEFT JOIN users u1 ON rh_create.user_id = u1.id

       LEFT JOIN LATERAL (
         SELECT user_id
         FROM reserve_history rh
         WHERE rh.bulle_id = b.id
           AND rh.action_type = 'update'
         ORDER BY rh.created_at DESC
         LIMIT 1
       ) rh_update ON TRUE
       LEFT JOIN users u2 ON rh_update.user_id = u2.id
       LEFT JOIN (
         SELECT bulle_id, json_agg(path) AS photos
         FROM bulle_media WHERE type='photo'
         GROUP BY bulle_id
       ) pm ON pm.bulle_id = b.id
       LEFT JOIN (
         SELECT bulle_id, json_agg(path) AS videos
         FROM bulle_media WHERE type='video'
         GROUP BY bulle_id
       ) vm ON vm.bulle_id = b.id`
    );

    const fields = [
      "id", "numero", "intitule", "photos", "videos", "description", "etat",
      "lot", "entreprise", "localisation", "observation",
      "date_butoir", "x", "y", "etage", "chambre",
      "created_by", "modified_by", "levee_par"
    ];

    const opts = {
      fields,
      delimiter: ";",
      header: true,
      quote: '"',
      eol: "\r\n"
    };

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const rowsWithFullMedia = result.rows.map(row => ({
      ...row,
      photo: row.photo ? baseUrl + row.photo : '',
      photos: Array.isArray(row.photos)
        ? row.photos.map(p => baseUrl + p).join(', ')
        : '',
      videos: Array.isArray(row.videos)
        ? row.videos.map(v => baseUrl + v).join(', ')
        : ''
    }));

    const json2csvParser = new Parser(opts);
    let csv = json2csvParser.parse(rowsWithFullMedia);

    const BOM = '\uFEFF';
    csv = BOM + csv;

    res.header("Content-Type", "text/csv; charset=utf-8");
    res.attachment(`bulles_all.csv`);
    return res.send(csv);
  } catch (err) {
    console.error(err);
    res.status(500).send("Erreur lors de l'export CSV complet");
  }
});

// Export CSV filtré
router.get("/export/csv", async (req, res) => {
  try {
    const { etage_id, chambre } = req.query;

    let result;
    if (!chambre || chambre === "total") {
      result = await pool.query(
        `SELECT f.name AS etage, b.chambre, b.numero, b.intitule, b.description, b.etat,
                b.lot, b.photo, b.levee_par,
                u1.username AS created_by,
                u2.username AS modified_by,
                pm.photos,
                vm.videos
         FROM bulles b
         LEFT JOIN floors f ON b.etage_id = f.id
         LEFT JOIN LATERAL (
           SELECT user_id
           FROM reserve_history rh
           WHERE rh.bulle_id = b.id
             AND rh.action_type = 'create'
           ORDER BY rh.created_at ASC
           LIMIT 1
         ) rh_create ON TRUE
         LEFT JOIN users u1 ON rh_create.user_id = u1.id

         LEFT JOIN LATERAL (
          SELECT user_id
          FROM reserve_history rh
          WHERE rh.bulle_id = b.id
             AND rh.action_type = 'update'
           ORDER BY rh.created_at DESC
           LIMIT 1
         ) rh_update ON TRUE
         LEFT JOIN users u2 ON rh_update.user_id = u2.id
         LEFT JOIN (
           SELECT bulle_id, json_agg(path) AS photos
           FROM bulle_media WHERE type='photo'
           GROUP BY bulle_id
         ) pm ON pm.bulle_id = b.id
         LEFT JOIN (
           SELECT bulle_id, json_agg(path) AS videos
           FROM bulle_media WHERE type='video'
           GROUP BY bulle_id
         ) vm ON vm.bulle_id = b.id
         WHERE b.etage_id = $1 ORDER BY b.numero`,
        [etage_id]
      );
    } else {
      result = await pool.query(
        `SELECT f.name AS etage, b.chambre, b.numero, b.intitule, b.description, b.etat,
                b.lot, b.photo, b.levee_par,
                u1.username AS created_by,
                u2.username AS modified_by,
                pm.photos,
                vm.videos
         FROM bulles b
         LEFT JOIN floors f ON b.etage_id = f.id
         LEFT JOIN LATERAL (
           SELECT user_id
           FROM reserve_history rh
           WHERE rh.bulle_id = b.id
             AND rh.action_type = 'create'
           ORDER BY rh.created_at ASC
           LIMIT 1
         ) rh_create ON TRUE
         LEFT JOIN users u1 ON rh_create.user_id = u1.id

         LEFT JOIN LATERAL (
          SELECT user_id
          FROM reserve_history rh
          WHERE rh.bulle_id = b.id
             AND rh.action_type = 'update'
           ORDER BY rh.created_at DESC
           LIMIT 1
         ) rh_update ON TRUE
         LEFT JOIN users u2 ON rh_update.user_id = u2.id
         LEFT JOIN (
           SELECT bulle_id, json_agg(path) AS photos
           FROM bulle_media WHERE type='photo'
           GROUP BY bulle_id
         ) pm ON pm.bulle_id = b.id
         LEFT JOIN (
           SELECT bulle_id, json_agg(path) AS videos
           FROM bulle_media WHERE type='video'
           GROUP BY bulle_id
         ) vm ON vm.bulle_id = b.id
         WHERE b.etage_id = $1 AND b.chambre = $2 ORDER BY b.numero`,
        [etage_id, chambre]
      );
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const rowsWithFullMedia = result.rows.map(r => ({
      ...r,
      photo: r.photo ? baseUrl + r.photo : '',
      photos: Array.isArray(r.photos)
        ? r.photos.map(p => baseUrl + p).join(', ')
        : '',
      videos: Array.isArray(r.videos)
        ? r.videos.map(v => baseUrl + v).join(', ')
        : ''
    }));

    const fields = [
      "etage",
      "chambre",
      "numero",
      "intitule",
      "photos",
      "videos",
      "description",
      "etat",
      "lot",
      "levee_par",
      "created_by",
      "modified_by"
    ];

    const opts = {
      fields,
      delimiter: ";",
      header: true,
      quote: '"',
      eol: "\r\n"
    };

    const json2csvParser = new Parser(opts);
    let csv = json2csvParser.parse(rowsWithFullMedia);

    const BOM = '\uFEFF';
    csv = BOM + csv;

    res.header("Content-Type", "text/csv; charset=utf-8");
    res.attachment(`bulles_${etage_id}_${chambre}.csv`);
    return res.send(csv);
  } catch (err) {
    console.error(err);
    res.status(500).send("Erreur lors de l'export CSV");
  }
});

// GET /api/bulles/stats
//   renvoie {attente: X, a_corriger: Y, corrige: Z, validee: W}
router.get('/stats', async (req, res) => {
  try {
    const result = await pool.query("SELECT etat, COUNT(*) FROM bulles GROUP BY etat");
    const stats = { attente: 0, a_corriger: 0, corrige: 0, validee: 0 };
    result.rows.forEach(r => {
      stats[r.etat] = parseInt(r.count, 10);
    });
    res.json(stats);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur stats' });
  }
});

// GET /api/bulles/urgent
//   renvoie un tableau des 5 bulles où etat != 'validee'
//   triées par due_date ASC
router.get('/urgent', async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, description, date_butoir FROM bulles WHERE etat <> 'validee' ORDER BY date_butoir ASC LIMIT 5"
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur urgent' });
  }
});

// GET /api/bulles/:id
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const result = await pool.query(
    `SELECT b.*, e.nom AS entreprise,
            COALESCE(mm.media, '[]') AS media
       FROM bulles b
       LEFT JOIN entreprises e ON b.entreprise_id = e.id
       LEFT JOIN (
         SELECT bulle_id,
                json_agg(json_build_object('type', type, 'path', path)
                         ORDER BY created_at) AS media
         FROM bulle_media
         GROUP BY bulle_id
       ) mm ON mm.bulle_id = b.id
      WHERE b.id = $1`,
    [id]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Bulle non trouvée' });
  const row = result.rows[0];
  const dedupedMedia = Array.from(
    new Map((row.media || []).map(m => [m.path, m])).values()
  );
  res.json({ ...row, media: dedupedMedia });
});

// GET /api/bulles/:id/history
router.get('/:id/history', async (req, res) => {
  const { id } = req.params;
  const logs = await pool.query(
    'SELECT * FROM reserve_history WHERE bulle_id=$1 ORDER BY created_at DESC',
    [id]
  );
  res.json(logs.rows);
});

router.post('/:id/photos', upload.array('photos'), async (req, res) => {
  const urls = req.files.map(f => f.path);
  res.json(urls);
});

module.exports = router;
