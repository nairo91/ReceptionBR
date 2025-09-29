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

const COLUMN_LABELS = {
  etage: 'Étage',
  chambre: 'Chambre',
  numero: 'N°',
  lot: 'Lot',
  intitule: 'Intitulé',
  description: 'Description',
  etat: 'État',
  observation: 'Observation',
  date_butoir: 'Date butoir',
  photos: 'Photos',
  creation_photos: 'Photos (création)',
  levee_photos: 'Photos (levée)',
  creation_videos: 'Vidéos (création)',
  levee_videos: 'Vidéos (levée)',
  levee_commentaire: 'Commentaire levée',
  levee_fait_par_email: 'Levée par',
  levee_fait_le: 'Levée le'
};

const PHOTO_COLUMN_KEYS = new Set(['photos', 'creation_photos', 'levee_photos']);
const MIN_COLUMN_WIDTH = 60;
const PHOTO_THUMB_CACHE = new Map();
const PHOTO_THUMB_CACHE_MAX = 200;
const MAX_THUMBS_PER_CELL = 6;
const PHOTO_GRID_MAX_PER_ROW = 3;
const MAX_PARALLEL_MEDIA_JOBS = 8;

async function mapLimit(items, limit, iteratee) {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  const resolvedLimit = Math.max(1, Number.isFinite(limit) ? Math.floor(limit) : 1);
  const results = new Array(items.length);
  let index = 0;

  const worker = async () => {
    while (true) {
      const currentIndex = index;
      index += 1;
      if (currentIndex >= items.length) {
        return;
      }
      results[currentIndex] = await iteratee(items[currentIndex], currentIndex);
    }
  };

  const workers = Array.from(
    { length: Math.min(resolvedLimit, items.length) },
    () => worker()
  );

  await Promise.all(workers);
  return results;
}

function rememberPhotoBuffer(url, buffer) {
  if (PHOTO_THUMB_CACHE.has(url)) {
    PHOTO_THUMB_CACHE.delete(url);
  }
  PHOTO_THUMB_CACHE.set(url, buffer);
  if (PHOTO_THUMB_CACHE.size > PHOTO_THUMB_CACHE_MAX) {
    const oldestKey = PHOTO_THUMB_CACHE.keys().next().value;
    if (oldestKey !== undefined) {
      PHOTO_THUMB_CACHE.delete(oldestKey);
    }
  }
}

