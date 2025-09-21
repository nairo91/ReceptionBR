const express = require('express');
const router  = express.Router();
const path    = require('path');
const fs      = require('fs/promises');
const sharp   = require('sharp');
const { Parser } = require('json2csv');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit-table');
const pool = require('../db');
const planPhaseConfig = require('../config/planPhases');
const { selectBullesWithEmails } = require('./bullesSelect');

let cachedFetchImpl = typeof fetch === 'function' ? fetch.bind(globalThis) : null;

async function getFetchImplementation() {
  if (cachedFetchImpl) {
    return cachedFetchImpl;
  }
  const mod = await import('node-fetch');
  cachedFetchImpl = mod.default || mod;
  return cachedFetchImpl;
}

router.get('/', async (req, res) => {
  // récupère les filtres chantier/étage/room
  const chantierFilter = req.query.chantier_id || '';
  const rawEtageId = Array.isArray(req.query.etage_id)
    ? req.query.etage_id[0]
    : req.query.etage_id;
  const etageFilter = rawEtageId || '';
  const rawRoom  = req.query.room_id ?? req.query.chambre ?? '';
  const rawPhaseParam = Array.isArray(req.query.phase)
    ? req.query.phase[0]
    : req.query.phase;
  const phaseParam =
    typeof rawPhaseParam === 'string' && rawPhaseParam.trim()
      ? rawPhaseParam.trim().toLowerCase()
      : undefined;

  let rows = await selectBullesWithEmails({
    chantier_id: chantierFilter,
    etage_id: etageFilter,
    chambre: rawRoom
  });

  if (phaseParam && !PHASE_PARAM_VALUES.has(phaseParam)) {
    console.warn(
      `[export bulles] Paramètre phase invalide "${rawPhaseParam}", filtrage ignoré`
    );
  } else if (phaseParam) {
    rows = await filterBullesByPhase(rows, {
      phase: phaseParam,
      etageId: rawEtageId
    });
  }

  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const fullUrl = p => p && /^https?:\/\//.test(p) ? p : `${baseUrl}${p}`;
  rows = rows.map(r => {
    const photos = [];
    const videos = [];
    for (const m of r.media || []) {
      if (m.type === 'photo') photos.push(m.path);
      if (m.type === 'video') videos.push(m.path);
    }
    const photoArr = Array.from(new Set(photos)).map(fullUrl);
    const videoArr = Array.from(new Set(videos)).map(fullUrl);
    return {
      ...r,
      photo: fullUrl(r.photo),
      photos: photoArr,
      videos: videoArr
    };
  });
  rows.forEach(r => delete r.media);

  // On extrait dynamiquement les noms de colonnes
  let cols = rows.length > 0 ? Object.keys(rows[0]) : [];
  // On retire les identifiants numériques inutiles
  cols = cols.filter(c => c !== 'created_by' && c !== 'modified_by' && c !== 'levee_fait_par' && c !== 'levee_photos');

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
    'levee_fait_par_email','levee_commentaire','levee_fait_le',
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
      videos: (r.videos || []).join(', ')
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
    // Normalisation des données pour pdfkit-table
    const toText = (v) => {
      if (v == null) return '';
      if (Array.isArray(v)) return v.join(', ');
      return String(v);
    };
    const serialize = (r) => ({
      ...r,
      photos: Array.isArray(r.photos) ? r.photos : (r.photos ? [r.photos] : []),
      videos: Array.isArray(r.videos) ? r.videos : (r.videos ? [r.videos] : [])
    });
    const safeRows = rows.map(serialize).map(r => cols.map(c => toText(r[c])));
    // pdfkit-table peut recevoir des headers en objets {label}
    const safeHeaders = cols.map(h => ({ label: toText(h) }));
    await doc.table({ headers: safeHeaders, rows: safeRows }, { width: 500 });
    doc.end();
    return;
  }

  // Si format inconnu
  return res.status(400).send('Format inconnu');
});

const PHASE_PARAM_VALUES = new Set(['1', '2', 'all']);
const DEFAULT_PHASE_LABELS = {
  '1': 'Phase 1',
  '2': 'Phase 2',
  all: 'Toutes phases'
};
const LEGEND_ITEMS = [
  { label: 'À corriger', color: '#e74c3c' },
  { label: 'Levée', color: '#2ecc71' }
];
const WATERMARK_PATH = path.join(__dirname, '..', 'public', 'img', 'brh-logo.png');

