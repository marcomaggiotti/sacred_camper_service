'use strict';

const express = require('express');
const { query } = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDay(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  if (date.toISOString().slice(0, 10) !== value) return null;
  return value;
}

function serialiseDestination(row, userId) {
  return {
    id: row.id,
    name: row.name,
    country: row.country,
    description: row.description,
    travelFrom: row.travel_from,
    travelTo: row.travel_to,
    createdByUsername: row.created_by_username,
    canEdit: row.created_by === userId,
    wishlistCount: row.wishlist_count,
    myWishlistCount: row.my_wishlist_count
  };
}

function serialiseItem(row, userId) {
  return {
    id: row.id,
    destinationId: row.destination_id,
    product: row.product,
    quantity: row.quantity,
    note: row.note,
    isFulfilled: row.is_fulfilled,
    fulfilledByUsername: row.fulfilled_by_username,
    username: row.username,
    requestedBy: row.full_name || row.username,
    mine: row.user_id === userId
  };
}

router.get('/destinations', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT d.id,
              d.name,
              d.country,
              d.description,
              to_char(d.travel_from, 'YYYY-MM-DD') AS travel_from,
              to_char(d.travel_to,   'YYYY-MM-DD') AS travel_to,
              d.created_by,
              u.username AS created_by_username,
              COUNT(w.id)::int AS wishlist_count,
              COUNT(w.id) FILTER (WHERE w.user_id = $1)::int AS my_wishlist_count
         FROM camper_destinations d
         JOIN camper_users u ON u.id = d.created_by
         LEFT JOIN camper_wishlist_items w ON w.destination_id = d.id
        GROUP BY d.id, u.username
        ORDER BY d.travel_from NULLS LAST, d.name`,
      [req.session.user.id]
    );
    res.json({
      destinations: rows.map((row) => serialiseDestination(row, req.session.user.id))
    });
  } catch (err) {
    next(err);
  }
});

router.post('/destinations', requireAuth, async (req, res, next) => {
  try {
    const { name, country, description, travelFrom, travelTo } = req.body || {};
    const trimmed = String(name || '').trim();
    if (trimmed.length < 2) {
      return res.status(400).json({ error: 'Il nome della destinazione è obbligatorio.' });
    }
    if (trimmed.length > 128) {
      return res.status(400).json({ error: 'Il nome è troppo lungo (max 128 caratteri).' });
    }

    let from = null;
    let to = null;
    if (travelFrom) {
      from = parseDay(String(travelFrom));
      if (!from) return res.status(400).json({ error: 'Data di partenza non valida.' });
    }
    if (travelTo) {
      to = parseDay(String(travelTo));
      if (!to) return res.status(400).json({ error: 'Data di ritorno non valida.' });
    }
    if (from && to && to < from) {
      return res.status(400).json({ error: 'Il ritorno precede la partenza.' });
    }

    const { rows } = await query(
      `INSERT INTO camper_destinations (name, country, description, travel_from, travel_to, created_by)
       VALUES ($1, $2, $3, $4::date, $5::date, $6)
       RETURNING id,
                 name,
                 country,
                 description,
                 to_char(travel_from, 'YYYY-MM-DD') AS travel_from,
                 to_char(travel_to,   'YYYY-MM-DD') AS travel_to,
                 created_by`,
      [
        trimmed,
        country ? String(country).trim().slice(0, 64) : null,
        description ? String(description).trim().slice(0, 2000) : null,
        from,
        to,
        req.session.user.id
      ]
    );
    const destination = serialiseDestination(
      {
        ...rows[0],
        created_by_username: req.session.user.username,
        wishlist_count: 0,
        my_wishlist_count: 0
      },
      req.session.user.id
    );
    res.status(201).json({ destination });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Questa destinazione esiste già.' });
    }
    next(err);
  }
});

router.delete('/destinations/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Identificativo non valido.' });
    }
    // Removing a destination also removes the wishlist hanging off it.
    const { rows } = await query(
      `DELETE FROM camper_destinations
        WHERE id = $1 AND (created_by = $2 OR $3::boolean)
        RETURNING id`,
      [id, req.session.user.id, req.session.user.isAdmin]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Destinazione non trovata o non creata da te.' });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------------ wishlist

router.get('/destinations/:id/wishlist', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Identificativo non valido.' });
    }
    const { rows } = await query(
      `SELECT w.id,
              w.destination_id,
              w.user_id,
              u.username,
              u.full_name,
              w.product,
              w.quantity,
              w.note,
              w.is_fulfilled,
              f.username AS fulfilled_by_username
         FROM camper_wishlist_items w
         JOIN camper_users u ON u.id = w.user_id
         LEFT JOIN camper_users f ON f.id = w.fulfilled_by
        WHERE w.destination_id = $1
        ORDER BY w.is_fulfilled, u.username, w.id`,
      [id]
    );
    res.json({ items: rows.map((row) => serialiseItem(row, req.session.user.id)) });
  } catch (err) {
    next(err);
  }
});

router.post('/destinations/:id/wishlist', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { product, quantity, note } = req.body || {};
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Identificativo non valido.' });
    }
    const trimmed = String(product || '').trim();
    if (trimmed.length < 2) {
      return res.status(400).json({ error: 'Indica il prodotto che desideri.' });
    }
    if (trimmed.length > 160) {
      return res.status(400).json({ error: 'Il nome del prodotto è troppo lungo (max 160).' });
    }
    const amount = quantity === undefined || quantity === null || quantity === '' ? 1 : Number(quantity);
    if (!Number.isInteger(amount) || amount < 1 || amount > 999) {
      return res.status(400).json({ error: 'Quantità non valida (1-999).' });
    }
    if (note && String(note).length > 500) {
      return res.status(400).json({ error: 'La nota è troppo lunga (max 500 caratteri).' });
    }

    const { rows: destination } = await query(
      'SELECT id FROM camper_destinations WHERE id = $1',
      [id]
    );
    if (destination.length === 0) {
      return res.status(404).json({ error: 'Destinazione inesistente.' });
    }

    const { rows } = await query(
      `INSERT INTO camper_wishlist_items (destination_id, user_id, product, quantity, note)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, destination_id, user_id, product, quantity, note, is_fulfilled`,
      [id, req.session.user.id, trimmed, amount, note ? String(note).trim() : null]
    );
    const item = serialiseItem(
      {
        ...rows[0],
        username: req.session.user.username,
        full_name: req.session.user.fullName,
        fulfilled_by_username: null
      },
      req.session.user.id
    );
    res.status(201).json({ item });
  } catch (err) {
    next(err);
  }
});

// Anyone travelling can tick an item off: the buyer is not always the person
// who asked for it.
router.post('/wishlist/:id/fulfilled', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Identificativo non valido.' });
    }
    const fulfilled = !(req.body && req.body.isFulfilled === false);
    const { rows } = await query(
      `UPDATE camper_wishlist_items
          SET is_fulfilled = $2::boolean,
              fulfilled_by = CASE WHEN $2::boolean THEN $3::int ELSE NULL END
        WHERE id = $1
        RETURNING id, is_fulfilled`,
      [id, fulfilled, req.session.user.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Desiderio non trovato.' });
    }
    res.json({ item: { id: rows[0].id, isFulfilled: rows[0].is_fulfilled } });
  } catch (err) {
    next(err);
  }
});

router.delete('/wishlist/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Identificativo non valido.' });
    }
    const { rows } = await query(
      `DELETE FROM camper_wishlist_items
        WHERE id = $1 AND (user_id = $2 OR $3::boolean)
        RETURNING id`,
      [id, req.session.user.id, req.session.user.isAdmin]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Desiderio non trovato o non tuo.' });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
