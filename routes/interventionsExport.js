const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const { Parser } = require('json2csv');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

router.get('/', async (req, res) => {
  // Récupère les filtres passés depuis selection.js
  const {
    floor_id   = '',
    room_id    = '',
    lot        = '',
    status     = '',
    start      = '',
    end        = '',
    columns    = '',
    format: rawFormat = 'csv'
  } = req.query;

  let format = rawFormat.toLowerCase();
  if (format === 'excel') format = 'xlsx';

  const params = [];
  const conds  = [];

  if (floor_id) { params.push(floor_id);  conds.push(`i.floor_id = $${params.length}`); }
  if (room_id)  { params.push(room_id);   conds.push(`i.room_id  = $${params.length}`); }
  if (lot)      { params.push(lot);       conds.push(`i.lot      = $${params.length}`); }
  if (status)   { params.push(status);    conds.push(`i.status   = $${params.length}`); }
  if (start)    { params.push(start);     conds.push(`i.created_at >= $${params.length}`); }
  if (end)      { params.push(end);       conds.push(`i.created_at <= $${params.length}`); }

  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

  // Colonnes souhaitées
  let cols = columns
    .split(',')
    .map(c => c.trim())
    .filter(c => c);

  // Si aucune sélection, valeurs par défaut
  if (cols.length === 0) {
    cols = ['id','created_by','last_modified_by','floor_id','room_id','lot','task','status','created_at'];
  }

  // Reconstruisons la liste de SELECT pour injecter les bonnes expressions SQL
  const selectList = cols.map(c => {
    if (c === 'created_by') {
      return 'u1.email AS created_by';
    }
    if (c === 'last_modified_by') {
      return 'u2.email AS last_modified_by';
    }
    // sinon une colonne de la table interventions
    return `i.${c}`;
  }).join(', ');

  const sql = `
    SELECT ${selectList}
    FROM interventions i
    LEFT JOIN users u1 ON u1.id = i.user_id::int
    LEFT JOIN users u2 ON u2.id = i.person::int
    ${where}
    ORDER BY i.created_at DESC
  `;
  const { rows } = await pool.query(sql, params);

  if (format === 'csv' || !format) {
    const parser = new Parser({ fields: cols });
    const csv = '\uFEFF' + parser.parse(rows);
    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.attachment('interventions.csv');
    return res.send(csv);
  }

  if (format === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Interventions');
    const headerRow = ws.addRow(cols);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F497D' }
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    ws.columns.forEach(col => { col.width = 20; });

    rows.forEach((r, idx) => {
      const row = ws.addRow(cols.map(c => r[c]));
      const isEven = idx % 2 === 0;
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isEven ? 'FFDCE6F1' : 'FFFFFFFF' }
      };
    });

    ws.eachRow({ includeEmpty: false }, row => {
      row.eachCell(cell => {
        cell.border = {
          top:    { style: 'thin' },
          left:   { style: 'thin' },
          bottom: { style: 'thin' },
          right:  { style: 'thin' }
        };
      });
    });

    res.header('Content-Disposition', 'attachment; filename=interventions.xlsx');
    return wb.xlsx.write(res).then(() => res.end());
  }

  if (format === 'pdf') {
    const doc = new PDFDocument({ size: 'A4', margin: 30 });
    res.header('Content-Type', 'application/pdf');
    res.attachment('interventions.pdf');
    doc.pipe(res);
    doc.text('Export des interventions', { align: 'center' }).moveDown();
    const headers = cols.join(' | ');
    doc.font('Helvetica-Bold').text(headers).moveDown();
    doc.font('Helvetica');
    rows.forEach(r => {
      doc.text(cols.map(c => r[c]).join(' | '));
    });
    doc.end();
    return;
  }

  return res.status(400).send('Format inconnu');
});

module.exports = router;
