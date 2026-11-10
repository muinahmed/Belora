// Everything the logged-in user's app needs: one "bootstrap" read, then small saves.
const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db/database');
const v = require('../utils/validate');
const q = require('../db/queries');
const { requireLogin } = require('../middleware/auth');
const { localDate, daysAgo, isDateKey } = require('../utils/dates');

const router = express.Router();
router.use(requireLogin);
const COST = Number(process.env.BCRYPT_COST) || 10;
const MEALS = ['breakfast', 'lunch', 'dinner', 'snacks'];

const profileOf = u => ({
  name: u.name, email: u.email, gender: u.gender, age: u.age, height: u.height, weight: u.weight,
  activity: u.activity, goal: u.goal, stepGoal: u.step_goal, photo: u.photo || ''
});

// The user's last 30 days, keyed by date
function daysOf(userId) {
  const since = localDate(daysAgo(30));
  const days = {};
  const blank = () => ({ water: 0, steps: 0, done: [], meals: { breakfast: [], lunch: [], dinner: [], snacks: [] } });
  for (const d of db.prepare('SELECT * FROM days WHERE user_id = ? AND date >= ?').all(userId, since)) {
    days[d.date] = { ...blank(), water: d.water, steps: d.steps };
  }
  for (const m of db.prepare('SELECT * FROM meal_items WHERE user_id = ? AND date >= ? ORDER BY id').all(userId, since)) {
    (days[m.date] ||= blank()).meals[m.meal].push({
      id: m.id, foodId: m.food_id, name: m.name, emoji: m.emoji, serving: m.serving,
      kcal: m.kcal, protein: m.protein, carbs: m.carbs, fat: m.fat
    });
  }
  for (const e of db.prepare('SELECT * FROM exercise_logs WHERE user_id = ? AND date >= ?').all(userId, since)) {
    (days[e.date] ||= blank()).done.push(e.exercise_id);
  }
  return days;
}

router.get('/bootstrap', (req, res) => {
  const u = req.user;
  res.json({
    user: { id: u.id, name: u.name, email: u.email, role: u.role },
    profile: profileOf(u),
    plan: u.plan,
    days: daysOf(u.id),
    foods: q.listFoods(),
    workouts: q.listWorkouts({ publishedOnly: true }),
    recipes: q.listRecipes({ publishedOnly: true }),
    plans: q.listPlans(),
    announcement: q.getSettings().announcement
  });
});

// Replace everything logged for one day (meals, water, steps, finished exercises).
const saveDay = db.transaction((userId, date, body) => {
  const water = v.integer(body.water ?? 0, 'Water', 0, 20);
  const steps = v.integer(body.steps ?? 0, 'Steps', 0, 200000);
  const done = v.list(body.done ?? [], 'Finished exercises', 200).filter(Number.isInteger);
  const meals = body.meals && typeof body.meals === 'object' ? body.meals : {};
  db.prepare(`INSERT INTO days (user_id, date, water, steps) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, date) DO UPDATE SET water = excluded.water, steps = excluded.steps`).run(userId, date, water, steps);

  db.prepare('DELETE FROM meal_items WHERE user_id = ? AND date = ?').run(userId, date);
  const foodExists = db.prepare('SELECT 1 FROM foods WHERE id = ?');
  const addItem = db.prepare('INSERT INTO meal_items (user_id, date, meal, food_id, name, emoji, serving, kcal, protein, carbs, fat) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const meal of MEALS) {
    for (const item of v.list(meals[meal] ?? [], 'Meal', 40)) {
      const foodId = Number.isInteger(item.foodId) && foodExists.get(item.foodId) ? item.foodId : null;
      addItem.run(userId, date, meal, foodId,
        v.text(item.name, 'Food name', { max: 80 }), v.optionalText(item.emoji, 'Emoji', 8) || '🍽️', v.optionalText(item.serving, 'Serving', 40),
        v.integer(item.kcal ?? 0, 'Calories', 0, 5000), v.number(item.protein ?? 0, 'Protein', 0, 500),
        v.number(item.carbs ?? 0, 'Carbs', 0, 500), v.number(item.fat ?? 0, 'Fat', 0, 500));
    }
  }

  db.prepare('DELETE FROM exercise_logs WHERE user_id = ? AND date = ?').run(userId, date);
  const exerciseExists = db.prepare('SELECT 1 FROM exercises WHERE id = ?');
  const addLog = db.prepare('INSERT OR IGNORE INTO exercise_logs (user_id, date, exercise_id) VALUES (?, ?, ?)');
  for (const id of done) if (exerciseExists.get(id)) addLog.run(userId, date, id);
});

router.put('/days/:date', (req, res) => {
  if (!isDateKey(req.params.date)) v.fail('The date must look like 2026-01-31.');
  saveDay(req.user.id, req.params.date, req.body || {});
  res.json({ ok: true });
});

router.put('/profile', (req, res) => {
  const b = req.body || {};
  let photo = null;
  if (b.photo) {
    if (typeof b.photo !== 'string' || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(b.photo) || b.photo.length > 80000) {
      v.fail('The profile photo could not be saved. Try a different picture.');
    }
    photo = b.photo;
  }
  db.prepare('UPDATE users SET name = ?, gender = ?, age = ?, height = ?, weight = ?, activity = ?, goal = ?, step_goal = ?, photo = ? WHERE id = ?').run(
    v.text(b.name, 'Name', { max: 50 }), v.oneOf(b.gender, 'Sex', ['female', 'male']), v.integer(b.age, 'Age', 13, 100),
    v.number(b.height, 'Height', 100, 230), v.number(b.weight, 'Weight', 30, 250), v.oneOf(Number(b.activity), 'Activity level', [1.2, 1.375, 1.55, 1.725]),
    v.oneOf(b.goal, 'Goal', ['lose', 'maintain', 'gain']), v.integer(b.stepGoal, 'Daily step goal', 1000, 50000), photo, req.user.id);
  res.json({ ok: true });
});

router.put('/plan', (req, res) => {
  const plan = db.prepare('SELECT id FROM plans WHERE slug = ?').get(String(req.body.plan || ''));
  if (!plan) v.fail('That plan does not exist.');
  db.prepare('UPDATE users SET plan_id = ? WHERE id = ?').run(plan.id, req.user.id);
  res.json({ ok: true });
});

router.put('/password', async (req, res) => {
  const current = typeof req.body.current === 'string' ? req.body.current : '';
  if (!(await bcrypt.compare(current, req.user.password_hash))) return res.status(400).json({ error: 'Your current password is not correct.' });
  const next = v.password(req.body.next, 'New password');
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await bcrypt.hash(next, COST), req.user.id);
  res.json({ ok: true });
});

// Remove everything the user has logged, but keep the account and profile.
router.delete('/data', (req, res) => {
  db.transaction(id => {
    for (const t of ['meal_items', 'exercise_logs', 'days']) db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).run(id);
  })(req.user.id);
  res.json({ ok: true });
});

module.exports = router;
