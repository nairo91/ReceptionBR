require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const ExcelJS = require("exceljs");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

const pad2 = (n) => String(n).padStart(2, "0");
function formatDate(val) {
  if (!val) return "";
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return String(val ?? "");
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} `
    + `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

const EXPORT_COLUMNS = [
  { header: "Chantier", key: "chantier_nom", width: 22 },
  { header: "Étage", key: "etage_nom", width: 18 },
  { header: "Chambre", key: "chambre", width: 12 },
  { header: "N°", key: "numero", width: 8 },
  { header: "Intitulé", key: "intitule", width: 28 },
  { header: "Description", key: "description", width: 40 },
  { header: "État", key: "etat", width: 12 },
  { header: "Lot", key: "lot", width: 20 },
  { header: "Entreprise", key: "entreprise_nom", width: 22 },
  { header: "Localisation", key: "localisation", width: 24 },
  { header: "Observation", key: "observation", width: 30 },
  { header: "Date butoir", key: "date_butoir", width: 14 },
  { header: "Commentaire levée", key: "levee_commentaire", width: 30 },
  { header: "Levée le", key: "levee_fait_le", width: 18 },
  { header: "Levée par (email)", key: "levee_fait_par_email", width: 26 },
  { header: "Créée le", key: "created_at", width: 20 },
  { header: "Créée par (email)", key: "created_by_email", width: 26 },
  { header: "Modifiée par (email)", key: "modified_by_email", width: 26 },
  { header: "Photos (création)", key: "photos_creation", width: 50 },
  { header: "Vidéos", key: "videos", width: 36 },
  { header: "Photos (levée)", key: "photos_levee", width: 50 }
];

const QUERY = `
  SELECT
    b.id,
    c.nom AS chantier_nom,
    f.name AS etage_nom,
    b.chambre,
    b.numero,
    b.intitule,
    b.description,
    b.etat,
    b.lot,
    e.nom AS entreprise_nom,
    b.localisation,
    b.observation,
    b.date_butoir,
    b.levee_commentaire,
    b.levee_fait_le,
    b.created_at,
    COALESCE(u_created.email, u_created_history.email) AS created_by_email,
    COALESCE(u_modified.email, u_modified_history.email) AS modified_by_email,
    u_levee.email AS levee_fait_par_email,
    pm.photos_creation,
    vm.videos,
    lm.photos_levee
  FROM bulles b
  LEFT JOIN chantiers c ON b.chantier_id = c.id
  LEFT JOIN floors f ON b.etage_id = f.id
  LEFT JOIN entreprises e ON b.entreprise_id = e.id
  LEFT JOIN users u_created ON u_created.id = b.created_by
  LEFT JOIN LATERAL (
    SELECT rh.user_id
    FROM reserve_history rh
    WHERE rh.bulle_id = b.id
      AND rh.action_type = 'create'
    ORDER BY rh.created_at ASC
    LIMIT 1
  ) rh_create ON TRUE
  LEFT JOIN users u_created_history ON u_created_history.id = rh_create.user_id
  LEFT JOIN users u_modified ON u_modified.id = b.modified_by
  LEFT JOIN LATERAL (
    SELECT rh.user_id
    FROM reserve_history rh
    WHERE rh.bulle_id = b.id
      AND rh.action_type = 'update'
    ORDER BY rh.created_at DESC
    LIMIT 1
  ) rh_update ON TRUE
  LEFT JOIN users u_modified_history ON u_modified_history.id = rh_update.user_id
  LEFT JOIN users u_levee ON u_levee.id = b.levee_fait_par
  LEFT JOIN (
    SELECT bulle_id, json_agg(path) AS photos_creation
    FROM bulle_media
    WHERE type = 'photo'
    GROUP BY bulle_id
  ) pm ON pm.bulle_id = b.id
  LEFT JOIN (
    SELECT bulle_id, json_agg(path) AS videos
    FROM bulle_media
    WHERE type = 'video'
    GROUP BY bulle_id
  ) vm ON vm.bulle_id = b.id
  LEFT JOIN (
    SELECT bulle_id, json_agg(path) AS photos_levee
    FROM bulle_media
    WHERE type = 'levee_photo'
    GROUP BY bulle_id
  ) lm ON lm.bulle_id = b.id
  WHERE b.created_at::date BETWEEN $1 AND $2
  ORDER BY c.nom ASC NULLS LAST, f.name ASC NULLS LAST, b.chambre ASC NULLS LAST, b.numero ASC NULLS LAST
`;

const toMultiline = (arr) =>
  Array.isArray(arr)
    ? Array.from(new Set(arr.filter((value) => value))).join("\n")
    : "";

function parseArgs(argv) {
  return argv.reduce(
    (acc, arg) => {
      if (arg.startsWith("--start=")) {
        acc.start = arg.replace("--start=", "");
      } else if (arg.startsWith("--end=")) {
        acc.end = arg.replace("--end=", "");
      } else if (arg.startsWith("--out=")) {
        acc.out = arg.replace("--out=", "");
      }
      return acc;
    },
    { start: undefined, end: undefined, out: undefined }
  );
}

function defaultOutputPath(start, end) {
  const filename = start === end
    ? `bulles_${start}.xlsx`
    : `bulles_${start}_${end}.xlsx`;
  return path.join("exports", filename);
}

async function exportBulles(start, end, outputFile) {
  if (!start || !end) {
    throw new Error("Les dates de début et de fin sont requises pour l'export.");
  }

  const client = await pool.connect();
  try {
    const { rows } = await client.query(QUERY, [start, end]);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Bulles");
    worksheet.columns = EXPORT_COLUMNS;

    rows.forEach((row) => {
      worksheet.addRow({
        chantier_nom: row.chantier_nom || "",
        etage_nom: row.etage_nom || "",
        chambre: row.chambre || "",
        numero: row.numero ?? "",
        intitule: row.intitule || "",
        description: row.description || "",
        etat: row.etat || "",
        lot: row.lot || "",
        entreprise_nom: row.entreprise_nom || "",
        localisation: row.localisation || "",
        observation: row.observation || "",
        date_butoir: formatDate(row.date_butoir),
        levee_commentaire: row.levee_commentaire || "",
        levee_fait_le: formatDate(row.levee_fait_le),
        levee_fait_par_email: row.levee_fait_par_email || "",
        created_at: formatDate(row.created_at),
        created_by_email: row.created_by_email || "",
        modified_by_email: row.modified_by_email || "",
        photos_creation: toMultiline(row.photos_creation),
        videos: toMultiline(row.videos),
        photos_levee: toMultiline(row.photos_levee)
      });
    });

    const outputPath = path.resolve(outputFile);
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
    await workbook.xlsx.writeFile(outputPath);
    console.log(`✅ Export généré : ${outputPath}`);
  } finally {
    client.release();
  }
}

(async () => {
  const { start, end, out } = parseArgs(process.argv.slice(2));

  try {
    if (start && end) {
      const output = out || defaultOutputPath(start, end);
      await exportBulles(start, end, output);
    } else {
      await exportBulles(
        "2025-09-19",
        "2025-09-19",
        defaultOutputPath("2025-09-19", "2025-09-19")
      );
      await exportBulles(
        "2025-09-22",
        "2025-09-26",
        defaultOutputPath("2025-09-22", "2025-09-26")
      );
    }
  } catch (error) {
    console.error("❌ Erreur lors de l'export des bulles", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
    process.exit();
  }
})();
