const express = require("express");
const router = express.Router();
const pool = require("../db");
const multer = require("multer");
const path = require("path");
const { Parser } = require("json2csv");
const { v2: cloudinary } = require("cloudinary");
const { CloudinaryStorage } = require("multer-storage-cloudinary");

cloudinary.config(process.env.CLOUDINARY_URL);

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "receptionbr",
    allowed_formats: ["jpg", "png"],
  },
});
const upload = multer({ storage });

// Middleware d'authentification désactivé (dev)
function isAuthenticated(req, res, next) {
  // Toujours passer, sans vérifier la session
  next();
}

// POST : création bulle avec created_by = null (pas d'utilisateur connecté)
router.post("/", /* isAuthenticated, */ upload.single("photo"), async (req, res) => {
  try {
    const {
      etage, chambre, x, y, numero, description,
      intitule, etat, lot, entreprise, localisation, observation, date_butoir
    } = req.body;

    const userId = null; // Pas de session user

    const safeDate = date_butoir === "" ? null : date_butoir;
    const photo = req.file ? req.file.path : null;

    const insertRes = await pool.query(
      `INSERT INTO bulles
      (etage, chambre, x, y, numero, description, photo, intitule, etat, lot, entreprise, localisation, observation, date_butoir, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [etage, chambre, x, y, numero, description || null, photo, intitule || null, etat, lot || null, entreprise || null, localisation || null, observation || null, safeDate, userId]
    );

    const newBulle = insertRes.rows[0];
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

// GET bulles (aucun changement)
router.get("/", async (req, res) => {
  const { etage, chambre } = req.query;
  let result;
  if (!chambre || chambre === "total") {
    result = await pool.query("SELECT * FROM bulles WHERE etage = $1", [etage]);
  } else {
    result = await pool.query("SELECT * FROM bulles WHERE etage = $1 AND chambre = $2", [etage, chambre]);
  }
  res.json(result.rows);
});

// DELETE bulle (sans authentification)
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  await pool.query("DELETE FROM bulles WHERE id = $1", [id]);
  res.json({ success: true });
});

// PUT : modification bulle sans authentification, modified_by et levee_par à null
router.put("/:id", /* isAuthenticated, */ upload.single("photo"), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      description, intitule, etat, lot, entreprise, localisation, observation, date_butoir
    } = req.body;

    const userId = null; // Pas d'utilisateur connecté

    const safeDate = date_butoir === "" ? null : date_butoir;
    const photo = req.file ? req.file.path : null;

    // Récupérer l'état actuel complet pour l'historique
    const oldRes = await pool.query('SELECT * FROM bulles WHERE id = $1', [id]);
    if (oldRes.rowCount === 0) return res.status(404).json({ error: 'Bulle non trouvée' });
    const oldRow = oldRes.rows[0];

    // Pas de levee_par sans authentification
    const leveeParClause = "";
    const leveeParValue = null;

    if (photo) {
      await pool.query(
        `UPDATE bulles
         SET description = $1, photo = $2, intitule = $3, etat = $4, lot = $5, entreprise = $6, localisation = $7, observation = $8, date_butoir = $9, modified_by = $10${leveeParClause}
         WHERE id = $11`,
        [description || null, photo, intitule || null, etat, lot || null, entreprise || null, localisation || null, observation || null, safeDate, userId, id]
      );
    } else {
      await pool.query(
        `UPDATE bulles
         SET description = $1, intitule = $2, etat = $3, lot = $4, entreprise = $5, localisation = $6, observation = $7, date_butoir = $8, modified_by = $9${leveeParClause}
         WHERE id = $10`,
        [description || null, intitule || null, etat, lot || null, entreprise || null, localisation || null, observation || null, safeDate, userId, id]
      );
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
    const result = await pool.query("SELECT * FROM bulles");

    const fields = [
      "id", "numero", "intitule", "description", "etat",
      "lot", "entreprise", "localisation", "observation",
      "date_butoir", "photo", "x", "y", "etage", "chambre",
      "created_by", "modified_by", "levee_par"
    ];

    const opts = {
      fields,
      delimiter: ";",
      header: true,
      quote: '"',
      eol: "\r\n"
    };

    const baseUrl = req.protocol + "://" + req.get("host");
    const rowsWithFullPhoto = result.rows.map(row => {
      return {
        ...row,
        photo: row.photo ? `=IMAGE("${baseUrl}${row.photo}")` : ""
      };
    });

    const json2csvParser = new Parser(opts);
    let csv = json2csvParser.parse(rowsWithFullPhoto);

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
    const { etage, chambre } = req.query;

    let result;
    if (!chambre || chambre === "total") {
      result = await pool.query(
        `SELECT b.etage, b.chambre, b.numero, b.intitule, b.description, b.etat, b.lot, b.photo,
                u1.username AS created_by, u2.username AS modified_by, b.levee_par
         FROM bulles b
         LEFT JOIN users u1 ON b.created_by = u1.id
         LEFT JOIN users u2 ON b.modified_by = u2.id
         WHERE b.etage = $1 ORDER BY b.numero`,
        [etage]
      );
    } else {
      result = await pool.query(
        `SELECT b.etage, b.chambre, b.numero, b.intitule, b.description, b.etat, b.lot, b.photo,
                u1.username AS created_by, u2.username AS modified_by, b.levee_par
         FROM bulles b
         LEFT JOIN users u1 ON b.created_by = u1.id
         LEFT JOIN users u2 ON b.modified_by = u2.id
         WHERE b.etage = $1 AND b.chambre = $2 ORDER BY b.numero`,
        [etage, chambre]
      );
    }

    // Convertir chemins photo en URL complètes (exemple ici : base URL à adapter)
    const baseUrl = req.protocol + "://" + req.get("host");
    const rowsWithFullPhoto = result.rows.map(row => {
      return {
        ...row,
        photo: row.photo ? `=IMAGE("${baseUrl}${row.photo}")` : ""
      };
    });

    const fields = [
      "etage",
      "chambre",
      "numero",
      "intitule",
      "description",
      "etat",
      "lot",
      "photo",
      "created_by",
      "modified_by",
      "levee_par"
    ];

    const opts = {
      fields,
      delimiter: ";",
      header: true,
      quote: '"',
      eol: "\r\n"
    };

    const json2csvParser = new Parser(opts);
    let csv = json2csvParser.parse(rowsWithFullPhoto);

    const BOM = '\uFEFF';
    csv = BOM + csv;

    res.header("Content-Type", "text/csv; charset=utf-8");
    res.attachment(`bulles_${etage}_${chambre}.csv`);
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
  const result = await pool.query('SELECT * FROM bulles WHERE id=$1', [id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Bulle non trouvée' });
  res.json(result.rows[0]);
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

module.exports = router;
