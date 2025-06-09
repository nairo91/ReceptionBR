const express = require("express");
const router = express.Router();
const pool = require("../db");
const multer = require("multer");
const path = require("path");
const { Parser } = require("json2csv"); // Installe json2csv avec npm install json2csv

const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

router.post("/", upload.single("photo"), async (req, res) => {
  const {
    etage, chambre, x, y, numero, description,
    intitule, etat, lot, entreprise, localisation, observation, date_butoir
  } = req.body;

  const safeDate = date_butoir === "" ? null : date_butoir;
  const photo = req.file ? `/uploads/${req.file.filename}` : null;

  await pool.query(
    `INSERT INTO bulles 
    (etage, chambre, x, y, numero, description, photo, intitule, etat, lot, entreprise, localisation, observation, date_butoir)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [etage, chambre, x, y, numero, description || null, photo, intitule || null, etat, lot || null, entreprise || null, localisation || null, observation || null, safeDate]
  );

  res.json({ success: true });
});

router.get("/", async (req, res) => {
  const { etage, chambre } = req.query;
  const result = await pool.query(
    "SELECT * FROM bulles WHERE etage = $1 AND chambre = $2",
    [etage, chambre]
  );
  res.json(result.rows);
});

router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  await pool.query("DELETE FROM bulles WHERE id = $1", [id]);
  res.json({ success: true });
});

router.put("/:id", upload.single("photo"), async (req, res) => {
  const { id } = req.params;
  const {
    description, intitule, etat, lot, entreprise, localisation, observation, date_butoir
  } = req.body;

  const safeDate = date_butoir === "" ? null : date_butoir;
  const photo = req.file ? `/uploads/${req.file.filename}` : null;

  if (photo) {
    await pool.query(
      `UPDATE bulles 
       SET description = $1, photo = $2, intitule = $3, etat = $4, lot = $5, entreprise = $6, localisation = $7, observation = $8, date_butoir = $9
       WHERE id = $10`,
      [description || null, photo, intitule || null, etat, lot || null, entreprise || null, localisation || null, observation || null, safeDate, id]
    );
  } else {
    await pool.query(
      `UPDATE bulles 
       SET description = $1, intitule = $2, etat = $3, lot = $4, entreprise = $5, localisation = $6, observation = $7, date_butoir = $8
       WHERE id = $9`,
      [description || null, intitule || null, etat, lot || null, entreprise || null, localisation || null, observation || null, safeDate, id]
    );
  }

  res.json({ success: true });
});


// Route export CSV
router.get("/export/csv", async (req, res) => {
  try {
    const { etage, chambre } = req.query;
    const result = await pool.query(
      "SELECT * FROM bulles WHERE etage = $1 AND chambre = $2",
      [etage, chambre]
    );

    const fields = [
      "id", "numero", "intitule", "description", "etat",
      "lot", "entreprise", "localisation", "observation",
      "date_butoir", "photo", "x", "y", "etage", "chambre"
    ];

    const json2csvParser = new Parser({ fields });
    const csv = json2csvParser.parse(result.rows);

    res.header("Content-Type", "text/csv");
    res.attachment(`bulles_${etage}_${chambre}.csv`);
    return res.send(csv);
  } catch (err) {
    console.error(err);
    res.status(500).send("Erreur lors de l'export CSV");
  }
});
module.exports = router;
