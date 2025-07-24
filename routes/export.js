const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/bulles/export
router.get('/', async (req, res) => {
  const { etage = '', chambre = '', format = 'csv', columns } = req.query;
  // Colonnes par défaut exactement celles de la table `bulles`
  const cols = (columns ||
    'id,etage,chambre,numero,intitule,description,etat,lot,entreprise,localisation,observation,date_butoir,photo,created_by,modified_by,levee_par,entreprise_id,chantier_id'
  )
    .split(',')
    .map(c => c.trim())
    .filter(Boolean);
  // WHERE dynamique
  const params = [];
  const conds  = [];
  if (etage)     { params.push(etage);   conds.push(`etage   = $${params.length}`); }
  if (chambre && chambre !== 'total') { params.push(chambre); conds.push(`chambre = $${params.length}`); }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  // Exécution
  const sql = `SELECT ${cols.join(', ')} FROM bulles ${where} ORDER BY id`;
  const { rows } = await pool.query(sql, params);

  // CSV via json2csv
  if (format === 'csv') {
    const { Parser } = require('json2csv');
    const parser = new Parser({ fields: cols });
    let csv = '\uFEFF' + parser.parse(rows);
    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.attachment('bulles.csv');
    return res.send(csv);
  }

  // Excel
  if (format === 'xlsx') {
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Bulles');
    ws.addRow(cols);
    rows.forEach(r => ws.addRow(cols.map(c => r[c])));
    res.header('Content-Disposition', 'attachment; filename=bulles.xlsx');
    return wb.xlsx.write(res).then(() => res.end());
  }

  // PDF
  if (format === 'pdf') {
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ size: 'A4', margin: 30 });
    res.header('Content-Disposition', 'attachment; filename=bulles.pdf');
    doc.pipe(res);
    doc.text('Export des bulles', { align: 'center' }).moveDown();
    const table = { headers: cols, rows: rows.map(r => cols.map(c => r[c])) };
    doc.table(table, { width: 500 });
    doc.end();
    return;
  }

  // Format inconnu
  return res.status(400).send('Format inconnu');
});

module.exports = router;
