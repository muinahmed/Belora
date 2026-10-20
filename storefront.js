import db from "./database/database.js";

// Storefront data access and shared markup. Route handling stays in main.js.

export const BRAND = "Bellora BD";
export const DELIVERY_CHARGES = { "Inside Dhaka": 70, "Outside Dhaka": 130 };
export const PAGE_SIZE = 24;
// International format without "+", e.g. 8801712345678. Empty when not set.
export const SHOP_WHATSAPP_NUMBER = (Deno.env.get("SHOP_WHATSAPP_NUMBER") || "").replace(/\D/g, "");
export const RETURNS_POLICY = Deno.env.get("RETURNS_POLICY")?.trim() ||
  "If there is a problem with your order, contact us after delivery and we will help sort it out.";

export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function taka(value) {
  const amount = Number(value) || 0;
  const decimals = Number.isInteger(Math.round(amount * 100) / 100) ? 0 : 2;
  return `৳${amount.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

export function effectivePrice(price, salePrice) {
  const base = Number(price);
  const sale = salePrice === null || salePrice === undefined || salePrice === "" ? null : Number(salePrice);
  return sale !== null && Number.isFinite(sale) && sale >= 0 && sale < base ? sale : base;
}

// ---------- Collections ----------
// The three storefront collections map onto whatever top-level categories the
// admin created, matched by keyword so "Jewellery", "jwellery" or "Earrings"
// all land in the right place. Child categories follow their parent.

export const COLLECTIONS = [
  {
    key: "jewellery",
    title: "Jewellery",
    intro: "Earrings, necklaces, rings and bracelets to wear every day and keep for years.",
    keywords: ["jewel", "jwel", "jewl", "earring", "necklace", "ring", "bracelet", "bangle", "pendant", "anklet", "chain"],
    image: "/images/collection-jewellery.jpg"
  },
  {
    key: "makeup",
    title: "Makeup",
    intro: "Colour for lips, eyes and cheeks, with a shade for every skin tone.",
    keywords: ["makeup", "make-up", "cosmetic", "lip", "blush", "eyeshadow", "eye-shadow", "mascara", "liner", "kajal", "foundation", "concealer", "powder", "highlight", "nail"],
    image: "/images/collection-makeup.jpg"
  },
  {
    key: "skincare",
    title: "Skincare",
    intro: "Cleansers, serums and moisturisers for a simple, steady daily routine.",
    keywords: ["skin", "serum", "cleanser", "moisturi", "toner", "sunscreen", "facewash", "face-wash", "mask"],
    image: "/images/collection-skincare.jpg"
  }
];

export function getCollection(key) {
  return COLLECTIONS.find(collection => collection.key === key) ?? null;
}

function allCategories() {
  return db.query("SELECT id, name, slug, parent_id FROM categories ORDER BY name").map(([id, name, slug, parentId]) => ({
    id: Number(id), name, slug, parentId: parentId === null ? null : Number(parentId)
  }));
}

function collectionKeyFor(category) {
  const haystack = `${category.slug} ${String(category.name).toLowerCase()}`;
  return COLLECTIONS.find(collection => collection.keywords.some(keyword => haystack.includes(keyword)))?.key ?? null;
}

// Returns { key: { roots: [category], ids: [id] } } for every collection.
export function collectionMap() {
  const categories = allCategories();
  const map = Object.fromEntries(COLLECTIONS.map(collection => [collection.key, { roots: [], ids: [] }]));
  for (const root of categories.filter(category => category.parentId === null)) {
    const key = collectionKeyFor(root);
    if (!key) continue;
    map[key].roots.push(root);
    map[key].ids.push(root.id, ...categories.filter(category => category.parentId === root.id).map(category => category.id));
  }
  return map;
}

// Category ids for a slug, including its children.
export function categoryScope(slug) {
  const categories = allCategories();
  const category = categories.find(entry => entry.slug === slug);
  if (!category) return { category: null, ids: [] };
  return {
    category,
    ids: [category.id, ...categories.filter(entry => entry.parentId === category.id).map(entry => entry.id)]
  };
}

export function categoryById(id) {
  return allCategories().find(category => category.id === Number(id)) ?? null;
}

// ---------- Product queries ----------

const IMAGE_SQL = `COALESCE(
  (SELECT image_path FROM product_images WHERE product_id = p.id AND is_main = 1 LIMIT 1),
  (SELECT image_path FROM product_images WHERE product_id = p.id ORDER BY id LIMIT 1),
  (SELECT image_path FROM product_variants WHERE product_id = p.id AND image_path IS NOT NULL AND image_path <> '' ORDER BY id LIMIT 1),
  '')`;
const PRICE_SQL = "(CASE WHEN p.sale_price IS NOT NULL AND p.sale_price >= 0 AND p.sale_price < p.price THEN p.sale_price ELSE p.price END)";
const ON_SALE_SQL = "(p.sale_price IS NOT NULL AND p.sale_price >= 0 AND p.sale_price < p.price)";
const CARD_SQL = `SELECT p.id, p.name, p.price, p.sale_price, p.stock, p.is_featured, c.name, ${IMAGE_SQL},
  (SELECT COUNT(*) FROM product_variants WHERE product_id = p.id)
  FROM products p LEFT JOIN categories c ON c.id = p.category_id`;

function toCard(row) {
  return {
    id: Number(row[0]),
    name: row[1],
    price: Number(row[2]),
    salePrice: row[3] === null ? null : Number(row[3]),
    stock: Number(row[4]),
    featured: Number(row[5]) === 1,
    categoryName: row[6] ?? "",
    image: row[7] ?? "",
    hasVariants: Number(row[8]) > 0
  };
}

function inList(ids) {
  return ids.map(() => "?").join(", ");
}

export const SORTS = {
  newest: { label: "Newest first", sql: "p.id DESC" },
  featured: { label: "Featured", sql: "p.is_featured DESC, p.id DESC" },
  "price-asc": { label: "Price, low to high", sql: `${PRICE_SQL} ASC, p.id DESC` },
  "price-desc": { label: "Price, high to low", sql: `${PRICE_SQL} DESC, p.id DESC` },
  name: { label: "Name, A to Z", sql: "p.name COLLATE NOCASE ASC" }
};

function listingWhere(filters) {
  const where = ["p.is_active = 1"];
  const params = [];
  if (filters.categoryIds) {
    if (!filters.categoryIds.length) where.push("0");
    else { where.push(`p.category_id IN (${inList(filters.categoryIds)})`); params.push(...filters.categoryIds); }
  }
  if (filters.q) {
    where.push("(LOWER(p.name) LIKE LOWER(?) OR LOWER(COALESCE(p.description, '')) LIKE LOWER(?) OR LOWER(COALESCE(c.name, '')) LIKE LOWER(?))");
    params.push(`%${filters.q}%`, `%${filters.q}%`, `%${filters.q}%`);
  }
  if (Number.isFinite(filters.minPrice)) { where.push(`${PRICE_SQL} >= ?`); params.push(filters.minPrice); }
  if (Number.isFinite(filters.maxPrice)) { where.push(`${PRICE_SQL} <= ?`); params.push(filters.maxPrice); }
  if (filters.skinConcern) { where.push("LOWER(COALESCE(p.skin_concern, '')) LIKE LOWER(?)"); params.push(`%${filters.skinConcern}%`); }
  if (filters.material) { where.push("LOWER(COALESCE(p.material, '')) LIKE LOWER(?)"); params.push(`%${filters.material}%`); }
  if (filters.design) {
    where.push("EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND LOWER(v.variant_value) LIKE LOWER(?))");
    params.push(`%${filters.design}%`);
  }
  if (filters.inStock) where.push("p.stock > 0");
  if (filters.onSale) where.push(ON_SALE_SQL);
  return { sql: `WHERE ${where.join(" AND ")}`, params };
}

export function listProducts(filters) {
  const { sql, params } = listingWhere(filters);
  const total = Number(db.query(`SELECT COUNT(*) FROM products p LEFT JOIN categories c ON c.id = p.category_id ${sql}`, params)[0][0]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page || 1), pages);
  const order = (SORTS[filters.sort] ?? SORTS.newest).sql;
  const items = db.query(`${CARD_SQL} ${sql} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, PAGE_SIZE, (page - 1) * PAGE_SIZE]).map(toCard);
  return { items, total, page, pages };
}

