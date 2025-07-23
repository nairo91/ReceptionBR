const fs = require('fs');
const path = require('path');
const readline = require('readline');
const bcrypt = require('bcrypt');
const pool = require('./index');

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
      firstLine = false;
      continue;
    }

    const [email, password] = line.split(',');

    if (!email || !password) {
      console.log('Ligne ignorée (données manquantes) :', line);
      continue;
    }

    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    const hashedPassword = await bcrypt.hash(trimmedPassword, saltRounds);

    try {
      await pool.query(
        `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'user') ON CONFLICT(email) DO NOTHING`,
        [trimmedEmail, hashedPassword]
      );
      console.log(`Utilisateur importé : ${trimmedEmail}`);
    } catch (err) {
      console.error(`Erreur import pour ${trimmedEmail} :`, err.message);
    }
  }

  console.log('Import terminé.');
  process.exit(0);
}

importUsers();
