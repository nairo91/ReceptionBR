const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const { Parser } = require('json2csv');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

router.get('/', async (req, res) => {
  // récupère les filtres chantier/étage/room
  const chantierFilter = req.query.chantier_id || '';
  const etageFilter = req.query.etage_id || '';
  const rawRoom  = req.query.room_id  || '';
  const roomId  = parseInt(rawRoom.replace(/\D/g,''), 10);

  // Construire WHERE
  const params = [];
  const conds  = [];
  if (chantierFilter) {
    params.push(chantierFilter);
    conds.push(`b.chantier_id = $${params.length}`);
  }
  if (etageFilter) {
    params.push(etageFilter);
    conds.push(`b.etage_id = $${params.length}`);
  }
  if (!isNaN(roomId)) {
    params.push(roomId);
    conds.push(`b.chambre = $${params.length}`);
  }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

  // Récupérer * toutes * les colonnes et remonter les emails de créateur/modificateur
  const sql = `
    SELECT
      b.*, f.name AS etage,
      e.nom AS entreprise,
      u1.email AS created_by_email,
      u2.email AS modified_by,
      pm.photos,
      vm.videos
    FROM bulles b
    LEFT JOIN floors f ON b.etage_id = f.id
    LEFT JOIN entreprises e ON b.entreprise_id = e.id
    LEFT JOIN users u1 ON b.created_by = u1.id
    LEFT JOIN users u2 ON b.modified_by = u2.id
    LEFT JOIN (
      SELECT bulle_id, json_agg(path) AS photos
      FROM bulle_media WHERE type='photo'
      GROUP BY bulle_id
    ) pm ON pm.bulle_id = b.id
    LEFT JOIN (
      SELECT bulle_id, json_agg(path) AS videos
      FROM bulle_media WHERE type='video'
      GROUP BY bulle_id
    ) vm ON vm.bulle_id = b.id
    ${where}
    ORDER BY b.id
  `;
  let { rows } = await pool.query(sql, params);
  const base = req.protocol + '://' + req.get('host');
  rows = rows.map(r => ({
    ...r,
    photo: r.photo ? `=IMAGE("${base + r.photo}")` : '',
    photos: Array.isArray(r.photos)
      ? `=IMAGE("${base + r.photos[0]}")`
      : '',
    videos: Array.isArray(r.videos)
      ? r.videos.map(v => `"${base + v}"`).join(',')
      : ''
  }));

  // On extrait dynamiquement les noms de colonnes
  let cols = rows.length > 0 ? Object.keys(rows[0]) : [];
  // On retire les identifiants numériques inutiles
  cols = cols.filter(c => c !== 'created_by');
  if (rows[0] && rows[0].photos !== undefined && !cols.includes('photos')) {
    cols.push('photos');
  }
  if (rows[0] && rows[0].videos !== undefined && !cols.includes('videos')) {
    cols.push('videos');
  }

  // --- BEGIN : Réordonnage fixe des colonnes ---
  // On veut d'abord ces colonnes dans cet ordre :
  const desiredOrder = [
    'etage',
    'chambre',
    'numero',
    'intitule',
    'photos',
    'videos',
    'photo',
    'etat',
    'lot',
    'entreprise',
    'localisation',
    'created_by_email',
    'modified_by'
  ];
  // On filtre pour ne garder que celles qui existent encore dans cols
  const head = desiredOrder.filter(c => cols.includes(c));
  // Puis on rajoute toutes les autres colonnes restantes
  const tail = cols.filter(c => !desiredOrder.includes(c));
  cols = [...head, ...tail];
  // --- END : Réordonnage fixe des colonnes ---

  if (req.query.columns) {
    const sel = Array.isArray(req.query.columns)
      ? req.query.columns
      : [req.query.columns];
    cols = sel.filter(c => cols.includes(c));
  }

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

    // Header stylé
    const headerRow = ws.addRow(cols);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F497D' }
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    ws.columns.forEach(col => { col.width = 20; });

    // Lignes de données avec effet zèbre
    rows.forEach((r, idx) => {
      const row = ws.addRow(cols.map(c => r[c]));
      const isEven = idx % 2 === 0;
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isEven ? 'FFDCE6F1' : 'FFFFFFFF' }
      };
    });

    // Bordures
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
