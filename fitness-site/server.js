// Kinetic web server: serves the pages in /public and the JSON API under /api.
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

// Read .env without an extra package (KEY=value lines; real environment variables win).
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const match = /^\s*([A-Z_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
  }
}

const express = require('express');
const session = require('express-session');
const { Invalid } = require('./utils/validate');
const { UPLOAD_DIR } = require('./utils/uploads');
const { requireAdminPage } = require('./middleware/auth');
const { seedIfEmpty } = require('./db/seed');

const firstRun = seedIfEmpty();
const app = express();
app.set('trust proxy', 1);             // behind a host's proxy (Render, Railway) the cookie can still be "secure"
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; frame-ancestors 'none'; form-action 'self'"
  });
  next();
});

app.use(session({
  name: 'kinetic.sid',
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: 'auto', maxAge: 7 * 24 * 60 * 60 * 1000 }
}));
app.use(express.json({ limit: '3mb' }));

// Requests that change data must carry a header only our own pages add. Another website
// cannot add it to a cross-site request, which blocks cross-site request forgery.
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.get('X-Requested-With') === 'kinetic') return next();
  res.status(403).json({ error: 'This request did not come from the Kinetic site.' });
});
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api', require('./routes/app'));
app.use('/api', (req, res) => res.status(404).json({ error: 'That address does not exist.' }));

app.use('/admin', requireAdminPage);                       // admin pages are only sent to administrators
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, 'public')));
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, 'public', '404.html')));

app.use((err, req, res, next) => {
  if (err instanceof Invalid) return res.status(400).json({ error: err.message });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'That upload is too large.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'The request could not be read.' });
  if (String(err.code || '').startsWith('SQLITE_CONSTRAINT')) return res.status(400).json({ error: 'Those values are not allowed. Check the form and try again.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server. Try again in a moment.' });
});

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => {
    if (firstRun) console.log('New database: demo data added (run "npm run seed" to reset it).');
    if (!process.env.SESSION_SECRET) console.log('No SESSION_SECRET set: everyone is logged out when the server restarts.');
    console.log(`Kinetic is running at http://localhost:${port}`);
  });
}

module.exports = app;
