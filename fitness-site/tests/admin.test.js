const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { request, app, db, HEADER, asAdmin, reset, DEMO_ADMIN, DEMO_USER, TINY_PNG } = require('./helpers');

const userId = email => db.prepare('SELECT id FROM users WHERE email = ?').get(email).id;
const lastLog = () => db.prepare('SELECT action, target FROM audit_log ORDER BY id DESC LIMIT 1').get();

describe('Admin: statistics and users', () => {
  beforeEach(reset);

  test('statistics have totals, 14 days of sign-ups and the most logged foods', async () => {
    const admin = await asAdmin();
    const { body } = await admin.get('/api/admin/stats');
    assert.equal(body.totals.users, 12);
    assert.equal(body.totals.suspended, 1);
    assert.equal(body.totals.paid, 5);
    assert.equal(body.signups.length, 14);
    assert.equal(body.active.length, 14);
    assert.equal(body.signups.reduce((n, d) => n + d.count, 0), 11);
    assert.ok(body.topFoods.length > 0 && body.topFoods[0].count >= body.topFoods[1].count);
    assert.equal(body.plans.reduce((n, p) => n + p.count, 0), 12);
  });

  test('the user list can be searched, filtered, sorted and paged', async () => {
    const admin = await asAdmin();
    const all = (await admin.get('/api/admin/users')).body;
    assert.equal(all.total, 12);
    assert.equal(all.rows.length, 10);
    assert.equal(all.pages, 2);
    assert.equal(all.rows[0].password_hash, undefined);
    assert.equal((await admin.get('/api/admin/users?page=2')).body.rows.length, 2);
    assert.equal((await admin.get('/api/admin/users?q=nadia')).body.total, 1);
    assert.equal((await admin.get('/api/admin/users?status=suspended')).body.rows[0].email, 'shuvo@example.com');
    assert.equal((await admin.get('/api/admin/users?role=admin')).body.total, 1);
    assert.equal((await admin.get('/api/admin/users?plan=yearly')).body.total, 2);
    const names = (await admin.get('/api/admin/users?sort=name&dir=asc')).body.rows.map(r => r.name);
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
  });

  test('search text is treated as text, not as SQL', async () => {
    const admin = await asAdmin();
    const res = await admin.get('/api/admin/users').query({ q: "' OR 1=1 --", sort: 'name; DROP TABLE users' });
    assert.equal(res.status, 200);
    assert.equal(res.body.total, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 12);
  });

  test('user detail shows the last seven days', async () => {
    const admin = await asAdmin();
    const { body } = await admin.get('/api/admin/users/' + userId(DEMO_USER.email));
    assert.equal(body.user.email, DEMO_USER.email);
    assert.equal(body.week.length, 7);
    assert.ok(body.week[6].kcal > 0);
    assert.equal((await admin.get('/api/admin/users/99999')).status, 404);
  });

  test('an administrator can create a user who can then log in', async () => {
    const admin = await asAdmin();
    const res = await admin.post('/api/admin/users').set(...HEADER).send({ name: 'Coach Karim', email: 'karim@example.com', password: 'Trainer123', role: 'admin', plan: 'free' });
    assert.equal(res.status, 201);
    assert.deepEqual(lastLog(), { action: 'user.create', target: 'karim@example.com' });
    const login = await request(app).post('/api/auth/login').set(...HEADER).send({ email: 'karim@example.com', password: 'Trainer123' });
    assert.equal(login.body.user.role, 'admin');
    const dup = await admin.post('/api/admin/users').set(...HEADER).send({ name: 'Again', email: 'karim@example.com', password: 'Trainer123', plan: 'free' });
    assert.equal(dup.status, 409);
  });

  test('editing a user changes plan and role, and suspending is logged', async () => {
    const admin = await asAdmin();
    const id = userId(DEMO_USER.email);
    const edit = { name: 'Nadia Rahman', email: DEMO_USER.email, role: 'user', status: 'suspended', plan: 'yearly' };
    assert.equal((await admin.put('/api/admin/users/' + id).set(...HEADER).send(edit)).status, 200);
    assert.equal(lastLog().action, 'user.suspend');
    const row = db.prepare('SELECT u.status, p.slug FROM users u JOIN plans p ON p.id = u.plan_id WHERE u.id = ?').get(id);
    assert.deepEqual(row, { status: 'suspended', slug: 'yearly' });
    assert.equal((await admin.put('/api/admin/users/' + id).set(...HEADER).send({ ...edit, role: 'owner' })).status, 400);
  });

  test('the last administrator cannot be demoted, suspended or deleted', async () => {
    const admin = await asAdmin();
    const id = userId(DEMO_ADMIN.email);
    const self = { name: 'Site Admin', email: DEMO_ADMIN.email, role: 'user', status: 'active', plan: 'free' };
    assert.equal((await admin.put('/api/admin/users/' + id).set(...HEADER).send(self)).status, 400);
    assert.equal((await admin.put('/api/admin/users/' + id).set(...HEADER).send({ ...self, role: 'admin', status: 'suspended' })).status, 400);
    assert.equal((await admin.delete('/api/admin/users/' + id).set(...HEADER)).status, 400);
    assert.equal(db.prepare('SELECT role, status FROM users WHERE id = ?').get(id).role, 'admin');
  });

  test('resetting a password gives a temporary one that works', async () => {
    const admin = await asAdmin();
    const res = await admin.post(`/api/admin/users/${userId(DEMO_USER.email)}/reset-password`).set(...HEADER);
    assert.equal(res.status, 200);
    const login = pw => request(app).post('/api/auth/login').set(...HEADER).send({ email: DEMO_USER.email, password: pw });
    assert.equal((await login(DEMO_USER.password)).status, 401);
    assert.equal((await login(res.body.password)).status, 200);
  });

  test('deleting a user also deletes everything they logged', async () => {
    const admin = await asAdmin();
    const id = userId(DEMO_USER.email);
    assert.ok(db.prepare('SELECT COUNT(*) AS n FROM meal_items WHERE user_id = ?').get(id).n > 0);
    assert.equal((await admin.delete('/api/admin/users/' + id).set(...HEADER)).status, 200);
    for (const t of ['meal_items', 'days', 'exercise_logs']) {
      assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE user_id = ?`).get(id).n, 0);
    }
  });

  test('the CSV export lists every user and cannot run spreadsheet formulas', async () => {
    const admin = await asAdmin();
    db.prepare("UPDATE users SET name = '=HYPERLINK(1)' WHERE email = ?").run(DEMO_USER.email);
    const res = await admin.get('/api/admin/users/export.csv');
    assert.match(res.headers['content-type'], /text\/csv/);
    const lines = res.text.trim().split('\r\n');
    assert.equal(lines.length, 13);
    assert.ok(res.text.includes(`"'=HYPERLINK(1)"`));
  });
});

describe('Admin: content', () => {
  beforeEach(reset);

  test('foods can be added, edited, searched and deleted', async () => {
    const admin = await asAdmin();
    const made = await admin.post('/api/admin/foods').set(...HEADER).send({ name: 'Fuchka', emoji: '🥙', serving: '6 pieces', kcal: 210, protein: 5, carbs: 30, fat: 8 });
    assert.equal(made.status, 201);
    assert.equal((await admin.get('/api/admin/foods?q=fuch')).body.rows.length, 1);
    assert.equal((await admin.put('/api/admin/foods/' + made.body.id).set(...HEADER).send({ name: 'Fuchka', kcal: 230 })).status, 200);
    assert.equal(db.prepare('SELECT kcal FROM foods WHERE id = ?').get(made.body.id).kcal, 230);
    assert.equal((await admin.post('/api/admin/foods').set(...HEADER).send({ name: '', kcal: 10 })).status, 400);
    assert.equal((await admin.post('/api/admin/foods').set(...HEADER).send({ name: 'Too much', kcal: 90000 })).status, 400);
    assert.equal((await admin.delete('/api/admin/foods/' + made.body.id).set(...HEADER)).status, 200);
    assert.equal((await admin.delete('/api/admin/foods/' + made.body.id).set(...HEADER)).status, 404);
  });

  test('deleting a food keeps it in diaries where it was already logged', async () => {
    const admin = await asAdmin();
    const logged = db.prepare('SELECT food_id, name FROM meal_items WHERE food_id IS NOT NULL LIMIT 1').get();
    const before = db.prepare('SELECT COUNT(*) AS n FROM meal_items').get().n;
    await admin.delete('/api/admin/foods/' + logged.food_id).set(...HEADER);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM meal_items').get().n, before);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM meal_items WHERE food_id = ?').get(logged.food_id).n, 0);
  });

  test('a workout is saved with its rounds and exercises', async () => {
    const admin = await asAdmin();
    const workout = { name: 'Morning stretch', level: 'Easy', tone: 'teal', emoji: '🧘', published: true,
      rounds: [{ name: 'Round 1', focus: 'Back', exercises: [{ name: 'Cat cow', detail: '2 × 10', kcal: 8, minutes: 2 }, { name: 'Child pose', detail: '60 seconds', kcal: 4, minutes: 1 }] }] };
    const made = await admin.post('/api/admin/workouts').set(...HEADER).send(workout);
    assert.equal(made.status, 201);
    const saved = (await admin.get('/api/admin/workouts')).body.rows.find(w => w.id === made.body.id);
    assert.equal(saved.rounds[0].exercises.length, 2);
    assert.equal((await admin.post('/api/admin/workouts').set(...HEADER).send({ ...workout, rounds: [] })).status, 400);
    assert.equal((await admin.post('/api/admin/workouts').set(...HEADER).send({ ...workout, level: 'Extreme' })).status, 400);
  });

  test('editing a workout keeps logged completions for exercises that stay', async () => {
    const admin = await asAdmin();
    const workout = (await admin.get('/api/admin/workouts')).body.rows[0];
    const [keep, drop] = workout.rounds[0].exercises;
    const uid = userId(DEMO_USER.email);
    db.prepare('INSERT OR IGNORE INTO exercise_logs (user_id, date, exercise_id) VALUES (?, ?, ?), (?, ?, ?)').run(uid, '2026-03-01', keep.id, uid, '2026-03-01', drop.id);
    const edited = { ...workout, name: 'Full-body burner 2', rounds: [{ name: 'Only round', focus: '', exercises: [{ ...keep, name: 'Glute bridge hold' }, { name: 'Brand new move', kcal: 10, minutes: 1 }] }] };
    assert.equal((await admin.put('/api/admin/workouts/' + workout.id).set(...HEADER).send(edited)).status, 200);
    const saved = (await admin.get('/api/admin/workouts')).body.rows[0];
    assert.equal(saved.rounds.length, 1);
    assert.deepEqual(saved.rounds[0].exercises.map(e => e.name), ['Glute bridge hold', 'Brand new move']);
    assert.equal(saved.rounds[0].exercises[0].id, keep.id);
    const logs = db.prepare("SELECT exercise_id FROM exercise_logs WHERE user_id = ? AND date = '2026-03-01'").all(uid).map(r => r.exercise_id);
    assert.deepEqual(logs, [keep.id]);
  });

  test('an unpublished workout is hidden from users but not from admins', async () => {
    const admin = await asAdmin();
    const workout = (await admin.get('/api/admin/workouts')).body.rows[0];
    await admin.put('/api/admin/workouts/' + workout.id).set(...HEADER).send({ ...workout, published: false });
    assert.equal((await admin.get('/api/bootstrap')).body.workouts.length, 3);
    assert.equal((await admin.get('/api/admin/workouts')).body.rows.length, 4);
  });

  test('recipes can be created, edited and deleted', async () => {
    const admin = await asAdmin();
    const recipe = { name: 'Mango lassi', emoji: '🥭', tone: 'yellow', kcal: 180, minutes: 5, protein: 6, carbs: 30, fat: 4, published: true,
      ingredients: [{ name: 'Mango', amount: '1 cup' }, { name: 'Yogurt', amount: '1 cup' }], steps: ['Blend everything until smooth.'] };
    const made = await admin.post('/api/admin/recipes').set(...HEADER).send(recipe);
    assert.equal(made.status, 201);
    await admin.put('/api/admin/recipes/' + made.body.id).set(...HEADER).send({ ...recipe, steps: ['Chill the mango.', 'Blend everything until smooth.'] });
    const saved = (await admin.get('/api/admin/recipes')).body.rows.find(r => r.id === made.body.id);
    assert.equal(saved.steps.length, 2);
    assert.equal(saved.ingredients[1].name, 'Yogurt');
    assert.equal((await admin.post('/api/admin/recipes').set(...HEADER).send({ ...recipe, steps: [] })).status, 400);
    assert.equal((await admin.delete('/api/admin/recipes/' + made.body.id).set(...HEADER)).status, 200);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM recipe_ingredients WHERE recipe_id = ?').get(made.body.id).n, 0);
  });

  test('photos are checked by their real content and removed with their recipe', async () => {
    const admin = await asAdmin();
    const fake = 'data:image/png;base64,' + Buffer.from('<script>alert(1)</script>').toString('base64');
    assert.equal((await admin.post('/api/admin/uploads').set(...HEADER).send({ dataUrl: fake })).status, 400);
    assert.equal((await admin.post('/api/admin/uploads').set(...HEADER).send({ dataUrl: 'hello' })).status, 400);
    const up = await admin.post('/api/admin/uploads').set(...HEADER).send({ dataUrl: TINY_PNG });
    assert.equal(up.status, 201);
    assert.match(up.body.path, /^\/uploads\/[a-f0-9]{32}\.png$/);
    const file = path.join(process.env.UPLOAD_DIR, path.basename(up.body.path));
    assert.ok(fs.existsSync(file));
    assert.equal((await admin.get(up.body.path)).status, 200);

    const recipe = (await admin.get('/api/admin/recipes')).body.rows[0];
    assert.equal((await admin.put('/api/admin/recipes/' + recipe.id).set(...HEADER).send({ ...recipe, image: '/uploads/../../server.js' })).status, 400);
    assert.equal((await admin.put('/api/admin/recipes/' + recipe.id).set(...HEADER).send({ ...recipe, image: up.body.path })).status, 200);
    await admin.delete('/api/admin/recipes/' + recipe.id).set(...HEADER);
    assert.ok(!fs.existsSync(file));
  });

  test('the photos that ship with the project load, survive edits and are never deleted', async () => {
    const admin = await asAdmin();
    const recipes = (await admin.get('/api/admin/recipes')).body.rows;
    const workouts = (await admin.get('/api/admin/workouts')).body.rows;
    for (const item of [...recipes, ...workouts]) {
      const res = await admin.get(item.image);
      assert.equal(res.status, 200, item.image);
      assert.match(res.headers['content-type'], /image\/jpeg/);
    }
    const recipe = recipes[0];
    assert.equal((await admin.put('/api/admin/recipes/' + recipe.id).set(...HEADER).send({ ...recipe, kcal: 350 })).status, 200);
    assert.equal((await admin.get('/api/admin/recipes')).body.rows[0].image, recipe.image);
    assert.equal((await admin.put('/api/admin/recipes/' + recipe.id).set(...HEADER).send({ ...recipe, image: '/img/../server.jpg' })).status, 400);
    await admin.delete('/api/admin/recipes/' + recipe.id).set(...HEADER);
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'public', recipe.image)));
  });

  test('plan prices can be changed and users see the new price', async () => {
    const admin = await asAdmin();
    const plan = (await admin.get('/api/admin/plans')).body.rows.find(p => p.slug === 'monthly');
    assert.equal(plan.subscribers, 3);
    assert.equal((await admin.put('/api/admin/plans/' + plan.id).set(...HEADER).send({ ...plan, price: 349 })).status, 200);
    assert.equal((await admin.get('/api/bootstrap')).body.plans.find(p => p.slug === 'monthly').price, 349);
    assert.equal((await admin.put('/api/admin/plans/' + plan.id).set(...HEADER).send({ ...plan, price: -1 })).status, 400);
  });

  test('settings change the announcement users see', async () => {
    const admin = await asAdmin();
    await admin.put('/api/admin/settings').set(...HEADER).send({ announcement: 'Gym closed on Friday.', signupsOpen: true });
    assert.equal((await admin.get('/api/bootstrap')).body.announcement, 'Gym closed on Friday.');
  });

  test('the activity log records changes and can be filtered', async () => {
    const admin = await asAdmin();
    await admin.post('/api/admin/foods').set(...HEADER).send({ name: 'Jhalmuri', kcal: 120 });
    await admin.put('/api/admin/settings').set(...HEADER).send({ announcement: '', signupsOpen: true });
    const all = (await admin.get('/api/admin/log')).body;
    assert.equal(all.total, 2);
    assert.equal(all.rows[0].action, 'settings.update');
    assert.equal(all.rows[0].admin_name, 'Site Admin');
    const foods = (await admin.get('/api/admin/log?area=food')).body;
    assert.deepEqual(foods.rows.map(r => r.target), ['Jhalmuri']);
  });
});
