// Demo data: plans, foods, workouts, recipes, one admin and a set of example users with a
// week of history, so the app and the admin statistics have something to show.
//   npm run seed   deletes everything and fills the database again
// The server also calls seedIfEmpty() on start, so a brand-new database is never blank.
const bcrypt = require('bcrypt');
const db = require('./database');
const { localDate, daysAgo } = require('../utils/dates');

const COST = Number(process.env.BCRYPT_COST) || 10;
const DEMO_ADMIN = { email: 'admin@kinetic.test', password: 'Admin123!' };
const DEMO_USER = { email: 'nadia@example.com', password: 'Student123!' };

const PLANS = [
  ['free', 'Free', 0, '', '', 0, ['Food diary with calorie budget', 'Steps and water tracking', 'Four guided workouts']],
  ['monthly', 'Pro monthly', 299, '/ month', 'Most popular', 1, ['Everything in Free', 'Weekly diet meal plans', 'Unlimited workout videos', 'Advice from trainers']],
  ['yearly', 'Pro yearly', 2499, '/ year', '', 0, ['Everything in Pro monthly', 'Saves ৳1,089 a year', 'Printable progress report']]
];

// name, emoji, serving, kcal, protein, carbs, fat
const FOODS = [
  ['White rice', '🍚', '1 cup cooked', 205, 4, 45, 0], ['Brown rice', '🍚', '1 cup cooked', 215, 5, 45, 2],
  ['Roti', '🫓', '1 piece', 120, 4, 22, 2], ['Paratha', '🫓', '1 piece', 260, 5, 36, 11],
  ['Masoor dal', '🥣', '1 cup', 180, 12, 30, 2], ['Khichuri', '🍲', '1 plate', 320, 11, 52, 8],
  ['Chicken curry', '🍗', '1 serving', 240, 24, 6, 13], ['Fish and vegetable curry', '🐟', '1 serving', 220, 22, 8, 11],
  ['Beef bhuna', '🥘', '1 serving', 310, 26, 5, 20], ['Mixed vegetable bhaji', '🥬', '1 cup', 110, 3, 12, 6],
  ['Egg omelette', '🍳', '2 eggs', 190, 13, 1, 15], ['Boiled egg', '🥚', '1 egg', 78, 6, 1, 5],
  ['Grilled chicken breast', '🍗', '100 g', 165, 31, 0, 4], ['Chicken biryani', '🍛', '1 plate', 480, 22, 58, 17],
  ['Oats with milk', '🥣', '1 bowl', 210, 9, 32, 5], ['Plain yogurt', '🥛', '1 cup', 110, 8, 12, 3],
  ['Milk tea', '☕', '1 cup', 90, 2, 12, 3], ['Banana', '🍌', '1 medium', 105, 1, 27, 0],
  ['Apple', '🍎', '1 medium', 95, 0, 25, 0], ['Mango', '🥭', '1 cup sliced', 100, 1, 25, 1],
  ['Cucumber salad', '🥗', '1 bowl', 60, 2, 9, 2], ['Chickpea salad', '🥗', '1 bowl', 230, 11, 30, 7],
  ['Peanuts', '🥜', '1 handful', 160, 7, 5, 14], ['Singara', '🥟', '1 piece', 140, 3, 16, 7],
  ['Whole wheat bread', '🍞', '2 slices', 140, 6, 24, 2], ['Lentil soup', '🍵', '1 bowl', 150, 9, 22, 3]
];

