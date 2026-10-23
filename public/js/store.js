// Storefront behaviour shared by every page: the "Added to bag" panel, the bag count in
// the header, and "Add to bag" on product cards. The product page uses the same panel.
(() => {
  const panel = document.querySelector(".added-panel");
  if (!panel) return;
  const title = panel.querySelector(".added-title");
  const item = panel.querySelector(".added-item");
  const actions = panel.querySelector(".added-actions");

  const close = () => {
    panel.hidden = true;
    document.body.classList.remove("has-added-panel");
  };
  const open = () => {
    panel.hidden = false;
    document.body.classList.add("has-added-panel");
  };

  const updateCount = (count) => {
    const label = `Shopping bag, ${count} ${count === 1 ? "item" : "items"}`;
    document.querySelectorAll(".bag-link").forEach((link) => {
      let badge = link.querySelector(".bag-count");
      if (!badge) {
        badge = document.createElement("b");
        badge.className = "bag-count";
        link.append(badge);
      }
      badge.textContent = count;
      link.setAttribute("aria-label", label);
      badge.classList.remove("bump");
      void badge.offsetWidth; // restart the animation when adding twice in a row
      badge.classList.add("bump");
    });
    const navBag = document.querySelector(".mobile-bottom-nav a[href='/cart']");
    if (navBag?.lastChild) navBag.lastChild.textContent = `Bag (${count})`;
  };

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // "Fly to bag": a copy of the product photo travels from where it is on screen to the
  // visible bag icon. Resolves when it lands (at once when there's nothing to animate).
  const flyToBag = (source) => new Promise((resolve) => {
    const target = [...document.querySelectorAll(".bag-link")].find((link) => link.getBoundingClientRect().width > 0);
    if (!source || !target || reduceMotion || !source.animate) return resolve();
    const from = source.getBoundingClientRect();
    if (!from.width || from.bottom < 0 || from.top > innerHeight) return resolve();
    const to = target.getBoundingClientRect();
    const size = Math.min(from.width, from.height, 160);
    const startX = from.left + from.width / 2 - size / 2;
    const startY = from.top + from.height / 2 - size / 2;
    const dx = to.left + to.width / 2 - (startX + size / 2);
    const dy = to.top + to.height / 2 - (startY + size / 2);
    const clone = document.createElement("img");
    clone.src = source.currentSrc || source.src;
    clone.alt = "";
    clone.className = "fly-to-bag";
    Object.assign(clone.style, { left: `${startX}px`, top: `${startY}px`, width: `${size}px`, height: `${size}px` });
    document.body.append(clone);
    const flight = clone.animate([
      { transform: "translate(0, 0) scale(1)", opacity: 1 },
      { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 40}px) scale(.55)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${dx}px, ${dy}px) scale(.1)`, opacity: .4 }
    ], { duration: 700, easing: "cubic-bezier(.45, 0, .55, 1)" });
    const land = () => { clone.remove(); resolve(); };
    flight.onfinish = land;
    flight.oncancel = land;
  });

  const showAdded = (result, source) => {
    // The count updates (and pops) as the photo reaches the bag.
    flyToBag(source).then(() => updateCount(result.count));
    title.textContent = "Added to bag";
    item.textContent = result.variant ? `${result.name} (${result.variant})` : result.name;
    actions.hidden = false;
    open();
    actions.querySelector(".btn-dark").focus();
  };

  const showError = (message) => {
    title.textContent = "Couldn't add to bag";
    item.textContent = message;
    actions.hidden = true;
    open();
    panel.querySelector(".added-close").focus();
  };

  // Adds a form's item in the background. Resolves true when handled here; false means
  // the caller should send the form the ordinary way (the request itself failed).
  const add = async (form) => {
    const photo = form.closest(".card")?.querySelector(".card-media img")
      ?? (form.id === "pd-form" ? document.querySelector(".pd-main-image img") : null);
    try {
      const response = await fetch(form.action, { method: "POST", body: new FormData(form), headers: { Accept: "application/json" } });
      const result = await response.json();
      if (result.ok) showAdded(result, photo);
      else showError(result.error);
      return true;
    } catch {
      return false;
    }
  };

  panel.querySelector(".added-close").addEventListener("click", close);
  panel.querySelector(".added-continue").addEventListener("click", close);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) close();
  });

  document.addEventListener("submit", async (event) => {
    const form = event.target.closest?.(".card-add");
    if (!form || !globalThis.fetch) return;
    event.preventDefault();
    const button = form.querySelector("button");
    button.disabled = true;
    const handled = await add(form);
    button.disabled = false;
    if (!handled) form.submit();
  });

  globalThis.BelloraBag = { add, close };
})();

// Photos: a shimmer while loading, then a fade-in. Only photos that haven't loaded when
// this runs are touched, so photos already on screen never blink.
(() => {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (const img of document.querySelectorAll(".card-media img, .pd-main-image img, .tile-media img, .bag-media img")) {
    if (img.complete && img.naturalWidth) continue;
    const box = img.parentElement;
    box.classList.add("is-loading");
    img.classList.add("img-fade");
    const done = () => {
      img.classList.add("is-loaded");
      box.classList.remove("is-loading");
    };
    img.addEventListener("load", done, { once: true });
    img.addEventListener("error", done, { once: true });
  }
})();

// Motion: scroll reveal and the header's scrolled state. Skipped entirely for visitors who
// ask their device for reduced motion.
(() => {
  const header = document.querySelector(".site-header");
  if (header) {
    const onScroll = () => header.classList.toggle("is-scrolled", scrollY > 8);
    addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  if (matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in globalThis)) return;
  // Only items starting below the first screen are hidden, so nothing visible on arrival
  // ever blinks out. Cards in a row follow one another by 70 ms.
  const selector = ".shelf-head, .card, .collection-tile, .sale-copy, .assurance-grid > div, .collection-about, .related .shelf-head";
  const items = [...document.querySelectorAll(selector)].filter((item) => item.getBoundingClientRect().top > innerHeight);
  if (!items.length) return;
  const reveal = (item) => {
    item.classList.add("is-visible");
    observer.unobserve(item);
  };
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) if (entry.isIntersecting) reveal(entry.target);
  });
  // Safety net: at the bottom of the page everything left is shown, so nothing can stay hidden.
  addEventListener("scroll", () => {
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) {
      document.querySelectorAll(".reveal:not(.is-visible)").forEach(reveal);
    }
  }, { passive: true });
  for (const item of items) {
    const siblings = item.parentElement ? [...item.parentElement.children] : [];
    item.style.setProperty("--reveal-delay", `${(siblings.indexOf(item) % 4) * 70}ms`);
    item.classList.add("reveal");
    observer.observe(item);
  }
})();
