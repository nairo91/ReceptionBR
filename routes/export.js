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

const userMap = loadUsersMap();

async function fetchRows(etage, chambre, lot, state, start, end, cols) {
  const selectCols = cols
    .filter(c => c !== 'created_by' && c !== 'image')
    .map(c => 'i.' + c)
    .join(', ');
  const sql = `
    SELECT ${selectCols}
      , (
          SELECT ih.person_new
            FROM interventions_history ih
           WHERE ih.intervention_id = i.id
             AND ih.action = 'Création'
           ORDER BY ih.created_at
           LIMIT 1
        ) AS created_by
      , (
          SELECT array_agg(url)
            FROM interventions_photos p
           WHERE p.intervention_id = i.id
        ) AS photos
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
    // ① on récupère les données brutes
    let rows = await fetchRows(etage, chambre, lot, state, start, end, cols);
    // ② on remplace user_id, person et created_by par les noms
    rows = rows.map(r => ({
      ...r,
      user_id:    userMap[r.user_id]    || r.user_id,
      person:     userMap[r.person]     || r.person,
      created_by: userMap[r.created_by] || r.created_by,
      photos: r.photos || [],
      image:  (r.photos || []).map(u => `=IMAGE("${u}")`).join(',')
    }));

    switch(req.params.format) {
      case 'csv': {
        if (!cols.includes('created_by')) cols.push('created_by');
        if (!cols.includes('image'))      cols.push('image');
        // csv : fields → [{ label, value }]
        const csvFields = cols.map(c => {
          let label = c;
          if (c === 'user_id')   label = 'Créateur';
          if (c === 'person')    label = 'Personne';
          if (c === 'created_by') label = 'Créé par';
          if (c === 'image')     label = 'Image';
          // sinon label = c
          return { label, value: c };
        });
        const parser = new Parser({ fields: csvFields, delimiter: ';', header: true, eol: '\r\n', quote: '"' });
        let csv = parser.parse(rows);
        csv = '\uFEFF' + csv;
        res.header('Content-Type', 'text/csv; charset=utf-8');
        res.attachment('interventions.csv');
        return res.send(csv);
      }
      case 'excel': {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Interventions');
        // colonnes Excel en français
        sheet.columns = cols.map(c => {
          let header = c;
          if (c === 'user_id')   header = 'Créateur';
          if (c === 'person')    header = 'Personne';
          if (c === 'created_by') header = 'Créé par';
          if (c === 'image')     header = 'Image';
          return { header, key: c, width: 20 };
        });
        rows.forEach(r => {
          const row = {};
          cols.forEach(c => { if (c !== 'image') row[c] = r[c]; });
          const added = sheet.addRow(row);
          if (cols.includes('image')) {
            const idx = cols.indexOf('image') + 1;
            const formula = r.photos && r.photos.length ? `=IMAGE("${r.photos[0]}")` : '';
            added.getCell(idx).value = { formula };
          }
        });
        res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.attachment('interventions.xlsx');
        await workbook.xlsx.write(res);
        return res.end();
      }
      case 'pdf': {
        // 📄 Export PDF
        const doc = new PDFDocument({ margin: 30, size: 'A4' });
        res.setHeader('Content-Type', 'application/pdf');
        res.attachment('interventions.pdf');
        doc.pipe(res);

        // entêtes en français
        const headers = cols.map(c => {
          if (c === 'user_id')   return 'Créateur';
          if (c === 'person')    return 'Personne';
          if (c === 'created_by') return 'Créé par';
          if (c === 'image')     return 'Image';
          return c.charAt(0).toUpperCase() + c.slice(1);
        });

        // calcul dynamique des largeurs pour éviter le chevauchement
        const margin    = 30;
        const pageWidth = doc.page.width;
        const availW    = pageWidth - margin * 2;
        const count     = headers.length;
        const colWidths = headers.map(() => availW / count);
        const rowHeight = 18;
        const startX    = margin;
        let y           = 80;

        doc.font('Helvetica-Bold').fontSize(9);
        let x = startX;
        headers.forEach((h, i) => {
          doc.text(h, x, y, { width: colWidths[i], align: 'left' });
          x += colWidths[i];
        });
        y += rowHeight;

        doc.font('Helvetica').fontSize(8);
        rows.forEach(r => {
          x = startX;
          cols.forEach((c, i) => {
            doc.text(String(r[c] ?? ''), x, y, { width: colWidths[i], align: 'left' });
            x += colWidths[i];
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
