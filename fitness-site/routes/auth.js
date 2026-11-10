// Accounts: sign up, log in, log out and "who am I".
const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db/database');
const v = require('../utils/validate');
const limiter = require('../utils/rateLimit');
const { getSettings } = require('../db/queries');
const { currentUser } = require('../middleware/auth');

const router = express.Router();
const COST = Number(process.env.BCRYPT_COST) || 10;
const byEmail = db.prepare('SELECT * FROM users WHERE email = ?');
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', COST);

// A fresh session id after logging in, so an old cookie cannot be reused (session fixation).
function startSession(req, userId) {
  return new Promise((resolve, reject) => {
    req.session.regenerate(err => {
      if (err) return reject(err);
      req.session.userId = userId;
      resolve();
    });
  });
}
const summary = u => ({ id: u.id, name: u.name, email: u.email, role: u.role });

router.post('/signup', async (req, res) => {
  if (!getSettings().signupsOpen) return res.status(403).json({ error: 'New sign-ups are closed at the moment.' });
  const name = v.text(req.body.name, 'Name', { max: 50 });
  const email = v.email(req.body.email);
  const password = v.password(req.body.password);
  if (byEmail.get(email)) return res.status(409).json({ error: 'An account with this email already exists. Log in instead.' });
  const hash = await bcrypt.hash(password, COST);
  const free = db.prepare('SELECT id FROM plans ORDER BY price, sort LIMIT 1').get().id;
  const id = db.prepare("INSERT INTO users (name, email, password_hash, plan_id, last_login_at) VALUES (?, ?, ?, ?, datetime('now'))")
    .run(name, email, hash, free).lastInsertRowid;
  await startSession(req, id);
  res.status(201).json({ user: summary(byEmail.get(email)) });
});

router.post('/login', async (req, res) => {
  const email = v.email(req.body.email);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (limiter.isLocked(req, email)) {
    return res.status(429).json({ error: 'Too many wrong passwords. Wait 10 minutes and try again.' });
  }
  const user = byEmail.get(email);
  // Compare against a dummy hash when the email is unknown, so both cases take the same time.
  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) {
    limiter.recordFailure(req, email);
    return res.status(401).json({ error: 'Email or password is incorrect.' });
  }
  if (user.status !== 'active') return res.status(403).json({ error: 'This account is suspended. Contact an administrator.' });
  limiter.clear(req, email);
  await startSession(req, user.id);
  db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);
  res.json({ user: summary(user) });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('kinetic.sid');
    res.json({ ok: true });
  });
});

router.get('/me', (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'Please log in.' });
  res.json({ user: summary(user) });
});

module.exports = router;
