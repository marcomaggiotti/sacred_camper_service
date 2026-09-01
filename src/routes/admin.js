'use strict';

const express = require('express');
const { query } = require('../db');
const { hashPassword, requireAdmin, MIN_PASSWORD_LENGTH } = require('../auth');

const router = express.Router();

const USERNAME_RE = /^[a-zA-Z0-9._-]{3,64}$/;

router.use(requireAdmin);

router.get('/users', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT u.id,
              u.username,
              u.full_name,
              u.is_admin,
              u.is_active,
              to_char(u.created_at, 'YYYY-MM-DD') AS created_at,
              COUNT(r.id)::int AS reservation_count
         FROM camper_users u
         LEFT JOIN camper_reservations r ON r.user_id = u.id
        GROUP BY u.id
        ORDER BY u.username`
    );
    res.json({ users: rows });
  } catch (err) {
    next(err);
  }
});

// Creates the username/password an ordinary user signs in with.
router.post('/users', async (req, res, next) => {
  try {
    const { username, password, fullName, isAdmin } = req.body || {};
    if (!USERNAME_RE.test(String(username || ''))) {
      return res.status(400).json({
        error: 'Username: da 3 a 64 caratteri fra lettere, numeri, punto, trattino e underscore.'
      });
    }
    if (String(password || '').length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        error: `La password deve avere almeno ${MIN_PASSWORD_LENGTH} caratteri.`
      });
    }

    const { rows } = await query(
      `INSERT INTO camper_users (username, password_hash, full_name, is_admin)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, full_name, is_admin, is_active`,
      [
        String(username),
        await hashPassword(String(password)),
        fullName ? String(fullName).slice(0, 128) : null,
        Boolean(isAdmin)
      ]
    );
    res.status(201).json({ user: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Questo username esiste già.' });
    }
    next(err);
  }
});

router.post('/users/:id/password', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { password } = req.body || {};
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Identificativo non valido.' });
    }
    if (String(password || '').length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        error: `La password deve avere almeno ${MIN_PASSWORD_LENGTH} caratteri.`
      });
    }
    const { rows } = await query(
      'UPDATE camper_users SET password_hash = $1 WHERE id = $2 RETURNING id',
      [await hashPassword(String(password)), id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Utente non trovato.' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/users/:id/active', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Identificativo non valido.' });
    }
    if (id === req.session.user.id) {
      return res.status(400).json({ error: 'Non puoi disattivare te stesso.' });
    }
    const { rows } = await query(
      'UPDATE camper_users SET is_active = $1 WHERE id = $2 RETURNING id, is_active',
      [Boolean(req.body && req.body.isActive), id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Utente non trovato.' });
    res.json({ user: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.delete('/users/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Identificativo non valido.' });
    }
    if (id === req.session.user.id) {
      return res.status(400).json({ error: 'Non puoi eliminare te stesso.' });
    }
    const { rows } = await query('DELETE FROM camper_users WHERE id = $1 RETURNING id', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Utente non trovato.' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/vehicles', async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT id, name, plate, seats, description, is_active FROM camper_vehicles ORDER BY name'
    );
    res.json({ vehicles: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/vehicles', async (req, res, next) => {
  try {
    const { name, plate, seats, description } = req.body || {};
    if (!name || String(name).trim().length < 2) {
      return res.status(400).json({ error: 'Il nome del camper è obbligatorio.' });
    }
    const seatCount = Number(seats || 4);
    if (!Number.isInteger(seatCount) || seatCount < 1 || seatCount > 20) {
      return res.status(400).json({ error: 'Numero di posti non valido (1-20).' });
    }
    const { rows } = await query(
      `INSERT INTO camper_vehicles (name, plate, seats, description)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, plate, seats, description, is_active`,
      [
        String(name).trim().slice(0, 128),
        plate ? String(plate).slice(0, 32) : null,
        seatCount,
        description ? String(description).slice(0, 1000) : null
      ]
    );
    res.status(201).json({ vehicle: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Esiste già un camper con questo nome.' });
    }
    next(err);
  }
});

module.exports = router;