// Filter values for the products currently listed. Each group ignores its own filter,
// so its other options stay visible to switch to, but respects every other filter:
// on the Sale page only sale products' shades and materials appear.
export function listingFacets(filters) {
  const without = (...keys) => listingWhere({ ...filters, ...Object.fromEntries(keys.map(key => [key, null])) });
  const FROM = "FROM products p LEFT JOIN categories c ON c.id = p.category_id";
  const distinct = (column, filterKey) => {
    const { sql, params } = without(filterKey);
    return db.query(`
      SELECT MIN(TRIM(p.${column})), COUNT(*) ${FROM}
      ${sql} AND TRIM(COALESCE(p.${column}, '')) <> ''
      GROUP BY LOWER(TRIM(p.${column})) ORDER BY COUNT(*) DESC, 1 LIMIT 12
    `, params).map(([value, count]) => ({ value, count: Number(count) }));
  };
  const shadeScope = without("design");
  const shades = db.query(`
    SELECT MIN(TRIM(v.variant_value)), COUNT(DISTINCT p.id) FROM product_variants v JOIN products p ON p.id = v.product_id
    LEFT JOIN categories c ON c.id = p.category_id
    ${shadeScope.sql} AND TRIM(v.variant_value) <> ''
    GROUP BY LOWER(TRIM(v.variant_value)) ORDER BY COUNT(DISTINCT p.id) DESC, 1 LIMIT 16
  `, shadeScope.params).map(([value, count]) => ({ value, count: Number(count) }));
  const priceScope = without("minPrice", "maxPrice");
  const range = db.query(`SELECT MIN(${PRICE_SQL}), MAX(${PRICE_SQL}) ${FROM} ${priceScope.sql}`, priceScope.params)[0];
  const saleScope = without("onSale");
  const saleCount = db.query(`SELECT COUNT(*) ${FROM} ${saleScope.sql} AND ${ON_SALE_SQL}`, saleScope.params)[0][0];
  return {
    materials: distinct("material", "material"),
    skinConcerns: distinct("skin_concern", "skinConcern"),
    shades,
    minPrice: range[0] === null ? null : Math.floor(Number(range[0])),
    maxPrice: range[1] === null ? null : Math.ceil(Number(range[1])),
    saleCount: Number(saleCount ?? 0)
  };
}

