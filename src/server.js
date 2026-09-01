'use strict';

require('dotenv').config();

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);

const { pool } = require('./db');
const { migrate } = require('./migrate');
const { seedAdmin } = require('./seedAdmin');
const authRoutes = require('./routes/auth');
const reservationRoutes = require('./routes/reservations');
const taskRoutes = require('./routes/tasks');
const destinationRoutes = require('./routes/destinations');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const IN_PRODUCTION = process.env.NODE_ENV === 'production';

// Render and similar platforms terminate TLS at a proxy; trusting it lets
// express-session mark the cookie secure without breaking the redirect loop.
app.set('trust proxy', 1);

app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ extended: false, limit: '64kb' }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

if (!process.env.SESSION_SECRET) {
  if (IN_PRODUCTION) {
    console.error('SESSION_SECRET must be set in production.');
    process.exit(1);
  }
  console.warn('SESSION_SECRET is not set; using a random one (sessions reset on restart).');
}

app.use(
  session({
    name: 'camper.sid',
    store: new PgSession({ pool, tableName: 'camper_session', createTableIfMissing: false }),
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: IN_PRODUCTION,
      maxAge: 1000 * 60 * 60 * 12
    }
  })
);

app.use('/api/auth', authRoutes);
app.use('/api', reservationRoutes);
app.use('/api', taskRoutes);
app.use('/api', destinationRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(503).json({ status: 'degraded', error: err.message });
  }
});

app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

['dashboard', 'tasks', 'destinations'].forEach((view) => {
  app.get(`/${view}`, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', `${view}.html`));
  });
});

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint non trovato.' });
  }
  res.status(404).sendFile(path.join(__dirname, '..', 'public', '404.html'));
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: 'Errore interno del server.' });
});

async function start() {
  await migrate();
  await seedAdmin({ silent: true });
  const server = app.listen(PORT, () => {
    console.log(`Sacred Camper service listening on http://localhost:${PORT}`);
  });

  const shutdown = () => {
    server.close(() => pool.end().then(() => process.exit(0)));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

if (require.main === module) {
  start().catch((err) => {
    console.error('Failed to start:', err);
    process.exit(1);
  });
}

module.exports = app;
