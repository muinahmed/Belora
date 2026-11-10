const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { request, app, db, HEADER, asUser, reset, DEMO_USER } = require('./helpers');
const { localDate } = require('../utils/dates');

describe('User app', () => {
  beforeEach(reset);

  test('bootstrap needs a login', async () => {
    assert.equal((await request(app).get('/api/bootstrap')).status, 401);
  });

  test('bootstrap returns the profile, history and all content', async () => {
    const user = await asUser();
    const { body } = await user.get('/api/bootstrap');
    assert.equal(body.user.email, DEMO_USER.email);
    assert.equal(body.profile.stepGoal, 8000);
    assert.ok(body.days[localDate()], 'today has demo data');
    assert.equal(body.foods.length, 26);
    assert.equal(body.workouts.length, 4);
    assert.ok(body.workouts[0].rounds[0].exercises[0].id);
    assert.equal(body.recipes.length, 6);
    assert.ok(body.recipes[0].ingredients.length > 0);
    assert.equal(body.recipes[0].image, '/img/recipe-chicken.jpg');
    assert.equal(body.workouts[0].image, '/img/workout-full.jpg');
    assert.equal(body.plans.length, 3);
    assert.equal(body.password_hash, undefined);
  });

  test('saving a day stores meals, water, steps and finished exercises', async () => {
    const user = await asUser();
    const boot = (await user.get('/api/bootstrap')).body;
    const food = boot.foods[0], exercise = boot.workouts[0].rounds[0].exercises[0];
    const res = await user.put('/api/days/2026-01-15').set(...HEADER).send({
      water: 5, steps: 7200, done: [exercise.id, 999999],
      meals: { lunch: [{ foodId: food.id, name: food.name, emoji: food.emoji, serving: food.serving, kcal: food.kcal, protein: 1, carbs: 2, fat: 3 }],
        snacks: [{ name: 'Home-made laddu', kcal: 150 }] }
    });
    assert.equal(res.status, 200);
    const id = db.prepare('SELECT id FROM users WHERE email = ?').get(DEMO_USER.email).id;
    assert.deepEqual(db.prepare('SELECT water, steps FROM days WHERE user_id = ? AND date = ?').get(id, '2026-01-15'), { water: 5, steps: 7200 });
    const items = db.prepare('SELECT meal, food_id, name FROM meal_items WHERE user_id = ? AND date = ? ORDER BY id').all(id, '2026-01-15');
    assert.deepEqual(items, [{ meal: 'lunch', food_id: food.id, name: food.name }, { meal: 'snacks', food_id: null, name: 'Home-made laddu' }]);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM exercise_logs WHERE user_id = ? AND date = ?').get(id, '2026-01-15').n, 1);
  });

  test('saving a day again replaces it instead of adding to it', async () => {
    const user = await asUser();
    const day = { water: 1, steps: 100, done: [], meals: { breakfast: [{ name: 'Tea', kcal: 90 }] } };
    await user.put('/api/days/2026-01-16').set(...HEADER).send(day);
    await user.put('/api/days/2026-01-16').set(...HEADER).send(day);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM meal_items WHERE date = '2026-01-16'").get().n, 1);
  });

  test('bad dates and impossible numbers are rejected', async () => {
    const user = await asUser();
    assert.equal((await user.put('/api/days/2026-02-31').set(...HEADER).send({})).status, 400);
    assert.equal((await user.put('/api/days/tomorrow').set(...HEADER).send({})).status, 400);
    assert.equal((await user.put('/api/days/2026-01-15').set(...HEADER).send({ steps: -5 })).status, 400);
    assert.equal((await user.put('/api/days/2026-01-15').set(...HEADER).send({ meals: { lunch: [{ name: 'Feast', kcal: 99999 }] } })).status, 400);
  });

  test('profile changes are saved and validated', async () => {
    const user = await asUser();
    const profile = { name: 'Nadia R', gender: 'female', age: 25, height: 161, weight: 57.5, activity: 1.55, goal: 'lose', stepGoal: 9000 };
    assert.equal((await user.put('/api/profile').set(...HEADER).send(profile)).status, 200);
    const saved = (await user.get('/api/bootstrap')).body.profile;
    assert.equal(saved.weight, 57.5);
    assert.equal(saved.goal, 'lose');
    assert.equal((await user.put('/api/profile').set(...HEADER).send({ ...profile, age: 7 })).status, 400);
    assert.equal((await user.put('/api/profile').set(...HEADER).send({ ...profile, goal: 'fly' })).status, 400);
  });

  test('a user can change plan, but only to one that exists', async () => {
    const user = await asUser();
    assert.equal((await user.put('/api/plan').set(...HEADER).send({ plan: 'monthly' })).status, 200);
    assert.equal((await user.get('/api/bootstrap')).body.plan, 'monthly');
    assert.equal((await user.put('/api/plan').set(...HEADER).send({ plan: 'platinum' })).status, 400);
  });

  test('changing the password needs the current one', async () => {
    const user = await asUser();
    assert.equal((await user.put('/api/password').set(...HEADER).send({ current: 'wrong', next: 'Brandnew123' })).status, 400);
    assert.equal((await user.put('/api/password').set(...HEADER).send({ current: DEMO_USER.password, next: 'Brandnew123' })).status, 200);
    const login = await request(app).post('/api/auth/login').set(...HEADER).send({ email: DEMO_USER.email, password: 'Brandnew123' });
    assert.equal(login.status, 200);
  });

  test('clearing data removes the logs but keeps the account', async () => {
    const user = await asUser();
    assert.equal((await user.delete('/api/data').set(...HEADER)).status, 200);
    const { body } = await user.get('/api/bootstrap');
    assert.deepEqual(body.days, {});
    assert.equal(body.user.email, DEMO_USER.email);
  });

  test('students cannot use the admin API', async () => {
    const user = await asUser();
    assert.equal((await user.get('/api/admin/stats')).status, 403);
    assert.equal((await user.delete('/api/admin/users/1').set(...HEADER)).status, 403);
    assert.equal((await request(app).get('/api/admin/users')).status, 401);
  });
});