export function countActive(categoryIds) {
  if (!categoryIds.length) return 0;
  return Number(db.query(`SELECT COUNT(*) FROM products WHERE is_active = 1 AND category_id IN (${inList(categoryIds)})`, categoryIds)[0][0]);
}

// Categories within a collection that hold products directly, for the filter chips.
export function categoriesWithCounts(categoryIds) {
  if (!categoryIds.length) return [];
  return db.query(`
    SELECT c.id, c.name, c.slug, (SELECT COUNT(*) FROM products p WHERE p.is_active = 1 AND p.category_id = c.id) AS count
    FROM categories c WHERE c.id IN (${inList(categoryIds)}) AND count > 0 ORDER BY c.name COLLATE NOCASE
  `, categoryIds).map(([id, name, slug, count]) => ({ id: Number(id), name, slug, count: Number(count) }));
}

export function shelf(kind, limit = 8, categoryIds = null) {
  const scope = categoryIds ? `AND p.category_id IN (${inList(categoryIds)})` : "";
  const params = categoryIds ?? [];
  if (kind === "bestsellers") {
    return db.query(`${CARD_SQL}
      JOIN (SELECT product_id, SUM(quantity) AS sold FROM order_items oi JOIN orders o ON o.id = oi.order_id
            WHERE o.status <> 'Cancelled' GROUP BY product_id) s ON s.product_id = p.id
      WHERE p.is_active = 1 ${scope} ORDER BY s.sold DESC, p.id DESC LIMIT ?`, [...params, limit]).map(toCard);
  }
  const where = { featured: "AND p.is_featured = 1", sale: `AND ${ON_SALE_SQL}`, newest: "" }[kind] ?? "";
  return db.query(`${CARD_SQL} WHERE p.is_active = 1 ${where} ${scope} ORDER BY p.id DESC LIMIT ?`, [...params, limit]).map(toCard);
}

