/* Log in and sign up page. */
(function () {
  'use strict';
  const { api } = window.K;
  const $ = id => document.getElementById(id);

  // Already logged in? Go straight to the app (or the admin panel for administrators).
  const goHome = user => { location.replace(user.role === 'admin' ? '/admin/' : '/index.html'); };
  api('/auth/me').then(r => goHome(r.user)).catch(() => { /* not logged in: stay here */ });

  function showTab(name) {
    for (const t of ['login', 'signup']) {
      $('tab-' + t).setAttribute('aria-selected', String(t === name));
      $('panel-' + t).hidden = t !== name;
    }
    $(name === 'login' ? 'login-email' : 'signup-name').focus();
  }
  $('tab-login').addEventListener('click', () => showTab('login'));
  $('tab-signup').addEventListener('click', () => showTab('signup'));
  if (location.hash === '#register') showTab('signup');

  function wire(formId, errorId, path, fields) {
    const form = $(formId), error = $(errorId), button = form.querySelector('button[type="submit"]');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      error.hidden = true;
      const body = Object.fromEntries(fields.map(f => [f, form.elements[f].value]));
      const missing = fields.find(f => !body[f].trim());
      if (missing) {
        error.textContent = 'Fill in every field.'; error.hidden = false;
        form.elements[missing].focus();
        return;
      }
      button.disabled = true;
      try {
        goHome((await api(path, { method: 'POST', body })).user);
      } catch (err) {
        error.textContent = err.message; error.hidden = false;
        button.disabled = false;
      }
    });
  }
  wire('login-form', 'login-error', '/auth/login', ['email', 'password']);
  wire('signup-form', 'signup-error', '/auth/signup', ['name', 'email', 'password']);
})();
