/* Helpers shared by the app, the log in page and the admin panel. */
window.K = (function () {
  'use strict';

  // Makes text safe to place inside HTML
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => Math.round(n).toLocaleString('en-US');

  const ICONS = {
    home: 'M3 11l9-7 9 7v8a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    diary: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
    plus: 'M12 5v14M5 12h14',
    dumbbell: 'M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11',
    chart: 'M5 20V11M12 20V4M19 20v-6',
    user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20c0-3.3 3.6-6 8-6s8 2.7 8 6',
    users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c0-3 2.9-5.2 6.5-5.2s6.5 2.2 6.5 5.2M16 4.3a3.5 3.5 0 0 1 0 6.4M18 15.2c2 .7 3.5 2.4 3.5 4.8',
    bowl: 'M3 11h18a9 9 0 0 1-18 0zM9 3v4M15 3v4',
    star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
    drop: 'M12 3s6 6.3 6 11a6 6 0 0 1-12 0c0-4.7 6-11 6-11z',
    flame: 'M12 3c1 3.5 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3.2 1.8-4.2C9.6 10.4 11.4 8 12 3z',
    clock: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    x: 'M6 6l12 12M18 6L6 18',
    back: 'M15 5l-7 7 7 7',
    next: 'M9 5l7 7-7 7',
    steps: 'M3 17l6-6 4 4 8-8M15 7h6v6',
    grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
    apple: 'M12 7c-2-2-6-1.5-6 3.5 0 4 2.5 8.5 4.5 8.5.8 0 1-.5 1.5-.5s.7.5 1.5.5c2 0 4.5-4.5 4.5-8.5 0-5-4-5.5-6-3.5zM12 7c0-2 1-3.5 2.5-4',
    log: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7',
    gear: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1',
    logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
    edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
    trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
    key: 'M14.5 9.5a4 4 0 1 0-3.6 4L8 16.5V19H5.5L4 17.5 9.6 12',
    eye: 'M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12zM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
    download: 'M12 4v11M7.5 11l4.5 4.5 4.5-4.5M5 20h14',
    search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
    image: 'M4 5h16v14H4zM4 15l4.5-4.5 4 4L15 12l5 5M9 9.5h.01'
  };
  const icon = (name, size = 22) =>
    `<svg class="ic" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[name] || ''}"/></svg>`;

  // Talks to the server. Returns the reply, or throws an Error with a message for the person.
  async function api(path, { method = 'GET', body } = {}) {
    let res;
    try {
      res = await fetch('/api' + path, {
        method,
        credentials: 'same-origin',
        headers: { 'X-Requested-With': 'kinetic', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined
      });
    } catch (e) {
      throw new Error('Could not reach the server. Check your connection and try again.');
    }
    let data = {};
    try { data = await res.json(); } catch (e) { /* no JSON in the reply */ }
    if (!res.ok) {
      const err = new Error(data.error || 'Something went wrong. Try again.');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  let toastTimer;
  function toast(message) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message; el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3000);
  }

  // Shrinks a chosen picture in the browser before it is uploaded.
  // square: true crops the middle to a square (profile pictures).
  function resizeImage(file, { max = 1200, square = false, quality = 0.85 } = {}) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith('image/')) return reject(new Error('Choose an image file, such as a JPG or PNG.'));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('That file could not be read.'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('That file could not be read as an image. Try a JPG or PNG.'));
        img.onload = () => {
          const side = Math.min(img.width, img.height);
          const sw = square ? side : img.width, sh = square ? side : img.height;
          const scale = Math.min(1, max / Math.max(sw, sh));
          const c = document.createElement('canvas');
          c.width = Math.round(sw * scale); c.height = Math.round(sh * scale);
          c.getContext('2d').drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', quality));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // <span data-icon="home"></span> placeholders in the HTML
  function fillIcons(root = document) {
    root.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon, Number(el.dataset.size) || 22); });
  }

  return { esc, fmt, icon, api, toast, resizeImage, fillIcons };
})();
