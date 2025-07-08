const express = require('express');
const router = express.Router();
const pool = require('../db');
const { Parser } = require('json2csv');

// GET list of floors
router.get('/floors', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name FROM floors ORDER BY id');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET rooms for a floor
router.get('/rooms', async (req, res) => {
  const { floorId } = req.query;
  if (!floorId) {
    return res.status(400).json({ error: 'floorId requis' });
  }
  // on s’assure que floorId est un entier
  const fid = parseInt(floorId, 10);
  if (Number.isNaN(fid)) {
    return res.status(400).json({ error: 'floorId doit être un entier' });
  }
  try {
    const result = await pool.query(
      // on cast $1 en entier pour éviter integer = text
      'SELECT id, name FROM rooms WHERE floor_id = $1::int ORDER BY id',
      [fid]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET users
router.get('/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username FROM users ORDER BY username');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST new intervention
router.post('/', async (req, res) => {
  const { floorId, roomId, userId, lot, task, status, person } = req.body;
  if (!floorId || !roomId || !userId || !lot || !task) {
    return res.status(400).json({ error: 'Données manquantes' });
  }
  try {
    await pool.query(
      'INSERT INTO interventions (floor_id, room_id, user_id, lot, task, status, person, action) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [floorId, roomId, userId, lot, task, status, person || userId, 'Création']
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});


// GET /api/interventions — liste toutes les interventions
router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, user_id, floor_id, room_id, lot, task, status, created_at FROM interventions ORDER BY created_at DESC'
  );
  res.json(rows);
});

function escapePdf(str) {
  return String(str)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function interventionsToPdf(rows) {
  const header = '%PDF-1.3\n';
  const objects = [];
  const lines = rows.map(r =>
    `${r.id} - ${r.user_id} - ${r.floor_id} - ${r.room_id} - ${r.lot} - ${r.task} - ${r.status} - ${new Date(r.created_at).toLocaleString()}`
  );
  const text = lines
    .map((l, idx) => `${idx === 0 ? '' : 'T* '}(${escapePdf(l)}) Tj`)
    .join('\n');
  const stream = `BT /F1 12 Tf 50 750 Td ${text} ET`;
  objects.push('1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj');
  objects.push('2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj');
  objects.push('3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj');
  objects.push(`4 0 obj<< /Length ${stream.length} >>stream\n${stream}\nendstream endobj`);
  objects.push('5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj');

  let body = header;
  const offsets = [];
  for (const obj of objects) {
    offsets.push(body.length);
    body += obj + '\n';
  }
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n`;
  body += '0000000000 65535 f \n';
  for (const off of offsets) {
    body += off.toString().padStart(10, '0') + ' 00000 n \n';
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body);
}

router.get('/export/csv', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, user_id, floor_id, room_id, lot, task, status, created_at FROM interventions ORDER BY created_at DESC'
    );
    const fields = ['id', 'user_id', 'floor_id', 'room_id', 'lot', 'task', 'status', 'created_at'];
    const opts = { fields, delimiter: ';', header: true, quote: '"', eol: '\r\n' };
    const parser = new Parser(opts);
    let csv = parser.parse(rows);
    csv = '\uFEFF' + csv;
    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.attachment('interventions.csv');
    res.send(csv);
  } catch (err) {
    console.error(err);
    res.status(500).send("Erreur export CSV");
  }
});

router.get('/export/pdf', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, user_id, floor_id, room_id, lot, task, status, created_at FROM interventions ORDER BY created_at DESC'
    );
    const pdf = interventionsToPdf(rows);
    res.header('Content-Type', 'application/pdf');
    res.attachment('interventions.pdf');
    res.send(pdf);
  } catch (err) {
    console.error(err);
    res.status(500).send("Erreur export PDF");
  }
});

// GET /api/interventions/history?etage=&chambre=&lot=
router.get('/history', async (req, res) => {
  // on s’assure que ces 3 variables sont toujours des chaînes
  const etage   = req.query.etage   || '';
  const chambre = req.query.chambre || '';
  const lot     = req.query.lot     || '';

  const sql = `
    SELECT
      i.id,
      u.username      AS user,
      i.floor_id::text AS floor,
      i.room_id   ::text AS room,
      i.lot,
      i.task,
      COALESCE(p.username, i.person) AS person,
      i.action        AS action,
      i.status        AS state,
      i.created_at    AS date
    FROM interventions i
      LEFT JOIN users u ON u.id::text = i.user_id
    LEFT JOIN users p ON p.id = (i.person::int)
    WHERE ($1 = '' OR i.floor_id::text = $1)
      AND ($2 = '' OR i.room_id::text = $2)
      AND ($3 = '' OR i.lot::text   = $3)
    ORDER BY i.created_at DESC
  `;
  console.log('––– HISTORY SQL –––');
  console.log('SQL:', sql.replace(/\s+/g, ' '));
  console.log('Params:', { etage, chambre, lot });
  console.log('–––––––––––––––––––');
  const { rows } = await pool.query(sql, [etage, chambre, lot]);
  res.json(rows);
});

// PUT update an intervention
router.put('/:id', async (req, res) => {
  const { floor, room, lot, task, person, state, userId } = req.body;
  const action = 'Modification';
  try {
    await pool.query(
      `UPDATE interventions
         SET floor_id = $1,
             room_id  = $2,
             lot      = $3,
             task     = $4,
             person   = $5,
             status   = $6,
             action   = $7
       WHERE id = $8`,
      [floor, room, lot, task, person || userId, state, action, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur modification' });
  }
});

// POST /api/interventions/bulk : insertion multiple
router.post('/bulk', async (req, res) => {
  const { floor, room, lot, rows } = req.body;
  if (!floor || !room || !lot || !Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'Données bulk manquantes' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const text = `
      INSERT INTO interventions
        (floor_id, room_id, user_id, lot, task, status, person, action)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;
    for (const { person: user_id, task, state } of rows) {
      if (!user_id || !task) continue;
      await client.query(text, [floor, room, user_id, lot, task, state || 'ouvert', user_id, 'Création']);
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur bulk' });
  } finally {
    client.release();
  }
});

module.exports = router;