// Same-category products first. A small category is topped up from the same collection,
// then from the rest of the shop, so the row is never left with one or two cards.
// Most viewed in-stock products over the last 30 days, then the newest, leaving out
// excludeIds. Used to fill the homepage's bestseller row while there are few orders.
export function popularProducts(limit, excludeIds = []) {
  if (limit < 1) return [];
  const exclude = excludeIds.length ? `AND p.id NOT IN (${inList(excludeIds)})` : "";
  return db.query(`${CARD_SQL}
    LEFT JOIN (SELECT product_id, COUNT(*) AS views FROM analytics_events
               WHERE event_type = 'product_view' AND created_at >= datetime('now', '-30 days') GROUP BY product_id) v ON v.product_id = p.id
    WHERE p.is_active = 1 AND p.stock > 0 ${exclude}
    ORDER BY COALESCE(v.views, 0) DESC, p.is_featured DESC, p.id DESC LIMIT ?`, [...excludeIds, limit]).map(toCard);
}

export function relatedProducts(productId, categoryId, limit = 4, collectionIds = []) {
  const picked = db.query(`${CARD_SQL} WHERE p.is_active = 1 AND p.id <> ? AND (p.category_id = ? OR ? IS NULL)
    ORDER BY p.stock > 0 DESC, p.id DESC LIMIT ?`, [productId, categoryId, categoryId, limit]).map(toCard);
  if (picked.length >= limit) return picked;
  const exclude = [productId, ...picked.map(product => product.id)];
  const sameCollection = collectionIds.length ? `p.category_id IN (${inList(collectionIds)})` : "0";
  const extra = db.query(`${CARD_SQL} WHERE p.is_active = 1 AND p.id NOT IN (${inList(exclude)})
    ORDER BY ${sameCollection} DESC, p.stock > 0 DESC, p.id DESC LIMIT ?`, [...exclude, ...collectionIds, limit - picked.length]).map(toCard);
  return [...picked, ...extra];
}

// ---------- Markup ----------

const icons = {
  search: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>`,
  bag: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1.2 12H6.2z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/></svg>`,
  home: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z"/></svg>`,
  grid: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6.5" height="6.5"/><rect x="13.5" y="4" width="6.5" height="6.5"/><rect x="4" y="13.5" width="6.5" height="6.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5"/></svg>`,
  check: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`,
  chat: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5a8.5 8.5 0 0 0-7.4 12.7L3.5 20.5l4.4-1.1A8.5 8.5 0 1 0 12 3.5z"/><path d="M8.5 10.5h7M8.5 13.5h4.5"/></svg>`
};
export { icons };

export function wordmark(extraClass = "") {
  return `<a class="wordmark ${extraClass}" href="/" aria-label="${BRAND} home"><img src="/images/bellora-logo.png" alt="Bellora" width="900" height="272"></a>`;
}

export function siteHeader({ active = "", cartCount = 0, query = "" } = {}) {
  const link = (href, key, label) => `<a href="${href}" ${active === key ? `aria-current="page"` : ""}>${label}</a>`;
  // Collections with a hover/focus dropdown of their sub-categories that have products.
  const collections = collectionMap();
  const collectionLink = (collection) => {
    const categories = categoriesWithCounts(collections[collection.key].ids);
    const menu = categories.length > 1
      ? `<div class="nav-menu">
          ${categories.map(category => `<a href="/collections/${collection.key}?category=${encodeURIComponent(category.slug)}">${escapeHtml(displayName(category.name))}</a>`).join("")}
          <a class="nav-menu-all" href="/collections/${collection.key}">All ${collection.title.toLowerCase()}</a>
        </div>`
      : "";
    return `<div class="nav-item${menu ? " has-menu" : ""}">${link(`/collections/${collection.key}`, collection.key, collection.title)}${menu}</div>`;
  };
  return `
<div class="promo-bar"><div class="wrap"><p>Cash on delivery across Bangladesh</p><p class="promo-secondary">Pay by cash, bKash or Nagad</p></div></div>
<header class="site-header">
  <div class="wrap header-row">
    <nav class="primary-nav" aria-label="Collections">
      ${COLLECTIONS.map(collectionLink).join("")}
      ${link("/products?sale=1", "sale", "Sale")}
      ${link("/products", "shop", "Shop all")}
    </nav>
    ${wordmark()}
    <div class="header-tools">
      <form class="header-search" method="GET" action="/products" role="search">
        <label class="search-icon" for="site-search">${icons.search}<span class="visually-hidden">Search products</span></label>
        <input id="site-search" name="q" type="search" value="${escapeHtml(query)}" placeholder="Search jewellery, makeup, skincare" enterkeyhint="search" autocomplete="off">
      </form>
      <a class="bag-link" href="/cart" aria-label="Shopping bag, ${cartCount} ${cartCount === 1 ? "item" : "items"}">${icons.bag}<span>Bag</span>${cartCount ? `<b class="bag-count">${cartCount}</b>` : ""}</a>
    </div>
  </div>
</header>
<nav class="mobile-bottom-nav" aria-label="Mobile navigation">
  <a href="/" ${active === "home" ? `aria-current="page"` : ""}>${icons.home}Home</a>
  <a href="/products" ${["shop", "jewellery", "makeup", "skincare", "sale"].includes(active) ? `aria-current="page"` : ""}>${icons.grid}Shop</a>
  <a href="/cart" ${active === "bag" ? `aria-current="page"` : ""}>${icons.bag}Bag${cartCount ? ` (${cartCount})` : ""}</a>
</nav>`;
}

