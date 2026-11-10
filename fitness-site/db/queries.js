// Reads and writes for the content both the app and the admin panel use:
// foods, workouts (with rounds and exercises), recipes, plans and settings.
const db = require('./database');
const v = require('../utils/validate');
const { imagePath, removeImage } = require('../utils/uploads');

const TONES = ['purple', 'orange', 'teal', 'yellow'];
const LEVELS = ['Easy', 'Medium', 'Hard'];

/* ---------- Foods ---------- */

function listFoods(search = '') {
  return db.prepare('SELECT * FROM foods WHERE name LIKE ? ORDER BY name COLLATE NOCASE').all(`%${search}%`);
}
function readFood(body) {
  return {
    name: v.text(body.name, 'Name', { max: 60 }),
    emoji: v.optionalText(body.emoji, 'Emoji', 8) || '🍽️',
    serving: v.optionalText(body.serving, 'Serving', 40) || '1 serving',
    kcal: v.integer(body.kcal, 'Calories', 0, 5000),
    protein: v.number(body.protein ?? 0, 'Protein', 0, 500),
    carbs: v.number(body.carbs ?? 0, 'Carbs', 0, 500),
    fat: v.number(body.fat ?? 0, 'Fat', 0, 500)
  };
}
function saveFood(id, body) {
  const f = readFood(body);
  if (id) {
    db.prepare('UPDATE foods SET name = ?, emoji = ?, serving = ?, kcal = ?, protein = ?, carbs = ?, fat = ? WHERE id = ?')
      .run(f.name, f.emoji, f.serving, f.kcal, f.protein, f.carbs, f.fat, id);
    return id;
  }
  return db.prepare('INSERT INTO foods (name, emoji, serving, kcal, protein, carbs, fat) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(f.name, f.emoji, f.serving, f.kcal, f.protein, f.carbs, f.fat).lastInsertRowid;
}

/* ---------- Workouts ---------- */

function listWorkouts({ publishedOnly = false } = {}) {
  const workouts = db.prepare(`SELECT * FROM workouts ${publishedOnly ? 'WHERE published = 1' : ''} ORDER BY sort, id`).all();
  const rounds = db.prepare('SELECT * FROM rounds ORDER BY sort, id').all();
  const exercises = db.prepare('SELECT * FROM exercises ORDER BY sort, id').all();
  return workouts.map(w => ({
    ...w,
    rounds: rounds.filter(r => r.workout_id === w.id).map(r => ({
      id: r.id, name: r.name, focus: r.focus,
      exercises: exercises.filter(e => e.round_id === r.id).map(({ round_id, sort, ...e }) => e)
    }))
  }));
}
const getWorkout = id => listWorkouts().find(w => w.id === id);

function readWorkout(body) {
  const rounds = v.list(body.rounds, 'Rounds', 8).map((r, i) => ({
    name: v.text(r && r.name, `Round ${i + 1} name`, { max: 40 }),
    focus: v.optionalText(r && r.focus, 'Round focus', 60),
    exercises: v.list(r && r.exercises, 'Exercises', 20).map(e => ({
      id: Number.isInteger(e && e.id) ? e.id : null,
      name: v.text(e && e.name, 'Exercise name', { max: 60 }),
      emoji: v.optionalText(e.emoji, 'Emoji', 8) || '💪',
      detail: v.optionalText(e.detail, 'Sets and reps', 60),
      kcal: v.integer(e.kcal ?? 0, 'Exercise calories', 0, 2000),
      minutes: v.integer(e.minutes ?? 0, 'Exercise minutes', 0, 240)
    }))
  }));
  if (!rounds.length || rounds.some(r => !r.exercises.length)) v.fail('A workout needs at least one round, and every round needs an exercise.');
  return {
    name: v.text(body.name, 'Name', { max: 60 }),
    level: v.oneOf(body.level, 'Level', LEVELS),
    tone: v.oneOf(body.tone, 'Colour', TONES),
    emoji: v.optionalText(body.emoji, 'Emoji', 8) || '💪',
    image: imagePath(body.image),
    published: v.flag(body.published),
    rounds
  };
}

// Creates or updates a workout with all its rounds and exercises in one transaction.
// Exercises that keep their id keep the completions users have logged against them.
const saveWorkout = db.transaction((id, body) => {
  const w = readWorkout(body);
  let oldImage = '';
  if (id) {
    oldImage = db.prepare('SELECT image FROM workouts WHERE id = ?').get(id).image;
    db.prepare('UPDATE workouts SET name = ?, level = ?, tone = ?, emoji = ?, image = ?, published = ? WHERE id = ?')
      .run(w.name, w.level, w.tone, w.emoji, w.image, w.published, id);
  } else {
    const sort = db.prepare('SELECT COALESCE(MAX(sort), -1) + 1 AS n FROM workouts').get().n;
    id = db.prepare('INSERT INTO workouts (name, level, tone, emoji, image, published, sort) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(w.name, w.level, w.tone, w.emoji, w.image, w.published, sort).lastInsertRowid;
  }
  const oldRounds = db.prepare('SELECT id FROM rounds WHERE workout_id = ? ORDER BY sort, id').all(id).map(r => r.id);
  const owned = new Set(db.prepare('SELECT e.id FROM exercises e JOIN rounds r ON r.id = e.round_id WHERE r.workout_id = ?').all(id).map(r => r.id));
  const kept = new Set();
  w.rounds.forEach((r, i) => {
    let rid = oldRounds[i];
    if (rid) db.prepare('UPDATE rounds SET name = ?, focus = ?, sort = ? WHERE id = ?').run(r.name, r.focus, i, rid);
    else rid = db.prepare('INSERT INTO rounds (workout_id, name, focus, sort) VALUES (?, ?, ?, ?)').run(id, r.name, r.focus, i).lastInsertRowid;
    r.exercises.forEach((e, j) => {
      if (e.id && owned.has(e.id) && !kept.has(e.id)) {
        db.prepare('UPDATE exercises SET round_id = ?, name = ?, emoji = ?, detail = ?, kcal = ?, minutes = ?, sort = ? WHERE id = ?')
          .run(rid, e.name, e.emoji, e.detail, e.kcal, e.minutes, j, e.id);
        kept.add(e.id);
      } else {
        kept.add(db.prepare('INSERT INTO exercises (round_id, name, emoji, detail, kcal, minutes, sort) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(rid, e.name, e.emoji, e.detail, e.kcal, e.minutes, j).lastInsertRowid);
      }
    });
  });
  for (const eid of owned) if (!kept.has(eid)) db.prepare('DELETE FROM exercises WHERE id = ?').run(eid);
  for (const rid of oldRounds.slice(w.rounds.length)) db.prepare('DELETE FROM rounds WHERE id = ?').run(rid);
  if (oldImage && oldImage !== w.image) removeImage(oldImage);
  return Number(id);
});

function deleteWorkout(id) {
  const row = db.prepare('SELECT image FROM workouts WHERE id = ?').get(id);
  db.prepare('DELETE FROM workouts WHERE id = ?').run(id);
  if (row) removeImage(row.image);
}

/* ---------- Recipes ---------- */

function listRecipes({ publishedOnly = false } = {}) {
  const recipes = db.prepare(`SELECT * FROM recipes ${publishedOnly ? 'WHERE published = 1' : ''} ORDER BY id`).all();
  const ingredients = db.prepare('SELECT * FROM recipe_ingredients ORDER BY sort, id').all();
  const steps = db.prepare('SELECT * FROM recipe_steps ORDER BY sort, id').all();
  return recipes.map(r => ({
    ...r,
    ingredients: ingredients.filter(i => i.recipe_id === r.id).map(i => ({ name: i.name, amount: i.amount })),
    steps: steps.filter(s => s.recipe_id === r.id).map(s => s.text)
  }));
}
const getRecipe = id => listRecipes().find(r => r.id === id);

function readRecipe(body) {
  const ingredients = v.list(body.ingredients, 'Ingredients', 30).map(i => ({
    name: v.text(i && i.name, 'Ingredient', { max: 80 }), amount: v.optionalText(i.amount, 'Amount', 40)
  }));
  const steps = v.list(body.steps, 'Directions', 20).map(s => v.text(s, 'Each direction', { max: 400 }));
  if (!ingredients.length || !steps.length) v.fail('A recipe needs at least one ingredient and one direction.');
  return {
    name: v.text(body.name, 'Name', { max: 80 }),
    emoji: v.optionalText(body.emoji, 'Emoji', 8) || '🍽️',
    tone: v.oneOf(body.tone, 'Colour', TONES),
    kcal: v.integer(body.kcal, 'Calories', 0, 5000),
    minutes: v.integer(body.minutes ?? 0, 'Minutes', 0, 600),
    protein: v.number(body.protein ?? 0, 'Protein', 0, 500),
    carbs: v.number(body.carbs ?? 0, 'Carbs', 0, 500),
    fat: v.number(body.fat ?? 0, 'Fat', 0, 500),
    image: imagePath(body.image),
    published: v.flag(body.published),
    ingredients, steps
  };
}

const saveRecipe = db.transaction((id, body) => {
  const r = readRecipe(body);
  let oldImage = '';
  const values = [r.name, r.emoji, r.tone, r.kcal, r.minutes, r.protein, r.carbs, r.fat, r.image, r.published];
  if (id) {
    oldImage = db.prepare('SELECT image FROM recipes WHERE id = ?').get(id).image;
    db.prepare('UPDATE recipes SET name = ?, emoji = ?, tone = ?, kcal = ?, minutes = ?, protein = ?, carbs = ?, fat = ?, image = ?, published = ? WHERE id = ?').run(...values, id);
    db.prepare('DELETE FROM recipe_ingredients WHERE recipe_id = ?').run(id);
    db.prepare('DELETE FROM recipe_steps WHERE recipe_id = ?').run(id);
  } else {
    id = db.prepare('INSERT INTO recipes (name, emoji, tone, kcal, minutes, protein, carbs, fat, image, published) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(...values).lastInsertRowid;
  }
  r.ingredients.forEach((i, n) => db.prepare('INSERT INTO recipe_ingredients (recipe_id, name, amount, sort) VALUES (?, ?, ?, ?)').run(id, i.name, i.amount, n));
  r.steps.forEach((text, n) => db.prepare('INSERT INTO recipe_steps (recipe_id, text, sort) VALUES (?, ?, ?)').run(id, text, n));
  if (oldImage && oldImage !== r.image) removeImage(oldImage);
  return Number(id);
});

function deleteRecipe(id) {
  const row = db.prepare('SELECT image FROM recipes WHERE id = ?').get(id);
  db.prepare('DELETE FROM recipes WHERE id = ?').run(id);
  if (row) removeImage(row.image);
}

/* ---------- Plans and settings ---------- */

function listPlans() {
  return db.prepare('SELECT * FROM plans ORDER BY sort, id').all().map(p => ({ ...p, features: JSON.parse(p.features) }));
}
function savePlan(id, body) {
  const features = v.list(body.features, 'Features', 8).map(f => v.text(f, 'Each feature', { max: 80 }));
  db.prepare('UPDATE plans SET name = ?, price = ?, period = ?, tag = ?, featured = ?, features = ? WHERE id = ?').run(
    v.text(body.name, 'Name', { max: 40 }), v.integer(body.price, 'Price', 0, 100000),
    v.oneOf(body.period ?? '', 'Billing period', ['', '/ month', '/ year']), v.optionalText(body.tag, 'Label', 24),
    v.flag(body.featured), JSON.stringify(features), id);
}

function getSettings() {
  const rows = Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map(r => [r.key, r.value]));
  return { announcement: rows.announcement || '', signupsOpen: rows.signups_open !== '0' };
}
function saveSettings(body) {
  const set = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  set.run('announcement', v.optionalText(body.announcement, 'Announcement', 200));
  set.run('signups_open', v.flag(body.signupsOpen) ? '1' : '0');
}

module.exports = {
  listFoods, saveFood, listWorkouts, getWorkout, saveWorkout, deleteWorkout,
  listRecipes, getRecipe, saveRecipe, deleteRecipe, listPlans, savePlan, getSettings, saveSettings
};
