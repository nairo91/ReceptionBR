const fs   = require('fs');
const path = require('path');
const router = require('express').Router();

// GET /api/users
// Lit db/users.csv et renvoie [{ id, username }, …]
router.get('/', (req, res) => {
  const csvPath = path.join(__dirname, '../db/users.csv');
  const text = fs.readFileSync(csvPath, 'latin1');
  const lines = text.split(/\r?\n/).slice(1).filter(l => l.trim());
  const users = lines.map((line, idx) => {
    const cols = line.split(';');
    const id   = cols[0].trim() || String(idx+1);
    const name = cols[1].trim();
    return { id, username: name };
  });
  res.json(users);
});

module.exports = router;
