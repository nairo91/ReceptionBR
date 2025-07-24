const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const { Parser } = require('json2csv');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

router.get('/', async (req, res) => {
  // on passe désormais étage et chambre comme nombres
  const floorId = req.query.floor_id || '';
  const roomId  = req.query.room_id  || '';

  // Construire WHERE
  const params = [];
  const conds  = [];
  if (floorId !== '') {
    params.push(floorId);
    conds.push(`etage = $${params.length}`);
  }
  if (roomId && roomId !== 'total') {
    params.push(roomId);
    conds.push(`chambre = $${params.length}`);
  }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

  // Récupérer * toutes * les colonnes avec info create/modify
  const sql = `
    SELECT
      b.*,
      h.user  AS created_by_email,
      h2.user AS modified_by_email
    FROM bulles b
    LEFT JOIN interventions_history h
      ON h.intervention_id = b.id
      AND h.action = 'creation'
    LEFT JOIN interventions_history h2
      ON h2.intervention_id = b.id
      AND h2.action <> 'creation'
      AND h2.id = (
        SELECT MAX(id)
        FROM interventions_history ih
        WHERE ih.intervention_id = b.id
          AND ih.action <> 'creation'
      )
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
