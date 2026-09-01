'use strict';

const express = require('express');
const { query } = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

const STATUSES = ['todo', 'doing', 'done'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Same strict day parsing as the reservation routes: Date rolls 2026-02-30
// over into March, so the round trip is checked.
function parseDay(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  if (date.toISOString().slice(0, 10) !== value) return null;
  return value;
}

const SELECT_TASK = `
  SELECT t.id,
         t.title,
         t.description,
         t.status,
         to_char(t.due_date, 'YYYY-MM-DD') AS due_date,
         t.created_by,
         creator.username  AS created_by_username,
         t.assignee_id,
         assignee.username  AS assignee_username,
         assignee.full_name AS assignee_full_name
    FROM camper_tasks t
    JOIN camper_users creator  ON creator.id  = t.created_by
    LEFT JOIN camper_users assignee ON assignee.id = t.assignee_id`;

function serialise(row, userId) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    dueDate: row.due_date,
    createdBy: row.created_by,
    createdByUsername: row.created_by_username,
    assigneeId: row.assignee_id,
    assigneeUsername: row.assignee_username,
    assigneeName: row.assignee_full_name || row.assignee_username,
    mine: row.assignee_id === userId,
    canEdit: row.created_by === userId || row.assignee_id === userId
  };
}

router.get('/tasks', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      `${SELECT_TASK}
        ORDER BY CASE t.status WHEN 'doing' THEN 0 WHEN 'todo' THEN 1 ELSE 2 END,
                 t.due_date NULLS LAST,
                 t.id`
    );
    res.json({ tasks: rows.map((row) => serialise(row, req.session.user.id)) });
  } catch (err) {
    next(err);
  }
});

router.post('/tasks', requireAuth, async (req, res, next) => {
  try {
    const { title, description, dueDate, assignToMe } = req.body || {};
    const trimmed = String(title || '').trim();
    if (trimmed.length < 2) {
      return res.status(400).json({ error: 'Il titolo della cosa da fare è obbligatorio.' });
    }
    if (trimmed.length > 160) {
      return res.status(400).json({ error: 'Il titolo è troppo lungo (max 160 caratteri).' });
    }
    if (description && String(description).length > 1000) {
      return res.status(400).json({ error: 'La descrizione è troppo lunga (max 1000 caratteri).' });
    }
    let due = null;
    if (dueDate) {
      due = parseDay(String(dueDate));
      if (!due) return res.status(400).json({ error: 'Scadenza non valida (formato YYYY-MM-DD).' });
    }

    const { rows } = await query(
      `WITH inserted AS (
         INSERT INTO camper_tasks (title, description, due_date, created_by, assignee_id)
         VALUES ($1, $2, $3::date, $4, $5)
         RETURNING *
       )
       ${SELECT_TASK.replace('FROM camper_tasks t', 'FROM inserted t')}`,
      [
        trimmed,
        description ? String(description).trim() : null,
        due,
        req.session.user.id,
        assignToMe ? req.session.user.id : null
      ]
    );
    res.status(201).json({ task: serialise(rows[0], req.session.user.id) });
  } catch (err) {
    next(err);
  }
});

// Claim an unassigned task for yourself, or release the one you hold.
router.post('/tasks/:id/assignee', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Identificativo non valido.' });
    }
    const claim = !(req.body && req.body.release);
    const userId = req.session.user.id;

    // Claiming only succeeds while the task is free, so two people racing for
    // the same task cannot both win.
    const { rows } = await query(
      claim
        ? `WITH updated AS (
             UPDATE camper_tasks
                SET assignee_id = $2,
                    status = CASE WHEN status = 'todo' THEN 'doing' ELSE status END
              WHERE id = $1 AND assignee_id IS NULL
              RETURNING *
           )
           ${SELECT_TASK.replace('FROM camper_tasks t', 'FROM updated t')}`
        : `WITH updated AS (
             UPDATE camper_tasks
                SET assignee_id = NULL,
                    status = CASE WHEN status = 'doing' THEN 'todo' ELSE status END
              WHERE id = $1 AND (assignee_id = $2 OR $3::boolean)
              RETURNING *
           )
           ${SELECT_TASK.replace('FROM camper_tasks t', 'FROM updated t')}`,
      claim ? [id, userId] : [id, userId, req.session.user.isAdmin]
    );

    if (rows.length === 0) {
      return res.status(409).json({
        error: claim
          ? 'Questa attività è già assegnata a qualcuno.'
          : 'Puoi liberare solo le attività assegnate a te.'
      });
    }
    res.json({ task: serialise(rows[0], userId) });
  } catch (err) {
    next(err);
  }
});

// The creator or the assignee may move a task along.
router.post('/tasks/:id/status', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const status = String((req.body && req.body.status) || '');
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Identificativo non valido.' });
    }
    if (!STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Stato non valido.' });
    }

    const { rows } = await query(
      `WITH updated AS (
         UPDATE camper_tasks
            SET status = $2::varchar,
                completed_at = CASE WHEN $2::varchar = 'done' THEN NOW() ELSE NULL END
          WHERE id = $1
            AND (created_by = $3 OR assignee_id = $3 OR $4::boolean)
          RETURNING *
       )
       ${SELECT_TASK.replace('FROM camper_tasks t', 'FROM updated t')}`,
      [id, status, req.session.user.id, req.session.user.isAdmin]
    );
    if (rows.length === 0) {
      return res.status(403).json({ error: 'Puoi aggiornare solo le tue attività.' });
    }
    res.json({ task: serialise(rows[0], req.session.user.id) });
  } catch (err) {
    next(err);
  }
});

router.delete('/tasks/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Identificativo non valido.' });
    }
    const { rows } = await query(
      `DELETE FROM camper_tasks
        WHERE id = $1 AND (created_by = $2 OR $3::boolean)
        RETURNING id`,
      [id, req.session.user.id, req.session.user.isAdmin]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Attività non trovata o non creata da te.' });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
