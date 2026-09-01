'use strict';

const express = require('express');
const { query, withTransaction } = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_NIGHTS = 60;

// Validates an ISO day string and rejects values Date silently rolls over,
// such as 2026-02-30.
function parseDay(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  if (date.toISOString().slice(0, 10) !== value) return null;
  return value;
}

function daysBetween(start, end) {
  const ms = new Date(`${end}T00:00:00Z`) - new Date(`${start}T00:00:00Z`);
  return Math.round(ms / 86400000) + 1;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function serialise(row, currentUserId) {
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    vehicleName: row.vehicle_name,
    startDate: row.start_date,
    endDate: row.end_date,
    note: row.note,
    username: row.username,
    fullName: row.full_name,
    mine: row.user_id === currentUserId
  };
}

router.get('/vehicles', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, name, plate, seats, description
         FROM camper_vehicles
        WHERE is_active
        ORDER BY name`
    );
    res.json({ vehicles: rows });
  } catch (err) {
    next(err);
  }
});

// Reservations overlapping [from, to]. Defaults to a wide window around today
// so the calendar can be rendered without extra round trips.
router.get('/reservations', requireAuth, async (req, res, next) => {
  try {
    const from = parseDay(req.query.from) || '1900-01-01';
    const to = parseDay(req.query.to) || '2999-12-31';
    const vehicleId = req.query.vehicleId ? Number(req.query.vehicleId) : null;
    if (vehicleId !== null && !Number.isInteger(vehicleId)) {
      return res.status(400).json({ error: 'vehicleId non valido.' });
    }

    const { rows } = await query(
      `SELECT r.id,
              r.vehicle_id,
              v.name AS vehicle_name,
              r.user_id,
              u.username,
              u.full_name,
              to_char(r.start_date, 'YYYY-MM-DD') AS start_date,
              to_char(r.end_date,   'YYYY-MM-DD') AS end_date,
              r.note
         FROM camper_reservations r
         JOIN camper_vehicles v ON v.id = r.vehicle_id
         JOIN camper_users    u ON u.id = r.user_id
        WHERE r.start_date <= $2::date
          AND r.end_date   >= $1::date
          AND ($3::int IS NULL OR r.vehicle_id = $3::int)
        ORDER BY r.start_date, r.id`,
      [from, to, vehicleId]
    );
    res.json({ reservations: rows.map((row) => serialise(row, req.session.user.id)) });
  } catch (err) {
    next(err);
  }
});

router.post('/reservations', requireAuth, async (req, res, next) => {
  try {
    const { vehicleId, startDate, endDate, note } = req.body || {};

    const vehicle = Number(vehicleId);
    if (!Number.isInteger(vehicle)) {
      return res.status(400).json({ error: 'Seleziona un camper.' });
    }
    const start = parseDay(startDate);
    const end = parseDay(endDate || startDate);
    if (!start || !end) {
      return res.status(400).json({ error: 'Date non valide (formato YYYY-MM-DD).' });
    }
    if (end < start) {
      return res.status(400).json({ error: 'La data di fine precede quella di inizio.' });
    }
    if (start < today()) {
      return res.status(400).json({ error: 'Non si possono prenotare giorni passati.' });
    }
    if (daysBetween(start, end) > MAX_NIGHTS) {
      return res.status(400).json({ error: `Al massimo ${MAX_NIGHTS} giorni per prenotazione.` });
    }
    if (note && String(note).length > 500) {
      return res.status(400).json({ error: 'La nota è troppo lunga (max 500 caratteri).' });
    }

    const created = await withTransaction(async (client) => {
      // Locking the camper row serialises concurrent bookings, so the overlap
      // check below cannot be raced by a second request.
      const { rows: vehicleRows } = await client.query(
        'SELECT id, name FROM camper_vehicles WHERE id = $1 AND is_active FOR UPDATE',
        [vehicle]
      );
      if (vehicleRows.length === 0) {
        const err = new Error('Camper inesistente o non disponibile.');
        err.status = 404;
        throw err;
      }

      const { rows: clash } = await client.query(
        `SELECT u.username,
                to_char(r.start_date, 'YYYY-MM-DD') AS start_date,
                to_char(r.end_date,   'YYYY-MM-DD') AS end_date
           FROM camper_reservations r
           JOIN camper_users u ON u.id = r.user_id
          WHERE r.vehicle_id = $1
            AND r.start_date <= $3::date
            AND r.end_date   >= $2::date
          LIMIT 1`,
        [vehicle, start, end]
      );
      if (clash.length > 0) {
        const c = clash[0];
        const err = new Error(
          `Il camper è già prenotato da ${c.username} dal ${c.start_date} al ${c.end_date}.`
        );
        err.status = 409;
        throw err;
      }

      const { rows } = await client.query(
        `INSERT INTO camper_reservations (vehicle_id, user_id, start_date, end_date, note)
         VALUES ($1, $2, $3::date, $4::date, $5)
         RETURNING id,
                   vehicle_id,
                   user_id,
                   to_char(start_date, 'YYYY-MM-DD') AS start_date,
                   to_char(end_date,   'YYYY-MM-DD') AS end_date,
                   note`,
        [vehicle, req.session.user.id, start, end, note ? String(note) : null]
      );
      return { ...rows[0], vehicle_name: vehicleRows[0].name, username: req.session.user.username };
    });

    res.status(201).json({ reservation: serialise(created, req.session.user.id) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    // Raised by the database level exclusion constraint when it is installed.
    if (err.code === '23P01') {
      return res.status(409).json({ error: 'Quelle date sono già prenotate.' });
    }
    next(err);
  }
});

// A user may cancel their own reservation; an admin may cancel any.
router.delete('/reservations/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Identificativo non valido.' });
    }
    const { rows } = await query(
      `DELETE FROM camper_reservations
        WHERE id = $1
          AND ($2::boolean OR user_id = $3)
        RETURNING id`,
      [id, req.session.user.isAdmin, req.session.user.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Prenotazione non trovata o non tua.' });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