// name, level, tone, emoji, rounds: [name, focus, exercises: [name, emoji, detail, kcal, minutes]]
const WORKOUTS = [
  ['Full-body burner', 'Medium', 'orange', '🔥', [
    ['Round 1', 'Legs and glutes', [['Glute bridge', '🧘', '3 × 15 reps', 28, 4], ['Bodyweight squat', '🏋️', '3 × 12 reps', 36, 4], ['Reverse lunge', '🦵', '3 × 10 each side', 34, 4], ['Hip extension', '🤸', '3 × 12 each side', 26, 3]]],
    ['Round 2', 'Upper body and core', [['Push-up', '💪', '3 × 10 reps', 32, 3], ['Plank', '🧘', '3 × 40 seconds', 22, 3], ['Mountain climber', '🏃', '3 × 30 seconds', 42, 4]]]
  ]],
  ['Core in 15', 'Easy', 'teal', '🧘', [
    ['Round 1', 'Front of the core', [['Dead bug', '🤸', '2 × 12 reps', 18, 3], ['Crunch', '💪', '2 × 15 reps', 20, 3], ['Leg raise', '🦵', '2 × 10 reps', 20, 3]]],
    ['Round 2', 'Sides and back', [['Side plank', '🧘', '2 × 30 seconds each side', 16, 3], ['Bird dog', '🤸', '2 × 10 each side', 16, 3]]]
  ]],
  ['Strong legs', 'Hard', 'purple', '🦵', [
    ['Round 1', 'Strength', [['Jump squat', '🏋️', '4 × 10 reps', 48, 5], ['Walking lunge', '🦵', '4 × 12 steps', 44, 5], ['Single-leg deadlift', '🤸', '3 × 10 each side', 36, 4]]],
    ['Round 2', 'Finisher', [['Wall sit', '🧘', '3 × 45 seconds', 24, 3], ['Calf raise', '🦵', '3 × 20 reps', 20, 3], ['High knees', '🏃', '3 × 30 seconds', 40, 3]]]
  ]],
  ['No-kit cardio', 'Medium', 'yellow', '🏃', [
    ['Round 1', 'Warm up', [['Jumping jack', '🤸', '3 × 40 seconds', 36, 3], ['Butt kick', '🏃', '3 × 30 seconds', 30, 3]]],
    ['Round 2', 'Push the pace', [['Burpee', '💪', '3 × 8 reps', 46, 4], ['Skater jump', '🤸', '3 × 30 seconds', 38, 3], ['Fast feet', '🏃', '3 × 20 seconds', 28, 2]]]
  ]]
];

// name, emoji, tone, kcal, minutes, protein, carbs, fat, ingredients [name, amount], steps
const RECIPES = [
  ['Lemon herb chicken with vegetables', '🍗', 'orange', 340, 30, 38, 14, 14,
    [['Chicken breast', '300 g'], ['Lemon juice', '2 tbsp'], ['Garlic, crushed', '3 cloves'], ['Carrot and beans', '2 cups'], ['Olive oil', '1 tbsp'], ['Black pepper and salt', 'to taste']],
    ['Mix the lemon juice, garlic, oil, pepper and salt. Coat the chicken and leave it for 10 minutes.', 'Cook the chicken in a hot pan for 6 to 7 minutes on each side until no pink remains.', 'Steam or stir-fry the vegetables for 5 minutes so they stay crisp.', 'Slice the chicken and serve it over the vegetables.']],
  ['Masoor dal with spinach', '🥣', 'yellow', 260, 25, 16, 38, 5,
    [['Red lentils (masoor)', '1 cup'], ['Spinach, chopped', '2 cups'], ['Onion, sliced', '1 small'], ['Turmeric', '½ tsp'], ['Garlic', '2 cloves'], ['Mustard oil', '1 tsp']],
    ['Rinse the lentils and boil them with turmeric and 3 cups of water for 15 minutes.', 'Fry the onion and garlic in the oil until golden.', 'Stir the spinach and the fried onion into the lentils.', 'Simmer for 5 minutes, add salt, and serve hot.']],
  ['Banana peanut oats', '🥣', 'purple', 320, 10, 12, 48, 10,
    [['Rolled oats', '½ cup'], ['Milk', '1 cup'], ['Banana', '1 medium'], ['Peanut butter', '1 tbsp'], ['Cinnamon', 'a pinch']],
    ['Simmer the oats in the milk for 5 minutes, stirring now and then.', 'Mash half the banana into the pot.', 'Pour into a bowl and top with the rest of the banana, the peanut butter and cinnamon.']],
  ['Grilled fish with cucumber salad', '🐟', 'teal', 290, 20, 34, 9, 13,
    [['Fish fillet (rui or tilapia)', '250 g'], ['Cucumber', '1 large'], ['Tomato', '1 medium'], ['Lemon', '½'], ['Coriander leaves', 'a handful'], ['Oil', '2 tsp']],
    ['Rub the fish with salt, pepper and half the lemon juice.', 'Grill or pan-fry for 4 minutes on each side.', 'Chop the cucumber, tomato and coriander and dress with the remaining lemon juice.', 'Serve the fish with the salad on the side.']],
  ['Chickpea salad bowl', '🥗', 'teal', 310, 15, 14, 42, 9,
    [['Boiled chickpeas', '1½ cups'], ['Onion, chopped', '1 small'], ['Green chilli', '1'], ['Cucumber, diced', '1 cup'], ['Lemon juice', '1 tbsp'], ['Roasted cumin powder', '½ tsp']],
    ['Put the chickpeas, onion, chilli and cucumber in a bowl.', 'Add the lemon juice, cumin and salt.', 'Toss well and eat straight away.']],
  ['Egg and vegetable fried rice', '🍳', 'orange', 380, 20, 16, 52, 12,
    [['Cooked brown rice', '1½ cups'], ['Eggs', '2'], ['Peas and carrot', '1 cup'], ['Spring onion', '2 stalks'], ['Soy sauce', '1 tbsp'], ['Oil', '2 tsp']],
    ['Scramble the eggs in half the oil and set them aside.', 'Stir-fry the vegetables in the remaining oil for 3 minutes.', 'Add the rice and soy sauce and fry for 3 minutes more.', 'Fold the eggs and spring onion through and serve.']]
];

