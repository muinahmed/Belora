// Admin panel API. Every route needs an administrator, and every change is written to the
// activity log. Sections: statistics, users, foods, workouts, recipes, plans, photos,
// activity log, settings.
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const db = require('../db/database');
const v = require('../utils/validate');
const q = require('../db/queries');
const { audit } = require('../utils/audit');
const { saveDataUrl } = require('../utils/uploads');
const { requireAdmin } = require('../middleware/auth');
const { localDate, daysAgo } = require('../utils/dates');

const router = express.Router();
router.use(requireAdmin);
const COST = Number(process.env.BCRYPT_COST) || 10;
const PAGE_SIZE = 10;

const idParam = req => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) v.fail('That record does not exist.');
  return id;
};
const notFound = res => res.status(404).json({ error: 'That record does not exist. It may have been deleted.' });
const count = (sql, ...args) => db.prepare(sql).get(...args).n;

/* ---------- Statistics ---------- */

router.get('/stats', (req, res) => {
  const today = localDate();
  const weekAgo = localDate(daysAgo(6));
  const dates = Array.from({ length: 14 }, (_, i) => localDate(daysAgo(13 - i)));
  const fill = rows => { const map = Object.fromEntries(rows.map(r => [r.date, r.n])); return dates.map(date => ({ date, count: map[date] || 0 })); };
  res.json({
    totals: {
      users: count('SELECT COUNT(*) AS n FROM users'),
      newThisWeek: count("SELECT COUNT(*) AS n FROM users WHERE date(created_at, 'localtime') >= ?", weekAgo),
      activeToday: count('SELECT COUNT(*) AS n FROM days WHERE date = ?', today),
      suspended: count("SELECT COUNT(*) AS n FROM users WHERE status = 'suspended'"),
      paid: count('SELECT COUNT(*) AS n FROM users u JOIN plans p ON p.id = u.plan_id WHERE p.price > 0'),
      mealsToday: count('SELECT COUNT(*) AS n FROM meal_items WHERE date = ?', today),
      exercisesThisWeek: count('SELECT COUNT(*) AS n FROM exercise_logs WHERE date >= ?', weekAgo),
      foods: count('SELECT COUNT(*) AS n FROM foods'),
      workouts: count('SELECT COUNT(*) AS n FROM workouts'),
      recipes: count('SELECT COUNT(*) AS n FROM recipes')
    },
    signups: fill(db.prepare("SELECT date(created_at, 'localtime') AS date, COUNT(*) AS n FROM users WHERE date(created_at, 'localtime') >= ? GROUP BY 1").all(dates[0])),
    active: fill(db.prepare('SELECT date, COUNT(*) AS n FROM days WHERE date >= ? GROUP BY date').all(dates[0])),
    topFoods: db.prepare('SELECT name, COUNT(*) AS count FROM meal_items WHERE date >= ? GROUP BY name ORDER BY count DESC, name LIMIT 6').all(localDate(daysAgo(29))),
    plans: db.prepare('SELECT p.name, p.price, COUNT(u.id) AS count FROM plans p LEFT JOIN users u ON u.plan_id = p.id GROUP BY p.id ORDER BY p.sort').all(),
    recent: db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 6').all()
  });
});

/* ---------- Users ---------- */

const USER_COLUMNS = `u.id, u.name, u.email, u.role, u.status, u.created_at, u.last_login_at, p.slug AS plan, p.name AS plan_name`;
const SORTS = { name: 'u.name COLLATE NOCASE', email: 'u.email', joined: 'u.created_at', login: 'u.last_login_at' };

// Builds the WHERE clause shared by the list and the CSV export
function userFilter(query) {
  const where = [], args = [];
  const search = String(query.q || '').trim();
  if (search) { where.push('(u.name LIKE ? OR u.email LIKE ?)'); args.push(`%${search}%`, `%${search}%`); }
  if (['user', 'admin'].includes(query.role)) { where.push('u.role = ?'); args.push(query.role); }
  if (['active', 'suspended'].includes(query.status)) { where.push('u.status = ?'); args.push(query.status); }
  if (query.plan) { where.push('p.slug = ?'); args.push(String(query.plan)); }
  const order = `${SORTS[query.sort] || SORTS.joined} ${query.dir === 'asc' ? 'ASC' : 'DESC'}, u.id`;
  return { where: where.length ? 'WHERE ' + where.join(' AND ') : '', args, order };
}

router.get('/users', (req, res) => {
  const f = userFilter(req.query);
  const total = count(`SELECT COUNT(*) AS n FROM users u JOIN plans p ON p.id = u.plan_id ${f.where}`, ...f.args);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, parseInt(req.query.page, 10) || 1));
  const rows = db.prepare(`SELECT ${USER_COLUMNS} FROM users u JOIN plans p ON p.id = u.plan_id ${f.where} ORDER BY ${f.order} LIMIT ? OFFSET ?`)
    .all(...f.args, PAGE_SIZE, (page - 1) * PAGE_SIZE);
  res.json({ rows, total, page, pages });
});

