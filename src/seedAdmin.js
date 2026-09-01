'use strict';

require('dotenv').config();

const crypto = require('crypto');
const { pool, query } = require('./db');
const { hashPassword } = require('./auth');

// Creates the first administrator so that there is somebody who can hand out
// usernames and passwords. Existing accounts are never overwritten.
async function seedAdmin({ silent = false } = {}) {
  const username = process.env.ADMIN_USERNAME || 'admin';

  const { rows } = await query('SELECT id FROM camper_users WHERE lower(username) = lower($1)', [
    username
  ]);
  if (rows.length > 0) {
    if (!silent) console.log(`Admin "${username}" already exists, nothing to do.`);
    return null;
  }

  const generated = !process.env.ADMIN_PASSWORD;
  const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(12).toString('base64url');

  await query(
    `INSERT INTO camper_users (username, password_hash, full_name, is_admin)
     VALUES ($1, $2, $3, TRUE)`,
    [username, await hashPassword(password), 'Amministratore']
  );

  console.log(`Created administrator "${username}".`);
  if (generated) {
    console.log(`Generated password: ${password}`);
    console.log('Save it now - it is not stored anywhere in plain text.');
  }
  return { username, password: generated ? password : undefined };
}

if (require.main === module) {
  seedAdmin()
    .then(() => pool.end())
    .catch((err) => {
      console.error('Seeding failed:', err);
      pool.end();
      process.exit(1);
    });
}

module.exports = { seedAdmin };
