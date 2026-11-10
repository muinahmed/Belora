/* Kinetic Fitness Tracker
   Plain JavaScript, no libraries. Everything is saved in the browser
   (localStorage), so the site works without a server.

   Sections in this file:
   1. Data (foods, workouts, recipes, plans)
   2. State and storage
   3. Calculations (calorie budget, BMI, steps)
   4. Small drawing helpers (icons, rings)
   5. Pages (one function per page)
   6. Dialogs
   7. Weekly chart
   8. Actions (what happens on click / submit)
   9. Start-up and routing */
(function () {
  'use strict';

  /* ================= 1. Data ================= */

  // name, emoji, serving, kcal, protein g, carbs g, fat g
  const FOODS = [
    ['White rice', '🍚', '1 cup cooked', 205, 4, 45, 0],
    ['Brown rice', '🍚', '1 cup cooked', 215, 5, 45, 2],
    ['Roti', '🫓', '1 piece', 120, 4, 22, 2],
    ['Paratha', '🫓', '1 piece', 260, 5, 36, 11],
    ['Masoor dal', '🥣', '1 cup', 180, 12, 30, 2],
    ['Khichuri', '🍲', '1 plate', 320, 11, 52, 8],
    ['Chicken curry', '🍗', '1 serving', 240, 24, 6, 13],
    ['Fish and vegetable curry', '🐟', '1 serving', 220, 22, 8, 11],
    ['Beef bhuna', '🥘', '1 serving', 310, 26, 5, 20],
    ['Mixed vegetable bhaji', '🥬', '1 cup', 110, 3, 12, 6],
    ['Egg omelette', '🍳', '2 eggs', 190, 13, 1, 15],
    ['Boiled egg', '🥚', '1 egg', 78, 6, 1, 5],
    ['Grilled chicken breast', '🍗', '100 g', 165, 31, 0, 4],
    ['Chicken biryani', '🍛', '1 plate', 480, 22, 58, 17],
    ['Oats with milk', '🥣', '1 bowl', 210, 9, 32, 5],
    ['Plain yogurt', '🥛', '1 cup', 110, 8, 12, 3],
    ['Milk tea', '☕', '1 cup', 90, 2, 12, 3],
    ['Banana', '🍌', '1 medium', 105, 1, 27, 0],
    ['Apple', '🍎', '1 medium', 95, 0, 25, 0],
    ['Mango', '🥭', '1 cup sliced', 100, 1, 25, 1],
    ['Cucumber salad', '🥗', '1 bowl', 60, 2, 9, 2],
    ['Chickpea salad', '🥗', '1 bowl', 230, 11, 30, 7],
    ['Peanuts', '🥜', '1 handful', 160, 7, 5, 14],
    ['Singara', '🥟', '1 piece', 140, 3, 16, 7],
    ['Whole wheat bread', '🍞', '2 slices', 140, 6, 24, 2],
    ['Lentil soup', '🍵', '1 bowl', 150, 9, 22, 3]
  ].map(([n, e, s, k, p, c, f]) => ({ n, e, s, k, p, c, f }));

  // Each exercise: id, name, emoji, how much, kcal burned, minutes
  const WORKOUTS = [
    {
      id: 'full', name: 'Full-body burner', level: 'Medium', tone: 't-orange', e: '🔥',
      rounds: [
        { name: 'Round 1', focus: 'Legs and glutes', ex: [
          ['f1', 'Glute bridge', '🧘', '3 × 15 reps', 28, 4],
          ['f2', 'Bodyweight squat', '🏋️', '3 × 12 reps', 36, 4],
          ['f3', 'Reverse lunge', '🦵', '3 × 10 each side', 34, 4],
          ['f4', 'Hip extension', '🤸', '3 × 12 each side', 26, 3]
        ] },
        { name: 'Round 2', focus: 'Upper body and core', ex: [
          ['f5', 'Push-up', '💪', '3 × 10 reps', 32, 3],
          ['f6', 'Plank', '🧘', '3 × 40 seconds', 22, 3],
          ['f7', 'Mountain climber', '🏃', '3 × 30 seconds', 42, 4]
        ] }
      ]
    },
    {
      id: 'core', name: 'Core in 15', level: 'Easy', tone: 't-teal', e: '🧘',
      rounds: [
        { name: 'Round 1', focus: 'Front of the core', ex: [
          ['c1', 'Dead bug', '🤸', '2 × 12 reps', 18, 3],
          ['c2', 'Crunch', '💪', '2 × 15 reps', 20, 3],
          ['c3', 'Leg raise', '🦵', '2 × 10 reps', 20, 3]
        ] },
        { name: 'Round 2', focus: 'Sides and back', ex: [
          ['c4', 'Side plank', '🧘', '2 × 30 seconds each side', 16, 3],
          ['c5', 'Bird dog', '🤸', '2 × 10 each side', 16, 3]
        ] }
      ]
    },
    {
      id: 'legs', name: 'Strong legs', level: 'Hard', tone: 't-purple', e: '🦵',
      rounds: [
        { name: 'Round 1', focus: 'Strength', ex: [
          ['l1', 'Jump squat', '🏋️', '4 × 10 reps', 48, 5],
          ['l2', 'Walking lunge', '🦵', '4 × 12 steps', 44, 5],
          ['l3', 'Single-leg deadlift', '🤸', '3 × 10 each side', 36, 4]
        ] },
        { name: 'Round 2', focus: 'Finisher', ex: [
          ['l4', 'Wall sit', '🧘', '3 × 45 seconds', 24, 3],
          ['l5', 'Calf raise', '🦵', '3 × 20 reps', 20, 3],
          ['l6', 'High knees', '🏃', '3 × 30 seconds', 40, 3]
        ] }
      ]
    },
    {
      id: 'cardio', name: 'No-kit cardio', level: 'Medium', tone: 't-yellow', e: '🏃',
      rounds: [
        { name: 'Round 1', focus: 'Warm up', ex: [
          ['k1', 'Jumping jack', '🤸', '3 × 40 seconds', 36, 3],
          ['k2', 'Butt kick', '🏃', '3 × 30 seconds', 30, 3]
        ] },
        { name: 'Round 2', focus: 'Push the pace', ex: [
          ['k3', 'Burpee', '💪', '3 × 8 reps', 46, 4],
          ['k4', 'Skater jump', '🤸', '3 × 30 seconds', 38, 3],
          ['k5', 'Fast feet', '🏃', '3 × 20 seconds', 28, 2]
        ] }
      ]
    }
  ].map(w => ({
    ...w,
    rounds: w.rounds.map(r => ({ ...r, ex: r.ex.map(([id, n, e, d, k, m]) => ({ id, n, e, d, k, m })) }))
  }));

  const RECIPES = [
    {
      id: 'chicken', name: 'Lemon herb chicken with vegetables', e: '🍗', tone: 't-orange', kcal: 340, time: 30, p: 38, c: 14, f: 14,
      ing: [['Chicken breast', '300 g'], ['Lemon juice', '2 tbsp'], ['Garlic, crushed', '3 cloves'], ['Carrot and beans', '2 cups'], ['Olive oil', '1 tbsp'], ['Black pepper and salt', 'to taste']],
      steps: ['Mix the lemon juice, garlic, oil, pepper and salt. Coat the chicken and leave it for 10 minutes.', 'Cook the chicken in a hot pan for 6 to 7 minutes on each side until no pink remains.', 'Steam or stir-fry the vegetables for 5 minutes so they stay crisp.', 'Slice the chicken and serve it over the vegetables.']
    },
    {
      id: 'dal', name: 'Masoor dal with spinach', e: '🥣', tone: 't-yellow', kcal: 260, time: 25, p: 16, c: 38, f: 5,
      ing: [['Red lentils (masoor)', '1 cup'], ['Spinach, chopped', '2 cups'], ['Onion, sliced', '1 small'], ['Turmeric', '½ tsp'], ['Garlic', '2 cloves'], ['Mustard oil', '1 tsp']],
      steps: ['Rinse the lentils and boil them with turmeric and 3 cups of water for 15 minutes.', 'Fry the onion and garlic in the oil until golden.', 'Stir the spinach and the fried onion into the lentils.', 'Simmer for 5 minutes, add salt, and serve hot.']
    },
    {
      id: 'oats', name: 'Banana peanut oats', e: '🥣', tone: 't-purple', kcal: 320, time: 10, p: 12, c: 48, f: 10,
      ing: [['Rolled oats', '½ cup'], ['Milk', '1 cup'], ['Banana', '1 medium'], ['Peanut butter', '1 tbsp'], ['Cinnamon', 'a pinch']],
      steps: ['Simmer the oats in the milk for 5 minutes, stirring now and then.', 'Mash half the banana into the pot.', 'Pour into a bowl and top with the rest of the banana, the peanut butter and cinnamon.']
    },
    {
      id: 'fish', name: 'Grilled fish with cucumber salad', e: '🐟', tone: 't-teal', kcal: 290, time: 20, p: 34, c: 9, f: 13,
      ing: [['Fish fillet (rui or tilapia)', '250 g'], ['Cucumber', '1 large'], ['Tomato', '1 medium'], ['Lemon', '½'], ['Coriander leaves', 'a handful'], ['Oil', '2 tsp']],
      steps: ['Rub the fish with salt, pepper and half the lemon juice.', 'Grill or pan-fry for 4 minutes on each side.', 'Chop the cucumber, tomato and coriander and dress with the remaining lemon juice.', 'Serve the fish with the salad on the side.']
    },
    {
      id: 'chola', name: 'Chickpea salad bowl', e: '🥗', tone: 't-teal', kcal: 310, time: 15, p: 14, c: 42, f: 9,
      ing: [['Boiled chickpeas', '1½ cups'], ['Onion, chopped', '1 small'], ['Green chilli', '1'], ['Cucumber, diced', '1 cup'], ['Lemon juice', '1 tbsp'], ['Roasted cumin powder', '½ tsp']],
      steps: ['Put the chickpeas, onion, chilli and cucumber in a bowl.', 'Add the lemon juice, cumin and salt.', 'Toss well and eat straight away.']
    },
    {
      id: 'eggrice', name: 'Egg and vegetable fried rice', e: '🍳', tone: 't-orange', kcal: 380, time: 20, p: 16, c: 52, f: 12,
      ing: [['Cooked brown rice', '1½ cups'], ['Eggs', '2'], ['Peas and carrot', '1 cup'], ['Spring onion', '2 stalks'], ['Soy sauce', '1 tbsp'], ['Oil', '2 tsp']],
      steps: ['Scramble the eggs in half the oil and set them aside.', 'Stir-fry the vegetables in the remaining oil for 3 minutes.', 'Add the rice and soy sauce and fry for 3 minutes more.', 'Fold the eggs and spring onion through and serve.']
    }
  ];

  const PLANS = [
    { id: 'free', name: 'Free', price: '৳0', per: '', features: ['Food diary with calorie budget', 'Steps and water tracking', 'Four guided workouts'] },
    { id: 'monthly', name: 'Pro monthly', price: '৳299', per: '/ month', featured: true, tag: 'Most popular', features: ['Everything in Free', 'Weekly diet meal plans', 'Unlimited workout videos', 'Advice from trainers'] },
    { id: 'yearly', name: 'Pro yearly', price: '৳2,499', per: '/ year', features: ['Everything in Pro monthly', 'Saves ৳1,089 a year', 'Printable progress report'] }
  ];

  const MEALS = [['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['dinner', 'Dinner'], ['snacks', 'Snacks']];
  const TITLES = { home: '', diary: 'Food diary', activity: 'Activity', workout: 'Workouts', recipes: 'Recipes', plans: 'Plans', profile: 'Profile' };
  const WATER_GOAL = 8;
  const ACTIVE_GOAL = 300; // kcal to burn per day

  /* ================= 2. State and storage ================= */

  const KEY = 'kinetic.v1';
  const pad = n => String(n).padStart(2, '0');
  const dkey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const todayKey = () => dkey(new Date());
  const last7 = () => Array.from({ length: 7 }, (_, i) => dkey(addDays(new Date(), i - 6)));
  let uidN = 0;
  const uid = () => Date.now().toString(36) + (uidN++).toString(36);

  const blankDay = () => ({ meals: { breakfast: [], lunch: [], dinner: [], snacks: [] }, water: 0, steps: 0, done: [] });
  const item = (i) => ({ id: uid(), ...FOODS[i] });

  // Example data so the first visit shows a working app.
  function sampleState() {
    const days = {};
    const steps = [7420, 9860, 4310, 8240, 11020, 6150, 5340];
    const water = [6, 8, 5, 7, 8, 6, 4];
    const menus = [
      [[14, 17], [0, 4, 6], [2, 9, 11], [18]],
      [[24, 11, 16], [5, 20], [2, 7], [15]],
      [[3, 10, 16], [13], [0, 4, 9], [23]],
      [[14, 18], [0, 7, 9], [25, 24], [17]],
      [[24, 10], [1, 12, 20], [2, 4, 9], [19]],
      [[14, 17, 11], [0, 6], [21], [16, 22]],
      [[14, 17, 16], [0, 4, 7], [], []]
    ];
    const done = [['f1', 'f2', 'f3', 'f4', 'f5'], ['c1', 'c2', 'c3', 'c4', 'c5'], [], ['k1', 'k2', 'k3'], ['l1', 'l2', 'l3', 'l4', 'l5', 'l6'], ['c1', 'c2'], ['f1', 'f2', 'f3']];
    last7().forEach((k, i) => {
      const d = blankDay();
      MEALS.forEach(([m], j) => { d.meals[m] = menus[i][j].map(item); });
      d.steps = steps[i]; d.water = water[i]; d.done = done[i];
      days[k] = d;
    });
    return {
      sample: true, plan: 'free', days,
      profile: { name: 'Nadia', gender: 'female', age: 24, height: 160, weight: 58, activity: 1.375, goal: 'maintain', stepGoal: 8000 }
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && s.profile && s.days) return s;
      }
    } catch (e) { /* storage blocked or bad data: fall back to the sample */ }
    return sampleState();
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* the page still works without saving */ }
  }

  let state = load();
  const ui = { view: 'home', date: todayKey(), workout: 'full', recipe: null, recipeTab: 'ingredients', metric: 'steps', foodMeal: 'breakfast', foodQuery: '' };

  function day(k) {
    if (!state.days[k]) state.days[k] = blankDay();
    const d = state.days[k];
    if (!d.done) d.done = [];
    return d;
  }
  const logKey = () => (ui.view === 'diary' ? ui.date : todayKey());

  /* ================= 3. Calculations ================= */

  // Daily calorie budget: Mifflin-St Jeor resting energy x activity level, adjusted for the goal.
  function budget() {
    const p = state.profile;
    const bmr = 10 * p.weight + 6.25 * p.height - 5 * p.age + (p.gender === 'male' ? 5 : -161);
    const goal = p.goal === 'lose' ? -500 : p.goal === 'gain' ? 300 : 0;
    return Math.max(1200, Math.round((bmr * p.activity + goal) / 10) * 10);
  }
  // Macro targets: 25% protein, 50% carbs, 25% fat (4, 4 and 9 kcal per gram).
  function targets() {
    const b = budget();
    return { p: Math.round(b * 0.25 / 4), c: Math.round(b * 0.5 / 4), f: Math.round(b * 0.25 / 9) };
  }
  function eaten(d) {
    const t = { k: 0, p: 0, c: 0, f: 0 };
    MEALS.forEach(([m]) => (d.meals[m] || []).forEach(x => { t.k += x.k; t.p += x.p; t.c += x.c; t.f += x.f; }));
    return t;
  }
  function stepStats(steps) {
    const p = state.profile;
    return {
      km: steps * p.height * 0.415 / 100000,   // stride is about 41.5% of height
      kcal: steps * 0.04 * p.weight / 70,
      min: steps / 110
    };
  }
  const ALL_EX = WORKOUTS.flatMap(w => w.rounds.flatMap(r => r.ex));
  function workoutStats(d) {
    return ALL_EX.filter(x => d.done.includes(x.id)).reduce((t, x) => ({ kcal: t.kcal + x.k, min: t.min + x.m }), { kcal: 0, min: 0 });
  }
  const burned = d => stepStats(d.steps).kcal + workoutStats(d).kcal;
  function bmi() {
    const p = state.profile;
    const v = p.weight / Math.pow(p.height / 100, 2);
    const band = v < 18.5 ? 0 : v < 25 ? 1 : v < 30 ? 2 : 3;
    return { v, band, label: ['Underweight', 'Healthy weight', 'Overweight', 'Obesity'][band] };
  }

  /* ================= 4. Drawing helpers ================= */

  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => Math.round(n).toLocaleString('en-US');
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  const ICONS = {
    home: 'M3 11l9-7 9 7v8a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    diary: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
    plus: 'M12 5v14M5 12h14',
    dumbbell: 'M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11',
    chart: 'M5 20V11M12 20V4M19 20v-6',
    user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20c0-3.3 3.6-6 8-6s8 2.7 8 6',
    bowl: 'M3 11h18a9 9 0 0 1-18 0zM9 3v4M15 3v4',
    star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
    drop: 'M12 3s6 6.3 6 11a6 6 0 0 1-12 0c0-4.7 6-11 6-11z',
    flame: 'M12 3c1 3.5 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3.2 1.8-4.2C9.6 10.4 11.4 8 12 3z',
    clock: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    x: 'M6 6l12 12M18 6L6 18',
    back: 'M15 5l-7 7 7 7',
    steps: 'M3 17l6-6 4 4 8-8M15 7h6v6',
    pin: 'M12 21s7-6.1 7-11a7 7 0 0 0-14 0c0 4.9 7 11 7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'
  };
  const icon = (name, size = 22) =>
    `<svg class="ic" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`;

  // One or more progress rings drawn as SVG circles. rings: [{pct, color}] from the outside in.
  function ringSvg(size, width, rings, label) {
    const mid = size / 2;
    let out = `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(label)}">`;
    rings.forEach((r, i) => {
      const rad = mid - width / 2 - i * (width + 4);
      const len = 2 * Math.PI * rad;
      const p = clamp(r.pct, 0, 1);
      out += `<circle cx="${mid}" cy="${mid}" r="${rad}" fill="none" stroke="var(--track)" stroke-width="${width}"/>`;
      if (p > 0) {
        out += `<circle class="arc" cx="${mid}" cy="${mid}" r="${rad}" fill="none" stroke="${r.color}" stroke-width="${width}" stroke-linecap="round" stroke-dasharray="${(len * p).toFixed(1)} ${len.toFixed(1)}" transform="rotate(-90 ${mid} ${mid})"/>`;
      }
    });
    return out + '</svg>';
  }

  const sampleBanner = () => state.sample
    ? `<div class="banner"><span>You are looking at example data. Clear it to start your own log.</span><button class="btn btn-sm btn-ghost" type="button" data-act="start-fresh">Start fresh</button></div>`
    : '';

  const recipeCard = r => `
    <button class="recipe-card" type="button" data-act="open-recipe" data-id="${r.id}">
      <span class="recipe-art ${r.tone}" aria-hidden="true">${r.e}</span>
      <span class="recipe-info">
        <b>${esc(r.name)}</b>
        <span class="meta num"><span>${icon('flame', 15)}${r.kcal} kcal</span><span>${icon('clock', 15)}${r.time} min</span></span>
      </span>
    </button>`;

  /* ================= 5. Pages ================= */

  const PAGES = {
    home() {
      const d = day(todayKey());
      const e = eaten(d), b = budget(), left = b - e.k;
      const w = WORKOUTS[0];
      const exCount = w.rounds.reduce((n, r) => n + r.ex.length, 0);
      const wk = { kcal: w.rounds.reduce((n, r) => n + r.ex.reduce((a, x) => a + x.k, 0), 0), min: w.rounds.reduce((n, r) => n + r.ex.reduce((a, x) => a + x.m, 0), 0) };
      const goal = state.profile.stepGoal;
      const active = Math.round(stepStats(d.steps).min + workoutStats(d).min);
      const popular = [['full', 'f2'], ['full', 'f5'], ['legs', 'l2'], ['cardio', 'k3'], ['core', 'c4']];
      return `
        ${sampleBanner()}
        <div class="home-grid">
          <section class="hero">
            <span class="chip">Today's pick</span>
            <h2>${esc(w.name)}</h2>
            <p class="num">${exCount} exercises · ${wk.min} min · ${wk.kcal} kcal</p>
            <button class="btn btn-white" type="button" data-act="open-workout" data-id="${w.id}">Start workout</button>
          </section>
          <section class="card">
            <header class="sec-head"><h2>Today's calories</h2><a href="#diary">Open diary</a></header>
            <div class="today-row">
              <div class="ringbox">
                ${ringSvg(132, 12, [{ pct: e.k / b, color: 'var(--c1)' }], `${fmt(e.k)} of ${fmt(b)} kcal eaten`)}
                <div class="ring-mid num"><strong>${fmt(Math.abs(left))}</strong><span>${left >= 0 ? 'kcal left' : 'kcal over'}</span></div>
              </div>
              <dl class="kv num">
                <div><dt>Eaten</dt><dd>${fmt(e.k)} kcal</dd></div>
                <div><dt>Burned</dt><dd>${fmt(burned(d))} kcal</dd></div>
                <div><dt>Budget</dt><dd>${fmt(b)} kcal</dd></div>
              </dl>
            </div>
          </section>
        </div>

        <div class="tiles">
          <a class="tile" href="#activity">
            <span class="tile-head"><span class="thumb t-orange">${icon('steps', 18)}</span>Steps</span>
            <strong class="num">${fmt(d.steps)}</strong>
            <span class="bar"><i style="width:${clamp(d.steps / goal * 100, 0, 100)}%;background:var(--c2)"></i></span>
            <small class="num">of ${fmt(goal)} steps</small>
          </a>
          <div class="tile">
            <span class="tile-head"><span class="thumb t-teal">${icon('drop', 18)}</span>Water</span>
            <strong class="num">${d.water} <small>of ${WATER_GOAL} glasses</small></strong>
            <span class="bar"><i style="width:${clamp(d.water / WATER_GOAL * 100, 0, 100)}%;background:var(--c3)"></i></span>
            <span class="tile-foot"><small>250 ml each</small><button class="btn btn-sm btn-soft" type="button" data-act="water-plus">Add a glass</button></span>
          </div>
          <a class="tile" href="#workout">
            <span class="tile-head"><span class="thumb t-purple">${icon('clock', 18)}</span>Active time</span>
            <strong class="num">${active} <small>min</small></strong>
            <span class="bar"><i style="width:${clamp(active / 60 * 100, 0, 100)}%"></i></span>
            <small>walking and workouts</small>
          </a>
        </div>

        <section>
          <header class="sec-head"><h2>Popular exercises</h2><a href="#workout">View all</a></header>
          <div class="hscroll">
            ${popular.map(([wid, xid]) => {
              const wo = WORKOUTS.find(x => x.id === wid), x = ALL_EX.find(y => y.id === xid);
              return `<button class="ex-card" type="button" data-act="open-workout" data-id="${wid}">
                <span class="thumb ${wo.tone}" aria-hidden="true">${x.e}</span>
                <b>${esc(x.n)}</b>
                <span class="sub">${esc(x.d)}</span>
                <span class="meta num"><span>${icon('flame', 15)}${x.k} kcal</span><span>${icon('clock', 15)}${x.m} min</span></span>
              </button>`;
            }).join('')}
          </div>
        </section>

        <section>
          <header class="sec-head"><h2>Meal ideas</h2><a href="#recipes">All recipes</a></header>
          <div class="recipe-grid">${RECIPES.slice(0, 3).map(recipeCard).join('')}</div>
        </section>`;
    },

    diary() {
      const d = day(ui.date);
      const e = eaten(d), b = budget(), t = targets(), left = b - e.k;
      const macros = [['Protein', e.p, t.p, 'var(--c1)'], ['Carbs', e.c, t.c, 'var(--c2)'], ['Fat', e.f, t.f, 'var(--c3)']];
      return `
        ${sampleBanner()}
        <div class="week" role="group" aria-label="Choose a day">
          ${last7().map(k => {
            const dt = parseKey(k);
            return `<button type="button" data-act="pick-day" data-day="${k}" aria-pressed="${k === ui.date}" aria-label="${dt.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}">
              <span>${dt.toLocaleDateString('en-GB', { weekday: 'short' })}</span><b class="num">${dt.getDate()}</b></button>`;
          }).join('')}
        </div>
        <div class="diary-grid">
          <div class="stack">
            <section class="card">
              <header class="sec-head"><h2>Nutrition</h2><span class="sub num">${fmt(e.k)} of ${fmt(b)} kcal</span></header>
              <div class="macro-row">
                <div class="ringbox">
                  ${ringSvg(150, 10, macros.map(m => ({ pct: m[1] / m[2], color: m[3] })), macros.map(m => `${m[0]} ${fmt(m[1])} of ${m[2]} grams`).join(', '))}
                  <div class="ring-mid num"><strong>${fmt(Math.abs(left))}</strong><span>${left >= 0 ? 'left' : 'over'}</span></div>
                </div>
                <ul class="legend num">
                  ${macros.map(m => `<li><i style="background:${m[3]}"></i><span>${m[0]}</span><b>${fmt(m[1])} / ${m[2]} g</b></li>`).join('')}
                </ul>
              </div>
            </section>
            <section class="card">
              <header class="sec-head"><h2>Water</h2><span class="sub num">${d.water} of ${WATER_GOAL} glasses</span></header>
              <div class="glasses" role="group" aria-label="Glasses of water">
                ${Array.from({ length: WATER_GOAL }, (_, i) => `<button class="glass" type="button" data-act="water-set" data-n="${i + 1}" aria-pressed="${i < d.water}" aria-label="${i + 1} glass${i ? 'es' : ''}">${icon('drop', 16)}</button>`).join('')}
              </div>
            </section>
          </div>
          <div class="stack">
            ${MEALS.map(([m, label]) => {
              const list = d.meals[m] || [];
              const kcal = list.reduce((n, x) => n + x.k, 0);
              return `<section class="card">
                <div class="meal-head">
                  <h3>${label}</h3><span class="sub num">${fmt(kcal)} kcal</span>
                  <button class="btn btn-sm btn-soft" type="button" data-act="add-food" data-meal="${m}">${icon('plus', 16)}Add</button>
                </div>
                ${list.length ? `<ul class="rows">${list.map(x => `
                  <li class="row">
                    <span class="thumb" aria-hidden="true">${esc(x.e)}</span>
                    <span class="row-text"><b>${esc(x.n)}</b><span>${esc(x.s)}</span></span>
                    <span class="kcal num">${fmt(x.k)}</span>
                    <button class="icon-btn" type="button" data-act="del-food" data-meal="${m}" data-id="${x.id}" aria-label="Remove ${esc(x.n)}">${icon('x', 16)}</button>
                  </li>`).join('')}</ul>`
                : `<p class="empty">Nothing logged for ${label.toLowerCase()} yet.</p>`}
              </section>`;
            }).join('')}
          </div>
        </div>`;
    },

    activity() {
      const d = day(todayKey());
      const goal = state.profile.stepGoal;
      const s = stepStats(d.steps), e = eaten(d), w = workoutStats(d);
      const M = METRICS[ui.metric];
      return `
        ${sampleBanner()}
        <div class="act-grid">
          <section class="card steps-card">
            <div class="ringbox">
              ${ringSvg(220, 16, [{ pct: d.steps / goal, color: 'var(--c2)' }], `${fmt(d.steps)} of ${fmt(goal)} steps`)}
              <div class="ring-mid big num"><span>Steps today</span><strong>${fmt(d.steps)}</strong><span>of ${fmt(goal)}</span></div>
            </div>
            <div class="stat3 num">
              <div><b>${s.km.toFixed(2)}</b><span>km</span></div>
              <div><b>${fmt(s.kcal)}</b><span>kcal</span></div>
              <div><b>${fmt(s.min)}</b><span>min</span></div>
            </div>
            <form class="inline-form" data-form="steps">
              <label class="sr-only" for="steps-in">Steps to add</label>
              <input id="steps-in" name="steps" type="number" min="1" max="100000" inputmode="numeric" placeholder="Steps walked" required>
              <button class="btn btn-orange" type="submit">Add steps</button>
            </form>
            <div class="quick">
              ${[500, 1000, 2500].map(n => `<button class="btn btn-sm btn-ghost num" type="button" data-act="steps-plus" data-n="${n}">+${fmt(n)}</button>`).join('')}
            </div>
          </section>
          <div class="stack">
            <div class="tiles">
              <div class="tile"><span class="tile-head"><span class="thumb t-teal">${icon('bowl', 18)}</span>Eaten</span><strong class="num">${fmt(e.k)} <small>kcal</small></strong></div>
              <div class="tile"><span class="tile-head"><span class="thumb t-orange">${icon('flame', 18)}</span>Burned</span><strong class="num">${fmt(burned(d))} <small>kcal</small></strong></div>
              <div class="tile"><span class="tile-head"><span class="thumb t-purple">${icon('dumbbell', 18)}</span>Workouts</span><strong class="num">${w.min} <small>min</small></strong></div>
            </div>
            <section class="card">
              <div class="chart-head">
                <h2 style="font-size:18px;font-weight:800">Last 7 days</h2>
                <div class="seg" role="group" aria-label="Show">
                  ${Object.entries(METRICS).map(([k, m]) => `<button type="button" data-act="metric" data-id="${k}" aria-pressed="${k === ui.metric}">${m.label}</button>`).join('')}
                </div>
              </div>
              <div class="key num">
                <span><i style="background:${M.color}"></i>${M.label} (${M.unit})</span>
                <span><i class="line"></i>${M.goalName} ${fmt(M.goal())}</span>
              </div>
              <div class="chart-wrap" id="chart"></div>
              <details class="table"><summary>View as table</summary><div class="table-scroll" id="chart-table"></div></details>
            </section>
          </div>
        </div>`;
    },

    workout() {
      const d = day(todayKey());
      const w = WORKOUTS.find(x => x.id === ui.workout) || WORKOUTS[0];
      const all = w.rounds.flatMap(r => r.ex);
      const done = all.filter(x => d.done.includes(x.id));
      const kcal = all.reduce((n, x) => n + x.k, 0), min = all.reduce((n, x) => n + x.m, 0);
      return `
        ${sampleBanner()}
        <div class="wk-grid">
          <div class="wk-list" role="group" aria-label="Choose a workout">
            ${WORKOUTS.map(x => {
              const ex = x.rounds.flatMap(r => r.ex), n = ex.filter(y => d.done.includes(y.id)).length;
              return `<button class="wk-item" type="button" data-act="open-workout" data-id="${x.id}" aria-pressed="${x.id === w.id}">
                <span class="thumb ${x.tone}" aria-hidden="true">${x.e}</span>
                <span class="row-text"><b>${esc(x.name)}</b><span class="num">${x.level} · ${n}/${ex.length} done</span></span>
              </button>`;
            }).join('')}
          </div>
          <section class="card">
            <div class="wk-title">
              <h2>${esc(w.name)}</h2>
              <span class="chip">${w.level}</span>
            </div>
            <p class="meta num" style="margin-top:8px"><span>${icon('flame', 15)}${kcal} kcal</span><span>${icon('clock', 15)}${min} min</span><span>${icon('dumbbell', 15)}${all.length} exercises</span></p>
            <div class="progress">
              <div class="num"><span>Your progress</span><span>${done.length}/${all.length}</span></div>
              <div class="bar"><i style="width:${done.length / all.length * 100}%"></i></div>
            </div>
            ${w.rounds.map(r => `
              <div class="round">
                <div class="round-head"><span style="font-weight:800;color:var(--ink);font-size:15px">${r.name}</span><span>${esc(r.focus)}</span></div>
                <div class="rows">
                  ${r.ex.map(x => `<button class="row ex" type="button" data-act="toggle-ex" data-id="${x.id}" aria-pressed="${d.done.includes(x.id)}">
                    <span class="thumb ${w.tone}" aria-hidden="true">${x.e}</span>
                    <span class="row-text"><b>${esc(x.n)}</b><span class="num">${esc(x.d)} · ${x.k} kcal</span></span>
                    <span class="tick">${icon('check', 16)}</span>
                  </button>`).join('')}
                </div>
              </div>`).join('')}
            ${done.length === all.length
              ? `<p class="done-note num">Workout complete. You burned about ${kcal} kcal in ${min} minutes.</p>`
              : `<p class="sub" style="margin-top:16px">Tap an exercise when you finish it. Burned calories are added to today's activity.</p>`}
            ${done.length ? `<div class="form-actions"><button class="btn btn-ghost btn-sm" type="button" data-act="reset-workout" data-id="${w.id}">Reset this workout</button></div>` : ''}
          </section>
        </div>`;
    },

    recipes() {
      const r = RECIPES.find(x => x.id === ui.recipe);
      if (!r) {
        return `<p class="sub" style="max-width:60ch">Balanced meals between 260 and 380 kcal a serving. Open one to see the ingredients, then add it to your diary.</p>
          <div class="recipe-grid">${RECIPES.map(recipeCard).join('')}</div>`;
      }
      const tab = ui.recipeTab;
      return `
        <button class="link back" type="button" data-act="close-recipe">${icon('back', 16)}All recipes</button>
        <div class="detail">
          <div class="stack">
            <div class="detail-art ${r.tone}" aria-hidden="true">${r.e}</div>
            <section class="card">
              <h2>${esc(r.name)}</h2>
              <p class="meta num" style="margin:8px 0 16px"><span>${icon('flame', 15)}${r.kcal} kcal</span><span>${icon('clock', 15)}${r.time} min</span></p>
              <div class="stat3 num">
                <div><b>${r.p} g</b><span>Protein</span></div>
                <div><b>${r.c} g</b><span>Carbs</span></div>
                <div><b>${r.f} g</b><span>Fat</span></div>
              </div>
            </section>
          </div>
          <div class="stack">
            <section class="card">
              <div class="seg" role="group" aria-label="Recipe section" style="margin-bottom:14px">
                <button type="button" data-act="recipe-tab" data-id="ingredients" aria-pressed="${tab === 'ingredients'}">Ingredients</button>
                <button type="button" data-act="recipe-tab" data-id="directions" aria-pressed="${tab === 'directions'}">Directions</button>
              </div>
              ${tab === 'ingredients'
                ? `<ul class="ing">${r.ing.map(([n, q]) => `<li><b style="font-weight:600">${esc(n)}</b><span>${esc(q)}</span></li>`).join('')}</ul>`
                : `<ol class="steps-list">${r.steps.map(s => `<li><p>${esc(s)}</p></li>`).join('')}</ol>`}
            </section>
            <section class="card">
              <header class="sec-head"><h2>Add to today's diary</h2></header>
              <div class="add-to">
                ${MEALS.map(([m, label]) => `<button class="btn btn-sm btn-soft" type="button" data-act="recipe-add" data-meal="${m}">${label}</button>`).join('')}
              </div>
            </section>
          </div>
        </div>`;
    },

    plans() {
      return `
        <p class="sub" style="max-width:60ch">This is a class project, so choosing a plan only changes what the app shows. No payment is taken.</p>
        <div class="plans">
          ${PLANS.map(p => {
            const current = state.plan === p.id;
            return `<section class="plan${p.featured ? ' featured' : ''}">
              ${p.tag ? `<span class="chip">${p.tag}</span>` : ''}
              <h2>${p.name}</h2>
              <p class="price num">${p.price} <small>${p.per}</small></p>
              <ul>${p.features.map(f => `<li>${icon('check', 16)}<span>${f}</span></li>`).join('')}</ul>
              <button class="btn ${p.featured ? 'btn-white' : current ? 'btn-ghost' : 'btn-primary'}" type="button" data-act="choose-plan" data-id="${p.id}" ${current ? 'disabled' : ''}>${current ? 'Your current plan' : 'Choose ' + p.name}</button>
            </section>`;
          }).join('')}
        </div>`;
    },

    profile() {
      const p = state.profile, b = bmi(), t = targets();
      const plan = PLANS.find(x => x.id === state.plan) || PLANS[0];
      const opt = (v, cur, label) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${label}</option>`;
      return `
        ${sampleBanner()}
        <div class="prof-grid">
          <div class="stack">
            <section class="card">
              <div class="prof-head">
                <span class="avatar" aria-hidden="true">${esc((p.name || 'K').trim().charAt(0).toUpperCase())}</span>
                <div><h2>${esc(p.name)}</h2><a class="chip" href="#plans" style="margin-top:6px">${plan.name} plan</a></div>
              </div>
              <div class="stat3 num" style="margin-top:18px">
                <div><b>${p.weight} kg</b><span>Weight</span></div>
                <div><b>${p.height} cm</b><span>Height</span></div>
                <div><b>${p.age}</b><span>Age</span></div>
              </div>
            </section>
            <section class="card">
              <header class="sec-head"><h2>Body mass index</h2><span class="sub">${b.label}</span></header>
              <p class="num" style="font-size:34px;font-weight:800;letter-spacing:-.02em">${b.v.toFixed(1)}</p>
              <div class="bmi-scale" aria-hidden="true">${[0, 1, 2, 3].map(i => `<span class="${i === b.band ? 'on' : ''}"></span>`).join('')}</div>
              <div class="bmi-labels num" aria-hidden="true"><span>Under 18.5</span><span>18.5 to 24.9</span><span>25 to 29.9</span><span>30 and over</span></div>
            </section>
            <section class="card">
              <header class="sec-head"><h2>Daily targets</h2></header>
              <dl class="kv num">
                <div><dt>Calorie budget</dt><dd>${fmt(budget())} kcal</dd></div>
                <div><dt>Protein</dt><dd>${t.p} g</dd></div>
                <div><dt>Carbs</dt><dd>${t.c} g</dd></div>
                <div><dt>Fat</dt><dd>${t.f} g</dd></div>
                <div><dt>Steps</dt><dd>${fmt(p.stepGoal)}</dd></div>
              </dl>
            </section>
          </div>
          <section class="card">
            <header class="sec-head"><h2>Your details</h2></header>
            <form data-form="profile">
              <div class="form-grid">
                <div class="field"><label for="p-name">Name</label><input id="p-name" name="name" type="text" maxlength="30" value="${esc(p.name)}" required></div>
                <div class="field"><label for="p-gender">Sex</label><select id="p-gender" name="gender">${opt('female', p.gender, 'Female')}${opt('male', p.gender, 'Male')}</select></div>
                <div class="field"><label for="p-age">Age</label><input id="p-age" name="age" type="number" min="13" max="100" value="${p.age}" required></div>
                <div class="field"><label for="p-height">Height (cm)</label><input id="p-height" name="height" type="number" min="100" max="230" value="${p.height}" required></div>
                <div class="field"><label for="p-weight">Weight (kg)</label><input id="p-weight" name="weight" type="number" min="30" max="250" step="0.1" value="${p.weight}" required></div>
                <div class="field"><label for="p-steps">Daily step goal</label><input id="p-steps" name="stepGoal" type="number" min="1000" max="50000" step="500" value="${p.stepGoal}" required></div>
                <div class="field"><label for="p-activity">Activity level</label><select id="p-activity" name="activity">
                  ${opt(1.2, p.activity, 'Mostly sitting')}${opt(1.375, p.activity, 'Lightly active')}${opt(1.55, p.activity, 'Moderately active')}${opt(1.725, p.activity, 'Very active')}</select></div>
                <div class="field"><label for="p-goal">Goal</label><select id="p-goal" name="goal">
                  ${opt('lose', p.goal, 'Lose weight')}${opt('maintain', p.goal, 'Stay the same')}${opt('gain', p.goal, 'Gain weight')}</select></div>
              </div>
              <div class="form-actions">
                <button class="btn btn-primary" type="submit">Save details</button>
                <button class="btn btn-ghost" type="button" data-act="ask-clear">Clear all data</button>
              </div>
            </form>
          </section>
        </div>`;
    }
  };

  /* ================= 6. Dialogs ================= */

  const sheet = () => $('#sheet');
  function openSheet(title, body) {
    const el = sheet();
    el.innerHTML = `<header class="sheet-head"><h2 id="sheet-title">${title}</h2><button class="icon-btn" type="button" data-act="close-sheet" aria-label="Close">${icon('x', 18)}</button></header><div class="sheet-body">${body}</div>`;
    if (!el.open) { if (el.showModal) el.showModal(); else el.setAttribute('open', ''); }
  }
  function closeSheet() {
    const el = sheet();
    if (el.open) { if (el.close) el.close(); else el.removeAttribute('open'); }
  }

  function quickSheet() {
    openSheet('Log something', `<div class="quick-grid">
      <button type="button" data-act="add-food" data-meal="${mealForNow()}"><span class="thumb t-purple">${icon('bowl', 20)}</span>Food</button>
      <button type="button" data-act="water-plus" data-close="1"><span class="thumb t-teal">${icon('drop', 20)}</span>A glass of water</button>
      <button type="button" data-act="go" data-id="activity"><span class="thumb t-orange">${icon('steps', 20)}</span>Steps</button>
      <button type="button" data-act="go" data-id="workout"><span class="thumb t-yellow">${icon('dumbbell', 20)}</span>A workout</button>
    </div>`);
  }
  function mealForNow() {
    const h = new Date().getHours();
    return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : h < 22 ? 'dinner' : 'snacks';
  }

  function foodRows() {
    const q = ui.foodQuery.trim().toLowerCase();
    const list = FOODS.map((f, i) => [f, i]).filter(([f]) => !q || f.n.toLowerCase().includes(q));
    if (!list.length) return `<li class="empty">No food matches “${esc(ui.foodQuery)}”. Add it yourself below.</li>`;
    return list.map(([f, i]) => `<li><button class="row" type="button" data-act="pick-food" data-i="${i}">
      <span class="thumb" aria-hidden="true">${f.e}</span>
      <span class="row-text"><b>${esc(f.n)}</b><span>${esc(f.s)}</span></span>
      <span class="kcal num">${f.k} kcal</span>
    </button></li>`).join('');
  }
  function foodSheet() {
    openSheet('Add food', `
      <div class="seg" role="group" aria-label="Meal">
        ${MEALS.map(([m, label]) => `<button type="button" data-act="food-meal" data-meal="${m}" aria-pressed="${m === ui.foodMeal}">${label}</button>`).join('')}
      </div>
      <div class="field"><label for="food-q">Search foods</label><input id="food-q" type="search" placeholder="Try rice, dal or egg" value="${esc(ui.foodQuery)}" autocomplete="off"></div>
      <ul class="food-list" id="food-list">${foodRows()}</ul>
      <details class="custom"><summary>Add your own food</summary>
        <form data-form="custom-food">
          <div class="field"><label for="cf-name">Name</label><input id="cf-name" name="name" type="text" maxlength="40" required></div>
          <div class="form-grid" style="grid-template-columns:repeat(2,minmax(0,1fr))">
            <div class="field"><label for="cf-kcal">Calories (kcal)</label><input id="cf-kcal" name="kcal" type="number" min="1" max="5000" required></div>
            <div class="field"><label for="cf-p">Protein (g)</label><input id="cf-p" name="p" type="number" min="0" max="500" value="0"></div>
            <div class="field"><label for="cf-c">Carbs (g)</label><input id="cf-c" name="c" type="number" min="0" max="500" value="0"></div>
            <div class="field"><label for="cf-f">Fat (g)</label><input id="cf-f" name="f" type="number" min="0" max="500" value="0"></div>
          </div>
          <button class="btn btn-primary" type="submit">Add food</button>
        </form>
      </details>
      <button class="btn btn-ghost btn-block" type="button" data-act="close-sheet">Done</button>`);
  }

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  /* ================= 7. Weekly chart ================= */

  const METRICS = {
    steps: { label: 'Steps', unit: 'steps', color: 'var(--c2)', goalName: 'Goal', goal: () => state.profile.stepGoal, value: d => d.steps },
    eaten: { label: 'Eaten', unit: 'kcal', color: 'var(--c1)', goalName: 'Budget', goal: () => budget(), value: d => eaten(d).k },
    burned: { label: 'Burned', unit: 'kcal', color: 'var(--c3)', goalName: 'Goal', goal: () => ACTIVE_GOAL, value: d => Math.round(burned(d)) }
  };

  // Round the top of the axis up to a clean number and return 4 even steps.
  function niceAxis(max) {
    const rough = max / 4, pow = Math.pow(10, Math.floor(Math.log10(rough)));
    const step = [1, 2, 2.5, 5, 10].map(m => m * pow).find(s => s >= rough);
    return { step, top: step * Math.ceil(max / step) };
  }

  function drawChart() {
    const box = $('#chart');
    if (!box) return;
    const M = METRICS[ui.metric];
    const keys = last7();
    const vals = keys.map(k => M.value(day(k)));
    const goal = M.goal();
    const { step, top } = niceAxis(Math.max(goal, ...vals, 1));
    const compact = top >= 10000;
    const tick = v => compact ? (v / 1000) + 'K' : fmt(v);

    const W = Math.max(280, Math.round(box.clientWidth || 600)), H = 230;
    const m = { t: 28, r: 8, b: 30, l: compact ? 40 : 48 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const band = iw / 7, bw = Math.min(24, band * 0.5);
    const y = v => m.t + ih - (v / top) * ih;

    let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${M.label} for the last 7 days">`;
    for (let v = 0; v <= top + 0.001; v += step) {
      svg += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/>`;
      svg += `<text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${tick(v)}</text>`;
    }
    keys.forEach((k, i) => {
      const cx = m.l + band * i + band / 2, x = cx - bw / 2;
      const top_ = y(vals[i]), h = m.t + ih - top_, r = Math.min(4, h);
      const dt = parseKey(k), isToday = i === 6;
      if (h > 0) {
        svg += `<path d="M${x},${m.t + ih} V${top_ + r} Q${x},${top_} ${x + r},${top_} H${x + bw - r} Q${x + bw},${top_} ${x + bw},${top_ + r} V${m.t + ih} Z" fill="${M.color}"/>`;
      }
      if (isToday) svg += `<text x="${cx}" y="${top_ - 8}" text-anchor="middle" style="fill:var(--ink);font-weight:800">${fmt(vals[i])}</text>`;
      svg += `<text x="${cx}" y="${H - 9}" text-anchor="middle"${isToday ? ' style="fill:var(--ink);font-weight:800"' : ''}>${isToday ? 'Today' : dt.toLocaleDateString('en-GB', { weekday: 'short' })}</text>`;
    });
    svg += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(goal)}" y2="${y(goal)}" stroke="var(--ink-2)" stroke-width="2"/>`;
    // Hover and keyboard targets: the whole column, not only the painted bar.
    keys.forEach((k, i) => {
      const dt = parseKey(k).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
      svg += `<rect class="hit" x="${m.l + band * i}" y="${m.t}" width="${band}" height="${ih}" fill="transparent" tabindex="0" data-tip-x="${m.l + band * i + band / 2}" data-tip-y="${y(vals[i])}" data-tip-v="${fmt(vals[i])} ${M.unit}" data-tip-d="${dt}" aria-label="${dt}: ${fmt(vals[i])} ${M.unit}"/>`;
    });
    box.innerHTML = svg + '</svg><div class="tip" hidden><b></b><span></span></div>';

    const table = $('#chart-table');
    if (table) {
      table.innerHTML = `<table class="num"><thead><tr><th>Day</th><th>${M.label} (${M.unit})</th><th>${M.goalName}</th></tr></thead><tbody>${keys.map((k, i) =>
        `<tr><td>${parseKey(k).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</td><td>${fmt(vals[i])}</td><td>${fmt(goal)}</td></tr>`).join('')}</tbody></table>`;
    }
  }
  function showTip(hit) {
    const tip = $('#chart .tip'), svg = $('#chart svg');
    if (!tip || !svg) return;
    const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
    tip.firstChild.textContent = hit.dataset.tipV;
    tip.lastChild.textContent = hit.dataset.tipD;
    tip.style.left = clamp(hit.dataset.tipX * scale, 56, svg.getBoundingClientRect().width - 56) + 'px';
    tip.style.top = Math.max(46, hit.dataset.tipY * scale - 8) + 'px';
    tip.hidden = false;
  }
  function hideTip() { const tip = $('#chart .tip'); if (tip) tip.hidden = true; }

  /* ================= 8. Actions ================= */

  function addFood(food, meal, key) {
    day(key).meals[meal].push({ id: uid(), n: food.n, e: food.e, s: food.s, k: food.k, p: food.p, c: food.c, f: food.f });
    save(); render();
    toast(`Added ${food.n} to ${MEALS.find(m => m[0] === meal)[1].toLowerCase()}`);
  }
  function go(view) {
    if (location.hash === '#' + view) { ui.view = view; render(); }
    else location.hash = view;
  }

  const ACTIONS = {
    'quick-add': quickSheet,
    'close-sheet': closeSheet,
    go(el) { closeSheet(); go(el.dataset.id); },
    'add-food'(el) { ui.foodMeal = el.dataset.meal; ui.foodQuery = ''; foodSheet(); },
    'food-meal'(el) { ui.foodMeal = el.dataset.meal; foodSheet(); },
    'pick-food'(el) { addFood(FOODS[el.dataset.i], ui.foodMeal, logKey()); },
    'del-food'(el) {
      const list = day(ui.date).meals[el.dataset.meal];
      const i = list.findIndex(x => x.id === el.dataset.id);
      if (i > -1) { const [gone] = list.splice(i, 1); save(); render(); toast(`Removed ${gone.n}`); }
    },
    'pick-day'(el) { ui.date = el.dataset.day; render(); },
    'water-set'(el) {
      const d = day(ui.date), n = Number(el.dataset.n);
      d.water = d.water === n ? n - 1 : n;
      save(); render();
    },
    'water-plus'(el) {
      const d = day(todayKey());
      d.water = Math.min(20, d.water + 1);
      save(); render();
      if (el.dataset.close) closeSheet();
      toast(`${d.water} of ${WATER_GOAL} glasses today`);
    },
    'steps-plus'(el) { addSteps(Number(el.dataset.n)); },
    metric(el) { ui.metric = el.dataset.id; render(); },
    'open-workout'(el) { ui.workout = el.dataset.id; go('workout'); },
    'toggle-ex'(el) {
      const d = day(todayKey()), id = el.dataset.id;
      d.done = d.done.includes(id) ? d.done.filter(x => x !== id) : [...d.done, id];
      save(); render();
      const again = document.querySelector(`[data-act="toggle-ex"][data-id="${id}"]`);
      if (again) again.focus();
    },
    'reset-workout'(el) {
      const w = WORKOUTS.find(x => x.id === el.dataset.id), ids = w.rounds.flatMap(r => r.ex.map(x => x.id));
      const d = day(todayKey());
      d.done = d.done.filter(x => !ids.includes(x));
      save(); render(); toast('Workout reset');
    },
    'open-recipe'(el) { ui.recipe = el.dataset.id; ui.recipeTab = 'ingredients'; go('recipes'); window.scrollTo(0, 0); },
    'close-recipe'() { ui.recipe = null; render(); },
    'recipe-tab'(el) { ui.recipeTab = el.dataset.id; render(); },
    'recipe-add'(el) {
      const r = RECIPES.find(x => x.id === ui.recipe);
      if (r) addFood({ n: r.name, e: r.e, s: '1 serving', k: r.kcal, p: r.p, c: r.c, f: r.f }, el.dataset.meal, todayKey());
    },
    'choose-plan'(el) {
      state.plan = el.dataset.id; save(); render();
      toast(`${PLANS.find(p => p.id === state.plan).name} selected. No payment was taken.`);
    },
    'start-fresh'() {
      state = { ...state, sample: false, days: {} };
      save(); render(); toast('Example data cleared. Your log starts now.');
    },
    'ask-clear'() {
      openSheet('Clear all data?', `<p>This removes your profile, diary, steps and workouts from this browser. It cannot be undone.</p>
        <div class="form-actions" style="margin-top:0">
          <button class="btn btn-orange" type="button" data-act="clear-all">Clear everything</button>
          <button class="btn btn-ghost" type="button" data-act="close-sheet">Keep my data</button>
        </div>`);
    },
    'clear-all'() {
      try { localStorage.removeItem(KEY); } catch (e) { /* nothing stored */ }
      state = sampleState();
      closeSheet(); render(); toast('Everything cleared. Example data is back.');
    }
  };

  function addSteps(n) {
    if (!(n > 0)) return;
    const d = day(todayKey());
    d.steps = Math.min(200000, d.steps + Math.round(n));
    save(); render();
    toast(`Added ${fmt(n)} steps`);
  }

  const FORMS = {
    steps(f) { addSteps(Number(f.steps.value)); },
    'custom-food'(f) {
      const name = f.name.value.trim();
      const kcal = Number(f.kcal.value);
      if (!name || !(kcal > 0)) return;
      addFood({ n: name, e: '🍽️', s: 'Your own food', k: kcal, p: Number(f.p.value) || 0, c: Number(f.c.value) || 0, f: Number(f.f.value) || 0 }, ui.foodMeal, logKey());
      f.reset();
    },
    profile(f) {
      const num = (el, lo, hi, fallback) => { const v = Number(el.value); return v >= lo && v <= hi ? v : fallback; };
      const p = state.profile;
      state.profile = {
        name: f.name.value.trim() || p.name,
        gender: f.gender.value === 'male' ? 'male' : 'female',
        age: num(f.age, 13, 100, p.age),
        height: num(f.height, 100, 230, p.height),
        weight: num(f.weight, 30, 250, p.weight),
        stepGoal: num(f.stepGoal, 1000, 50000, p.stepGoal),
        activity: num(f.activity, 1.2, 1.725, p.activity),
        goal: ['lose', 'maintain', 'gain'].includes(f.goal.value) ? f.goal.value : p.goal
      };
      save(); render();
      toast(`Saved. Your budget is ${fmt(budget())} kcal a day.`);
    }
  };

  /* ================= 9. Start-up and routing ================= */

  function render() {
    const p = state.profile, now = new Date();
    $('#view').innerHTML = PAGES[ui.view]();
    $('#top-title').textContent = ui.view === 'home' ? `Hi, ${p.name}` : TITLES[ui.view];
    $('#top-date').textContent = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    $('#top-avatar').textContent = (p.name || 'K').trim().charAt(0).toUpperCase();
    document.title = (ui.view === 'home' ? '' : TITLES[ui.view] + ' · ') + 'Kinetic Fitness Tracker';
    document.querySelectorAll('[data-nav]').forEach(a => {
      if (a.dataset.nav === ui.view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    drawChart();
  }

  function route() {
    const name = location.hash.replace('#', '');
    const next = PAGES[name] ? name : 'home';
    if (next !== ui.view) { window.scrollTo(0, 0); if (next === 'recipes' && ui.view !== 'home') ui.recipe = null; }
    if (next === 'diary' && ui.view !== 'diary') ui.date = todayKey();
    ui.view = next;
    render();
  }

  document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });

  document.addEventListener('click', e => {
    if (e.target === sheet()) { closeSheet(); return; }   // click on the dark backdrop
    if (ui.view === 'recipes' && ui.recipe && e.target.closest('[data-nav="recipes"]')) { ui.recipe = null; render(); return; }
    const el = e.target.closest('[data-act]');
    if (el && ACTIONS[el.dataset.act]) ACTIONS[el.dataset.act](el, e);
  });
  document.addEventListener('submit', e => {
    const f = e.target.closest('[data-form]');
    if (!f) return;
    e.preventDefault();
    FORMS[f.dataset.form](f);
  });
  document.addEventListener('input', e => {
    if (e.target.id === 'food-q') { ui.foodQuery = e.target.value; $('#food-list').innerHTML = foodRows(); }
  });
  ['pointerover', 'focusin'].forEach(t => document.addEventListener(t, e => {
    if (e.target.classList && e.target.classList.contains('hit')) showTip(e.target);
  }));
  ['pointerout', 'focusout'].forEach(t => document.addEventListener(t, e => {
    if (e.target.classList && e.target.classList.contains('hit')) hideTip();
  }));
  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(drawChart, 120); });
  window.addEventListener('hashchange', route);
  route();
})();
