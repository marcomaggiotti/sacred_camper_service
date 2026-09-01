'use strict';

const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

// Managed Postgres providers (Render, Heroku, ...) terminate TLS with a
// certificate that is not in the public trust store, so verification is
// relaxed unless PGSSLMODE explicitly asks for a strict connection.
const isLocal = /@(localhost|127\.0\.0\.1)/.test(connectionString);
const ssl =
  process.env.PGSSLMODE === 'disable' || isLocal
    ? false
    : { rejectUnauthorized: false };

const pool = new Pool({ connectionString, ssl, max: 10 });

pool.on('error', (err) => {
  console.error('Unexpected error on idle Postgres client', err);
});

async function query(text, params) {
  return pool.query(text, params);
}

// Runs fn inside a transaction, rolling back on any error.
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTransaction, ssl };
