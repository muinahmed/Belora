/* Kinetic Fitness Tracker – the app a logged-in user sees.
   Plain JavaScript, no libraries. Foods, workouts, recipes and plans come from the server
   (an administrator manages them in the admin panel). Everything the user logs is saved
   to the database through the API in routes/app.js.

   Sections in this file:
   1. Content from the server
   2. State and saving
   3. Calculations (calorie budget, BMI, steps)
   4. Small drawing helpers (rings, photos)
   5. Pages (one function per page)
   6. Dialogs
   7. Weekly chart
   8. Actions (what happens on click / submit)
   9. Start-up and routing */
(function () {
  'use strict';

  /* ================= 1. Content from the server ================= */

  const { api, esc, fmt, icon, toast, resizeImage, fillIcons } = window.K;

  // Filled by applyBootstrap() when the page loads
  let FOODS = [], WORKOUTS = [], RECIPES = [], PLANS = [], ALL_EX = [];
  let USER = null, ANNOUNCEMENT = '';

  const MEALS = [['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['dinner', 'Dinner'], ['snacks', 'Snacks']];
  const TITLES = { home: '', diary: 'Food diary', activity: 'Activity', workout: 'Workouts', recipes: 'Recipes', plans: 'Plans', profile: 'Profile' };
  const WATER_GOAL = 8;
  const ACTIVE_GOAL = 300; // kcal to burn per day

  /* ================= 2. State and saving ================= */

  const pad = n => String(n).padStart(2, '0');
  const dkey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const todayKey = () => dkey(new Date());
  const last7 = () => Array.from({ length: 7 }, (_, i) => dkey(addDays(new Date(), i - 6)));
  let uidN = 0;
  const uid = () => Date.now().toString(36) + (uidN++).toString(36);

  const blankDay = () => ({ meals: { breakfast: [], lunch: [], dinner: [], snacks: [] }, water: 0, steps: 0, done: [] });

  let state = { profile: {}, plan: '', days: {} };
  const ui = { view: 'home', date: todayKey(), workout: null, recipe: null, recipeTab: 'ingredients', metric: 'steps', foodMeal: 'breakfast', foodQuery: '' };

  function day(k) {
    if (!state.days[k]) state.days[k] = blankDay();
    return state.days[k];
  }
  const logKey = () => (ui.view === 'diary' ? ui.date : todayKey());

  // The server uses full names (kcal, protein); the pages use short ones (k, p). These convert.
  const foodIn = f => ({ fid: f.id, n: f.name, e: f.emoji, s: f.serving, k: f.kcal, p: f.protein, c: f.carbs, f: f.fat });
  const itemIn = m => ({ id: 's' + m.id, fid: m.foodId, n: m.name, e: m.emoji, s: m.serving, k: m.kcal, p: m.protein, c: m.carbs, f: m.fat });
  const itemOut = x => ({ foodId: x.fid ?? null, name: x.n, emoji: x.e, serving: x.s, kcal: x.k, protein: x.p, carbs: x.c, fat: x.f });
  const dayOut = d => ({ water: d.water, steps: d.steps, done: d.done, meals: Object.fromEntries(MEALS.map(([m]) => [m, (d.meals[m] || []).map(itemOut)])) });
  const profileOut = p => ({ name: p.name, gender: p.gender, age: p.age, height: p.height, weight: p.weight, activity: p.activity, goal: p.goal, stepGoal: p.stepGoal, photo: p.photo || '' });

  function applyBootstrap(b) {
    USER = b.user;
    ANNOUNCEMENT = b.announcement || '';
    FOODS = b.foods.map(foodIn);
    WORKOUTS = b.workouts.map(w => ({
      id: w.id, name: w.name, level: w.level, tone: 't-' + w.tone, e: w.emoji, image: w.image,
      rounds: w.rounds.map(r => ({ name: r.name, focus: r.focus, ex: r.exercises.map(x => ({ id: x.id, n: x.name, e: x.emoji, d: x.detail, k: x.kcal, m: x.minutes })) }))
    }));
    ALL_EX = WORKOUTS.flatMap(w => w.rounds.flatMap(r => r.ex));
    RECIPES = b.recipes.map(r => ({
      id: r.id, name: r.name, e: r.emoji, tone: 't-' + r.tone, kcal: r.kcal, time: r.minutes, p: r.protein, c: r.carbs, f: r.fat,
      image: r.image, ing: r.ingredients.map(i => [i.name, i.amount]), steps: r.steps
    }));
    PLANS = b.plans.map(p => ({ id: p.slug, name: p.name, price: '৳' + fmt(p.price), per: p.period, featured: !!p.featured, tag: p.tag, features: p.features }));
    state = { profile: b.profile, plan: b.plan, days: {} };
    for (const [k, d] of Object.entries(b.days)) {
      state.days[k] = { water: d.water, steps: d.steps, done: d.done, meals: Object.fromEntries(MEALS.map(([m]) => [m, (d.meals[m] || []).map(itemIn)])) };
    }
    if (!WORKOUTS.some(w => w.id === ui.workout)) ui.workout = WORKOUTS.length ? WORKOUTS[0].id : null;
    rememberSaved();
  }

  // save() sends only what changed since the last save: each edited day, the profile, the plan.
  const EMPTY_DAY = JSON.stringify(dayOut(blankDay()));
  let saved = { days: {}, profile: '', plan: '' };
  function rememberSaved() {
    saved = { days: {}, profile: JSON.stringify(profileOut(state.profile)), plan: state.plan };
    for (const [k, d] of Object.entries(state.days)) saved.days[k] = JSON.stringify(dayOut(d));
  }
  let queue = Promise.resolve();
  function save() {
    const jobs = [];
    for (const [k, d] of Object.entries(state.days)) {
      const json = JSON.stringify(dayOut(d));
      if (json !== (saved.days[k] ?? EMPTY_DAY)) { saved.days[k] = json; jobs.push(() => api('/days/' + k, { method: 'PUT', body: JSON.parse(json) })); }
    }
    const profile = JSON.stringify(profileOut(state.profile));
    if (profile !== saved.profile) { saved.profile = profile; jobs.push(() => api('/profile', { method: 'PUT', body: JSON.parse(profile) })); }
    if (state.plan !== saved.plan) { saved.plan = state.plan; jobs.push(() => api('/plan', { method: 'PUT', body: { plan: state.plan } })); }
    if (!jobs.length) return;
    // One save at a time, in order, so a slow request can never overwrite a newer one.
    queue = queue.then(async () => { for (const job of jobs) await job(); }).catch(err => {
      if (err.status === 401) { location.href = '/auth.html'; return; }
      saved = { days: {}, profile: '', plan: '' };          // forget what was sent, so the next save tries again
      toast('Not saved: ' + err.message);
    });
  }

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
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

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

  // A photo an administrator uploaded, laid over the emoji tile. Nothing when there is none.
  const photo = (src, cls = '') => (src ? `<img class="photo ${cls}" src="${esc(src)}" alt="" loading="lazy">` : '');
  const initial = () => esc((state.profile.name || 'K').trim().charAt(0).toUpperCase());
  const avatarInner = () => {
    const src = state.profile.photo;
    return src && src.startsWith('data:image/') ? `<img src="${esc(src)}" alt="">` : initial();
  };

  const announcement = () => (ANNOUNCEMENT ? `<div class="banner"><span>${esc(ANNOUNCEMENT)}</span></div>` : '');
  const emptyCard = (title, text) => `<section class="card"><h2 style="font-size:18px;font-weight:800;margin-bottom:6px">${title}</h2><p class="sub">${text}</p></section>`;

  const recipeCard = r => `
    <button class="recipe-card" type="button" data-act="open-recipe" data-id="${r.id}">
      <span class="recipe-art art ${r.tone}" aria-hidden="true">${esc(r.e)}${photo(r.image)}</span>
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
      const wex = w ? w.rounds.flatMap(r => r.ex) : [];
      const exCount = wex.length;
      const wk = { kcal: wex.reduce((a, x) => a + x.k, 0), min: wex.reduce((a, x) => a + x.m, 0) };
      const goal = state.profile.stepGoal;
      const active = Math.round(stepStats(d.steps).min + workoutStats(d).min);
      // One exercise from each workout, plus a second from the first
      const popular = WORKOUTS.map(wo => [wo, wo.rounds.flatMap(r => r.ex)[1] || wo.rounds.flatMap(r => r.ex)[0]]).concat(w && wex[4] ? [[w, wex[4]]] : []).filter(([, x]) => x);
      return `
        ${announcement()}
        <div class="home-grid">
          ${w ? `<section class="hero">
            ${photo(w.image, 'hero-photo')}
            <span class="chip">Today's pick</span>
            <h2>${esc(w.name)}</h2>
            <p class="num">${exCount} exercises · ${wk.min} min · ${wk.kcal} kcal</p>
            <button class="btn btn-white" type="button" data-act="open-workout" data-id="${w.id}">Start workout</button>
          </section>` : emptyCard('No workouts yet', 'Workouts will appear here once an administrator adds one.')}
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
            ${popular.map(([wo, x]) => {
              return `<button class="ex-card" type="button" data-act="open-workout" data-id="${wo.id}">
                <span class="thumb ${wo.tone}" aria-hidden="true">${esc(x.e)}</span>
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
      if (!w) return emptyCard('No workouts yet', 'Workouts will appear here once an administrator adds one.');
      const all = w.rounds.flatMap(r => r.ex);
      const done = all.filter(x => d.done.includes(x.id));
      const kcal = all.reduce((n, x) => n + x.k, 0), min = all.reduce((n, x) => n + x.m, 0);
      return `
        <div class="wk-grid">
          <div class="wk-list" role="group" aria-label="Choose a workout">
            ${WORKOUTS.map(x => {
              const ex = x.rounds.flatMap(r => r.ex), n = ex.filter(y => d.done.includes(y.id)).length;
              return `<button class="wk-item" type="button" data-act="open-workout" data-id="${x.id}" aria-pressed="${x.id === w.id}">
                <span class="thumb art ${x.tone}" aria-hidden="true">${esc(x.e)}${photo(x.image)}</span>
                <span class="row-text"><b>${esc(x.name)}</b><span class="num">${esc(x.level)} · ${n}/${ex.length} done</span></span>
              </button>`;
            }).join('')}
          </div>
          <section class="card">
            ${photo(w.image, 'wk-banner')}
            <div class="wk-title">
              <h2>${esc(w.name)}</h2>
              <span class="chip">${esc(w.level)}</span>
            </div>
            <p class="meta num" style="margin-top:8px"><span>${icon('flame', 15)}${kcal} kcal</span><span>${icon('clock', 15)}${min} min</span><span>${icon('dumbbell', 15)}${all.length} exercises</span></p>
            <div class="progress">
              <div class="num"><span>Your progress</span><span>${done.length}/${all.length}</span></div>
              <div class="bar"><i style="width:${done.length / all.length * 100}%"></i></div>
            </div>
            ${w.rounds.map(r => `
              <div class="round">
                <div class="round-head"><span style="font-weight:800;color:var(--ink);font-size:15px">${esc(r.name)}</span><span>${esc(r.focus)}</span></div>
                <div class="rows">
                  ${r.ex.map(x => `<button class="row ex" type="button" data-act="toggle-ex" data-id="${x.id}" aria-pressed="${d.done.includes(x.id)}">
                    <span class="thumb ${w.tone}" aria-hidden="true">${esc(x.e)}</span>
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
          ${RECIPES.length ? `<div class="recipe-grid">${RECIPES.map(recipeCard).join('')}</div>` : emptyCard('No recipes yet', 'Recipes will appear here once an administrator adds one.')}`;
      }
      const tab = ui.recipeTab;
      return `
        <button class="link back" type="button" data-act="close-recipe">${icon('back', 16)}All recipes</button>
        <div class="detail">
          <div class="stack">
            <div class="detail-art art ${r.tone}" aria-hidden="true">${esc(r.e)}${photo(r.image)}</div>
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
              ${p.tag ? `<span class="chip">${esc(p.tag)}</span>` : ''}
              <h2>${esc(p.name)}</h2>
              <p class="price num">${esc(p.price)} <small>${esc(p.per)}</small></p>
              <ul>${p.features.map(f => `<li>${icon('check', 16)}<span>${esc(f)}</span></li>`).join('')}</ul>
              <button class="btn ${p.featured ? 'btn-white' : current ? 'btn-ghost' : 'btn-primary'}" type="button" data-act="choose-plan" data-id="${p.id}" ${current ? 'disabled' : ''}>${current ? 'Your current plan' : 'Choose ' + esc(p.name)}</button>
            </section>`;
          }).join('')}
        </div>`;
    },

    profile() {
      const p = state.profile, b = bmi(), t = targets();
      const plan = PLANS.find(x => x.id === state.plan) || PLANS[0] || { name: 'No' };
      const opt = (v, cur, label) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${label}</option>`;
      return `
        <div class="prof-grid">
          <div class="stack">
            <section class="card">
              <div class="prof-head">
                <span class="avatar" aria-hidden="true">${avatarInner()}</span>
                <div><h2>${esc(p.name)}</h2><p class="sub" style="overflow-wrap:anywhere">${esc(p.email)}</p><a class="chip" href="#plans" style="margin-top:6px">${esc(plan.name)} plan</a></div>
              </div>
              <div class="form-actions" style="margin-top:14px">
                <label class="btn btn-sm btn-soft file-btn" for="p-photo">${p.photo ? 'Change photo' : 'Add a profile photo'}<input class="sr-only" id="p-photo" type="file" accept="image/*"></label>
                ${p.photo ? '<button class="btn btn-sm btn-ghost" type="button" data-act="remove-photo">Remove photo</button>' : ''}
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
          <div class="stack">
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
                <button class="btn btn-ghost" type="button" data-act="ask-clear">Clear my logs</button>
              </div>
            </form>
          </section>
          <section class="card">
            <header class="sec-head"><h2>Password and account</h2></header>
            <form data-form="password">
              <div class="form-grid">
                <div class="field"><label for="pw-current">Current password</label><input id="pw-current" name="current" type="password" autocomplete="current-password" required></div>
                <div class="field"><label for="pw-next">New password</label><input id="pw-next" name="next" type="password" autocomplete="new-password" minlength="8" required></div>
              </div>
              <p class="sub" style="margin-top:8px">At least 8 characters, with a letter and a number.</p>
              <div class="form-actions">
                <button class="btn btn-soft" type="submit">Change password</button>
                ${USER.role === 'admin' ? '<a class="btn btn-ghost" href="/admin/">Open admin panel</a>' : ''}
                <button class="btn btn-ghost" type="button" data-act="logout">Log out</button>
              </div>
            </form>
          </section>
          </div>
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
      <span class="thumb" aria-hidden="true">${esc(f.e)}</span>
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
    day(key).meals[meal].push({ id: uid(), fid: food.fid ?? null, n: food.n, e: food.e, s: food.s, k: food.k, p: food.p, c: food.c, f: food.f });
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
    'open-workout'(el) { ui.workout = Number(el.dataset.id); go('workout'); },
    'toggle-ex'(el) {
      const d = day(todayKey()), id = Number(el.dataset.id);
      d.done = d.done.includes(id) ? d.done.filter(x => x !== id) : [...d.done, id];
      save(); render();
      const again = document.querySelector(`[data-act="toggle-ex"][data-id="${id}"]`);
      if (again) again.focus();
    },
    'reset-workout'(el) {
      const w = WORKOUTS.find(x => x.id === Number(el.dataset.id)), ids = w.rounds.flatMap(r => r.ex.map(x => x.id));
      const d = day(todayKey());
      d.done = d.done.filter(x => !ids.includes(x));
      save(); render(); toast('Workout reset');
    },
    'open-recipe'(el) { ui.recipe = Number(el.dataset.id); ui.recipeTab = 'ingredients'; go('recipes'); window.scrollTo(0, 0); },
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
    'remove-photo'() { state.profile.photo = ''; save(); render(); toast('Profile photo removed'); },
    'ask-clear'() {
      openSheet('Clear your logs?', `<p>This removes everything you have logged: your diary, water, steps and finished workouts. Your account and profile stay. It cannot be undone.</p>
        <div class="form-actions" style="margin-top:0">
          <button class="btn btn-orange" type="button" data-act="clear-all">Clear my logs</button>
          <button class="btn btn-ghost" type="button" data-act="close-sheet">Keep them</button>
        </div>`);
    },
    async 'clear-all'() {
      try {
        await api('/data', { method: 'DELETE' });
        state.days = {}; rememberSaved();
        closeSheet(); render(); toast('Your logs were cleared.');
      } catch (err) { toast(err.message); }
    },
    async logout() {
      try { await api('/auth/logout', { method: 'POST' }); } catch (err) { /* leave anyway */ }
      location.href = '/auth.html';
    },
    reload() { location.reload(); }
  };

  function addSteps(n) {
    if (!(n > 0)) return;
    const d = day(todayKey());
    d.steps = Math.min(200000, d.steps + Math.round(n));
    save(); render();
    toast(`Added ${fmt(n)} steps`);
  }

  function setProfilePhoto(file) {
    if (!file || !file.type.startsWith('image/')) { toast('Choose an image file, such as a JPG or PNG.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 192, side = Math.min(img.width, img.height);
        const c = document.createElement('canvas');
        c.width = c.height = size;
        c.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
        state.profile.photo = c.toDataURL('image/jpeg', 0.85);
        save(); render(); toast('Profile photo updated');
      };
      img.onerror = () => toast('That file could not be read as an image. Try a JPG or PNG.');
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
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
        goal: ['lose', 'maintain', 'gain'].includes(f.goal.value) ? f.goal.value : p.goal,
        email: p.email,
        photo: p.photo
      };
      save(); render();
      toast(`Saved. Your budget is ${fmt(budget())} kcal a day.`);
    }
  };

  FORMS.password = async f => {
    try {
      await api('/password', { method: 'PUT', body: { current: f.current.value, next: f.next.value } });
      f.reset(); toast('Password changed.');
    } catch (err) { toast(err.message); }
  };

  /* ================= 9. Start-up and routing ================= */

  function render() {
    const p = state.profile, now = new Date();
    $('#view').innerHTML = PAGES[ui.view]();
    $('#top-title').textContent = ui.view === 'home' ? `Hi, ${p.name}` : TITLES[ui.view];
    $('#top-date').textContent = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    $('#top-avatar').innerHTML = avatarInner();
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

  fillIcons();

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
  document.addEventListener('change', e => {
    if (e.target.id === 'p-photo') setProfilePhoto(e.target.files[0]);
  });
  // A photo that fails to load is removed, leaving the emoji underneath.
  document.addEventListener('error', e => {
    if (e.target.classList && e.target.classList.contains('photo')) e.target.remove();
  }, true);
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
  window.addEventListener('hashchange', () => { if (USER) route(); });

  // Load everything from the server, then show the page. Visitors who are not logged in go to the log in page.
  (async function start() {
    try {
      applyBootstrap(await api('/bootstrap'));
    } catch (err) {
      if (err.status === 401) { location.replace('/auth.html'); return; }
      $('#view').innerHTML = `<section class="card"><h2 style="font-size:18px;font-weight:800;margin-bottom:6px">Kinetic could not load</h2><p class="sub">${esc(err.message)}</p><div class="form-actions"><button class="btn btn-primary" type="button" data-act="reload">Try again</button></div></section>`;
      return;
    }
    const adminLink = $('#admin-link');
    if (adminLink) adminLink.hidden = USER.role !== 'admin';
    route();
  })();
})();
