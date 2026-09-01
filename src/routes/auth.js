'use strict';

const express = require('express');
const { query } = require('../db');
const { verifyCredentials, requireAuth, hashPassword, MIN_PASSWORD_LENGTH } = require('../auth');

const router = express.Router();

router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Username e password sono obbligatori.' });
    }
    const user = await verifyCredentials(String(username), String(password));
    if (!user) {
      return res.status(401).json({ error: 'Credenziali non valide.' });
    }
    // A fresh session id on login keeps a pre-login cookie from being reused.
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.user = user;
      req.session.save((saveErr) => {
        if (saveErr) return next(saveErr);
        res.json({ user });
      });
    });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res, next) => {
  if (!req.session) return res.json({ ok: true });
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('camper.sid');
    res.json({ ok: true });
  });
});

router.get('/me', (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Non autenticato.' });
  }
  res.json({ user: req.session.user });
});

// Any signed in user may rotate their own password.
router.post('/password', requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Password attuale e nuova sono obbligatorie.' });
    }
    if (String(newPassword).length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        error: `La nuova password deve avere almeno ${MIN_PASSWORD_LENGTH} caratteri.`
      });
    }
    const ok = await verifyCredentials(req.session.user.username, String(currentPassword));
    if (!ok) return res.status(401).json({ error: 'La password attuale non è corretta.' });

    await query('UPDATE camper_users SET password_hash = $1 WHERE id = $2', [
      await hashPassword(String(newPassword)),
      req.session.user.id
    ]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
