const bcrypt = require('bcryptjs');
const { db } = require('./src/db');

async function verify() {
  try {
    const user = await db.one('SELECT password_hash FROM users WHERE username = $1', ['importer1']);
    console.log('DB Hash:', user.password_hash);
    const isValid = await bcrypt.compare('password123', user.password_hash);
    console.log('Is Valid:', isValid);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit();
  }
}

verify();