async function loadImageBuffer(url) {
  if (!url) return null;
  if (PHOTO_THUMB_CACHE.has(url)) {
    const cached = PHOTO_THUMB_CACHE.get(url);
    rememberPhotoBuffer(url, cached);
    return cached;
  }

  try {
    const fetchImpl = await getFetchImplementation();
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 7000);
    let response;
    try {
      response = await fetchImpl(url, { signal: ctrl.signal });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      throw new Error(`statut ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    rememberPhotoBuffer(url, buffer);
    return buffer;
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    console.warn(`[export bulles] Échec chargement miniature ${url} (${message})`);
    rememberPhotoBuffer(url, null);
    return null;
  }
}

function renderPhotoThumbGrid(doc, rectCell, buffers, remaining = 0) {
  if (!doc || !rectCell) {
    return;
  }

  const validBuffers = Array.isArray(buffers) ? buffers.filter(Boolean) : [];
  if (validBuffers.length === 0 && remaining <= 0) {
    return;
  }

  const padding = 4;
  const gap = 4;
  const maxPerRow = PHOTO_GRID_MAX_PER_ROW;
  const innerWidth = Math.max(0, rectCell.width - padding * 2);
  const innerHeight = Math.max(0, rectCell.height - padding * 2);
  const count = validBuffers.length;
  const colsPerRow = Math.max(1, Math.min(maxPerRow, count));
  const rowsNeeded = Math.max(1, Math.ceil(count / colsPerRow));
  const rawThumbWidth = colsPerRow > 0
    ? (innerWidth - gap * (colsPerRow - 1)) / colsPerRow
    : innerWidth;
  const rawThumbHeight = rowsNeeded > 0
    ? (innerHeight - gap * (rowsNeeded - 1)) / rowsNeeded
    : innerHeight;
  const thumbSize = Math.max(32, Math.min(rawThumbWidth, rawThumbHeight > 0 ? rawThumbHeight : rawThumbWidth));
  const thumbWidth = thumbSize;
  const thumbHeight = thumbSize;
  const maxX = rectCell.x + rectCell.width - padding;
  const maxY = rectCell.y + rectCell.height - padding;

  for (let idx = 0; idx < count; idx += 1) {
    const buffer = validBuffers[idx];

    const col = idx % colsPerRow;
    const row = Math.floor(idx / colsPerRow);
    const baseX = rectCell.x + padding + col * (thumbWidth + gap);
    const baseY = rectCell.y + padding + row * (thumbHeight + gap);
    const availableWidth = Math.max(8, Math.min(thumbWidth, maxX - baseX));
    const availableHeight = Math.max(8, Math.min(thumbHeight, maxY - baseY));

    doc.save();
    doc.image(buffer, baseX, baseY, {
      fit: [availableWidth, availableHeight],
      align: 'left',
      valign: 'top'
    });
    doc.restore();
  }

  if (remaining > 0) {
    doc.save();
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#333');
    doc.text(`+${remaining}`, rectCell.x + rectCell.width - 18, rectCell.y + 4, {
      width: 14,
      align: 'right'
    });
    doc.restore();
  }
}

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
  const isAbs = p => /^([a-z][a-z0-9+\-.]*:|\/\/)/i.test(p);
  const fullUrl = p => (p && isAbs(p)) ? p : `${baseUrl}${p}`;
  const uniq = a => Array.from(new Set((a || []).filter(Boolean))).map(fullUrl);
  const detectIsVideoByExt = ext => ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v', 'mpg', 'mpeg'].includes(ext);
  const detectIsImageByExt = ext => ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'heic', 'heif', 'tiff', 'tif', 'svg'].includes(ext);
  const includeLeveeMedia = !!phaseParam;
  const normalizeColumnName = c => {
    if (c === 'modified_by') return 'modified_by_email';
    if (c === 'levee_fait_par') return 'levee_fait_par_email';
    return c;
  };
  const requestedColumns = req.query.columns
    ? new Set(
      (Array.isArray(req.query.columns) ? req.query.columns : [req.query.columns])
        .map(normalizeColumnName)
    )
    : null;

  const classifyMediaEntry = (entry, hint) => {
    const lowerHint = hint ? hint.toLowerCase() : undefined;
    const rawPath = typeof entry.path === 'string' ? entry.path : '';
    const typeCandidates = [
      entry.type,
      entry.kind,
      entry.media_type,
      entry.mediaType,
      entry.mime,
      entry.mime_type,
      entry.mimeType,
      entry.contentType,
      entry.content_type
    ]
      .map(v => String(v || '').toLowerCase())
      .filter(Boolean);

    if (typeCandidates.some(val => val.includes('video'))) return 'video';
    if (typeCandidates.some(val => val.includes('photo') || val.includes('image'))) return 'photo';

    if (lowerHint === 'video') return 'video';
    if (lowerHint === 'photo') return 'photo';

    const contextCandidates = [entry.context, entry.category, entry.scope]
      .map(v => String(v || '').toLowerCase())
      .filter(Boolean);
    if (contextCandidates.some(val => val.includes('video'))) return 'video';
    if (contextCandidates.some(val => val.includes('photo') || val.includes('image'))) return 'photo';

    const match = rawPath.split(/[?#]/)[0].match(/\.([a-z0-9]+)$/i);
    if (match) {
      const ext = match[1].toLowerCase();
      if (detectIsVideoByExt(ext)) return 'video';
      if (detectIsImageByExt(ext)) return 'photo';
    }

    return undefined;
  };

  const collectMediaIntoBuckets = (value, hint, buckets) => {
    if (!value) return;

    const visit = (val, localHint) => {
      if (!val) return;

      if (Array.isArray(val)) {
        val.forEach(item => visit(item, localHint));
        return;
      }

      if (typeof val === 'string') {
        const path = val.trim();
        if (!path) return;
        const kind = classifyMediaEntry({ path }, localHint);
        if (kind === 'photo') buckets.photos.push(path);
        if (kind === 'video') buckets.videos.push(path);
        return;
      }

      if (typeof val === 'object') {
        const candidate = { ...val };
        const pathCandidate =
          candidate.path ||
          candidate.url ||
          candidate.uri ||
          candidate.location ||
          candidate.media_path ||
          candidate.mediaPath ||
          candidate.file_path ||
          candidate.filePath;

        if (typeof pathCandidate === 'string' && pathCandidate.trim()) {
          const normalizedPath = pathCandidate.trim();
          const kind = classifyMediaEntry({ ...candidate, path: normalizedPath }, localHint);
          if (kind === 'photo') buckets.photos.push(normalizedPath);
          if (kind === 'video') buckets.videos.push(normalizedPath);
        }

        if (candidate.media) visit(candidate.media, localHint);
        if (candidate.photos) visit(candidate.photos, 'photo');
        if (candidate.videos) visit(candidate.videos, 'video');
        return;
      }
    };

    visit(value, hint);
  };

  rows = rows.map(r => {
    const creationPhotosRaw = [];
    const creationVideosRaw = [];
    const leveePhotosRaw = [];
    const leveeVideosRaw = [];
    const leveeKeysToDelete = new Set();
    const hadPhoto = Object.prototype.hasOwnProperty.call(r, 'photo');

    collectMediaIntoBuckets(r.media, undefined, {
      photos: creationPhotosRaw,
      videos: creationVideosRaw
    });

    const leveeMediaBuckets = {
      photos: leveePhotosRaw,
      videos: leveeVideosRaw
    };

    Object.entries(r).forEach(([key, value]) => {
      const lowerKey = String(key).toLowerCase();
      if (!lowerKey.startsWith('levee')) return;
      if (key === 'levee' || key === 'levees') return;
      if (!/media|photo|video/.test(lowerKey)) return;

      const hint = lowerKey.includes('video')
        ? 'video'
        : lowerKey.includes('photo')
          ? 'photo'
          : undefined;

      collectMediaIntoBuckets(value, hint, leveeMediaBuckets);
      leveeKeysToDelete.add(key);
    });

    if (r.levee && typeof r.levee === 'object') {
      collectMediaIntoBuckets(r.levee.media, undefined, leveeMediaBuckets);
      collectMediaIntoBuckets(r.levee.photos, 'photo', leveeMediaBuckets);
      collectMediaIntoBuckets(r.levee.videos, 'video', leveeMediaBuckets);
    }

    if (Array.isArray(r.levees)) {
      r.levees.forEach(leveeItem => {
        if (!leveeItem || typeof leveeItem !== 'object') return;
        collectMediaIntoBuckets(leveeItem.media, undefined, leveeMediaBuckets);
        collectMediaIntoBuckets(leveeItem.photos, 'photo', leveeMediaBuckets);
        collectMediaIntoBuckets(leveeItem.videos, 'video', leveeMediaBuckets);
      });
    }

    const next = { ...r };
    delete next.media;
    leveeKeysToDelete.forEach(key => {
      delete next[key];
    });

    if (next.levee && typeof next.levee === 'object') {
      const leveeObj = { ...next.levee };
      delete leveeObj.media;
      delete leveeObj.photos;
      delete leveeObj.videos;
      next.levee = leveeObj;
    }

    if (Array.isArray(next.levees)) {
      next.levees = next.levees.map(item => {
        if (!item || typeof item !== 'object') return item;
        const clone = { ...item };
        delete clone.media;
        delete clone.photos;
        delete clone.videos;
        return clone;
      });
    }

    const creation_photos = uniq(creationPhotosRaw);
    const creation_videos = uniq(creationVideosRaw);
    const levee_photos = uniq(leveePhotosRaw);
    const levee_videos = uniq(leveeVideosRaw);

    // Convenience columns obey the phase-specific merge rules:
    // without a phase we only expose creation media, with a phase we merge levée media too.
    const photos = includeLeveeMedia
      ? uniq([...creation_photos, ...levee_photos])
      : creation_photos;
    const videos = includeLeveeMedia
      ? uniq([...creation_videos, ...levee_videos])
      : creation_videos;

    const exposeCreationPhotos = includeLeveeMedia || requestedColumns?.has('creation_photos');
    const exposeCreationVideos = includeLeveeMedia || requestedColumns?.has('creation_videos');
    const exposeLeveePhotos = includeLeveeMedia || requestedColumns?.has('levee_photos');
    const exposeLeveeVideos = includeLeveeMedia || requestedColumns?.has('levee_videos');

    next.photos = photos;
    next.videos = videos;

    if (exposeCreationPhotos) {
      next.creation_photos = creation_photos;
    }
    if (exposeCreationVideos) {
      next.creation_videos = creation_videos;
    }
    if (exposeLeveePhotos) {
      next.levee_photos = levee_photos;
    }
    if (exposeLeveeVideos) {
      next.levee_videos = levee_videos;
    }

    if (hadPhoto) {
      next.photo = creation_photos[0] || null;
    }

    return next;
  });

  // On extrait dynamiquement les noms de colonnes
  let cols = rows.length > 0 ? Object.keys(rows[0]) : [];
  // On retire les identifiants numériques inutiles
  const legacyColumnBlacklist = new Set([
    'created_by',
    'modified_by',
    'levee_fait_par',
    'media',
    'levee_media',
    'levee_medias',
    'levee_medias_photos',
    'levee_media_photos',
    'leveeMedia',
    'leveeMedias',
    'leveeMediasPhotos',
    'leveeMediaUrls',
    'levee_medias_photos_urls',
    'levee_medias_urls',
    'levee_photos_urls',
    'leveePhotos',
    'leveePhoto',
    'levee_photo',
    'levee_photo_url',
    'levee_photo_urls',
    'leveePhotoUrl',
    'leveePhotoUrls',
    'levee_media_url',
    'leveeMediaUrl',
    // on ne blacklist plus les colonnes officielles levee_photos / levee_videos
    'leveeVideos',
    'levee_video',
    'levee_video_url',
    'leveeVideo',
    'leveeVideoUrl'
  ]);
  cols = cols.filter(c => !legacyColumnBlacklist.has(c));

  // Rétro-compatibilité : si le client envoie "modified_by", on mappe vers "modified_by_email"
  if (req.query.columns) {
    let sel = Array.isArray(req.query.columns) ? req.query.columns.slice() : [req.query.columns];
    sel = sel.map(normalizeColumnName);
    cols = sel.filter(c => cols.includes(c)).length ? sel.filter(c => cols.includes(c)) : cols;
  }
  const alwaysExpose = includeLeveeMedia
    ? ['creation_photos','creation_videos','levee_photos','levee_videos','photos','videos']
    : ['photos','videos'];
  if (!req.query.columns) {
    alwaysExpose.forEach(col => {
      if (rows[0] && rows[0][col] !== undefined && !cols.includes(col)) {
        cols.push(col);
      }
    });
  }

  // --- BEGIN : Réordonnage fixe des colonnes ---
  // On veut d'abord ces colonnes dans cet ordre :
  const desiredOrder = [
    'created_by_email','modified_by_email',
    'etage','chambre','numero','lot','intitule','description','etat','entreprise','localisation','observation','date_butoir',
    // En mode non-phase, on conserve uniquement la colonne historique "photos"
    ...(includeLeveeMedia
      ? ['creation_photos','creation_videos','photos','levee_photos','levee_videos']
      : ['photos']),
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
    const arrayColumns = new Set([
      'creation_photos',
      'creation_videos',
      'levee_photos',
      'levee_videos',
      'photos',
      'videos'
    ].filter(col => cols.includes(col)));
    const serialize = r => {
      const out = { ...r };
      arrayColumns.forEach(col => {
        if (Array.isArray(out[col])) {
          out[col] = out[col].join(', ');
        }
      });
      return out;
    };
    const parser = new Parser({ fields: cols });
    let csv = '\uFEFF' + parser.parse(rows.map(serialize));
    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.attachment('bulles.csv');
    return res.send(csv);
  }

  if (format === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Bulles');

    const isPhaseExport = !!(phaseParam && phaseParam !== 'all');
    const includePhotoHyperlinks = isPhaseExport && (
      cols.includes('creation_photos') ||
      cols.includes('levee_photos') ||
      cols.includes('photos')
    );

    const BASE_ALLOWED = isPhaseExport
      ? [
          'etage',
          'chambre',
          'numero',
          'lot',
          'intitule',
          'description',
          'etat',
          'observation',
          'date_butoir',
          'creation_photos',
          'levee_photos',
          'levee_commentaire',
          'levee_fait_par_email',
          'levee_fait_le'
        ]
      : cols;
    const baseCols = BASE_ALLOWED.filter(c => cols.includes(c));

    const maxCreationPhotos = includePhotoHyperlinks
      ? Math.max(0, ...rows.map(r => (Array.isArray(r.creation_photos)
        ? r.creation_photos.length
        : Array.isArray(r.photos)
          ? r.photos.length
          : 0)))
      : 0;
    const maxLeveePhotos = includePhotoHyperlinks
      ? Math.max(0, ...rows.map(r => (Array.isArray(r.levee_photos) ? r.levee_photos.length : 0)))
      : 0;

    const photoCols = includePhotoHyperlinks
      ? [
          ...Array.from({ length: maxCreationPhotos }, (_, i) => `creation_photo_${i + 1}`),
          ...Array.from({ length: maxLeveePhotos }, (_, i) => `levee_photo_${i + 1}`)
        ]
      : [];
    const finalCols = [...baseCols, ...photoCols];

    const headerRow = ws.addRow(
      finalCols.map(key => {
        if (key.startsWith('creation_photo_')) {
          const index = Number.parseInt(key.split('_').pop(), 10);
          return `Photo (création) ${Number.isFinite(index) ? index : ''}`.trim();
        }
        if (key.startsWith('levee_photo_')) {
          const index = Number.parseInt(key.split('_').pop(), 10);
          return `Photo (levée) ${Number.isFinite(index) ? index : ''}`.trim();
        }
        return COLUMN_LABELS[key] || key;
      })
    );
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F497D' }
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    ws.columns.forEach(col => { col.width = 22; });
    const narrowPhotoColumnIndexes = finalCols
      .map((key, index) => ({ key, index }))
      .filter(({ key }) => /^creation_photo_|^levee_photo_/.test(key))
      .map(({ index }) => index + 1);
    narrowPhotoColumnIndexes.forEach(colIndex => {
      const column = ws.getColumn(colIndex);
      column.width = 14;
    });

    const arrayLikeColumns = new Set([
      'creation_photos',
      'creation_videos',
      'levee_photos',
      'levee_videos',
      'photos',
      'videos'
    ].filter(col => baseCols.includes(col)));
    // Lignes de données avec effet zèbre
    rows.forEach((r, idx) => {
      const baseVals = baseCols.map(c => {
        if (arrayLikeColumns.has(c) && Array.isArray(r[c])) {
          return r[c].join('\n');
        }
        return r[c] == null ? '' : r[c];
      });

      const rowValues = [...baseVals];

      if (includePhotoHyperlinks) {
        for (let i = 0; i < maxCreationPhotos; i += 1) {
          const url = (Array.isArray(r.creation_photos) ? r.creation_photos[i]
            : Array.isArray(r.photos) ? r.photos[i]
              : undefined) || '';
          rowValues.push(url ? { text: `Photo (création) ${i + 1}`, hyperlink: url } : '');
        }
        for (let i = 0; i < maxLeveePhotos; i += 1) {
          const url = (Array.isArray(r.levee_photos) ? r.levee_photos[i] : undefined) || '';
          rowValues.push(url ? { text: `Photo (levée) ${i + 1}`, hyperlink: url } : '');
        }
      }

      const row = ws.addRow(rowValues);
      const isEven = idx % 2 === 0;
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isEven ? 'FFDCE6F1' : 'FFFFFFFF' }
      };
    });

    ws.eachRow({ includeEmpty: false }, row => {
      row.eachCell(cell => {
        const previous = cell.alignment || {};
        cell.alignment = {
          ...previous,
          wrapText: true,
          vertical: 'top'
        };
      });
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
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 24 });
    const phase = phaseParam;
    const phaseTag =
      phase && phase !== 'all'
        ? `_phase-${phase}`
        : phase === 'all'
          ? `_phases`
          : '';
    res.header('Content-Disposition', `attachment; filename=bulles${phaseTag}.pdf`);
    res.header('Content-Type', 'application/pdf');
    doc.pipe(res);
    doc.on('end', () => {
      PHOTO_THUMB_CACHE.clear();
    });

    // --- Title & subtitle -------------------------------------------------
    doc
      .font('Helvetica-Bold')
      .fontSize(14)
      .fillColor('#111')
      .text('Reception compte rendu', { align: 'left' });

    const chantierName = chantierFilter || '—';
    const etageName = etageFilter || '—';
    const roomLabel = rawRoom ? String(rawRoom) : 'total';
    const subtitleParts = [`Chantier: ${chantierName}`, `Étage: ${etageName}`, `Chambre: ${roomLabel}`];
    if (phase) {
      const phaseLabel =
        phase === 'all'
          ? 'Toutes phases'
          : /^\d+$/.test(phase)
            ? `Phase ${phase}`
            : phase;
      subtitleParts.push(`Phase: ${phaseLabel}`);
    }

    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#555')
      .text(subtitleParts.join(' — '))
      .moveDown(0.8);

    // --- Data normalisation ----------------------------------------------
    const toArray = value => {
      if (Array.isArray(value)) return value.filter(val => val != null && val !== '');
      if (value == null || value === '') return [];
      return [value];
    };

    const toText = value => {
      if (value == null) return '';
      if (Array.isArray(value)) {
        return value
          .filter(v => v != null && v !== '')
          .map(v => String(v))
          .join('\n');
      }
      return String(value);
    };

    const normalizedRows = rows.map(row => {
      const next = { ...row };
      const creationPhotos = toArray(row.creation_photos ?? row.photos);
      const creationVideos = toArray(row.creation_videos ?? row.videos);
      const leveePhotos = toArray(row.levee_photos);
      const leveeVideos = toArray(row.levee_videos);

      if (includeLeveeMedia) {
        next.photos = uniq([...creationPhotos, ...leveePhotos]);
        next.videos = uniq([...creationVideos, ...leveeVideos]);
      } else {
        next.photos = creationPhotos;
        next.videos = creationVideos;
      }

      if (includeLeveeMedia) {
        next.creation_photos = creationPhotos;
        next.creation_videos = creationVideos;
        next.levee_photos = leveePhotos;
        next.levee_videos = leveeVideos;
      }

      return next;
    });

    const PDF_ALLOWED = [
      'etage',
      'chambre',
      'numero',
      'lot',
      'intitule',
      'description',
      'etat',
      'observation',
      'date_butoir',
      ...(includeLeveeMedia ? ['creation_photos', 'levee_photos'] : ['photos']),
      'levee_commentaire',
      'levee_fait_par_email',
      'levee_fait_le'
    ];

    let pdfCols = PDF_ALLOWED.filter(col => cols.includes(col));

    if (pdfCols.length === 0) {
      pdfCols = cols.slice();
    }

    const safeRows = normalizedRows.map(row => {
      const entry = {};
      pdfCols.forEach(col => {
        if (PHOTO_COLUMN_KEYS.has(col)) {
          entry[col] = '';
        } else {
          entry[col] = toText(row[col]);
        }
      });
      return entry;
    });

    // --- Column sizing ----------------------------------------------------
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const columnWeightMap = new Map([
      ['etage', 1.2],
      ['chambre', 1.2],
      ['numero', 1],
      ['lot', 1.6],
      ['intitule', 2.6],
      ['description', 2.6],
      ['etat', 1.2],
      ['observation', 3.2],
      ['date_butoir', 1.4],
      ['creation_photos', 3.2],
      ['photos', 3.2],
      ['levee_photos', 3.2],
      ['levee_fait_par_email', 2],
      ['levee_commentaire', 2.8],
      ['levee_fait_le', 1.4]
    ]);
    const defaultWeight = 1.6;
    const weights = pdfCols.map(col => columnWeightMap.get(col) || defaultWeight);
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || 1;
    let columnsSize = weights.map(weight => (weight / totalWeight) * pageWidth);
    const currentTotal = columnsSize.reduce((sum, width) => sum + width, 0);
    if (currentTotal > pageWidth) {
      const ratio = pageWidth / currentTotal;
      columnsSize = columnsSize.map(width => width * ratio);
    }
    columnsSize = columnsSize.map(width => Math.max(MIN_COLUMN_WIDTH, Math.floor(width)));
    const sumAfterMin = columnsSize.reduce((sum, width) => sum + width, 0);
    if (sumAfterMin > pageWidth) {
      const ratio = pageWidth / sumAfterMin;
      columnsSize = columnsSize.map(width => Math.floor(width * ratio));
    }

    // --- Headers ----------------------------------------------------------
    const headerFont = { fontFamily: 'Helvetica-Bold', fontSize: 9, color: '#ffffff' };
    const headers = pdfCols.map((key, idx) => ({
      label: COLUMN_LABELS[key] || key,
      property: key,
      width: columnsSize[idx] || Math.floor(pageWidth / Math.max(pdfCols.length, 1)),
      headerColor: '#2c3e50',
      headerOpacity: 1,
      align: 'left',
      headerAlign: 'left',
      padding: [4, 4],
      options: { ...headerFont }
    }));

    // --- Table rendering --------------------------------------------------
    const photoBuffersByRowAndKey = new Map();
    const preloadJobs = [];
    for (let rowIndex = 0; rowIndex < normalizedRows.length; rowIndex += 1) {
      for (const key of pdfCols) {
        if (!PHOTO_COLUMN_KEYS.has(key)) continue;
        preloadJobs.push({ rowIndex, key });
      }
    }

    await mapLimit(preloadJobs, MAX_PARALLEL_MEDIA_JOBS, async ({ rowIndex, key }) => {
      const rawValues = toArray(normalizedRows[rowIndex]?.[key]);
      const uniqueUrls = Array.from(new Set(rawValues.map(u => (u || '').trim()).filter(Boolean)));
      if (uniqueUrls.length === 0) {
        photoBuffersByRowAndKey.set(`${rowIndex}|${key}`, { buffers: [], remaining: 0 });
        return;
      }

      const visibleUrls = uniqueUrls.slice(0, MAX_THUMBS_PER_CELL);
      const loadedBuffers = await mapLimit(
        visibleUrls,
        MAX_PARALLEL_MEDIA_JOBS,
        async url => loadImageBuffer(url)
      );
      const buffers = loadedBuffers.filter(Boolean);
      const remaining = Math.max(0, uniqueUrls.length - visibleUrls.length);
      photoBuffersByRowAndKey.set(`${rowIndex}|${key}`, { buffers, remaining });
    });

    const padLinesPerRow = new Array(normalizedRows.length).fill(0);
    for (let rowIndex = 0; rowIndex < normalizedRows.length; rowIndex += 1) {
      let neededRows = 1;
      for (const key of pdfCols) {
        if (!PHOTO_COLUMN_KEYS.has(key)) continue;
        const entry = photoBuffersByRowAndKey.get(`${rowIndex}|${key}`);
        if (!entry) continue;
        const count = Array.isArray(entry.buffers) ? entry.buffers.length : 0;
        const rowsNeeded = Math.max(1, Math.ceil(count / PHOTO_GRID_MAX_PER_ROW));
        if (rowsNeeded > neededRows) {
          neededRows = rowsNeeded;
        }
      }
      padLinesPerRow[rowIndex] = Math.max(0, neededRows - 1);
    }

    const NBSP = '\u00A0';
    const paddingTargets = ['observation', 'description', 'intitule'];
    const paddedSafeRows = safeRows.map((row, rowIndex) => {
      const extraLines = padLinesPerRow[rowIndex];
      if (!extraLines) {
        return row;
      }
      const padKey = paddingTargets.find(key => pdfCols.includes(key))
        || pdfCols.find(key => !PHOTO_COLUMN_KEYS.has(key));
      if (!padKey) {
        return row;
      }
      const pad = (('\n' + NBSP.repeat(2))).repeat(extraLines);
      if (!pad) {
        return row;
      }
      const baseValue = row[padKey] ? String(row[padKey]) : '';
      return {
        ...row,
        [padKey]: `${baseValue}${pad}`
      };
    });

    await doc.table(
      { headers, datas: paddedSafeRows },
      {
        width: pageWidth,
        columnsSize,
        columnSpacing: 6,
        padding: 4,
        prepareHeader: () => {
          doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff');
        },
        prepareRow: (row, columnIndex, rowIndex, rectRow, rectCell) => {
          if (columnIndex === 0 && rowIndex % 2 === 1) {
            const { x, y, width, height } = rectRow;
            doc.save().rect(x, y, width, height).fill('#f7f9fc').restore();
          }
          doc.font('Helvetica').fontSize(8).lineGap(1.2).fillColor('#111');

          const key = pdfCols[columnIndex];
          if (!PHOTO_COLUMN_KEYS.has(key) || !rectCell) {
            return;
          }

          const zebraColor = rowIndex % 2 === 1 ? '#f7f9fc' : '#ffffff';
          doc.save().rect(rectCell.x, rectCell.y, rectCell.width, rectCell.height).fill(zebraColor).restore();

          const entry = photoBuffersByRowAndKey.get(`${rowIndex}|${key}`);
          if (!entry) {
            return;
          }

          renderPhotoThumbGrid(doc, rectCell, entry.buffers, entry.remaining);
        },
        divider: {
          header: { width: 0.5, color: '#dfe6ee' },
          horizontal: { width: 0.5, color: '#dfe6ee' },
          vertical: { width: 0.5, color: '#dfe6ee', disabled: false }
        }
      }
    );

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
