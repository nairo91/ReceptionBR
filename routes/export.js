const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const { Parser } = require('json2csv');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

router.get('/', async (req, res) => {
  // on récupère la chaîne "R+X" pour filtrer sur la colonne textuelle `etage`
  const etageFilter = req.query.floor_id || '';
  const rawRoom  = req.query.room_id  || '';
  const roomId  = parseInt(rawRoom.replace(/\D/g,''), 10);

  // Construire WHERE
  const params = [];
  const conds  = [];
  if (etageFilter) {
    params.push(etageFilter);
    conds.push(`etage = $${params.length}`);
  }
  if (!isNaN(roomId)) {
    params.push(roomId);
    conds.push(`chambre = $${params.length}`);
  }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

  // Récupérer * toutes * les colonnes et remonter les noms plutôt que les IDs
  const sql = `
    SELECT
      -- toutes les colonnes de b sauf les champs numériques created_by / modified_by
      b.id, b.etage, b.chambre, b.x, b.y, b.numero,
      b.intitule, b.description, b.etat, b.lot, b.entreprise,
      b.localisation, b.observation, b.date_butoir, b.photo,
      -- remplacez par u1.username si vous préférez le login plutôt que l'email
      u1.username   AS created_by,
      u2.username   AS modified_by
    FROM bulles b
    LEFT JOIN users u1 ON b.created_by   = u1.id
    LEFT JOIN users u2 ON b.modified_by = u2.id
    ${where}
    ORDER BY b.id
  `;
  const { rows } = await pool.query(sql, params);

  // On extrait dynamiquement les noms de colonnes
  const cols = rows.length > 0 ? Object.keys(rows[0]) : [];

  const format = (req.query.format || 'csv').toLowerCase();
  if (format === 'csv') {
    const parser = new Parser({ fields: cols });
    let csv = '\uFEFF' + parser.parse(rows);
    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.attachment('bulles.csv');
    return res.send(csv);
  }

  if (format === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Bulles');
    ws.addRow(cols);
    rows.forEach(r => ws.addRow(cols.map(c => r[c])));
    res.header('Content-Disposition', 'attachment; filename=bulles.xlsx');
    return wb.xlsx.write(res).then(() => res.end());
  }

  if (format === 'pdf') {
    const doc = new PDFDocument({ size: 'A4', margin: 30 });
    res.header('Content-Disposition', 'attachment; filename=bulles.pdf');
    doc.pipe(res);
    doc.text('Export des bulles', { align: 'center' }).moveDown();
    // On utilise pdfkit-table ou un helper similaire
    const table = { headers: cols, rows: rows.map(r => cols.map(c => r[c])) };
    doc.table(table, { width: 500 });
    doc.end();
    return;
  }

  // Si format inconnu
  return res.status(400).send('Format inconnu');
});

module.exports = router;
