const express = require('express');
const router  = express.Router();
const { Parser } = require('json2csv');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { selectBullesWithEmails } = require('./bullesSelect');

router.get('/', async (req, res) => {
  // récupère les filtres chantier/étage/room
  const chantierFilter = req.query.chantier_id || '';
  const etageFilter = req.query.etage_id || '';
  const rawRoom  = req.query.room_id ?? req.query.chambre ?? '';

  let rows = await selectBullesWithEmails({
    chantier_id: chantierFilter,
    etage_id: etageFilter,
    chambre: rawRoom
  });

  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const fullUrl = p => p && /^https?:\/\//.test(p) ? p : `${baseUrl}${p}`;
  rows = rows.map(r => {
    const photos = [];
    const videos = [];
    const levee = [];
    for (const m of r.media || []) {
      if (m.type === 'photo') photos.push(m.path);
      if (m.type === 'video') videos.push(m.path);
      if (m.type === 'levee_photo') levee.push(m.path);
    }
    const photoArr = Array.from(new Set(photos)).map(fullUrl);
    const videoArr = Array.from(new Set(videos)).map(fullUrl);
    const leveeArr = Array.from(new Set(levee)).map(fullUrl);
    return {
      ...r,
      photo: fullUrl(r.photo),
      photos: photoArr,
      videos: videoArr,
      levee_photos: leveeArr
    };
  });
  rows.forEach(r => delete r.media);

  // On extrait dynamiquement les noms de colonnes
  let cols = rows.length > 0 ? Object.keys(rows[0]) : [];
  // On retire les identifiants numériques inutiles
  cols = cols.filter(c => c !== 'created_by' && c !== 'modified_by' && c !== 'levee_fait_par');

  // Rétro-compatibilité : si le client envoie "modified_by", on mappe vers "modified_by_email"
  if (req.query.columns) {
    let sel = Array.isArray(req.query.columns) ? req.query.columns.slice() : [req.query.columns];
    sel = sel.map(c => {
      if (c === 'modified_by') return 'modified_by_email';
      if (c === 'levee_fait_par') return 'levee_fait_par_email';
      return c;
    });
    cols = sel.filter(c => cols.includes(c)).length ? sel.filter(c => cols.includes(c)) : cols;
  }
  if (rows[0] && rows[0].photos !== undefined && !cols.includes('photos')) {
    cols.push('photos');
  }
  if (rows[0] && rows[0].videos !== undefined && !cols.includes('videos')) {
    cols.push('videos');
  }

  // --- BEGIN : Réordonnage fixe des colonnes ---
  // On veut d'abord ces colonnes dans cet ordre :
  const desiredOrder = [
    'created_by_email','modified_by_email',
    'etage','chambre','numero','lot','intitule','description','etat','entreprise','localisation','observation','date_butoir',
    'photos', // <= juste avant le bloc Levée
    'levee_fait_par_email','levee_commentaire','levee_photos','levee_fait_le',
    'videos','photo'
  ];
  // On filtre pour ne garder que celles qui existent encore dans cols
  const head = desiredOrder.filter(c => cols.includes(c));
  // Puis on rajoute toutes les autres colonnes restantes
  const tail = cols.filter(c => !desiredOrder.includes(c));
  cols = [...head, ...tail];
  // --- END : Réordonnage fixe des colonnes ---
  // plus de repositionnement automatique : on respecte desiredOrder

  const format = (req.query.format || 'csv').toLowerCase();
  if (format === 'csv') {
    const serialize = r => ({
      ...r,
      photos: (r.photos || []).join(', '),
      videos: (r.videos || []).join(', '),
      levee_photos: (r.levee_photos || []).join('\n')
    });
    const parser = new Parser({ fields: cols });
    let csv = '\uFEFF' + parser.parse(rows.map(serialize));
    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.attachment('bulles.csv');
    return res.send(csv);
  }

  if (format === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Bulles');

    const maxPhotos = Math.max(0, ...rows.map(r => Array.isArray(r.photos) ? r.photos.length : 0));
    const baseCols = cols.filter(c => c !== 'photos');
    const photoCols = Array.from({ length: maxPhotos }, (_, i) => `Photo ${i + 1}`);
    const finalCols = [...baseCols, ...photoCols];

    // Header stylé
    const headerRow = ws.addRow(finalCols);
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
      const baseVals = baseCols.map(c => {
        if (c === 'videos' && Array.isArray(r.videos)) return r.videos.join(', ');
        if (c === 'levee_photos' && Array.isArray(r.levee_photos)) return r.levee_photos.join('\n');
        return r[c];
      });
      const photoVals = [];
      for (let i = 0; i < maxPhotos; i++) {
        const url = (r.photos || [])[i] || '';
        photoVals.push(url ? { text: `Photo ${i + 1}`, hyperlink: url } : '');
      }
      const row = ws.addRow([...baseVals, ...photoVals]);
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
    const serialize = r => ({
      ...r,
      photos: (r.photos || []).join(', '),
      videos: (r.videos || []).join(', '),
      levee_photos: (r.levee_photos || []).join(', ')
    });
    const pdfRows = rows.map(serialize);
    const table = { headers: cols, rows: pdfRows.map(r => cols.map(c => r[c])) };
    doc.table(table, { width: 500 });
    doc.end();
    return;
  }

  // Si format inconnu
  return res.status(400).send('Format inconnu');
});

module.exports = router;