// name, email, gender, age, height, weight, goal, plan slug, joined (days ago), status
const USERS = [
  ['Nadia Rahman', DEMO_USER.email, 'female', 24, 160, 58, 'maintain', 'free', 13, 'active'],
  ['Tanvir Hasan', 'tanvir@example.com', 'male', 22, 172, 74, 'lose', 'monthly', 12, 'active'],
  ['Sadia Islam', 'sadia@example.com', 'female', 21, 157, 52, 'gain', 'free', 11, 'active'],
  ['Rafi Chowdhury', 'rafi@example.com', 'male', 25, 178, 82, 'lose', 'yearly', 9, 'active'],
  ['Mim Akter', 'mim@example.com', 'female', 23, 162, 61, 'maintain', 'monthly', 8, 'active'],
  ['Arif Hossain', 'arif@example.com', 'male', 27, 169, 70, 'maintain', 'free', 6, 'active'],
  ['Farhana Yasmin', 'farhana@example.com', 'female', 26, 155, 66, 'lose', 'monthly', 5, 'active'],
  ['Shuvo Das', 'shuvo@example.com', 'male', 20, 175, 63, 'gain', 'free', 4, 'suspended'],
  ['Ishrat Jahan', 'ishrat@example.com', 'female', 22, 164, 57, 'maintain', 'free', 2, 'active'],
  ['Imran Khan', 'imran@example.com', 'male', 24, 180, 88, 'lose', 'yearly', 1, 'active'],
  ['Tasnim Alam', 'tasnim@example.com', 'female', 19, 158, 50, 'maintain', 'free', 0, 'active']
];

// Small repeatable random number generator, so every seed gives the same demo data.
function makeRandom(seed) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}

