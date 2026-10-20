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
    });
    const navBag = document.querySelector(".mobile-bottom-nav a[href='/cart']");
    if (navBag?.lastChild) navBag.lastChild.textContent = `Bag (${count})`;
  };

  const showAdded = (result) => {
    updateCount(result.count);
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
    try {
      const response = await fetch(form.action, { method: "POST", body: new FormData(form), headers: { Accept: "application/json" } });
      const result = await response.json();
      if (result.ok) showAdded(result);
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