router.get('/plan', async (req, res) => {
  try {
    const {
      etage_id: rawFloorId,
      chantier_id: chantierId,
      phase: rawPhase = 'all'
    } = req.query;

    const floorId = parseInt(String(rawFloorId ?? '').trim(), 10);
    if (!Number.isFinite(floorId)) {
      return res.status(400).json({ error: 'Paramètre etage_id invalide' });
    }

    const phase = String(rawPhase || 'all').toLowerCase();
    if (!PHASE_PARAM_VALUES.has(phase)) {
      return res.status(400).json({ error: 'Paramètre phase invalide (1, 2 ou all)' });
    }

    const floorRes = await pool.query(
      'SELECT id, name, plan_path FROM floors WHERE id = $1',
      [floorId]
    );
    if (floorRes.rowCount === 0) {
      return res.status(404).json({ error: 'Étage introuvable' });
    }
    const floor = floorRes.rows[0];
    if (!floor.plan_path) {
      return res.status(404).json({ error: 'Aucun plan enregistré pour cet étage' });
    }

    let planBuffer;
    try {
      planBuffer = await loadPlanBuffer(floor.plan_path);
    } catch (err) {
      if (err && err.status === 404) {
        return res.status(404).json({ error: 'Plan introuvable pour cet étage' });
      }
      throw err;
    }
    const planMeta = await sharp(planBuffer).metadata();
    if (!planMeta.width || !planMeta.height) {
      throw new Error('Impossible de lire les dimensions du plan');
    }

    const phaseBoxes = resolvePhaseBoxes(floor.id, floor.name, planMeta);
    const bulles = await selectBullesWithEmails({
      chantier_id: chantierId,
      etage_id: floorId
    });
    const categorized = categorizeBullesByPhase(bulles, planMeta, phaseBoxes);

    if (categorized.unmatched.length) {
      console.warn(
        `[export plan] ${categorized.unmatched.length} bulle(s) en dehors des zones configurées`
      );
    }

    const phasesToRender = phase === 'all' ? ['1', '2'] : [phase];
    const totalEntries = phasesToRender.reduce(
      (sum, key) => sum + (categorized[key]?.length || 0),
      0
    );
    if (totalEntries === 0) {
      return res.status(404).json({ error: 'Aucune donnée à exporter pour cette sélection' });
    }
    const pages = await buildPhasePages(
      phasesToRender,
      planBuffer,
      planMeta,
      phaseBoxes,
      categorized
    );

    const watermark = await loadWatermark();

    res.header('Content-Type', 'application/pdf');
    const safeFloor = (floor.name || `etage-${floor.id}`).replace(/[^a-z0-9_-]+/gi, '_');
    res.header(
      'Content-Disposition',
      `attachment; filename=plan_${safeFloor}_${phase}.pdf`
    );

    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    doc.pipe(res);

    for (let i = 0; i < pages.length; i++) {
      if (i > 0) doc.addPage();
      drawPhasePage(doc, pages[i], {
        floorName: floor.name,
        watermark
      });
    }

    doc.end();
  } catch (err) {
    console.error('Erreur export plan', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erreur lors de la génération du PDF' });
    } else {
      res.end();
    }
  }
});

let cachedWatermark = null;

async function loadWatermark() {
  if (cachedWatermark !== null) {
    return cachedWatermark;
  }
  try {
    const buffer = await fs.readFile(WATERMARK_PATH);
    const meta = await sharp(buffer).metadata();
    cachedWatermark = {
      buffer,
      width: meta.width || 0,
      height: meta.height || 0
    };
    return cachedWatermark;
  } catch (err) {
    console.warn('Watermark introuvable ou illisible', err.message);
    cachedWatermark = null;
    return null;
  }
}

