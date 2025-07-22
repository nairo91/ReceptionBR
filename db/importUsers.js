const fs = require('fs');
const path = require('path');
const readline = require('readline');
const bcrypt = require('bcrypt');
const pool = require('../db');

const csvPath = path.join(__dirname, 'users.csv');

async function importUsers() {
  const rl = readline.createInterface({
    input: fs.createReadStream(csvPath),
    crlfDelay: Infinity
  });
  let first = true;
  for await (const line of rl) {
    if (first) { first = false; continue; }
    if (!line.trim()) continue;
    const [username, email, password] = line.split(',');
    if (!username || !email || !password) continue;
    const hash = await bcrypt.hash(password.trim(), 10);
    const role = username.trim() === 'Jeremy_LAUNAY' ? 'admin' : 'user';
    await pool.query(
      `INSERT INTO users(username,email,password_hash,role)
       VALUES($1,$2,$3,$4)
       ON CONFLICT (email) DO NOTHING`,
      [username.trim(), email.trim(), hash, role]
    );
  }
  console.log('Import terminé');
  process.exit(0);
}

importUsers().catch(err => {console.error(err); process.exit(1);});
