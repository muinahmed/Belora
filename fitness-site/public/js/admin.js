/* Kinetic admin panel. One page; the part after # in the address picks the section.
   Every change goes through the admin API in routes/admin.js.

   Sections in this file:
   1. Helpers (dates, badges, dialogs, photo picker, chart)
   2. Dashboard
   3. Users
   4. Foods
   5. Workouts
   6. Recipes
   7. Plans
   8. Activity log and site settings
   9. Start-up and routing */
(function () {
  'use strict';
  const { api, esc, fmt, icon, toast, resizeImage, fillIcons } = window.K;
  const $ = (s, r = document) => r.querySelector(s);
  const view = $('#adm-view'), actions = $('#adm-actions'), modal = $('#modal');
  let me = null;
  let plans = [];

  /* ================= 1. Helpers ================= */

  // The database stores UTC times as "2026-01-31 09:30:00"
  const toDate = s => new Date(String(s).replace(' ', 'T') + 'Z');
  const dateOnly = s => (s ? toDate(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Never');
  const dateTime = s => (s ? toDate(s).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Never');
  const dayLabel = (key, opts) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-GB', opts); };
  const badge = (text, tone = '') => `<span class="badge ${tone}">${esc(text)}</span>`;
  const options = (list, current) => list.map(([value, label]) => `<option value="${esc(value)}" ${String(value) === String(current) ? 'selected' : ''}>${esc(label)}</option>`).join('');
  const TONES = [['purple', 'Purple'], ['orange', 'Orange'], ['teal', 'Teal'], ['yellow', 'Yellow']];
  const field = (label, id, input, hint = '') => `<div class="field"><label for="${id}">${label}</label>${input}${hint ? `<span class="hint">${hint}</span>` : ''}</div>`;
  const input = (id, name, value = '', attrs = 'type="text"') => `<input id="${id}" name="${name}" value="${esc(value)}" ${attrs}>`;
  const iconBtn = (act, id, name, label, cls = '') => `<button class="icon-btn ${cls}" type="button" data-act="${act}" data-id="${id}" aria-label="${esc(label)}" title="${esc(label)}">${icon(name, 17)}</button>`;

  // A dialog with a form. onSubmit gets the form; if it throws, the message is shown in the dialog.
  let submitHandler = null;
  function openModal(title, body, { submit = 'Save', onSubmit = null, wide = false, cancel = 'Cancel', danger = false } = {}) {
    submitHandler = onSubmit;
    modal.classList.toggle('wide', wide);
    modal.innerHTML = `
      <header class="sheet-head"><h2 id="modal-title">${esc(title)}</h2><button class="icon-btn" type="button" data-act="close-modal" aria-label="Close">${icon('x', 18)}</button></header>
      <div class="sheet-body"><form id="modal-form" novalidate>
        <p class="form-error" id="modal-error" role="alert" hidden></p>
        ${body}
        <div class="modal-actions">
          <button class="btn btn-ghost" type="button" data-act="close-modal">${esc(cancel)}</button>
          ${onSubmit ? `<button class="btn ${danger ? 'btn-orange' : 'btn-primary'}" type="submit">${esc(submit)}</button>` : ''}
        </div>
      </form></div>`;
    if (!modal.open) modal.showModal();
  }
  const closeModal = () => { if (modal.open) modal.close(); submitHandler = null; };
  const confirmBox = (title, text, label, fn) => openModal(title, `<p>${text}</p>`, { submit: label, onSubmit: fn, danger: true });

  // Photo picker used by the workout and recipe forms
  const photoPick = (image, emoji) => `
    <div class="field"><span style="font-size:12px;font-weight:700;color:var(--ink-2)">Photo</span>
      <div class="photo-pick">
        <div class="art" id="photo-preview">${image ? `<img class="photo" src="${esc(image)}" alt="">` : esc(emoji || '🖼️')}</div>
        <input type="hidden" name="image" id="photo-path" value="${esc(image || '')}">
        <label class="btn btn-sm btn-soft file-btn" for="photo-file">${icon('image', 16)}Choose photo<input class="sr-only" id="photo-file" type="file" accept="image/jpeg,image/png,image/webp"></label>
        <button class="btn btn-sm btn-ghost" type="button" data-act="photo-remove">Remove</button>
      </div>
      <span class="hint">JPG, PNG or WebP. Large photos are made smaller before they are uploaded.</span>
    </div>`;
  async function uploadPhoto(file) {
    const error = $('#modal-error');
    error.hidden = true;
    try {
      const dataUrl = await resizeImage(file, { max: 1200, quality: 0.82 });
      const { path } = await api('/admin/uploads', { method: 'POST', body: { dataUrl } });
      $('#photo-path').value = path;
      $('#photo-preview').innerHTML = `<img class="photo" src="${esc(path)}" alt="">`;
    } catch (err) { error.textContent = err.message; error.hidden = false; }
  }

  const pager = (d, what) => `
    <div class="table-foot"><span>${fmt(d.total)} ${what}${d.total === 1 ? '' : 's'}</span>
      <div class="pager">
        <button class="btn btn-sm btn-ghost" type="button" data-act="page" data-id="${d.page - 1}" ${d.page <= 1 ? 'disabled' : ''}>${icon('back', 14)}Previous</button>
        <span class="num">Page ${d.page} of ${d.pages}</span>
        <button class="btn btn-sm btn-ghost" type="button" data-act="page" data-id="${d.page + 1}" ${d.page >= d.pages ? 'disabled' : ''}>Next${icon('next', 14)}</button>
      </div></div>`;

  // Column chart: one bar per day, hover or focus a column for the exact value.
  function columnChart(box, rows, color, unit) {
    const max = Math.max(1, ...rows.map(r => r.count));
    const rough = max / 4, pow = Math.pow(10, Math.floor(Math.log10(rough)));
    const step = Math.max(1, [1, 2, 2.5, 5, 10].map(m => m * pow).find(s => s >= rough));
    const top = step * Math.ceil(max / step);
    const W = Math.max(280, Math.round(box.clientWidth || 500)), H = 200, m = { t: 14, r: 6, b: 26, l: 30 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b, band = iw / rows.length, bw = Math.min(24, band * 0.55);
    const y = v => m.t + ih - (v / top) * ih;
    let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(unit)} per day for the last ${rows.length} days">`;
    for (let v = 0; v <= top + 0.001; v += step) {
      svg += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
    }
    const every = band < 34 ? 2 : 1;
    rows.forEach((r, i) => {
      const cx = m.l + band * i + band / 2, x = cx - bw / 2, t = y(r.count), h = m.t + ih - t, rad = Math.min(4, h);
      if (h > 0) svg += `<path d="M${x},${m.t + ih} V${t + rad} Q${x},${t} ${x + rad},${t} H${x + bw - rad} Q${x + bw},${t} ${x + bw},${t + rad} V${m.t + ih} Z" fill="${color}"/>`;
      if ((rows.length - 1 - i) % every === 0) svg += `<text x="${cx}" y="${H - 8}" text-anchor="middle">${dayLabel(r.date, { day: 'numeric' })}</text>`;
    });
    rows.forEach((r, i) => {
      const label = dayLabel(r.date, { weekday: 'short', day: 'numeric', month: 'short' });
      svg += `<rect class="hit" x="${m.l + band * i}" y="${m.t}" width="${band}" height="${ih}" fill="transparent" tabindex="0" data-tip-x="${m.l + band * i + band / 2}" data-tip-y="${y(r.count)}" data-tip-v="${r.count} ${esc(unit)}" data-tip-d="${label}" aria-label="${label}: ${r.count} ${esc(unit)}"/>`;
    });
    box.innerHTML = svg + '</svg><div class="tip" hidden><b></b><span></span></div>';
  }
  const chartTable = (rows, unit) => `<details class="table"><summary>View as table</summary><div class="table-scroll"><table class="num"><thead><tr><th>Day</th><th>${unit}</th></tr></thead><tbody>${rows.map(r => `<tr><td>${dayLabel(r.date, { weekday: 'short', day: 'numeric', month: 'short' })}</td><td>${r.count}</td></tr>`).join('')}</tbody></table></div></details>`;

  const ACTION_LABELS = {
    'user.create': 'Created user', 'user.update': 'Edited user', 'user.suspend': 'Suspended user', 'user.activate': 'Reactivated user',
    'user.reset_password': 'Reset password', 'user.delete': 'Deleted user', 'user.export': 'Exported users',
    'food.create': 'Added food', 'food.update': 'Edited food', 'food.delete': 'Deleted food',
    'workout.create': 'Added workout', 'workout.update': 'Edited workout', 'workout.delete': 'Deleted workout',
    'recipe.create': 'Added recipe', 'recipe.update': 'Edited recipe', 'recipe.delete': 'Deleted recipe',
    'plan.update': 'Edited plan', 'settings.update': 'Changed site settings'
  };
  const actionLabel = a => ACTION_LABELS[a] || a;

  /* ================= 2. Dashboard ================= */

  let dashboardData = null;
  async function dashboard() {
    const d = dashboardData = await api('/admin/stats');
    const t = d.totals;
    const kpi = (label, value, note, tone, ic) => `<div class="kpi"><span class="kpi-label"><span class="thumb ${tone}">${icon(ic, 16)}</span>${label}</span><strong class="num">${fmt(value)}</strong><small>${note}</small></div>`;
    const foodMax = Math.max(1, ...d.topFoods.map(f => f.count));
    view.innerHTML = `
      <div class="kpis">
        ${kpi('Users', t.users, `${t.newThisWeek} joined this week`, 't-purple', 'users')}
        ${kpi('Active today', t.activeToday, 'logged something today', 't-teal', 'steps')}
        ${kpi('On a paid plan', t.paid, `${Math.round(t.paid / Math.max(1, t.users) * 100)}% of all users`, 't-yellow', 'star')}
        ${kpi('Meals logged today', t.mealsToday, 'food diary entries', 't-orange', 'bowl')}
        ${kpi('Exercises this week', t.exercisesThisWeek, 'ticked off in 7 days', 't-purple', 'dumbbell')}
        ${kpi('Suspended', t.suspended, 'accounts blocked from logging in', 't-orange', 'x')}
      </div>
      <div class="two">
        <section class="card"><h2>New sign-ups</h2><p class="card-sub">Accounts created each day, last 14 days</p><div class="chart-wrap" id="chart-signups"></div>${chartTable(d.signups, 'Sign-ups')}</section>
        <section class="card"><h2>Active users</h2><p class="card-sub">People who logged food, water, steps or a workout each day</p><div class="chart-wrap" id="chart-active"></div>${chartTable(d.active, 'Active users')}</section>
      </div>
      <div class="three">
        <section class="card"><h2>Most logged foods</h2><p class="card-sub">Diary entries in the last 30 days</p>
          ${d.topFoods.length ? `<div class="hbars">${d.topFoods.map(f => `<div class="hbar"><span>${esc(f.name)}</span><b class="num">${f.count}</b><span class="bar"><i style="width:${f.count / foodMax * 100}%;background:var(--c2)"></i></span></div>`).join('')}</div>` : '<p class="sub">Nothing has been logged yet.</p>'}
        </section>
        <section class="card"><h2>Plans</h2><p class="card-sub">How many users are on each plan</p>
          <div class="hbars">${d.plans.map(p => `<div class="hbar"><span>${esc(p.name)} <span class="sub num">৳${fmt(p.price)}</span></span><b class="num">${p.count}</b><span class="bar"><i style="width:${p.count / Math.max(1, t.users) * 100}%"></i></span></div>`).join('')}</div>
        </section>
        <section class="card"><h2>Recent admin activity</h2><p class="card-sub"><a class="link" href="#activity">Open the full log</a></p>
          ${d.recent.length ? `<ul class="feed">${d.recent.map(r => `<li><b>${esc(actionLabel(r.action))}${r.target ? ': ' + esc(r.target) : ''}</b><span>${esc(r.admin_name)} · ${dateTime(r.created_at)}</span></li>`).join('')}</ul>` : '<p class="sub">No changes have been made yet.</p>'}
        </section>
      </div>`;
    drawDashboardCharts();
  }
  function drawDashboardCharts() {
    if (!dashboardData || !$('#chart-signups')) return;
    columnChart($('#chart-signups'), dashboardData.signups, 'var(--c1)', 'sign-ups');
    columnChart($('#chart-active'), dashboardData.active, 'var(--c3)', 'active users');
  }

  /* ================= 3. Users ================= */

  const uq = { q: '', role: '', status: '', plan: '', sort: 'joined', dir: 'desc', page: 1 };
  const userQuery = () => new URLSearchParams(Object.entries(uq).filter(([, v]) => v !== '')).toString();

  async function users() {
    actions.innerHTML = `<a class="btn btn-ghost" id="csv-link" href="/api/admin/users/export.csv">${icon('download', 18)}Export CSV</a><button class="btn btn-primary" type="button" data-act="user-new">${icon('plus', 18)}Add user</button>`;
    view.innerHTML = `
      <div class="toolbar card">
        ${field('Search', 'u-q', `<input id="u-q" type="search" placeholder="Name or email" value="${esc(uq.q)}" autocomplete="off">`).replace('class="field"', 'class="field grow"')}
        ${field('Role', 'u-role', `<select id="u-role" data-filter="role">${options([['', 'All roles'], ['user', 'Users'], ['admin', 'Administrators']], uq.role)}</select>`)}
        ${field('Status', 'u-status', `<select id="u-status" data-filter="status">${options([['', 'Any status'], ['active', 'Active'], ['suspended', 'Suspended']], uq.status)}</select>`)}
        ${field('Plan', 'u-plan', `<select id="u-plan" data-filter="plan">${options([['', 'All plans'], ...plans.map(p => [p.slug, p.name])], uq.plan)}</select>`)}
        ${field('Sort by', 'u-sort', `<select id="u-sort" data-filter="sort">${options([['joined:desc', 'Newest first'], ['joined:asc', 'Oldest first'], ['name:asc', 'Name A to Z'], ['name:desc', 'Name Z to A'], ['login:desc', 'Last login']], uq.sort + ':' + uq.dir)}</select>`)}
      </div>
      <section class="card table-card" id="users-table"></section>`;
    await usersTable();
  }
  async function usersTable() {
    const d = await api('/admin/users?' + userQuery());
    uq.page = d.page;
    const link = $('#csv-link');
    if (link) link.href = '/api/admin/users/export.csv?' + userQuery();
    const box = $('#users-table');
    if (!box) return;
    box.innerHTML = `
      <div class="table-wrap"><table class="adm-table">
        <thead><tr><th>User</th><th>Role</th><th>Plan</th><th>Status</th><th>Joined</th><th>Last login</th><th class="r">Actions</th></tr></thead>
        <tbody>${d.rows.map(u => `<tr>
          <td><div class="cell-main"><span class="avatar" style="width:38px;height:38px;font-size:15px" aria-hidden="true">${esc(u.name.trim().charAt(0).toUpperCase())}</span><div><b>${esc(u.name)}${u.id === me.id ? ' (you)' : ''}</b><span>${esc(u.email)}</span></div></div></td>
          <td>${u.role === 'admin' ? badge('Admin', 'accent') : badge('User')}</td>
          <td>${badge(u.plan_name, u.plan === 'free' ? '' : 'gold')}</td>
          <td>${u.status === 'active' ? badge('Active', 'good') : badge('Suspended', 'warn')}</td>
          <td class="num">${dateOnly(u.created_at)}</td>
          <td class="num">${dateTime(u.last_login_at)}</td>
          <td><div class="row-actions">
            ${iconBtn('user-view', u.id, 'eye', 'View ' + u.name)}${iconBtn('user-edit', u.id, 'edit', 'Edit ' + u.name)}${iconBtn('user-reset', u.id, 'key', 'Reset password for ' + u.name)}${iconBtn('user-delete', u.id, 'trash', 'Delete ' + u.name, 'danger')}
          </div></td></tr>`).join('') || `<tr><td colspan="7" class="empty-row">No users match these filters.</td></tr>`}
        </tbody></table></div>
      ${pager(d, 'user')}`;
    box.dataset.rows = JSON.stringify(d.rows);
  }
  const userRow = id => JSON.parse($('#users-table').dataset.rows).find(u => u.id === Number(id));
  const userFields = (u, withPassword) => `
    <div class="form-grid">
      ${field('Name', 'f-name', input('f-name', 'name', u.name, 'type="text" maxlength="50" required'))}
      ${field('Email', 'f-email', input('f-email', 'email', u.email, 'type="email" required'))}
      ${withPassword ? field('Password', 'f-password', input('f-password', 'password', '', 'type="text" minlength="8" required autocomplete="off"'), 'At least 8 characters, with a letter and a number.') : ''}
      ${field('Role', 'f-role', `<select id="f-role" name="role">${options([['user', 'User'], ['admin', 'Administrator']], u.role)}</select>`)}
      ${field('Plan', 'f-plan', `<select id="f-plan" name="plan">${options(plans.map(p => [p.slug, p.name]), u.plan)}</select>`)}
      ${withPassword ? '' : field('Status', 'f-status', `<select id="f-status" name="status">${options([['active', 'Active'], ['suspended', 'Suspended']], u.status)}</select>`, 'Suspended users cannot log in.')}
    </div>`;
  const formValues = form => Object.fromEntries(new FormData(form).entries());

  /* ================= 4. Foods ================= */

  let foodSearch = '', foodRows = [];
  async function foods() {
    actions.innerHTML = `<button class="btn btn-primary" type="button" data-act="food-new">${icon('plus', 18)}Add food</button>`;
    view.innerHTML = `
      <div class="toolbar card">${field('Search', 'food-q', `<input id="food-q" type="search" placeholder="Food name" value="${esc(foodSearch)}" autocomplete="off">`).replace('class="field"', 'class="field grow"')}</div>
      <section class="card table-card" id="foods-table"></section>`;
    await foodsTable();
  }
  async function foodsTable() {
    foodRows = (await api('/admin/foods?q=' + encodeURIComponent(foodSearch))).rows;
    const box = $('#foods-table');
    if (!box) return;
    box.innerHTML = `
      <div class="table-wrap"><table class="adm-table">
        <thead><tr><th>Food</th><th class="r">Calories</th><th class="r">Protein</th><th class="r">Carbs</th><th class="r">Fat</th><th class="r">Actions</th></tr></thead>
        <tbody>${foodRows.map(f => `<tr>
          <td><div class="cell-main"><span class="thumb" aria-hidden="true">${esc(f.emoji)}</span><div><b>${esc(f.name)}</b><span>${esc(f.serving)}</span></div></div></td>
          <td class="r num">${fmt(f.kcal)} kcal</td><td class="r num">${f.protein} g</td><td class="r num">${f.carbs} g</td><td class="r num">${f.fat} g</td>
          <td><div class="row-actions">${iconBtn('food-edit', f.id, 'edit', 'Edit ' + f.name)}${iconBtn('food-delete', f.id, 'trash', 'Delete ' + f.name, 'danger')}</div></td></tr>`).join('') || `<tr><td colspan="6" class="empty-row">No food matches “${esc(foodSearch)}”.</td></tr>`}
        </tbody></table></div>
      <div class="table-foot"><span>${foodRows.length} food${foodRows.length === 1 ? '' : 's'}</span></div>`;
  }
  const foodFields = f => `
    <div class="form-grid">
      ${field('Name', 'f-name', input('f-name', 'name', f.name, 'type="text" maxlength="60" required'))}
      ${field('Emoji', 'f-emoji', input('f-emoji', 'emoji', f.emoji || '🍽️', 'type="text" maxlength="8"'))}
      ${field('Serving', 'f-serving', input('f-serving', 'serving', f.serving || '1 serving', 'type="text" maxlength="40"'), 'For example “1 cup” or “100 g”.')}
      ${field('Calories (kcal)', 'f-kcal', input('f-kcal', 'kcal', f.kcal ?? '', 'type="number" min="0" max="5000" required'))}
      ${field('Protein (g)', 'f-protein', input('f-protein', 'protein', f.protein ?? 0, 'type="number" min="0" max="500" step="0.1"'))}
      ${field('Carbs (g)', 'f-carbs', input('f-carbs', 'carbs', f.carbs ?? 0, 'type="number" min="0" max="500" step="0.1"'))}
      ${field('Fat (g)', 'f-fat', input('f-fat', 'fat', f.fat ?? 0, 'type="number" min="0" max="500" step="0.1"'))}
    </div>`;
  function foodForm(food) {
    openModal(food ? 'Edit food' : 'Add food', foodFields(food || {}), {
      submit: food ? 'Save food' : 'Add food',
      onSubmit: async form => {
        await api('/admin/foods' + (food ? '/' + food.id : ''), { method: food ? 'PUT' : 'POST', body: formValues(form) });
        closeModal(); toast(food ? 'Food saved.' : 'Food added.'); await foodsTable();
      }
    });
  }

  /* ================= 5. Workouts ================= */

  let workoutRows = [];
  async function workouts() {
    actions.innerHTML = `<button class="btn btn-primary" type="button" data-act="workout-new">${icon('plus', 18)}Add workout</button>`;
    workoutRows = (await api('/admin/workouts')).rows;
    view.innerHTML = workoutRows.length ? `<div class="content-grid">${workoutRows.map(w => {
      const ex = w.rounds.flatMap(r => r.exercises);
      return `<article class="content-card">
        <div class="content-art art t-${esc(w.tone)}" aria-hidden="true">${esc(w.emoji)}${w.image ? `<img class="photo" src="${esc(w.image)}" alt="">` : ''}</div>
        <div class="content-body">
          <h2>${esc(w.name)}</h2>
          <p class="meta num"><span>${icon('dumbbell', 15)}${ex.length} exercises</span><span>${icon('flame', 15)}${ex.reduce((n, x) => n + x.kcal, 0)} kcal</span><span>${icon('clock', 15)}${ex.reduce((n, x) => n + x.minutes, 0)} min</span></p>
          <div class="content-foot"><span>${badge(w.level)} ${w.published ? badge('Published', 'good') : badge('Hidden', 'warn')}</span>
            <span class="row-actions">${iconBtn('workout-edit', w.id, 'edit', 'Edit ' + w.name)}${iconBtn('workout-delete', w.id, 'trash', 'Delete ' + w.name, 'danger')}</span></div>
        </div></article>`;
    }).join('')}</div>` : `<section class="card"><h2>No workouts yet</h2><p class="card-sub">Add the first workout and it will appear in the app.</p></section>`;
  }
  // Field names start with "x-" so they never clash with the workout's own name and emoji fields
  const exerciseRow = (x = {}) => `
    <div class="ex-ed">
      <input type="hidden" name="x-id" value="${x.id || ''}">
      <input type="text" name="x-emoji" value="${esc(x.emoji || '💪')}" maxlength="8" aria-label="Emoji">
      <input type="text" name="x-name" value="${esc(x.name || '')}" maxlength="60" placeholder="Exercise name" aria-label="Exercise name">
      <input type="text" name="x-detail" value="${esc(x.detail || '')}" maxlength="60" placeholder="3 × 12 reps" aria-label="Sets and reps">
      <input type="number" name="x-kcal" min="0" max="2000" value="${x.kcal ?? 20}" aria-label="Calories burned">
      <input type="number" name="x-minutes" min="0" max="240" value="${x.minutes ?? 3}" aria-label="Minutes">
      <button class="icon-btn danger" type="button" data-act="ex-remove" aria-label="Remove exercise">${icon('x', 15)}</button>
    </div>`;
  const roundBlock = (r = { name: '', focus: '', exercises: [{}] }) => `
    <fieldset class="round-ed">
      <legend>Round</legend>
      <div class="round-head-ed">
        <input type="text" name="round-name" value="${esc(r.name)}" maxlength="40" placeholder="Round name, e.g. Round 1" aria-label="Round name">
        <input type="text" name="round-focus" value="${esc(r.focus)}" maxlength="60" placeholder="Focus, e.g. Legs and glutes" aria-label="Round focus">
        <button class="btn btn-sm btn-ghost" type="button" data-act="round-remove">Remove round</button>
      </div>
      <div class="ex-ed ex-ed-head" aria-hidden="true"><span>Emoji</span><span>Exercise</span><span>Sets and reps</span><span>kcal</span><span>Min</span><span></span></div>
      <div class="ex-list">${r.exercises.map(exerciseRow).join('')}</div>
      <button class="btn btn-sm btn-soft" type="button" data-act="ex-add" style="justify-self:start">${icon('plus', 15)}Add exercise</button>
    </fieldset>`;
  function workoutForm(w) {
    const d = w || { name: '', level: 'Medium', tone: 'purple', emoji: '💪', image: '', published: 1, rounds: [{ name: 'Round 1', focus: '', exercises: [{}] }] };
    openModal(w ? 'Edit workout' : 'Add workout', `
      <div class="form-grid">
        ${field('Name', 'f-name', input('f-name', 'name', d.name, 'type="text" maxlength="60" required'))}
        ${field('Level', 'f-level', `<select id="f-level" name="level">${options([['Easy', 'Easy'], ['Medium', 'Medium'], ['Hard', 'Hard']], d.level)}</select>`)}
        ${field('Colour', 'f-tone', `<select id="f-tone" name="tone">${options(TONES, d.tone)}</select>`)}
        ${field('Emoji', 'f-emoji', input('f-emoji', 'emoji', d.emoji, 'type="text" maxlength="8"'), 'Shown when there is no photo.')}
      </div>
      ${photoPick(d.image, d.emoji)}
      <label class="check"><input type="checkbox" name="published" ${d.published ? 'checked' : ''}>Published (visible in the app)</label>
      <div id="rounds" style="display:grid;gap:12px">${d.rounds.map(roundBlock).join('')}</div>
      <button class="btn btn-sm btn-soft" type="button" data-act="round-add" style="justify-self:start">${icon('plus', 15)}Add round</button>`, {
      wide: true, submit: w ? 'Save workout' : 'Add workout',
      onSubmit: async form => {
        const rounds = [...form.querySelectorAll('.round-ed')].map(r => ({
          name: $('[name="round-name"]', r).value, focus: $('[name="round-focus"]', r).value,
          exercises: [...r.querySelectorAll('.ex-list .ex-ed')].map(x => ({
            id: Number($('[name="x-id"]', x).value) || undefined, emoji: $('[name="x-emoji"]', x).value, name: $('[name="x-name"]', x).value,
            detail: $('[name="x-detail"]', x).value, kcal: Number($('[name="x-kcal"]', x).value), minutes: Number($('[name="x-minutes"]', x).value)
          }))
        }));
        const body = { name: form.elements.name.value, level: form.elements.level.value, tone: form.elements.tone.value, emoji: form.elements.emoji.value,
          image: form.elements.image.value, published: form.elements.published.checked, rounds };
        await api('/admin/workouts' + (w ? '/' + w.id : ''), { method: w ? 'PUT' : 'POST', body });
        closeModal(); toast(w ? 'Workout saved.' : 'Workout added.'); await workouts();
      }
    });
  }

  /* ================= 6. Recipes ================= */

  let recipeRows = [];
  async function recipes() {
    actions.innerHTML = `<button class="btn btn-primary" type="button" data-act="recipe-new">${icon('plus', 18)}Add recipe</button>`;
    recipeRows = (await api('/admin/recipes')).rows;
    view.innerHTML = recipeRows.length ? `<div class="content-grid">${recipeRows.map(r => `<article class="content-card">
        <div class="content-art art t-${esc(r.tone)}" aria-hidden="true">${esc(r.emoji)}${r.image ? `<img class="photo" src="${esc(r.image)}" alt="">` : ''}</div>
        <div class="content-body">
          <h2>${esc(r.name)}</h2>
          <p class="meta num"><span>${icon('flame', 15)}${r.kcal} kcal</span><span>${icon('clock', 15)}${r.minutes} min</span><span>${r.ingredients.length} ingredients</span></p>
          <div class="content-foot"><span>${r.published ? badge('Published', 'good') : badge('Hidden', 'warn')} ${r.image ? '' : badge('No photo')}</span>
            <span class="row-actions">${iconBtn('recipe-edit', r.id, 'edit', 'Edit ' + r.name)}${iconBtn('recipe-delete', r.id, 'trash', 'Delete ' + r.name, 'danger')}</span></div>
        </div></article>`).join('')}</div>` : `<section class="card"><h2>No recipes yet</h2><p class="card-sub">Add the first recipe and it will appear in the app.</p></section>`;
  }
  function recipeForm(r) {
    const d = r || { name: '', emoji: '🍽️', tone: 'orange', kcal: '', minutes: 20, protein: 0, carbs: 0, fat: 0, image: '', published: 1, ingredients: [], steps: [] };
    openModal(r ? 'Edit recipe' : 'Add recipe', `
      <div class="form-grid">
        ${field('Name', 'f-name', input('f-name', 'name', d.name, 'type="text" maxlength="80" required'))}
        ${field('Emoji', 'f-emoji', input('f-emoji', 'emoji', d.emoji, 'type="text" maxlength="8"'))}
        ${field('Colour', 'f-tone', `<select id="f-tone" name="tone">${options(TONES, d.tone)}</select>`)}
        ${field('Calories (kcal)', 'f-kcal', input('f-kcal', 'kcal', d.kcal, 'type="number" min="0" max="5000" required'))}
        ${field('Time (minutes)', 'f-minutes', input('f-minutes', 'minutes', d.minutes, 'type="number" min="0" max="600"'))}
        ${field('Protein (g)', 'f-protein', input('f-protein', 'protein', d.protein, 'type="number" min="0" max="500" step="0.1"'))}
        ${field('Carbs (g)', 'f-carbs', input('f-carbs', 'carbs', d.carbs, 'type="number" min="0" max="500" step="0.1"'))}
        ${field('Fat (g)', 'f-fat', input('f-fat', 'fat', d.fat, 'type="number" min="0" max="500" step="0.1"'))}
      </div>
      ${photoPick(d.image, d.emoji)}
      <label class="check"><input type="checkbox" name="published" ${d.published ? 'checked' : ''}>Published (visible in the app)</label>
      ${field('Ingredients', 'f-ingredients', `<textarea id="f-ingredients" name="ingredients" required>${esc(d.ingredients.map(i => i.amount ? `${i.name} | ${i.amount}` : i.name).join('\n'))}</textarea>`, 'One per line. Put the amount after a bar, like “Chicken breast | 300 g”.')}
      ${field('Directions', 'f-steps', `<textarea id="f-steps" name="steps" required>${esc(d.steps.join('\n'))}</textarea>`, 'One step per line, in order.')}`, {
      wide: true, submit: r ? 'Save recipe' : 'Add recipe',
      onSubmit: async form => {
        const lines = name => form.elements[name].value.split('\n').map(l => l.trim()).filter(Boolean);
        const body = { ...formValues(form), published: form.elements.published.checked,
          ingredients: lines('ingredients').map(l => { const [name, ...rest] = l.split('|'); return { name: name.trim(), amount: rest.join('|').trim() }; }),
          steps: lines('steps') };
        await api('/admin/recipes' + (r ? '/' + r.id : ''), { method: r ? 'PUT' : 'POST', body });
        closeModal(); toast(r ? 'Recipe saved.' : 'Recipe added.'); await recipes();
      }
    });
  }

  /* ================= 7. Plans ================= */

  let planRows = [];
  async function plansView() {
    planRows = (await api('/admin/plans')).rows;
    plans = planRows;
    view.innerHTML = `<p class="sub" style="max-width:65ch">Prices are shown to users on the Plans page. This is a class project, so no payment is taken when a user picks a plan.</p>
      <div class="content-grid">${planRows.map(p => `<article class="content-card"><div class="content-body" style="padding-top:16px">
        <div class="content-foot" style="margin:0"><h2>${esc(p.name)}</h2>${p.featured ? badge('Highlighted', 'gold') : ''}</div>
        <p class="num" style="font-size:28px;font-weight:800;letter-spacing:-.02em">৳${fmt(p.price)} <small style="font-size:13px;font-weight:600;color:var(--ink-2)">${esc(p.period)}</small></p>
        <ul style="display:grid;gap:6px;font-size:14px">${p.features.map(f => `<li style="display:flex;gap:8px">${icon('check', 16)}<span>${esc(f)}</span></li>`).join('')}</ul>
        <div class="content-foot"><span>${badge(p.subscribers + (p.subscribers === 1 ? ' user' : ' users'), 'accent')}</span><button class="btn btn-sm btn-soft" type="button" data-act="plan-edit" data-id="${p.id}">${icon('edit', 15)}Edit plan</button></div>
      </div></article>`).join('')}</div>`;
  }
  function planForm(p) {
    openModal('Edit plan', `
      <div class="form-grid">
        ${field('Name', 'f-name', input('f-name', 'name', p.name, 'type="text" maxlength="40" required'))}
        ${field('Price (৳)', 'f-price', input('f-price', 'price', p.price, 'type="number" min="0" max="100000" required'))}
        ${field('Billed', 'f-period', `<select id="f-period" name="period">${options([['', 'Free / one-off'], ['/ month', 'Every month'], ['/ year', 'Every year']], p.period)}</select>`)}
        ${field('Label', 'f-tag', input('f-tag', 'tag', p.tag, 'type="text" maxlength="24"'), 'Optional, like “Most popular”.')}
      </div>
      <label class="check"><input type="checkbox" name="featured" ${p.featured ? 'checked' : ''}>Highlight this plan</label>
      ${field('Features', 'f-features', `<textarea id="f-features" name="features" required>${esc(p.features.join('\n'))}</textarea>`, 'One per line, up to 8.')}`, {
      submit: 'Save plan',
      onSubmit: async form => {
        const body = { ...formValues(form), featured: form.elements.featured.checked, features: form.elements.features.value.split('\n').map(l => l.trim()).filter(Boolean) };
        await api('/admin/plans/' + p.id, { method: 'PUT', body });
        closeModal(); toast('Plan saved.'); await plansView();
      }
    });
  }

  /* ================= 8. Activity log and site settings ================= */

  const lq = { area: '', page: 1 };
  async function activity() {
    const d = await api(`/admin/log?area=${lq.area}&page=${lq.page}`);
    lq.page = d.page;
    view.innerHTML = `
      <div class="toolbar card">${field('Show', 'log-area', `<select id="log-area" data-filter="area">${options([['', 'All changes'], ['user', 'Users'], ['food', 'Foods'], ['workout', 'Workouts'], ['recipe', 'Recipes'], ['plan', 'Plans'], ['settings', 'Site settings']], lq.area)}</select>`)}</div>
      <section class="card table-card">
        <div class="table-wrap"><table class="adm-table">
          <thead><tr><th>When</th><th>Administrator</th><th>Action</th><th>What</th><th>Details</th></tr></thead>
          <tbody>${d.rows.map(r => `<tr><td class="num">${dateTime(r.created_at)}</td><td>${esc(r.admin_name)}</td><td>${badge(actionLabel(r.action), r.action.endsWith('delete') || r.action.endsWith('suspend') ? 'warn' : 'accent')}</td><td>${esc(r.target)}</td><td class="wrap">${esc(r.detail)}</td></tr>`).join('') || `<tr><td colspan="5" class="empty-row">Nothing has been changed yet. Every change an administrator makes is listed here.</td></tr>`}
          </tbody></table></div>
        ${pager(d, 'change')}
      </section>`;
  }

  async function site() {
    const s = await api('/admin/settings');
    view.innerHTML = `<section class="card" style="max-width:640px"><form id="site-form" style="display:grid;gap:16px">
      ${field('Announcement', 'site-announcement', `<textarea id="site-announcement" name="announcement" maxlength="200" style="min-height:90px">${esc(s.announcement)}</textarea>`, 'Shown at the top of every user’s Home page. Leave it empty to show nothing. Up to 200 characters.')}
      <label class="check"><input type="checkbox" name="signupsOpen" ${s.signupsOpen ? 'checked' : ''}>Allow new people to register</label>
      <div><button class="btn btn-primary" type="submit">Save settings</button></div>
    </form></section>`;
  }

  /* ================= 9. Start-up and routing ================= */

  const VIEWS = { dashboard, users, foods, workouts, recipes, plans: plansView, activity, site };
  const TITLES = { dashboard: 'Dashboard', users: 'Users', foods: 'Foods', workouts: 'Workouts', recipes: 'Recipes', plans: 'Plans', activity: 'Activity log', site: 'Site settings' };
  let current = 'dashboard';

  async function route() {
    const name = location.hash.replace('#', '');
    current = VIEWS[name] ? name : 'dashboard';
    $('#adm-title').textContent = TITLES[current];
    document.title = `${TITLES[current]} · Kinetic admin`;
    document.querySelectorAll('[data-nav]').forEach(a => { if (a.dataset.nav === current) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    actions.innerHTML = '';
    view.innerHTML = '<p class="sub">Loading…</p>';
    try { await VIEWS[current](); } catch (err) { showError(err); }
    window.scrollTo(0, 0);
  }
  function showError(err) {
    if (err.status === 401 || err.status === 403) { location.href = '/auth.html'; return; }
    view.innerHTML = `<section class="card"><h2>This page could not load</h2><p class="card-sub">${esc(err.message)}</p><button class="btn btn-primary" type="button" data-act="retry">Try again</button></section>`;
  }
  // Runs an action and shows any error as a toast
  const guard = fn => async (...args) => { try { await fn(...args); } catch (err) { if (err.status === 401) location.href = '/auth.html'; else toast(err.message); } };

  const ACT = {
    'close-modal': closeModal,
    retry: route,
    async logout() { try { await api('/auth/logout', { method: 'POST' }); } catch (e) { /* leave anyway */ } location.href = '/auth.html'; },
    page(el) { const n = Number(el.dataset.id); if (current === 'users') { uq.page = n; return usersTable(); } lq.page = n; return activity(); },

    'user-new'() {
      openModal('Add user', userFields({ name: '', email: '', role: 'user', plan: plans[0] && plans[0].slug }, true), {
        submit: 'Add user',
        onSubmit: async form => { await api('/admin/users', { method: 'POST', body: formValues(form) }); closeModal(); toast('User added.'); await usersTable(); }
      });
    },
    'user-edit'(el) {
      const u = userRow(el.dataset.id);
      openModal('Edit user', userFields(u, false), {
        submit: 'Save user',
        onSubmit: async form => { await api('/admin/users/' + u.id, { method: 'PUT', body: formValues(form) }); closeModal(); toast('User saved.'); await usersTable(); }
      });
    },
    async 'user-view'(el) {
      const { user: u, week } = await api('/admin/users/' + el.dataset.id);
      const bmi = u.weight / Math.pow(u.height / 100, 2);
      openModal(u.name, `
        <dl class="detail-list">
          <div><dt>Email</dt><dd>${esc(u.email)}</dd></div><div><dt>Role</dt><dd>${u.role === 'admin' ? 'Administrator' : 'User'}</dd></div>
          <div><dt>Plan</dt><dd>${esc(u.plan_name)}</dd></div><div><dt>Status</dt><dd>${u.status === 'active' ? 'Active' : 'Suspended'}</dd></div>
          <div><dt>Joined</dt><dd>${dateOnly(u.created_at)}</dd></div><div><dt>Last login</dt><dd>${dateTime(u.last_login_at)}</dd></div>
          <div><dt>Age</dt><dd>${u.age}</dd></div><div><dt>Height and weight</dt><dd>${u.height} cm, ${u.weight} kg</dd></div>
          <div><dt>BMI</dt><dd>${bmi.toFixed(1)}</dd></div><div><dt>Goal</dt><dd>${{ lose: 'Lose weight', maintain: 'Stay the same', gain: 'Gain weight' }[u.goal]}</dd></div>
        </dl>
        <h3 style="font-size:15px;font-weight:800;margin-top:6px">Last 7 days</h3>
        <div class="table-wrap"><table class="adm-table num">
          <thead><tr><th>Day</th><th class="r">Calories</th><th class="r">Steps</th><th class="r">Water</th><th class="r">Exercises</th></tr></thead>
          <tbody>${week.map(d => `<tr><td>${dayLabel(d.date, { weekday: 'short', day: 'numeric', month: 'short' })}</td><td class="r">${fmt(d.kcal)}</td><td class="r">${fmt(d.steps)}</td><td class="r">${d.water}</td><td class="r">${d.exercises}</td></tr>`).join('')}</tbody>
        </table></div>`, { cancel: 'Close', wide: true });
    },
    'user-reset'(el) {
      const u = userRow(el.dataset.id);
      confirmBox('Reset password?', `${esc(u.name)} will get a new temporary password and the old one will stop working.`, 'Reset password', async () => {
        const { password } = await api(`/admin/users/${u.id}/reset-password`, { method: 'POST' });
        openModal('Temporary password', `<p>Give this password to ${esc(u.name)}. It is shown only once. They can change it on their Profile page.</p>
          <div class="secret"><span id="temp-password">${esc(password)}</span><button class="btn btn-sm btn-ghost" type="button" data-act="copy-password">Copy</button></div>`, { cancel: 'Done' });
      });
    },
    async 'copy-password'() {
      const text = $('#temp-password').textContent;
      try { await navigator.clipboard.writeText(text); toast('Password copied.'); }
      catch (e) { const r = document.createRange(); r.selectNodeContents($('#temp-password')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast('Press Ctrl+C to copy.'); }
    },
    'user-delete'(el) {
      const u = userRow(el.dataset.id);
      confirmBox('Delete this user?', `${esc(u.name)} (${esc(u.email)}) and everything they have logged will be deleted. This cannot be undone.`, 'Delete user', async () => {
        await api('/admin/users/' + u.id, { method: 'DELETE' }); closeModal(); toast('User deleted.'); await usersTable();
      });
    },

    'food-new'() { foodForm(null); },
    'food-edit'(el) { foodForm(foodRows.find(f => f.id === Number(el.dataset.id))); },
    'food-delete'(el) {
      const f = foodRows.find(x => x.id === Number(el.dataset.id));
      confirmBox('Delete this food?', `${esc(f.name)} will be removed from the food list. Diary entries that already use it are kept.`, 'Delete food', async () => {
        await api('/admin/foods/' + f.id, { method: 'DELETE' }); closeModal(); toast('Food deleted.'); await foodsTable();
      });
    },

    'workout-new'() { workoutForm(null); },
    'workout-edit'(el) { workoutForm(workoutRows.find(w => w.id === Number(el.dataset.id))); },
    'workout-delete'(el) {
      const w = workoutRows.find(x => x.id === Number(el.dataset.id));
      confirmBox('Delete this workout?', `${esc(w.name)} and its exercises will be deleted, along with the completions users logged for it.`, 'Delete workout', async () => {
        await api('/admin/workouts/' + w.id, { method: 'DELETE' }); closeModal(); toast('Workout deleted.'); await workouts();
      });
    },
    'round-add'() { $('#rounds').insertAdjacentHTML('beforeend', roundBlock({ name: 'Round ' + ($('#rounds').children.length + 1), focus: '', exercises: [{}] })); },
    'round-remove'(el) { if ($('#rounds').children.length > 1) el.closest('.round-ed').remove(); else toast('A workout needs at least one round.'); },
    'ex-add'(el) { $('.ex-list', el.closest('.round-ed')).insertAdjacentHTML('beforeend', exerciseRow()); },
    'ex-remove'(el) { const list = el.closest('.ex-list'); if (list.children.length > 1) el.closest('.ex-ed').remove(); else toast('A round needs at least one exercise.'); },
    'photo-remove'() { $('#photo-path').value = ''; $('#photo-preview').textContent = '🖼️'; },

    'recipe-new'() { recipeForm(null); },
    'recipe-edit'(el) { recipeForm(recipeRows.find(r => r.id === Number(el.dataset.id))); },
    'recipe-delete'(el) {
      const r = recipeRows.find(x => x.id === Number(el.dataset.id));
      confirmBox('Delete this recipe?', `${esc(r.name)} will be removed from the app. This cannot be undone.`, 'Delete recipe', async () => {
        await api('/admin/recipes/' + r.id, { method: 'DELETE' }); closeModal(); toast('Recipe deleted.'); await recipes();
      });
    },
    'plan-edit'(el) { planForm(planRows.find(p => p.id === Number(el.dataset.id))); }
  };

  document.addEventListener('click', e => {
    if (e.target === modal) { closeModal(); return; }
    const el = e.target.closest('[data-act]');
    if (el && ACT[el.dataset.act]) guard(ACT[el.dataset.act])(el);
  });

  document.addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.target;
    if (form.id === 'site-form') {
      return guard(async () => {
        await api('/admin/settings', { method: 'PUT', body: { announcement: form.elements.announcement.value, signupsOpen: form.elements.signupsOpen.checked } });
        toast('Settings saved.');
      })();
    }
    if (form.id !== 'modal-form' || !submitHandler) return;
    const error = $('#modal-error'), button = form.querySelector('button[type="submit"]');
    error.hidden = true; button.disabled = true;
    try { await submitHandler(form); }
    catch (err) {
      if (err.status === 401) { location.href = '/auth.html'; return; }
      if ($('#modal-error')) { $('#modal-error').textContent = err.message; $('#modal-error').hidden = false; $('.sheet-body', modal).scrollTop = 0; modal.scrollTop = 0; }
      button.disabled = false;
    }
  });

  let searchTimer;
  document.addEventListener('input', e => {
    if (e.target.id === 'u-q') { clearTimeout(searchTimer); searchTimer = setTimeout(guard(() => { uq.q = e.target.value.trim(); uq.page = 1; return usersTable(); }), 250); }
    if (e.target.id === 'food-q') { clearTimeout(searchTimer); searchTimer = setTimeout(guard(() => { foodSearch = e.target.value.trim(); return foodsTable(); }), 250); }
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'photo-file' && t.files[0]) return uploadPhoto(t.files[0]);
    if (!t.dataset.filter) return;
    if (current === 'activity') { lq.area = t.value; lq.page = 1; return guard(activity)(); }
    if (t.dataset.filter === 'sort') [uq.sort, uq.dir] = t.value.split(':'); else uq[t.dataset.filter] = t.value;
    uq.page = 1;
    guard(usersTable)();
  });

  // Chart tooltips (hover and keyboard focus)
  const showTip = hit => {
    const wrap = hit.closest('.chart-wrap'), tip = $('.tip', wrap), svg = $('svg', wrap);
    const width = svg.getBoundingClientRect().width, scale = width / svg.viewBox.baseVal.width;
    tip.firstChild.textContent = hit.dataset.tipV; tip.lastChild.textContent = hit.dataset.tipD;
    tip.style.left = Math.max(60, Math.min(width - 60, hit.dataset.tipX * scale)) + 'px';
    tip.style.top = Math.max(46, hit.dataset.tipY * scale - 8) + 'px';
    tip.hidden = false;
  };
  const isHit = e => e.target.classList && e.target.classList.contains('hit');
  ['pointerover', 'focusin'].forEach(t => document.addEventListener(t, e => { if (isHit(e)) showTip(e.target); }));
  ['pointerout', 'focusout'].forEach(t => document.addEventListener(t, e => { if (isHit(e)) $('.tip', e.target.closest('.chart-wrap')).hidden = true; }));
  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (current === 'dashboard') drawDashboardCharts(); }, 150); });
  window.addEventListener('hashchange', route);

  (async function start() {
    fillIcons();
    try {
      me = (await api('/auth/me')).user;
      if (me.role !== 'admin') { location.replace('/index.html'); return; }
      plans = (await api('/admin/plans')).rows;
    } catch (err) { location.replace('/auth.html'); return; }
    $('#adm-who').textContent = 'Signed in as ' + me.name;
    route();
  })();
})();