async function loadPlanBuffer(planPath) {
  if (!planPath) {
    const err = new Error('Chemin du plan manquant');
    err.status = 400;
    throw err;
  }
  if (/^https?:\/\//i.test(planPath)) {
    const fetchImpl = await getFetchImplementation();
    const response = await fetchImpl(planPath);
    if (!response.ok) {
      const error = new Error(`Impossible de télécharger le plan (${response.status})`);
      error.status = response.status === 404 ? 404 : 500;
      throw error;
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
  const cleaned = String(planPath).replace(/^\/+/, '');
  const candidates = [
    path.join(__dirname, '..', cleaned),
    path.join(__dirname, '..', 'public', cleaned),
    path.join(__dirname, '..', '..', cleaned)
  ];
  for (const candidate of candidates) {
    try {
      return await fs.readFile(candidate);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
  const err = new Error(`Plan introuvable localement (${planPath})`);
  err.status = 404;
  throw err;
}

function resolvePhaseBoxes(floorId, floorName, meta) {
  const configBoxes = pickConfigBoxes(floorId, floorName);
  const boxes = {};
  boxes['1'] = convertConfigBoxToAbsolute(configBoxes?.['1'], meta) || fallbackBoxForPhase('1', meta);
  boxes['2'] = convertConfigBoxToAbsolute(configBoxes?.['2'], meta) || fallbackBoxForPhase('2', meta);
  return boxes;
}

function pickConfigBoxes(floorId, floorName) {
  if (!planPhaseConfig) return null;
  const { byFloorId = {}, byFloorName = {}, default: defaultBoxes } = planPhaseConfig;

  const floorKey = floorId != null ? String(floorId) : null;
  if (floorKey && Object.prototype.hasOwnProperty.call(byFloorId, floorKey)) {
    return cloneBoxes(byFloorId[floorKey]);
  }

  if (floorName && typeof floorName === 'string') {
    const normalizedTarget = normalizeLabel(floorName);
    for (const [label, boxes] of Object.entries(byFloorName || {})) {
      if (normalizeLabel(label) === normalizedTarget) {
        return cloneBoxes(boxes);
      }
    }
  }

  if (defaultBoxes) return cloneBoxes(defaultBoxes);
  return null;
}

function cloneBoxes(boxes) {
  if (!boxes) return null;
  return Object.fromEntries(
    Object.entries(boxes).map(([k, v]) => [k, v ? { ...v } : null])
  );
}

function normalizeLabel(value) {
  if (!value) return '';
  return String(value)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function convertConfigBoxToAbsolute(box, meta) {
  if (!box) return null;
  const width = meta.width || 1;
  const height = meta.height || 1;
  const isRelative = box.relative === true || box.mode === 'relative';
  const left = isRelative ? (box.left || 0) * width : box.left || 0;
  const top = isRelative ? (box.top || 0) * height : box.top || 0;
  const boxWidth = isRelative ? (box.width || 0) * width : box.width || 0;
  const boxHeight = isRelative ? (box.height || 0) * height : box.height || 0;
  const normalized = clampBox({ left, top, width: boxWidth, height: boxHeight }, meta);
  if (!normalized || normalized.width <= 0 || normalized.height <= 0) return null;
  return normalized;
}

function clampBox(box, meta) {
  if (!box) return null;
  const maxWidth = meta.width || 1;
  const maxHeight = meta.height || 1;
  const left = Math.max(0, Math.min(Math.round(box.left || 0), maxWidth - 1));
  const top = Math.max(0, Math.min(Math.round(box.top || 0), maxHeight - 1));
  const width = Math.max(1, Math.min(Math.round(box.width || 0), maxWidth - left));
  const height = Math.max(1, Math.min(Math.round(box.height || 0), maxHeight - top));
  return { left, top, width, height };
}

function fallbackBoxForPhase(phase, meta) {
  const width = meta.width || 1;
  const height = meta.height || 1;
  const overlap = Math.round(width * 0.02);
  if (phase === '1') {
    return clampBox({ left: 0, top: 0, width: Math.round(width / 2) + overlap, height }, meta);
  }
  if (phase === '2') {
    const left = Math.max(0, Math.round(width / 2) - overlap);
    return clampBox({ left, top: 0, width: width - left, height }, meta);
  }
  return clampBox({ left: 0, top: 0, width, height }, meta);
}

function categorizeBullesByPhase(bulles, meta, boxes) {
  const result = { '1': [], '2': [], all: [], unmatched: [] };
  for (const bulle of bulles) {
    const coords = toAbsoluteCoordinates(bulle, meta);
    if (!coords) continue;
    const entry = { bulle, x: coords.x, y: coords.y };
    let assigned = false;
    if (pointInBox(coords, boxes['1'])) {
      result['1'].push(entry);
      assigned = true;
    }
    if (!assigned && pointInBox(coords, boxes['2'])) {
      result['2'].push(entry);
      assigned = true;
    }
    if (!assigned) {
      result.unmatched.push(entry);
    }
    result.all.push(entry);
  }
  result['1'].sort(compareEntries);
  result['2'].sort(compareEntries);
  result.all.sort(compareEntries);
  return result;
}

function toAbsoluteCoordinates(bulle, meta) {
  const rawX = Number(bulle.x);
  const rawY = Number(bulle.y);
  if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) return null;
  const width = meta.width || 1;
  const height = meta.height || 1;
  const isLegacy = rawX > 1 || rawY > 1;
  const x = isLegacy ? rawX : rawX * width;
  const y = isLegacy ? rawY : rawY * height;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function compareEntries(a, b) {
  const numA = parseInt(a.bulle?.numero, 10);
  const numB = parseInt(b.bulle?.numero, 10);
  if (Number.isFinite(numA) && Number.isFinite(numB) && numA !== numB) {
    return numA - numB;
  }
  if (a.y !== b.y) return a.y - b.y;
  return a.x - b.x;
}

function pointInBox(point, box) {
  if (!box || !point) return false;
  return (
    point.x >= box.left &&
    point.x <= box.left + box.width &&
    point.y >= box.top &&
    point.y <= box.top + box.height
  );
}

async function filterBullesByPhase(rows, { phase, etageId }) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return rows;
  }

  const floorIdStr = etageId != null ? String(etageId).trim() : '';
  if (!floorIdStr) {
    console.info(
      `[export bulles] Filtrage phase=${phase} ignoré : etage_id manquant`
    );
    return rows;
  }

  const floorId = Number.parseInt(floorIdStr, 10);
  if (!Number.isFinite(floorId)) {
    console.info(
      `[export bulles] Filtrage phase=${phase} ignoré : etage_id invalide (${etageId})`
    );
    return rows;
  }

  try {
    const floorRes = await pool.query(
      'SELECT id, name, plan_path FROM floors WHERE id = $1',
      [floorId]
    );
    if (floorRes.rowCount === 0) {
      console.info(
        `[export bulles] Filtrage phase=${phase} ignoré : étage ${floorId} introuvable`
      );
      return rows;
    }

    const floor = floorRes.rows[0];
    if (!floor.plan_path) {
      console.info(
        `[export bulles] Filtrage phase=${phase} ignoré : aucun plan pour l'étage ${floorId}`
      );
      return rows;
    }

    let planMeta;
    try {
      const planBuffer = await loadPlanBuffer(floor.plan_path);
      planMeta = await sharp(planBuffer).metadata();
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      console.warn(
        `[export bulles] Filtrage phase=${phase} ignoré : échec lecture plan étage ${floorId} (${message})`
      );
      return rows;
    }

    if (!planMeta.width || !planMeta.height) {
      console.warn(
        `[export bulles] Filtrage phase=${phase} ignoré : dimensions du plan indisponibles pour l'étage ${floorId}`
      );
      return rows;
    }

    const boxes = resolvePhaseBoxes(floor.id, floor.name, planMeta);
    if (!boxes) {
      console.info(
        `[export bulles] Filtrage phase=${phase} ignoré : aucune configuration de phase pour l'étage ${floorId}`
      );
      return rows;
    }

    const targetBoxes =
      phase === 'all'
        ? ['1', '2'].map(key => boxes[key]).filter(Boolean)
        : [boxes[phase]].filter(Boolean);

    if (targetBoxes.length === 0) {
      console.info(
        `[export bulles] Filtrage phase=${phase} ignoré : zone introuvable pour l'étage ${floorId}`
      );
      return rows;
    }

    const filteredRows = [];
    let skippedForCoords = 0;
    let skippedOutside = 0;

    for (const bulle of rows) {
      const coords = toAbsoluteCoordinates(bulle, planMeta);
      if (!coords) {
        skippedForCoords += 1;
        continue;
      }
      if (targetBoxes.some(box => pointInBox(coords, box))) {
        filteredRows.push(bulle);
      } else {
        skippedOutside += 1;
      }
    }

    console.info(
      `[export bulles] phase=${phase} étage=${floorId}: ${filteredRows.length}/${rows.length} bulles conservées` +
        (skippedForCoords ? `, ${skippedForCoords} sans coordonnées` : '') +
        (skippedOutside ? `, ${skippedOutside} hors zone` : '')
    );

    return filteredRows;
  } catch (err) {
    console.error(
      `[export bulles] Erreur lors du filtrage phase=${phase} étage=${etageId}`,
      err
    );
    return rows;
  }
}

async function buildPhasePages(keys, planBuffer, meta, boxes, categorized) {
  const pages = [];
  for (const key of keys) {
    const box = boxes[key] || fallbackBoxForPhase(key, meta);
    if (!box) continue;
    const isFull =
      box.left === 0 && box.top === 0 && box.width === meta.width && box.height === meta.height;
    const buffer = isFull ? planBuffer : await sharp(planBuffer).extract(box).toBuffer();
    const entries = (categorized[key] || []).map(entry => ({
      ...entry,
      relativeX: entry.x - box.left,
      relativeY: entry.y - box.top
    }));
    pages.push({
      key,
      label: DEFAULT_PHASE_LABELS[key] || `Phase ${key}`,
      box,
      image: {
        buffer,
        width: box.width,
        height: box.height
      },
      entries
    });
  }
  return pages;
}

function drawPhasePage(doc, page, { floorName, watermark }) {
  const margin = 40;
  const headerHeight = margin + 24;
  const legendHeight = 40;
  const usableWidth = doc.page.width - margin * 2;
  const usableHeight = doc.page.height - headerHeight - legendHeight;
  const scale = Math.min(
    usableWidth / page.image.width,
    (usableHeight > 0 ? usableHeight : doc.page.height) / page.image.height
  );
  const drawWidth = page.image.width * scale;
  const drawHeight = page.image.height * scale;
  const imageX = margin + (usableWidth - drawWidth) / 2;
  const imageY = headerHeight;

  const title = floorName ? `${floorName} — ${page.label}` : page.label;
  doc.fontSize(18).fillColor('#111111').text(title, margin, margin);
  const countText = `${page.entries.length} réserve${page.entries.length > 1 ? 's' : ''}`;
  doc.fontSize(10).fillColor('#555555').text(countText, margin, margin + 22);

  doc.image(page.image.buffer, imageX, imageY, {
    width: drawWidth,
    height: drawHeight
  });

  if (watermark && watermark.buffer) {
    drawWatermark(doc, watermark);
  }

  const radius = Math.max(7, 14 * Math.min(scale, 1));
  const strokeWidth = Math.max(1, 1.4 * Math.min(scale, 1));

  for (const entry of page.entries) {
    const px = imageX + entry.relativeX * scale;
    const py = imageY + entry.relativeY * scale;
    const color = getColorForEtat(entry.bulle?.etat);
    doc.save();
    doc.lineWidth(strokeWidth);
    doc.fillColor(color);
    doc.strokeColor('#ffffff');
    doc.circle(px, py, radius).fillAndStroke(color, '#ffffff');
    doc.restore();

    if (entry.bulle?.numero != null) {
      const fontSize = Math.max(8, 11 * Math.min(scale, 1));
      doc.save();
      doc.fontSize(fontSize);
      doc.fillColor('#ffffff');
      doc.text(String(entry.bulle.numero), px - radius, py - fontSize / 2, {
        width: radius * 2,
        align: 'center'
      });
      doc.restore();
    }
  }

  drawLegend(doc, margin);
}

function drawWatermark(doc, watermark) {
  const ratio = watermark.width && watermark.height ? watermark.height / watermark.width : 1;
  const targetWidth = doc.page.width * 0.5;
  const targetHeight = targetWidth * ratio;
  const x = (doc.page.width - targetWidth) / 2;
  const y = (doc.page.height - targetHeight) / 2;
  doc.save();
  doc.opacity(0.08);
  doc.image(watermark.buffer, x, y, { width: targetWidth, height: targetHeight });
  doc.restore();
}

function drawLegend(doc, margin) {
  const y = doc.page.height - margin - 16;
  const size = 10;
  let x = margin;
  doc.fontSize(9);
  for (const item of LEGEND_ITEMS) {
    doc.save();
    doc.rect(x, y, size, size).fill(item.color);
    doc.restore();
    doc.fillColor('#111111');
    doc.text(item.label, x + size + 4, y - 2, { lineBreak: false });
    const labelWidth = doc.widthOfString(item.label);
    x += size + 4 + labelWidth + 16;
  }
  doc.fillColor('#111111');
}

function getColorForEtat(etat) {
  if (etat === 'levee') return '#2ecc71';
  return '#e74c3c';
}

module.exports = router;
