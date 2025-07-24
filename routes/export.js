const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const { Parser } = require('json2csv');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

router.get('/', async (req, res) => {
  // Récupérer et forcer des entiers pour éviter integer = text
  const rawFloor = req.query.floor_id || '';
  const rawRoom  = req.query.room_id  || '';
  const floorId = parseInt(rawFloor.replace(/\D/g,''), 10);
  const roomId  = parseInt(rawRoom.replace(/\D/g,''), 10);

  // Construire WHERE
  const params = [];
  const conds  = [];
  // On ne pousse le paramètre que s'il est un entier valide
  if (!isNaN(floorId)) {
    params.push(floorId);
    conds.push(`etage = $${params.length}`);
  }
  if (!isNaN(roomId)) {
    params.push(roomId);
    conds.push(`chambre = $${params.length}`);
  }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

  // Récupérer * toutes * les colonnes et remonter les emails de créateur/modificateur
  const sql = `
    SELECT
      b.*,
      u1.email AS created_by_email,
      u2.email AS modified_by_email
    FROM bulles b
    LEFT JOIN interventions_history h
      ON h.intervention_id = b.id
      AND h.action = 'creation'
    LEFT JOIN users u1
      ON u1.id = (h.user_id::integer)
    LEFT JOIN interventions_history h2
      ON h2.intervention_id = b.id
      AND h2.action <> 'creation'
      AND h2.id = (
        SELECT MAX(id)
        FROM interventions_history ih
        WHERE ih.intervention_id = b.id
          AND ih.action <> 'creation'
      )
    LEFT JOIN users u2
      ON u2.id = (h2.user_id::integer)
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
