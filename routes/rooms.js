const express = require("express");
const router = express.Router();

// GET /api/rooms
// Génère 15 chambres pour l'étage indiqué par floorId (ex : "R+5")
router.get('/', (req, res) => {
  const floorId = req.query.floorId;
  const floorNumber = parseInt(floorId.split('+')[1]);

  const rooms = Array.from({ length: 15 }, (_, i) => {
    const num = floorNumber * 100 + i + 1;
    return { id: num.toString(), name: `Chambre ${num}` };
  });

  // Ajout d'une option supplémentaire pour les couloirs
  rooms.push({ id: 'couloir', name: 'Couloirs' });

  res.json(rooms);
});

module.exports = router;
