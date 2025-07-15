const express = require('express');
const router = express.Router();
const pool = require('../db');
const { Parser } = require('json2csv');
const upload = require('../middlewares/upload');

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
    const created = (await pool.query(
      `INSERT INTO interventions
         (floor_id, room_id, user_id, lot, task, status, person, action)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [floorId, roomId, userId, lot, task, status || 'ouvert', person || userId, 'Création']
    )).rows[0];

    // ↪ historiser la création before/after
    await pool.query(
      `INSERT INTO interventions_history
         (intervention_id, user_id,
          floor_old, floor_new,
          room_old,  room_new,
          lot_old,   lot_new,
          task_old,  task_new,
          state_old, state_new,
          person_old, person_new,
          action,    created_at)
       VALUES
         ($1, $2,
          NULL, $3,
          NULL, $4,
          NULL, $5,
          NULL, $6,
          NULL, $7,
          NULL, $8,
          'Création', now())`,
      [created.id, userId,
       created.floor_id,
       created.room_id,
       created.lot,
       created.task,
       created.status,
       created.person]
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
      i.user_id,
      i.floor_id::text AS floor,
      i.room_id::text  AS room,
      i.lot,
      i.task,
      i.person,
      i.action   AS action,
      i.status   AS state,
      i.created_at AS date
    FROM interventions i
    WHERE ($1 = '' OR i.floor_id::text = $1)
      AND ($2 = '' OR i.room_id::text  = $2)
      AND ($3 = '' OR i.lot         = $3)
    ORDER BY i.created_at DESC;
  `;
  console.log('––– HISTORY SQL –––');
  console.log('SQL:', sql.replace(/\s+/g, ' '));
  console.log('Params:', { etage, chambre, lot });
  console.log('–––––––––––––––––––');
  const { rows } = await pool.query(sql, [etage, chambre, lot]);
  res.json(rows);
});

router.get('/:id/history', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         ih.intervention_id AS id,
         u_old.username AS person_old,
         u_new.username AS person_new,
         ih.floor_old,   ih.floor_new,
         ih.room_old,    ih.room_new,
         ih.lot_old,     ih.lot_new,
         ih.task_old,    ih.task_new,
         ih.state_old,   ih.state_new,
         ih.action,
         ih.created_at
       FROM interventions_history ih
       LEFT JOIN users u_old
         ON u_old.id::text = ih.person_old::text
       LEFT JOIN users u_new
         ON u_new.id::text = ih.person_new::text
      WHERE ih.intervention_id=$1
   ORDER BY ih.version DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/:id/comments', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT text, created_at FROM interventions_comments WHERE intervention_id=$1 ORDER BY created_at DESC',
    [req.params.id]
  );
  res.json(rows);
});

router.get('/:id/photos', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT url FROM interventions_photos WHERE intervention_id=$1 ORDER BY created_at DESC',
    [req.params.id]
  );
  res.json(rows.map(r => r.url));
});

router.post('/:id/comment', async (req, res) => {
  const { text } = req.body;
  await pool.query(
    `INSERT INTO interventions_comments (intervention_id, text, created_at)
     VALUES ($1, $2, now())`,
    [req.params.id, text]
  );
  res.json({ success: true });
});

// PUT update an intervention
router.put('/:id', async (req, res) => {
  const { floor, room, lot, task, person, state, userId } = req.body;
  try {
    // 1️⃣ lire l’état courant
    const before = (await pool.query(
      'SELECT floor_id, room_id, lot, task, status, person FROM interventions WHERE id=$1',
      [req.params.id]
    )).rows[0];

    // 2️⃣ historiser ancien ET nouveau
    await pool.query(
      `INSERT INTO interventions_history
         (intervention_id,user_id,
          floor_old,floor_new,
          room_old, room_new,
          lot_old,  lot_new,
          task_old, task_new,
          state_old,state_new,
          person_old, person_new,
          action,   created_at)
       VALUES
         ($1,$2,
          $3,$4,
          $5,$6,
          $7,$8,
          $9,$10,
          $11,$12,
          $13,$14,
          'Modification',now())`,
      [
        req.params.id, userId,
        before.floor_id, floor,
        before.room_id,  room,
        before.lot,      lot,
        before.task,     task,
        before.status,   state,
        before.person,   person
      ]
    );

    // 3️⃣ appliquer la mise à jour
    await pool.query(
      `UPDATE interventions
          SET floor_id=$1, room_id=$2, lot=$3, task=$4,
              person=$5, status=$6, action=$7
        WHERE id=$8`,
      [floor, room, lot, task, person||userId, state, 'Modification', req.params.id]
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
      const insertedStatus = state || 'ouvert';
      await client.query(text, [floor, room, user_id, lot, task, insertedStatus, user_id, 'Création']);

      // 1️⃣ On historise la création de chaque ligne
      await client.query(
        `INSERT INTO interventions_history
           (intervention_id, user_id,
            floor_old, floor_new,
            room_old,  room_new,
            lot_old,   lot_new,
            task_old,  task_new,
            state_old, state_new,
            person_old, person_new,
            action,    created_at)
         VALUES (currval('interventions_id_seq'), $1,
            NULL, $2,
            NULL, $3,
            NULL, $4,
            NULL, $5,
            NULL, $6,
            NULL, $7,
            'Création', now())`,
        [user_id, floor, room, lot, task, insertedStatus, user_id]
      );
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

router.post('/:id/photos', upload.array('photos'), async (req, res) => {
  const urls = req.files.map(f => f.path);
  // persister en base et attendre chaque insertion
  for (const url of urls) {
    await pool.query(
      'INSERT INTO interventions_photos (intervention_id, url, created_at) VALUES ($1, $2, now())',
      [req.params.id, url]
    );
  }
  res.json(urls);
});

module.exports = router;
