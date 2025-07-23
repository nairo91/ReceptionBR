const express = require('express');
const router = express.Router();

// GET /api/floors
// Renvoie une liste statique d'étages R+0 à R+5
router.get('/', (req, res) => {
  const floors = Array.from({ length: 6 }, (_, i) => {
    const name = `R+${i}`;
    return { id: name, name };
  });
  res.json(floors);
});

module.exports = router;