// contact: { whatsapp, phone, facebook, instagram, tiktok }, each optional. Unset ones are left out.
export function siteFooter(contact = {}, { scriptSrc = "" } = {}) {
  const { whatsapp = "", phone = "", facebook = "", instagram = "", tiktok = "" } = contact;
  const socials = [["Facebook", facebook], ["Instagram", instagram], ["TikTok", tiktok]].filter(([, href]) => href);
  const contactLinks = [
    phone ? `<a href="tel:${escapeHtml(phone)}">Call ${escapeHtml(phone)}</a>` : "",
    whatsapp ? `<a target="_blank" rel="noreferrer" href="https://wa.me/${whatsapp}">WhatsApp us</a>` : "",
    ...socials.map(([label, href]) => `<a target="_blank" rel="noreferrer" href="${escapeHtml(href)}">${label}</a>`)
  ].filter(Boolean);
  return `
<footer class="site-footer">
  <div class="wrap footer-grid${contactLinks.length ? " has-contact" : ""}">
    <div class="footer-brand">
      ${wordmark()}
      <p>Jewellery, makeup and skincare, chosen piece by piece and delivered across Bangladesh.</p>
    </div>
    <nav aria-label="Shop">
      <h2>Shop</h2>
      ${COLLECTIONS.map(collection => `<a href="/collections/${collection.key}">${collection.title}</a>`).join("")}
      <a href="/products?sale=1">Sale</a>
      <a href="/products?sort=newest">New arrivals</a>
      <a href="/track-order">Track your order</a>
    </nav>
    <div>
      <h2>Delivery and payment</h2>
      <p>${taka(DELIVERY_CHARGES["Inside Dhaka"])} delivery inside Dhaka, ${taka(DELIVERY_CHARGES["Outside Dhaka"])} everywhere else in Bangladesh.</p>
      <p>Pay with cash on delivery, bKash or Nagad.</p>
    </div>
    ${contactLinks.length ? `<nav aria-label="Contact us">
      <h2>Contact us</h2>
      ${contactLinks.join("")}
    </nav>` : ""}
  </div>
  <div class="wrap footer-base">
    <p>© ${new Date().getFullYear()} ${BRAND}</p>
    <a href="/admin/login">Staff login</a>
  </div>
</footer>
${whatsapp ? `<a class="wa-float" target="_blank" rel="noreferrer" href="https://wa.me/${whatsapp}" aria-label="Message us on WhatsApp">${icons.chat}<span>WhatsApp</span></a>` : ""}
<div class="added-panel" role="dialog" aria-labelledby="added-title" hidden>
  <div class="added-head">
    <span class="added-mark" aria-hidden="true">${icons.check}</span>
    <div>
      <p class="added-title" id="added-title">Added to bag</p>
      <p class="added-item"></p>
    </div>
    <button class="added-close" type="button" aria-label="Close">×</button>
  </div>
  <div class="added-actions">
    <a class="btn btn-dark" href="/checkout">Checkout</a>
    <button class="btn btn-ghost added-continue" type="button">Continue shopping</button>
  </div>
</div>
${scriptSrc ? `<script src="${scriptSrc}"></script>` : ""}`;
}