// Spreadsheet download of the filtered list. Cells that start with = + - @ get a leading
// apostrophe so a spreadsheet never runs them as formulas.
router.get('/users/export.csv', (req, res) => {
  const f = userFilter(req.query);
  const rows = db.prepare(`SELECT ${USER_COLUMNS} FROM users u JOIN plans p ON p.id = u.plan_id ${f.where} ORDER BY ${f.order}`).all(...f.args);
  const cell = value => {
    let s = value === null || value === undefined ? '' : String(value);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const lines = [['ID', 'Name', 'Email', 'Role', 'Status', 'Plan', 'Joined (UTC)', 'Last login (UTC)']]
    .concat(rows.map(r => [r.id, r.name, r.email, r.role, r.status, r.plan_name, r.created_at, r.last_login_at]));
  audit(req, 'user.export', `${rows.length} users`);
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="kinetic-users-${localDate()}.csv"` });
  res.send('﻿' + lines.map(l => l.map(cell).join(',')).join('\r\n'));
});

router.get('/users/:id', (req, res) => {
  const id = idParam(req);
  const user = db.prepare(`SELECT ${USER_COLUMNS}, u.gender, u.age, u.height, u.weight, u.goal, u.step_goal FROM users u JOIN plans p ON p.id = u.plan_id WHERE u.id = ?`).get(id);
  if (!user) return notFound(res);
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = localDate(daysAgo(6 - i));
    const day = db.prepare('SELECT water, steps FROM days WHERE user_id = ? AND date = ?').get(id, date) || { water: 0, steps: 0 };
    return {
      date, ...day,
      kcal: db.prepare('SELECT COALESCE(SUM(kcal), 0) AS n FROM meal_items WHERE user_id = ? AND date = ?').get(id, date).n,
      exercises: count('SELECT COUNT(*) AS n FROM exercise_logs WHERE user_id = ? AND date = ?', id, date)
    };
  });
  res.json({ user, week });
});

// The site must always keep one active administrator, and nobody can lock themselves out.
function guardAdminChange(req, target, next) {
  const losesAdmin = target.role === 'admin' && target.status === 'active' && (next.role !== 'admin' || next.status !== 'active');
  if (!losesAdmin) return;
  if (target.id === req.user.id) v.fail('You cannot remove your own administrator access. Ask another administrator.');
  if (count("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'active'") <= 1) v.fail('The site needs at least one active administrator.');
}
const planBySlug = slug => db.prepare('SELECT id FROM plans WHERE slug = ?').get(String(slug || '')) || v.fail('Choose a plan from the list.');

router.post('/users', async (req, res) => {
  const b = req.body || {};
  const name = v.text(b.name, 'Name', { max: 50 });
  const email = v.email(b.email);
  const password = v.password(b.password);
  const role = v.oneOf(b.role || 'user', 'Role', ['user', 'admin']);
  const plan = planBySlug(b.plan);
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return res.status(409).json({ error: 'An account with this email already exists.' });
  const id = db.prepare('INSERT INTO users (name, email, password_hash, role, plan_id) VALUES (?, ?, ?, ?, ?)')
    .run(name, email, await bcrypt.hash(password, COST), role, plan.id).lastInsertRowid;
  audit(req, 'user.create', email, `role ${role}`);
  res.status(201).json({ id: Number(id) });
});

router.put('/users/:id', (req, res) => {
  const id = idParam(req), b = req.body || {};
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!target) return notFound(res);
  const next = {
    name: v.text(b.name, 'Name', { max: 50 }), email: v.email(b.email),
    role: v.oneOf(b.role, 'Role', ['user', 'admin']), status: v.oneOf(b.status, 'Status', ['active', 'suspended']),
    plan: planBySlug(b.plan)
  };
  guardAdminChange(req, target, next);
  if (db.prepare('SELECT 1 FROM users WHERE email = ? AND id <> ?').get(next.email, id)) return res.status(409).json({ error: 'Another account already uses this email.' });
  db.prepare('UPDATE users SET name = ?, email = ?, role = ?, status = ?, plan_id = ? WHERE id = ?').run(next.name, next.email, next.role, next.status, next.plan.id, id);
  const changes = ['name', 'email', 'role', 'status'].filter(k => target[k] !== next[k]).map(k => `${k}: ${target[k]} → ${next[k]}`);
  if (target.plan_id !== next.plan.id) changes.push('plan changed');
  const action = target.status !== next.status ? (next.status === 'suspended' ? 'user.suspend' : 'user.activate') : 'user.update';
  audit(req, action, next.email, changes.join('; '));
  res.json({ ok: true });
});

// Sets a random temporary password and shows it to the administrator once.
router.post('/users/:id/reset-password', async (req, res) => {
  const id = idParam(req);
  const target = db.prepare('SELECT email FROM users WHERE id = ?').get(id);
  if (!target) return notFound(res);
  const password = 'Kin-' + crypto.randomBytes(6).toString('base64url') + '7';
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await bcrypt.hash(password, COST), id);
  audit(req, 'user.reset_password', target.email);
  res.json({ password });
});

router.delete('/users/:id', (req, res) => {
  const id = idParam(req);
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!target) return notFound(res);
  if (target.id === req.user.id) v.fail('You cannot delete your own account while logged in.');
  guardAdminChange(req, target, { role: 'user', status: 'suspended' });
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  audit(req, 'user.delete', target.email);
  res.json({ ok: true });
});

/* ---------- Foods ---------- */

router.get('/foods', (req, res) => res.json({ rows: q.listFoods(String(req.query.q || '').trim()) }));
router.post('/foods', (req, res) => {
  const id = q.saveFood(null, req.body || {});
  audit(req, 'food.create', req.body.name);
  res.status(201).json({ id: Number(id) });
});
router.put('/foods/:id', (req, res) => {
  const id = idParam(req);
  if (!db.prepare('SELECT 1 FROM foods WHERE id = ?').get(id)) return notFound(res);
  q.saveFood(id, req.body || {});
  audit(req, 'food.update', req.body.name);
  res.json({ ok: true });
});
router.delete('/foods/:id', (req, res) => {
  const id = idParam(req);
  const food = db.prepare('SELECT name FROM foods WHERE id = ?').get(id);
  if (!food) return notFound(res);
  db.prepare('DELETE FROM foods WHERE id = ?').run(id);     // diary entries keep their own copy of the name and calories
  audit(req, 'food.delete', food.name);
  res.json({ ok: true });
});

/* ---------- Workouts ---------- */

router.get('/workouts', (req, res) => res.json({ rows: q.listWorkouts() }));
router.post('/workouts', (req, res) => {
  const id = q.saveWorkout(null, req.body || {});
  audit(req, 'workout.create', req.body.name);
  res.status(201).json({ id });
});
router.put('/workouts/:id', (req, res) => {
  const id = idParam(req);
  if (!q.getWorkout(id)) return notFound(res);
  q.saveWorkout(id, req.body || {});
  audit(req, 'workout.update', req.body.name);
  res.json({ ok: true });
});
router.delete('/workouts/:id', (req, res) => {
  const id = idParam(req), workout = q.getWorkout(id);
  if (!workout) return notFound(res);
  q.deleteWorkout(id);
  audit(req, 'workout.delete', workout.name);
  res.json({ ok: true });
});

/* ---------- Recipes ---------- */

router.get('/recipes', (req, res) => res.json({ rows: q.listRecipes() }));
router.post('/recipes', (req, res) => {
  const id = q.saveRecipe(null, req.body || {});
  audit(req, 'recipe.create', req.body.name);
  res.status(201).json({ id });
});
router.put('/recipes/:id', (req, res) => {
  const id = idParam(req);
  if (!q.getRecipe(id)) return notFound(res);
  q.saveRecipe(id, req.body || {});
  audit(req, 'recipe.update', req.body.name);
  res.json({ ok: true });
});
router.delete('/recipes/:id', (req, res) => {
  const id = idParam(req), recipe = q.getRecipe(id);
  if (!recipe) return notFound(res);
  q.deleteRecipe(id);
  audit(req, 'recipe.delete', recipe.name);
  res.json({ ok: true });
});

/* ---------- Plans ---------- */

router.get('/plans', (req, res) => {
  const subscribers = Object.fromEntries(db.prepare('SELECT plan_id, COUNT(*) AS n FROM users GROUP BY plan_id').all().map(r => [r.plan_id, r.n]));
  res.json({ rows: q.listPlans().map(p => ({ ...p, subscribers: subscribers[p.id] || 0 })) });
});
router.put('/plans/:id', (req, res) => {
  const id = idParam(req);
  if (!db.prepare('SELECT 1 FROM plans WHERE id = ?').get(id)) return notFound(res);
  q.savePlan(id, req.body || {});
  audit(req, 'plan.update', req.body.name, `price ৳${req.body.price}`);
  res.json({ ok: true });
});

/* ---------- Photos ---------- */

router.post('/uploads', (req, res) => {
  res.status(201).json({ path: saveDataUrl(req.body && req.body.dataUrl) });
});

/* ---------- Activity log ---------- */

router.get('/log', (req, res) => {
  const area = /^[a-z]+$/.test(req.query.area || '') ? req.query.area : '';
  const where = area ? 'WHERE action LIKE ?' : '';
  const args = area ? [`${area}.%`] : [];
  const total = count(`SELECT COUNT(*) AS n FROM audit_log ${where}`, ...args);
  const pages = Math.max(1, Math.ceil(total / 15));
  const page = Math.min(pages, Math.max(1, parseInt(req.query.page, 10) || 1));
  res.json({ rows: db.prepare(`SELECT * FROM audit_log ${where} ORDER BY id DESC LIMIT 15 OFFSET ?`).all(...args, (page - 1) * 15), total, page, pages });
});

/* ---------- Settings ---------- */

router.get('/settings', (req, res) => res.json(q.getSettings()));
router.put('/settings', (req, res) => {
  q.saveSettings(req.body || {});
  audit(req, 'settings.update', 'Site settings', req.body.signupsOpen ? 'sign-ups open' : 'sign-ups closed');
  res.json({ ok: true });
});

module.exports = router;
