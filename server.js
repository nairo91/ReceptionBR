// serveur Express ici
const express = require("express");
const multer = require("multer");
const path = require("path");
const cors = require("cors");
const bullesRoutes = require("./routes/bulles");

const app = express();
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("uploads"));
app.use(express.static("public"));

app.use("/api/bulles", bullesRoutes);

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serveur en ligne sur le port ${PORT}`));
