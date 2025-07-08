const express = require("express");
const router = express.Router();

// GET /api/rooms
// Génère 15 chambres pour l'étage indiqué par floorId (ex: "R+5")
router.get('/', (req, res) => {
  const { floorId } = req.query;
  if (!floorId) {
    return res.status(400).json({ error: 'floorId requis' });
  }

  const match = /^R\+(\d+)$/.exec(floorId);
  const floorNumber = match ? parseInt(match[1], 10) : 0;

  const rooms = Array.from({ length: 15 }, (_, i) => {
    const num = floorNumber * 100 + i + 1;
    return { id: num.toString(), name: `Chambre ${num}` };
  });
  rooms.push({ id: 'couloir', name: 'Couloir' });
  res.json(rooms);
});

module.exports = router;
