'use strict';

const bcrypt = require('bcryptjs');
const { query } = require('./db');

const SALT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 8;

function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

async function verifyCredentials(username, password) {
  const { rows } = await query(
    `SELECT id, username, password_hash, full_name, is_admin, is_active
       FROM camper_users
      WHERE lower(username) = lower($1)`,
    [username]
  );
  const user = rows[0];
  // Always run a hash comparison so a missing user and a wrong password take
  // roughly the same amount of time.
  const hash = user ? user.password_hash : '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin';
  const ok = await bcrypt.compare(password, hash);
  if (!user || !ok || !user.is_active) return null;
  return {
    id: user.id,
    username: user.username,
    fullName: user.full_name,
    isAdmin: user.is_admin
  };
}

function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    if (req.accepts('json') && !req.accepts('html')) {
      return res.status(401).json({ error: 'Autenticazione richiesta.' });
    }
    return res.status(401).json({ error: 'Autenticazione richiesta.' });
  }
  return next();
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Autenticazione richiesta.' });
  }
  if (!req.session.user.isAdmin) {
    return res.status(403).json({ error: 'Servono i permessi di amministratore.' });
  }
  return next();
}

module.exports = {
  hashPassword,
  verifyCredentials,
  requireAuth,
  requireAdmin,
  MIN_PASSWORD_LENGTH
};
