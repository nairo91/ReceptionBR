const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/bulles/export
router.get('/export', async (req, res) => {
  const { etage = '', chambre = '', format = 'csv', columns } = req.query;
  // Colonnes par défaut exactement celles de la table `bulles`
  const cols = (columns || 'id,numero,intitule,description,etat,lot,entreprise,localisation,observation,date_butoir,created_at,created_by,floor_id,room_id')
    .split(',')
    .map(c => c.trim())
    .filter(Boolean);
  // Construire le WHERE selon etage/chambre
  const params = [];
  const conditions = [];
  if (etage)   { params.push(etage);   conditions.push(`etage = $${params.length}`); }
  if (chambre && chambre !== 'total') { params.push(chambre); conditions.push(`chambre = $${params.length}`); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  // Exécution
  const sql = `SELECT ${cols.join(', ')} FROM bulles ${where} ORDER BY created_at`;
  const { rows } = await pool.query(sql, params);

  if (format === 'csv') {
    const { Parser } = require('json2csv');
    const parser = new Parser({ fields: cols });
    let csv = parser.parse(rows);
    // BOM pour Excel
    csv = '\uFEFF' + csv;
    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.attachment('bulles.csv');
    return res.send(csv);
  }

  if (format === 'xlsx') {
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Bulles');
    sheet.addRow(cols);
    rows.forEach(r => sheet.addRow(cols.map(c => r[c])));
    res.setHeader('Content-Disposition', 'attachment; filename=bulles.xlsx');
    return workbook.xlsx.write(res).then(() => res.end());
  }

  if (format === 'pdf') {
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ size: 'A4', margin: 30 });
    res.setHeader('Content-Disposition', 'attachment; filename=bulles.pdf');
    doc.pipe(res);
    doc.text('Export des bulles', { align: 'center' }).moveDown();
    const table = { headers: cols, rows: rows.map(r => cols.map(c => r[c])) };
    doc.table(table, { width: 500 });
    doc.end();
    return;
  }

  return res.status(400).send('Format inconnu');
});

module.exports = router;