export function productCard(product) {
  const onSale = effectivePrice(product.price, product.salePrice) < product.price;
  const now = effectivePrice(product.price, product.salePrice);
  const discount = onSale ? Math.round((1 - now / product.price) * 100) : 0;
  const image = product.image
    ? `<img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy" decoding="async">`
    : `<span class="media-placeholder" aria-hidden="true">B</span>`;
  const tag = product.stock < 1
    ? `<span class="tag tag-soldout">Sold out</span>`
    : onSale ? `<span class="tag tag-sale">${discount}% off</span>` : "";
  const stock = product.stock < 1 ? "" : product.stock <= 5
    ? `<p class="card-stock low">Only ${product.stock} left</p>`
    : `<p class="card-stock">In stock</p>`;
  // Sold out: ask on WhatsApp. Shades to choose: open the product. Otherwise add straight from the card.
  let action = "";
  if (product.stock < 1) {
    action = SHOP_WHATSAPP_NUMBER
      ? `<a class="card-action card-ask" target="_blank" rel="noreferrer" href="https://wa.me/${SHOP_WHATSAPP_NUMBER}?text=${encodeURIComponent(`Hello! Is "${product.name}" back in stock?`)}">Ask on WhatsApp</a>`
      : "";
  } else if (product.hasVariants) {
    action = `<a class="card-action" href="/product/${product.id}">Choose option</a>`;
  } else {
    action = `<form class="card-add" method="POST" action="/cart/add">
        <input type="hidden" name="product_id" value="${product.id}"><input type="hidden" name="quantity" value="1">
        <button class="card-action" type="submit" aria-label="Add ${escapeHtml(product.name)} to bag">${icons.plus}Add to bag</button>
      </form>`;
  }
  return `<article class="card${product.stock < 1 ? " is-soldout" : ""}">
    <a class="card-media" href="/product/${product.id}" tabindex="-1" aria-hidden="true">${image}${tag}</a>
    <div class="card-body">
      ${product.categoryName ? `<p class="card-category">${escapeHtml(product.categoryName)}</p>` : ""}
      <h3><a href="/product/${product.id}">${escapeHtml(product.name)}</a></h3>
      <p class="card-price"><span${onSale ? ` class="price-sale"` : ""}>${taka(now)}</span>${onSale ? ` <s>${taka(product.price)}</s>` : ""}</p>
      ${stock}
    </div>
    ${action}
  </article>`;
}

export function productGrid(products, extraClass = "") {
  return `<div class="product-grid ${extraClass}">${products.map(productCard).join("")}</div>`;
}

export function shelfSection(title, products, viewAllHref, viewAllLabel, extraClass = "") {
  if (!products.length) return "";
  return `<section class="shelf ${extraClass}">
    <div class="wrap">
      <div class="shelf-head"><h2>${title}</h2>${viewAllHref ? `<a class="text-link" href="${viewAllHref}">${viewAllLabel}</a>` : ""}</div>
      ${productGrid(products)}
    </div>
  </section>`;
}

export function breadcrumbs(items) {
  return `<nav class="crumbs" aria-label="Breadcrumb"><ol>${items.map(([label, href], index) =>
    index === items.length - 1 || !href
      ? `<li aria-current="page">${escapeHtml(label)}</li>`
      : `<li><a href="${href}">${escapeHtml(label)}</a></li>`
  ).join("")}</ol></nav>`;
}

export function pagination(page, pages, hrefFor) {
  if (pages <= 1) return "";
  const numbers = [...new Set([1, page - 1, page, page + 1, pages])].filter(n => n >= 1 && n <= pages).sort((a, b) => a - b);
  const parts = [];
  numbers.forEach((n, index) => {
    if (index && n - numbers[index - 1] > 1) parts.push(`<span class="page-gap" aria-hidden="true">…</span>`);
    parts.push(n === page
      ? `<span class="page-num" aria-current="page">${n}</span>`
      : `<a class="page-num" href="${hrefFor(n)}" aria-label="Page ${n}">${n}</a>`);
  });
  return `<nav class="pagination" aria-label="Pages">
    ${page > 1 ? `<a class="page-step" href="${hrefFor(page - 1)}" rel="prev">Previous</a>` : `<span class="page-step" aria-disabled="true">Previous</span>`}
    <div class="page-list">${parts.join("")}</div>
    ${page < pages ? `<a class="page-step" href="${hrefFor(page + 1)}" rel="next">Next</a>` : `<span class="page-step" aria-disabled="true">Next</span>`}
  </nav>`;
}

// Category names are typed in the admin and are sometimes lowercase ("blush").
export function displayName(name = "") {
  const text = String(name).trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}
