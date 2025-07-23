const express = require('express');
const router = express.Router();
const pool = require('../db');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const { Parser } = require('json2csv');
const csvExpress = require('csv-express');
const fs = require('fs');
const path = require('path');

// expose res.csv()
router.use(csvExpress());

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

const userMap = loadUsersMap();

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
} // ← fermer fetchRows ici, avant le router.get

// Export des bulles en différents formats
router.get('/', async (req, res) => {
  const { etage, chambre, format } = req.query;
  const cols = (
    req.query.columns ||
    'id,user_id,floor_id,room_id,numero,lot,intitule,description,etat,entreprise,localisation,observation,date_butoir,created_at'
  )
    .split(',')
    .filter(Boolean);

  const sql = `SELECT ${cols.join(',')} FROM bulles
     WHERE etage=$1
     ${chambre && chambre !== 'total' ? 'AND chambre=$2' : ''}`;
  const { rows } = await pool.query(
    sql,
    chambre && chambre !== 'total' ? [etage, chambre] : [etage]
  );

  switch (format) {
    case 'xlsx': {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Bulles');
      sheet.addRow(cols);
      rows.forEach(r => sheet.addRow(cols.map(c => r[c])));
      res.setHeader('Content-Disposition', 'attachment; filename=bulles.xlsx');
      return workbook.xlsx.write(res).then(() => res.end());
    }
    case 'pdf': {
      const doc = new PDFDocument({ size: 'A4', margin: 30 });
      res.setHeader('Content-Disposition', 'attachment; filename=bulles.pdf');
      doc.pipe(res);
      doc.text('Export des bulles', { align: 'center' }).moveDown();
      const table = {
        headers: cols,
        rows: rows.map(r => cols.map(c => r[c]))
      };
      doc.table(table, { width: 500 });
      doc.end();
      return;
    }
    default: {
      res.setHeader('Content-Disposition', 'attachment; filename=bulles.csv');
      res.csv(rows, true);
    }
  }
});  // ← fermeture du router.get

module.exports = router;
