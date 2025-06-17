const fs = require('fs');
const path = require('path');
const readline = require('readline');
const bcrypt = require('bcrypt');
const pool = require('./db'); // adapter le chemin si besoin

const csvFilePath = path.join(__dirname, 'users.csv'); // adapter si fichier ailleurs
const saltRounds = 10;

async function importUsers() {
  const fileStream = fs.createReadStream(csvFilePath);

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let firstLine = true;
  for await (const line of rl) {
    if (firstLine) {
      firstLine = false; // on saute l'entête
      continue;
    }

    const [username, password] = line.split(',');

    if (!username || !password) {
      console.log('Ligne ignorée (données manquantes) :', line);
      continue;
    }

    const trimmedUsername = username.trim();
    const trimmedPassword = password.trim();

    const hashedPassword = await bcrypt.hash(trimmedPassword, saltRounds);

    try {
      await pool.query(
        `INSERT INTO users (username, password_hash) VALUES ($1, $2) ON CONFLICT (username) DO NOTHING`,
        [trimmedUsername, hashedPassword]
      );
      console.log(`Utilisateur importé : ${trimmedUsername}`);
    } catch (err) {
      console.error(`Erreur import pour ${trimmedUsername} :`, err.message);
    }
  }

  console.log('Import terminé.');
  process.exit(0);
}

importUsers();
