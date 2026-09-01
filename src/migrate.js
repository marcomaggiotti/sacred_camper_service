'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { pool, query } = require('./db');

async function migrate() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await query(schema);

  // The overlap exclusion constraint needs btree_gist, which is not available
  // on every plan. Failing to install it is not fatal.
  const optional = fs.readFileSync(
    path.join(__dirname, 'schema_exclusion.sql'),
    'utf8'
  );
  try {
    await query(optional);
    console.log('Applied overlap exclusion constraint.');
  } catch (err) {
    if (err.code === '42710' || err.code === '42P07') {
      // Constraint already exists.
    } else {
      console.warn(
        'Skipping the database level overlap constraint (%s). ' +
          'Bookings are still serialised by the application.',
        err.message
      );
    }
  }

  await seedDefaultCamper();
  console.log('Migration complete.');
}

async function seedDefaultCamper() {
  const { rows } = await query('SELECT COUNT(*)::int AS n FROM camper_vehicles');
  if (rows[0].n > 0) return;
  await query(
    `INSERT INTO camper_vehicles (name, plate, seats, description)
     VALUES ($1, $2, $3, $4)`,
    [
      'Il Camper Sacro',
      'SC-001-IT',
      4,
      'Il camper di famiglia: quattro posti letto, cucina e tanta voglia di partire.'
    ]
  );
  console.log('Seeded the default camper.');
}

if (require.main === module) {
  migrate()
    .then(() => pool.end())
    .catch((err) => {
      console.error('Migration failed:', err);
      pool.end();
      process.exit(1);
    });
}

module.exports = { migrate };
