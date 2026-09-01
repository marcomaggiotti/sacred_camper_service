'use strict';

require('dotenv').config();

const crypto = require('crypto');
const { pool, query } = require('./db');
const { hashPassword } = require('./auth');

// Creates or updates the first administrator.
async function seedAdmin({ silent = false } = {}) {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const generated = !process.env.ADMIN_PASSWORD;
  const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(12).toString('base64url');

  const { rows } = await query('SELECT id FROM camper_users WHERE lower(username) = lower($1)', [
    username
  ]);

  if (rows.length > 0) {
    // Admin exists; update password only if explicitly set
    if (process.env.ADMIN_PASSWORD) {
      await query(
        `UPDATE camper_users SET password_hash = $1 WHERE lower(username) = lower($2)`,
        [await hashPassword(password), username]
      );
      if (!silent) console.log(`Updated password for administrator "${username}".`);
    } else if (!silent) {
      console.log(`Admin "${username}" already exists, nothing to do.`);
    }
    return null;
  }

  // Create new admin
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
