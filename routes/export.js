const express = require('express');
const router = express.Router();
const pool = require('../db');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
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

async function fetchRows(etage, chambre, lot) {
  const sql = `
    SELECT user_id, action, lot, floor_id::text AS floor, room_id::text AS room,
           task, status, created_at
      FROM interventions
      WHERE ($1='' OR floor_id::text=$1)
        AND ($2='' OR room_id::text=$2)
        AND ($3='' OR lot=$3)
      ORDER BY created_at DESC`;
  const { rows } = await pool.query(sql, [etage, chambre, lot]);
  return rows;
}

router.get('/pdf', async (req, res) => {
  try {
    const etage = req.query.etage || '';
    const chambre = req.query.chambre || '';
    const lot = req.query.lot || '';
    const rows = await fetchRows(etage, chambre, lot);
    const userMap = loadUsersMap();

    const doc = new PDFDocument({ margin: 30, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="interventions.pdf"');
    doc.pipe(res);

    const headers = ['Utilisateur','Action','Lot','Étage','Chambre','Tâche','État','Date'];
    doc.fontSize(12);
    doc.text(headers.join(' | '));
    doc.moveDown();

    rows.forEach(r => {
      const line = [
        userMap[r.user_id] || r.user_id,
        r.action,
        r.lot,
        r.floor,
        r.room,
        r.task,
        r.status,
        new Date(r.created_at).toLocaleString('fr-FR')
      ].join(' | ');
      doc.text(line);
    });

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur export PDF');
  }
});

router.get('/excel', async (req, res) => {
  try {
    const etage = req.query.etage || '';
    const chambre = req.query.chambre || '';
    const lot = req.query.lot || '';
    const rows = await fetchRows(etage, chambre, lot);
    const userMap = loadUsersMap();
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Interventions');

    sheet.columns = [
      { header: 'Utilisateur', key: 'utilisateur', width: 20 },
      { header: 'Action', key: 'action', width: 15 },
      { header: 'Lot', key: 'lot', width: 15 },
      { header: 'Étage', key: 'etage', width: 10 },
      { header: 'Chambre', key: 'chambre', width: 12 },
      { header: 'Tâche', key: 'tache', width: 30 },
      { header: 'État', key: 'etat', width: 15 },
      { header: 'Date', key: 'date', width: 20 },
    ];

    rows.forEach(r => {
      sheet.addRow({
        utilisateur: userMap[r.user_id] || r.user_id,
        action: r.action,
        lot: r.lot,
        etage: r.floor,
        chambre: r.room,
        tache: r.task,
        etat: r.status,
        date: new Date(r.created_at).toLocaleString('fr-FR')
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="interventions.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur export Excel');
  }
});

module.exports = router;