function seed() {
  const rand = makeRandom(7);
  const pick = list => list[Math.floor(rand() * list.length)];
  const run = db.transaction(() => {
    for (const t of ['audit_log', 'exercise_logs', 'meal_items', 'days', 'users', 'recipe_steps', 'recipe_ingredients', 'recipes', 'exercises', 'rounds', 'workouts', 'foods', 'plans', 'settings']) {
      db.prepare(`DELETE FROM ${t}`).run();
    }

    const addPlan = db.prepare('INSERT INTO plans (slug, name, price, period, tag, featured, features, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    PLANS.forEach((p, i) => addPlan.run(p[0], p[1], p[2], p[3], p[4], p[5], JSON.stringify(p[6]), i));
    const planId = Object.fromEntries(db.prepare('SELECT slug, id FROM plans').all().map(r => [r.slug, r.id]));

    const addFood = db.prepare('INSERT INTO foods (name, emoji, serving, kcal, protein, carbs, fat) VALUES (?, ?, ?, ?, ?, ?, ?)');
    FOODS.forEach(f => addFood.run(...f));
    const foods = db.prepare('SELECT * FROM foods').all();

    const addWorkout = db.prepare('INSERT INTO workouts (name, level, tone, emoji, sort) VALUES (?, ?, ?, ?, ?)');
    const addRound = db.prepare('INSERT INTO rounds (workout_id, name, focus, sort) VALUES (?, ?, ?, ?)');
    const addExercise = db.prepare('INSERT INTO exercises (round_id, name, emoji, detail, kcal, minutes, sort) VALUES (?, ?, ?, ?, ?, ?, ?)');
    WORKOUTS.forEach(([name, level, tone, emoji, rounds], i) => {
      const wid = addWorkout.run(name, level, tone, emoji, i).lastInsertRowid;
      rounds.forEach(([rname, focus, exercises], j) => {
        const rid = addRound.run(wid, rname, focus, j).lastInsertRowid;
        exercises.forEach((e, k) => addExercise.run(rid, ...e, k));
      });
    });
    const exerciseIds = db.prepare('SELECT id FROM exercises').all().map(r => r.id);

    const addRecipe = db.prepare('INSERT INTO recipes (name, emoji, tone, kcal, minutes, protein, carbs, fat) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const addIngredient = db.prepare('INSERT INTO recipe_ingredients (recipe_id, name, amount, sort) VALUES (?, ?, ?, ?)');
    const addStep = db.prepare('INSERT INTO recipe_steps (recipe_id, text, sort) VALUES (?, ?, ?)');
    RECIPES.forEach(r => {
      const rid = addRecipe.run(...r.slice(0, 8)).lastInsertRowid;
      r[8].forEach(([n, a], i) => addIngredient.run(rid, n, a, i));
      r[9].forEach((text, i) => addStep.run(rid, text, i));
    });

    const addUser = db.prepare(`INSERT INTO users (name, email, password_hash, role, status, plan_id, gender, age, height, weight, goal, created_at, last_login_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', ?), datetime('now', ?))`);
    addUser.run('Site Admin', DEMO_ADMIN.email, bcrypt.hashSync(DEMO_ADMIN.password, COST), 'admin', 'active', planId.free, 'female', 30, 165, 60, 'maintain', '-20 days', '-1 hours');
    const userHash = bcrypt.hashSync(DEMO_USER.password, COST);

    const addDay = db.prepare('INSERT INTO days (user_id, date, water, steps) VALUES (?, ?, ?, ?)');
    const addItem = db.prepare('INSERT INTO meal_items (user_id, date, meal, food_id, name, emoji, serving, kcal, protein, carbs, fat) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const addLog = db.prepare('INSERT OR IGNORE INTO exercise_logs (user_id, date, exercise_id) VALUES (?, ?, ?)');
    const mealSizes = { breakfast: 2, lunch: 3, dinner: 2, snacks: 1 };

    USERS.forEach(([name, email, gender, age, height, weight, goal, plan, joined, status], u) => {
      const uid = addUser.run(name, email, userHash, 'user', status, planId[plan], gender, age, height, weight, goal, `-${joined} days`, `-${Math.floor(rand() * 40)} hours`).lastInsertRowid;
      for (let ago = Math.min(joined, 6); ago >= 0; ago--) {
        if (u > 0 && rand() < 0.3) continue;                 // most users skip a day now and then
        const date = localDate(daysAgo(ago));
        addDay.run(uid, date, 3 + Math.floor(rand() * 6), 3000 + Math.floor(rand() * 9000));
        for (const [meal, size] of Object.entries(mealSizes)) {
          if (ago === 0 && (meal === 'dinner' || meal === 'snacks')) continue;   // today is still in progress
          for (let i = 0; i < size; i++) {
            const f = pick(foods);
            addItem.run(uid, date, meal, f.id, f.name, f.emoji, f.serving, f.kcal, f.protein, f.carbs, f.fat);
          }
        }
        const start = Math.floor(rand() * exerciseIds.length);
        for (let i = 0; i < Math.floor(rand() * 6); i++) addLog.run(uid, date, exerciseIds[(start + i) % exerciseIds.length]);
      }
    });

    const set = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
    set.run('announcement', 'Welcome to Kinetic. New recipes are added every week.');
    set.run('signups_open', '1');
  });
  run();
}

function seedIfEmpty() {
  if (db.prepare('SELECT COUNT(*) AS n FROM plans').get().n === 0) { seed(); return true; }
  return false;
}

module.exports = { seed, seedIfEmpty, DEMO_ADMIN, DEMO_USER };

if (require.main === module) {
  seed();
  console.log('Database reset with demo data.');
  console.log(`Admin:   ${DEMO_ADMIN.email} / ${DEMO_ADMIN.password}`);
  console.log(`Student: ${DEMO_USER.email} / ${DEMO_USER.password}`);
}
