const express = require('express');
const router = express.Router();
const pool = require('../db');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const { Parser } = require('json2csv');
const fs = require('fs');
const path = require('path');

function loadUsersMap() {
  const csvPath = path.join(__dirname, '../db/users.csv');
  if (!fs.existsSync(csvPath)) return {};
  const text = fs.readFileSync(csvPath, 'latin1');
  const lines = text.split(/\r?\n/).slice(1).filter(l => l.trim());
  const map = {};
  lines.forEach((line, idx) => {
    const [id, name] = line.split(';');
    const key = id.trim() || String(idx + 1);
    map[key] = name ? name.trim() : key;
  });
  return map;
}

async function fetchRows(etage, chambre, lot, state, start, end, cols) {
  const sql = `
    SELECT ${cols.map(c => 'i.' + c).join(', ')}
      FROM interventions i
      WHERE ($1='' OR i.floor_id::text=$1)
        AND ($2='' OR i.room_id::text=$2)
        AND ($3='' OR i.lot=$3)
        AND ($4='' OR i.status=$4::text)
        AND ($5 = '' OR i.created_at >= $5::timestamp)
        AND ($6 = '' OR i.created_at <= $6::timestamp)
      ORDER BY i.created_at DESC`;
  const { rows } = await pool.query(sql, [etage, chambre, lot, state, start, end]);
  return rows;
}

router.get('/:format', async (req, res) => {
  try {
    const { etage='', chambre='', lot='', state='', start='', end='', columns } = req.query;
    const cols = (columns || 'id,user_id,floor_id,room_id,lot,task,status,person,action,created_at')
      .split(',').map(c => c.trim()).filter(Boolean);
    const rows = await fetchRows(etage, chambre, lot, state, start, end, cols);
    const userMap = loadUsersMap();

    switch(req.params.format) {
      case 'csv': {
        const parser = new Parser({ fields: cols, delimiter: ';', header: true, eol: '\r\n', quote: '"' });
        let csv = parser.parse(rows);
        csv = '\uFEFF' + csv;
        res.header('Content-Type', 'text/csv; charset=utf-8');
        res.attachment('interventions.csv');
        return res.send(csv);
      }
      case 'excel': {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Interventions');
        sheet.columns = cols.map(c => ({ header: c, key: c, width: 20 }));
        rows.forEach(r => {
          const row = {};
          cols.forEach(c => { row[c] = r[c]; });
          sheet.addRow(row);
        });
        res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.attachment('interventions.xlsx');
        await workbook.xlsx.write(res);
        return res.end();
      }
      case 'pdf': {
        const doc = new PDFDocument({ margin: 30, size: 'A4' });
        res.setHeader('Content-Type', 'application/pdf');
        res.attachment('interventions.pdf');
        doc.pipe(res);
        const colWidths = cols.map(() => 60);
        const rowHeight = 20;
        const startX = 30;
        let y = 80;
        doc.font('Helvetica-Bold').fontSize(10);
        let x = startX;
        cols.forEach((h, idx) => {
          doc.text(h, x, y, { width: colWidths[idx], align: 'left' });
          x += colWidths[idx];
        });
        y += rowHeight;
        doc.font('Helvetica').fontSize(9);
        rows.forEach(r => {
          x = startX;
          cols.forEach((c, idx) => {
            doc.text(String(r[c] ?? ''), x, y, { width: colWidths[idx], align: 'left' });
            x += colWidths[idx];
          });
          y += rowHeight;
        });
        doc.end();
        return;
      }
    }
    res.status(400).send('Format inconnu');
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur export');
  }
});

module.exports = router;
