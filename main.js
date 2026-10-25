import db from "./database/database.js";
import { asset, imageVersion, versionImagePaths } from "./assets.js";
import {
  BRAND, COLLECTIONS, DELIVERY_CHARGES, PAGE_SIZE, RETURNS_POLICY, SORTS, breadcrumbs, categoryById, categoryScope,
  categoriesWithCounts, collectionMap, countActive, effectivePrice, escapeHtml,
  getCollection, icons, listProducts, listingFacets, pagination, productGrid, relatedProducts,
  displayName, formatText, popularProducts, productPath, shelf, shelfSection, siteFooter, siteHeader, taka, SHOP_WHATSAPP_NUMBER
} from "./storefront.js";

const publicDir = "./public";
const dataDir = Deno.env.get("DATA_DIR") || publicDir;
const uploadDir = `${dataDir}/uploads/products`;
const PORT = Number(Deno.env.get("PORT") || 8000);

const ADMIN_USERNAME = Deno.env.get("ADMIN_USERNAME")?.trim();
const ADMIN_PASSWORD = Deno.env.get("ADMIN_PASSWORD");
// Footer contact details. Social links must be full https:// addresses; anything else is ignored.
const socialLink = (name) => {
  const value = (Deno.env.get(name) || "").trim();
  return /^https:\/\/[^\s"'<>]+$/.test(value) ? value : "";
};
const SHOP_CONTACT = {
  whatsapp: SHOP_WHATSAPP_NUMBER,
  phone: (Deno.env.get("SHOP_PHONE") || "").replace(/[^\d+]/g, ""),
  facebook: socialLink("FACEBOOK_URL"),
  instagram: socialLink("INSTAGRAM_URL"),
  tiktok: socialLink("TIKTOK_URL")
};
const PUBLIC_BASE_URL = (Deno.env.get("PUBLIC_BASE_URL") || "").replace(/\/$/, "");
// Numbers customers send bKash / Nagad payments to. When one is set, checkout shows it
// and asks for the transaction ID; when it isn't, the method is only recorded as before.
const PAYMENT_NUMBERS = {
  bKash: normalizeBdPhone(Deno.env.get("BKASH_NUMBER") || ""),
  Nagad: normalizeBdPhone(Deno.env.get("NAGAD_NUMBER") || "")
};

if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
  throw new Error("ADMIN_USERNAME and ADMIN_PASSWORD environment variables must be set.");
}

const ORDER_STATUSES = ["Pending", "Confirmed", "Processing", "Out for Delivery", "Delivered", "Cancelled"];
// Admin order list date filters. Days are counted in Bangladesh time (UTC+6); the
// database stores UTC.
const ORDER_RANGES = [
  ["", "Any time"],
  ["today", "Today", "date(created_at, '+6 hours') = date('now', '+6 hours')"],
  ["7d", "Last 7 days", "created_at >= datetime('now', '-7 days')"],
  ["30d", "Last 30 days", "created_at >= datetime('now', '-30 days')"],
  ["month", "This month", "strftime('%Y-%m', created_at, '+6 hours') = strftime('%Y-%m', 'now', '+6 hours')"]
];

// Reads the admin order filters (status, search, date range) shared by the order list
// and its CSV download. Unknown values are ignored.
function orderFilters(searchParams) {
  const state = {
    status: ORDER_STATUSES.includes(searchParams.get("status")) ? searchParams.get("status") : "",
    range: ORDER_RANGES.some(([key]) => key && key === searchParams.get("range")) ? searchParams.get("range") : "",
    q: searchParams.get("q")?.trim() ?? ""
  };
  const conditions = [];
  const params = [];
  if (state.status) { conditions.push("status = ?"); params.push(state.status); }
  if (state.range) conditions.push(ORDER_RANGES.find(([key]) => key === state.range)[2]);
  if (state.q) {
    conditions.push("(CAST(id AS TEXT) LIKE ? OR customer_name LIKE ? OR phone LIKE ? OR transaction_id LIKE ?)");
    params.push(`%${state.q}%`, `%${state.q}%`, `%${state.q}%`, `%${state.q}%`);
  }
  return { state, where: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "", params };
}

// One CSV cell. Text that Excel would run as a formula (=, +, -, @) is prefixed with an
// apostrophe. Phone numbers are written as ="017..." so Excel keeps the leading zero.
function csvCell(value) {
  if (value && typeof value === "object" && "phone" in value) {
    return /^\d+$/.test(String(value.phone)) ? `"=""${value.phone}"""` : csvCell(value.phone);
  }
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (typeof value !== "number" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) || text !== text.trim() ? `"${text.replaceAll('"', '""')}"` : text;
}
const DISTRICTS = ["Bagerhat", "Bandarban", "Barguna", "Barishal", "Bhola", "Bogura", "Brahmanbaria", "Chandpur", "Chapainawabganj", "Chattogram", "Chuadanga", "Cumilla", "Cox's Bazar", "Dhaka", "Dinajpur", "Faridpur", "Feni", "Gaibandha", "Gazipur", "Gopalganj", "Habiganj", "Jamalpur", "Jashore", "Jhalokathi", "Jhenaidah", "Joypurhat", "Khagrachhari", "Khulna", "Kishoreganj", "Kurigram", "Kushtia", "Lakshmipur", "Lalmonirhat", "Madaripur", "Magura", "Manikganj", "Meherpur", "Moulvibazar", "Munshiganj", "Mymensingh", "Naogaon", "Narail", "Narayanganj", "Narsingdi", "Natore", "Netrokona", "Nilphamari", "Noakhali", "Pabna", "Panchagarh", "Patuakhali", "Pirojpur", "Rajbari", "Rajshahi", "Rangamati", "Rangpur", "Satkhira", "Shariatpur", "Sherpur", "Sirajganj", "Sunamganj", "Sylhet", "Tangail", "Thakurgaon"];

function slugify(value = "") {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// The site's public address: PUBLIC_BASE_URL when set, otherwise this request's host.
// Railway ends HTTPS at its proxy, so the scheme comes from X-Forwarded-Proto.
function siteOrigin(request) {
  if (PUBLIC_BASE_URL) return PUBLIC_BASE_URL;
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  return `${proto === "https" || proto === "http" ? proto : url.protocol.slice(0, -1)}://${url.host}`;
}

// JSON-LD for structured data. "<" is escaped so the text can't close the script tag.
function jsonLd(data) {
  return `<script type="application/ld+json">${JSON.stringify(data).replaceAll("<", "\\u003c")}</script>`;
}

// Breadcrumb trail for Google, from the same [label, href] pairs as the visible breadcrumbs.
// The last item (the current page, without href) uses currentPath.
function breadcrumbData(items, origin, currentPath) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map(([label, href], index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: label,
      item: `${origin}${href || currentPath}`
    }))
  };
}

function page(title, content, options = {}) {
  const description = options.description || `Shop makeup, skincare and jewellery at ${BRAND}, with cash on delivery across Bangladesh.`;
  const image = options.image || asset("/images/beauty-hero-banner.jpg");
  const absolute = (path) => PUBLIC_BASE_URL ? `${PUBLIC_BASE_URL}${path}` : path;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} — ${BRAND}</title>
  <meta name="description" content="${escapeHtml(description)}">
  ${options.canonical && PUBLIC_BASE_URL ? `<link rel="canonical" href="${escapeHtml(absolute(options.canonical))}">` : ""}
  ${options.noindex ? `<meta name="robots" content="noindex">` : ""}
  <meta property="og:site_name" content="${BRAND}">
  <meta property="og:type" content="${options.ogType || "website"}">
  <meta property="og:title" content="${escapeHtml(title)} — ${BRAND}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="${escapeHtml(absolute(image))}">
  ${options.canonical && PUBLIC_BASE_URL ? `<meta property="og:url" content="${escapeHtml(absolute(options.canonical))}">` : ""}
  <meta name="twitter:card" content="summary_large_image">
  ${(options.meta ?? []).map(([property, content]) => `<meta property="${escapeHtml(property)}" content="${escapeHtml(content)}">`).join("\n  ")}
  <meta name="theme-color" content="#FBF7F1">
  <link rel="icon" href="${asset("/images/bellora-icon.png")}" type="image/png">
  <link rel="apple-touch-icon" href="${asset("/images/bellora-icon.png")}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..700;1,6..96,400..600&family=Jost:wght@400;500;600&display=swap">
  <link rel="stylesheet" href="/css/style.css?v=${STYLESHEET_VERSION}">
  ${(options.jsonLd ?? []).map(jsonLd).join("\n  ")}
</head>
<body>
<a class="skip-link" href="#main-content">Skip to content</a>
${content}
</body>
</html>`;
}

function redirect(location) {
  return new Response(null, {
    status: 303,
    headers: { Location: location }
  });
}

function cookie(request, name) {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [key, ...values] = part.trim().split("=");
    if (key === name) return decodeURIComponent(values.join("="));
  }
  return null;
}

// Cart and admin session ids are random UUIDs; anything else in the cookie is ignored.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CART_MAX_AGE_DAYS = 30;
const ADMIN_SESSION_HOURS = 12;

function isSecureRequest(request) {
  return new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
}

function cartIdFor(request) {
  const id = cookie(request, "spark_cart");
  return id && UUID_PATTERN.test(id) ? id : null;
}

// Bags are stored in the database so they survive restarts and redeploys.
const carts = {
  get(id) {
    if (!id) return undefined;
    const row = db.query("SELECT items FROM carts WHERE id = ?", [id])[0];
    if (!row) return undefined;
    try {
      const items = JSON.parse(row[0]);
      return Array.isArray(items) ? items : [];
    } catch {
      return [];
    }
  },
  has(id) {
    return Boolean(id) && db.query("SELECT 1 FROM carts WHERE id = ?", [id]).length > 0;
  },
  set(id, items) {
    if (!id) return;
    db.query(
      "INSERT INTO carts (id, items, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET items = excluded.items, updated_at = excluded.updated_at",
      [id, JSON.stringify(items), Date.now()]
    );
  }
};

function getCart(request) {
  const id = cartIdFor(request);
  if (!id) return [];
  return carts.get(id) ?? [];
}

function ensureCart(request) {
  let id = cartIdFor(request);
  if (!id) id = crypto.randomUUID();
  if (!carts.has(id)) carts.set(id, []);
  return id;
}

function cartResponse(request, response, cartId = null) {
  const existing = cartIdFor(request);

  if (existing) return response;

  const id = cartId || ensureCart(request);
  const headers = new Headers(response.headers);
  headers.append(
    "Set-Cookie",
    `spark_cart=${encodeURIComponent(id)}; Path=/; Max-Age=${CART_MAX_AGE_DAYS * 24 * 60 * 60}; HttpOnly; SameSite=Lax${isSecureRequest(request) ? "; Secure" : ""}`
  );
  return new Response(response.body, {
    status: response.status,
    headers
  });
}

function isAdmin(request) {
  const token = cookie(request, "spark_admin");
  if (!token || !UUID_PATTERN.test(token)) return false;
  return db.query("SELECT 1 FROM admin_sessions WHERE token = ? AND expires_at > ?", [token, Date.now()]).length > 0;
}

// Compares secrets without leaking, through response timing, how much of a guess was right.
async function sameSecret(given = "", expected = "") {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([given, expected].map(value =>
    crypto.subtle.digest("SHA-256", encoder.encode(String(value)))
  ));
  const left = new Uint8Array(a);
  const right = new Uint8Array(b);
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left[index] ^ right[index];
  return difference === 0;
}

// At most LOGIN_LIMIT failed admin logins per address in LOGIN_WINDOW_MS.
const LOGIN_LIMIT = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginFailures = new Map();

function recentLoginFailures(ip) {
  const cutoff = Date.now() - LOGIN_WINDOW_MS;
  const recent = (loginFailures.get(ip) ?? []).filter(time => time > cutoff);
  if (recent.length) loginFailures.set(ip, recent);
  else loginFailures.delete(ip);
  return recent;
}

// Removes abandoned bags, expired admin logins and old analytics. Runs at startup and every 6 hours.
function cleanUpStoredData() {
  try {
    db.query("DELETE FROM carts WHERE updated_at < ?", [Date.now() - CART_MAX_AGE_DAYS * 24 * 60 * 60 * 1000]);
    db.query("DELETE FROM admin_sessions WHERE expires_at <= ?", [Date.now()]);
    db.query("DELETE FROM analytics_events WHERE created_at < datetime('now', '-90 days')");
  } catch (error) {
    console.error("Cleanup failed", error);
  }
}

function adminGuard(request) {
  if (!isAdmin(request)) return redirect("/admin/login");
  return null;
}

function cartCount(request) {
  return getCartDetails(request).reduce((sum, item) => sum + item.quantity, 0);
}

function storeHeader(request, active = "", query = "") {
  return siteHeader({ active, cartCount: cartCount(request), query });
}

function storeFooter() {
  return siteFooter(SHOP_CONTACT, { scriptSrc: `/js/store.js?v=${STORE_SCRIPT_VERSION}` });
}

function html(body, status = 200) {
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

function adminHeader(title) {
  return `
<header class="admin-header">
  <div>
    <a class="wordmark" href="/admin/dashboard" aria-label="Bellora admin dashboard"><img src="${asset("/images/bellora-logo.png")}" alt="Bellora" width="900" height="272"></a>
    <strong>${escapeHtml(title)}</strong>
  </div>
  <nav>
    <a href="/admin/dashboard">Dashboard</a>
    <a href="/admin/products">Products</a>
    <a href="/admin/categories">Categories</a>
    <a href="/admin/collections">Collections</a>
    <a href="/admin/orders">Orders</a>
    <form method="POST" action="/admin/logout"><button class="link-button">Logout</button></form>
  </nav>
</header>`;
}

function adminPage(title, content) {
  return page(title, `${adminHeader(title)}<main id="main-content" class="admin-main">${content}</main>`, { noindex: true });
}

// Shown when the admin product form can't be saved. Going back keeps what was typed
// (browsers restore form fields), so the admin only fixes the named problem.
function productFormError(message) {
  return html(adminPage("Product not saved", `
    <div class="page-title"><p class="eyebrow">Catalogue</p><h1>Product not saved</h1></div>
    <p class="error-box" role="alert">${escapeHtml(message)}</p>
    <p class="muted">Nothing was changed. Go back to the form, fix this and save again. Photos you chose will need to be selected again.</p>
    <p><button class="btn" type="button" onclick="history.back()">Back to the form</button>
    <a class="btn btn-light" href="/admin/products">All products</a></p>`), 400);
}

// Sale price and featured flag from the admin product form.
function saleFields(form, price) {
  const raw = form.get("sale_price")?.toString().trim() ?? "";
  const salePrice = raw === "" ? null : Number(raw);
  if (salePrice !== null && (!Number.isFinite(salePrice) || salePrice < 0 || salePrice >= price)) {
    return { error: "Sale price must be a number lower than the regular price, or left empty." };
  }
  return { salePrice, featured: form.get("is_featured") === "1" ? 1 : 0 };
}

function getProduct(id) {
  const rows = db.query(`
    SELECT p.id, p.category_id, p.name, p.slug, p.description,
           p.price, p.sku, p.stock, p.is_active, p.skin_concern, p.ingredients,
           p.how_to_use, p.material, p.size_info, p.care_instructions,
           c.name AS category_name,
           COALESCE(
             (SELECT image_path FROM product_images
              WHERE product_id = p.id AND is_main = 1 LIMIT 1), ''
           ) AS image_path,
           p.sale_price, p.is_featured, p.search_keywords
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.id = ?
  `, [id]);

  if (!rows.length) return null;

  const row = rows[0];
  const variants = db.query(`
    SELECT id, variant_name, variant_value, image_path, stock
    FROM product_variants
    WHERE product_id = ?
    ORDER BY id
  `, [id]);

  const images = db.query(`
  SELECT image_path, is_main, id
  FROM product_images
  WHERE product_id = ?
  ORDER BY is_main DESC, id ASC
`, [id]);

  return {
    id: row[0],
    categoryId: row[1],
    name: row[2],
    slug: row[3],
    description: row[4] ?? "",
    price: Number(row[5]),
    sku: row[6] ?? "",
    stock: Number(row[7]),
    active: Number(row[8]) === 1,
    skinConcern: row[9] ?? "",
    ingredients: row[10] ?? "",
    howToUse: row[11] ?? "",
    material: row[12] ?? "",
    sizeInfo: row[13] ?? "",
    careInstructions: row[14] ?? "",
    categoryName: row[15] ?? "Uncategorised",
    imagePath: row[16] ?? "",
    salePrice: row[17] === null ? null : Number(row[17]),
    featured: Number(row[18]) === 1,
    searchKeywords: row[19] ?? "",
    // The price customers pay: the sale price while it is valid, else the regular price.
    unitPrice: effectivePrice(row[5], row[17]),
    images: images.map(image => ({
      path: image[0],
      isMain: Number(image[1]) === 1,
      id: Number(image[2])
    })),
    variants: variants.map(v => ({
      id: v[0],
      name: v[1],
      value: v[2],
      imagePath: v[3] ?? "",
      stock: v[4] === null ? null : Number(v[4])
    }))
  };
}

// Resolves the stored cart against the database. Items whose product was deleted or
// deactivated, or whose variant no longer exists, are dropped from the stored cart too.
function getCartDetails(request) {
  const cart = getCart(request);
  const details = cart.map(item => {
    const product = getProduct(item.productId);
    if (!product || !product.active) return null;
    const variant = item.variantId
      ? product.variants.find(entry => entry.id === item.variantId)
      : null;
    if (item.variantId && !variant) return null;
    return {
      ...item,
      product,
      variant,
      imagePath: variant?.imagePath || product.imagePath,
      availableStock: variant?.stock ?? product.stock,
      lineTotal: product.unitPrice * item.quantity
    };
  });
  const valid = details.filter(Boolean);
  const id = cartIdFor(request);
  if (id && valid.length !== cart.length) {
    carts.set(id, cart.filter((_, index) => details[index]));
  }
  return valid;
}

function totalForCart(details) {
  return details.reduce((sum, item) => sum + item.lineTotal, 0);
}

function getSetting(key) {
  return db.query("SELECT value FROM site_settings WHERE key = ?", [key])[0]?.[0] ?? "";
}

function setSetting(key, value) {
  if (value) db.query("INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [key, value]);
  else db.query("DELETE FROM site_settings WHERE key = ?", [key]);
}

// Paragraphs from plain text: blank lines separate paragraphs; everything is escaped.
function textParagraphs(text) {
  return String(text).split(/\n\s*\n/).map(part => part.trim()).filter(Boolean).map(part => `<p>${escapeHtml(part)}</p>`).join("");
}

function trackEvent(eventType, productId = null) {
  db.query("INSERT INTO analytics_events (event_type, product_id) VALUES (?, ?)", [eventType, productId]);
}

function imageMime(path) {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  return "image/jpeg";
}

async function readView(name) {
  return versionImagePaths(await Deno.readTextFile(`./views/${name}`));
}

// Single-pass {{KEY}} substitution. A replacer function keeps "$&"-style
// sequences in product text literal, and inserted content is never re-scanned.
function fill(template, values) {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (match, key) => key in values ? String(values[key]) : match);
}

function notFound(request) {
  return html(page("Page not found", `${storeHeader(request)}
    <main id="main-content" class="wrap empty-state not-found">
      <h1>We could not find that page</h1>
      <p>The product may have sold out or moved.</p>
      <div class="empty-links">${COLLECTIONS.map(collection => `<a class="btn btn-ghost" href="/collections/${collection.key}">Shop ${collection.title.toLowerCase()}</a>`).join("")}</div>
    </main>${storeFooter()}`, { noindex: true }), 404);
}

// Returns a message for an unacceptable upload, or null when it is fine or absent.
function imageProblem(file) {
  if (!(file instanceof File) || file.size === 0) return null;
  if (!file.type.startsWith("image/")) return `"${file.name}" is not an image. Please upload JPG, PNG, WebP or GIF photos.`;
  if (file.size > 5 * 1024 * 1024) return `"${file.name}" is larger than 5 MB. Please upload a smaller photo.`;
  return null;
}

// The browser-reported type can be anything, so the file's first bytes decide what it is.
async function detectImageType(file) {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const ascii = (start, end) => String.fromCharCode(...bytes.slice(start, end));
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return "jpg";
  if (bytes[0] === 0x89 && ascii(1, 4) === "PNG") return "png";
  if (ascii(0, 4) === "GIF8") return "gif";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  return null;
}

// Checks every upload in a form, including its contents. Returns the first problem, or null.
async function uploadsProblem(files) {
  for (const file of files) {
    const problem = imageProblem(file);
    if (problem) return problem;
    if (file instanceof File && file.size > 0 && !await detectImageType(file)) {
      return `"${file.name}" is not a JPG, PNG, WebP or GIF photo. Please upload a different file.`;
    }
  }
  return null;
}

async function saveUploadedImage(file) {
  if (!(file instanceof File) || file.size === 0) return null;
  const problem = imageProblem(file);
  if (problem) throw new Error(problem);
  const extension = await detectImageType(file);
  if (!extension) throw new Error(`"${file.name}" is not a JPG, PNG, WebP or GIF photo.`);

  const fileName = `${crypto.randomUUID()}.${extension}`;
  const diskPath = `${uploadDir}/${fileName}`;
  const webPath = `/uploads/products/${fileName}`;

  await Deno.mkdir(uploadDir, { recursive: true });
  await Deno.writeFile(diskPath, new Uint8Array(await file.arrayBuffer()));

  return { diskPath, webPath };
}

function categoryOptions(selectedId = null) {
  const rows = db.query(`
    SELECT id, name, parent_id FROM categories
    ORDER BY CASE WHEN parent_id IS NULL THEN 0 ELSE 1 END, name
  `);
  return rows.map(([id, name, parentId]) =>
    `<option value="${id}" ${Number(id) === Number(selectedId) ? "selected" : ""}>${parentId ? "— " : ""}${escapeHtml(name)}</option>`
  ).join("");
}

function parentCategoryOptions(selectedId = null, excludeId = null) {
  const rows = db.query("SELECT id, name FROM categories WHERE parent_id IS NULL ORDER BY name");
  return rows.filter(([id]) => Number(id) !== Number(excludeId)).map(([id, name]) =>
    `<option value="${id}" ${Number(id) === Number(selectedId) ? "selected" : ""}>${escapeHtml(name)}</option>`
  ).join("");
}

// Current shade photos on the edit form, each with a "Remove photo" box.
function designImagePreview(variants = []) {
  const designs = variants.filter(variant => variant.imagePath);
  if (!designs.length) return "";
  return `<div class="design-preview-list">${designs.map(variant => `
    <figure><img src="${escapeHtml(variant.imagePath)}" alt="${escapeHtml(variant.value)}"><figcaption>${escapeHtml(variant.value)}</figcaption>
      <label class="photo-remove"><input type="checkbox" name="remove_variant_image" value="${variant.id}"> Remove photo</label>
    </figure>
  `).join("")}</div>`;
}

// Current gallery photos on the edit form: choose the main photo, or tick photos to remove.
function galleryManager(images = []) {
  if (!images.length) return "";
  return `<div class="gallery-manager">
    <p class="gallery-manager-title">Current gallery photos</p>
    <div class="design-preview-list">${images.map((image, index) => `
      <figure><img src="${escapeHtml(image.path)}" alt="Photo ${index + 1}">
        <label class="photo-main"><input type="radio" name="main_image" value="${image.id}" ${image.isMain ? "checked" : ""}> Main photo</label>
        <label class="photo-remove"><input type="checkbox" name="remove_image" value="${image.id}"> Remove</label>
      </figure>`).join("")}
    </div>
  </div>`;
}

// Deletes an uploaded photo file once no gallery photo or shade uses it any more.
async function removeUnusedUpload(webPath) {
  const match = String(webPath ?? "").match(/^\/uploads\/products\/([\w-]+\.(?:jpg|jpeg|png|webp|gif))$/);
  if (!match) return;
  const stillUsed = db.query("SELECT 1 FROM product_images WHERE image_path = ? UNION ALL SELECT 1 FROM product_variants WHERE image_path = ? LIMIT 1", [webPath, webPath]).length;
  if (!stillUsed) await Deno.remove(`${uploadDir}/${match[1]}`).catch(() => {});
}

// Syncs a product's variants with the form. Existing variants are matched by value and
// updated in place so their ids stay stable for carts and orders; new values are inserted
// and values no longer in the form are deleted.
// Checks the variant fields and works out what to update, insert and delete, without
// writing anything. Returns { error } when a line is invalid.
function planVariants(variantName, variantValue, variantStock, files = [], existing = []) {
  const names = variantName
    ? String(variantValue ?? "").split(/\r?\n/).map(value => value.trim()).filter(Boolean)
    : [];
  const stocks = String(variantStock ?? "").split(/\r?\n/).map(value => value.trim());

  const unmatched = [...existing];
  const planned = [];
  for (const [index, value] of names.entries()) {
    const matchIndex = unmatched.findIndex(variant => variant.value === value);
    const old = matchIndex >= 0 ? unmatched.splice(matchIndex, 1)[0] : null;
    const requestedStock = stocks[index] === "" || stocks[index] === undefined ? old?.stock ?? null : Number(stocks[index]);
    if (requestedStock !== null && (!Number.isInteger(requestedStock) || requestedStock < 0)) {
      return { error: `Stock for "${value}" must be a whole number of 0 or more (line ${index + 1} of the stock list).` };
    }
    const problem = imageProblem(files[index]);
    if (problem) return { error: `Photo for "${value}": ${problem}` };
    planned.push({ value, old, stock: requestedStock, file: files[index] });
  }
  return { variantName, planned, unmatched };
}

async function saveDesignVariants(productId, { variantName, planned, unmatched }) {
  for (const entry of planned) {
    const uploaded = await saveUploadedImage(entry.file);
    const imagePath = uploaded?.webPath || entry.old?.imagePath || null;
    if (entry.old) {
      db.query(
        "UPDATE product_variants SET variant_name = ?, image_path = ?, stock = ? WHERE id = ? AND product_id = ?",
        [variantName, imagePath, entry.stock, entry.old.id, productId]
      );
    } else {
      db.query(
        "INSERT INTO product_variants (product_id, variant_name, variant_value, image_path, stock) VALUES (?, ?, ?, ?, ?)",
        [productId, variantName, entry.value, imagePath, entry.stock]
      );
    }
  }
  for (const removed of unmatched) {
    db.query("DELETE FROM product_variants WHERE id = ? AND product_id = ?", [removed.id, productId]);
  }
}

// Accepts 01XXXXXXXXX, 8801XXXXXXXXX or +8801XXXXXXXXX (spaces and dashes allowed)
// and returns the 11-digit local form, or null when it isn't a Bangladeshi mobile number.
function normalizeBdPhone(value = "") {
  const match = String(value).replace(/[\s-]/g, "").match(/^(?:\+?88)?(01[3-9]\d{8})$/);
  return match ? match[1] : null;
}

// Railway's proxy appends the visitor's address as the last X-Forwarded-For entry;
// earlier entries can be set by the client, so only the last one is trusted.
function clientAddress(request, info) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",").pop().trim();
  return info?.remoteAddr?.hostname ?? "unknown";
}

// At most CHECKOUT_LIMIT placed orders per connection per hour. Many customers share
// a mobile-network address, so the limit stays generous and counts only real orders.
const CHECKOUT_LIMIT = 10;
const CHECKOUT_WINDOW_MS = 60 * 60 * 1000;
const checkoutLog = new Map();

function recentCheckouts(ip) {
  const cutoff = Date.now() - CHECKOUT_WINDOW_MS;
  const recent = (checkoutLog.get(ip) ?? []).filter(time => time > cutoff);
  if (recent.length) checkoutLog.set(ip, recent);
  else checkoutLog.delete(ip);
  return recent;
}

function checkoutAllowed(ip) {
  return recentCheckouts(ip).length < CHECKOUT_LIMIT;
}

function recordCheckout(ip) {
  checkoutLog.set(ip, [...recentCheckouts(ip), Date.now()]);
}

// Order tracking needs the order number and the phone it was placed with. Failed lookups
// are limited per address so phone numbers can't be guessed for an order number.
const TRACK_FAILURE_LIMIT = 10;
const TRACK_WINDOW_MS = 60 * 60 * 1000;
const trackFailures = new Map();

function recentTrackFailures(ip) {
  const cutoff = Date.now() - TRACK_WINDOW_MS;
  const recent = (trackFailures.get(ip) ?? []).filter(time => time > cutoff);
  if (recent.length) trackFailures.set(ip, recent);
  else trackFailures.delete(ip);
  return recent;
}

// Customer-facing names for each order status, in delivery order.
const TRACKING_STEPS = [
  ["Pending", "Order received"],
  ["Confirmed", "Confirmed"],
  ["Processing", "Packing"],
  ["Out for Delivery", "Out for delivery"],
  ["Delivered", "Delivered"]
];

function trackingPage(request, { values = {}, error = "", order = null, status = 200 } = {}) {
  let result = "";
  if (order) {
    const current = TRACKING_STEPS.findIndex(([status]) => status === order.status);
    const steps = order.status === "Cancelled"
      ? `<p class="track-cancelled">This order was cancelled. If you didn't expect this, please contact us.</p>`
      : `<ol class="track-steps">${TRACKING_STEPS.map(([, label], index) =>
          `<li class="${index < current ? "is-done" : index === current ? "is-current" : ""}"${index === current ? ` aria-current="step"` : ""}><span class="track-dot" aria-hidden="true">${index <= current ? icons.check : ""}</span>${label}</li>`
        ).join("")}</ol>`;
    result = `<section class="track-result" aria-labelledby="track-result-title">
      <h2 id="track-result-title">Order #${order.id}</h2>
      <p class="muted">Placed ${escapeHtml(order.placed)} · ${escapeHtml(order.district || "")}</p>
      ${steps}
      <ul class="track-items">${order.items.map(([name, quantity]) => `<li><span>${escapeHtml(name)}</span><b>× ${quantity}</b></li>`).join("")}</ul>
      <dl class="summary-lines">
        <div><dt>Payment</dt><dd>${escapeHtml(order.payment)}</dd></div>
        <div class="summary-total"><dt>Total</dt><dd>${taka(order.total)}</dd></div>
      </dl>
      ${SHOP_WHATSAPP_NUMBER ? `<a class="btn btn-ghost" target="_blank" rel="noreferrer" href="https://wa.me/${SHOP_WHATSAPP_NUMBER}?text=${encodeURIComponent(`Hello! I'm asking about ${BRAND} order #${order.id}.`)}">Ask about this order on WhatsApp</a>` : ""}
    </section>`;
  }
  return html(page("Track your order", `${storeHeader(request)}
    <main id="main-content" class="wrap track-page">
      ${breadcrumbs([["Home", "/"], ["Track your order", ""]])}
      <h1>Track your order</h1>
      <p class="listing-intro">Enter your order number and the phone number you ordered with.</p>
      ${error ? `<p class="error-box" role="alert">${escapeHtml(error)}</p>` : ""}
      <form class="track-form" method="POST" action="/track-order">
        <label>Order number<input name="order" inputmode="numeric" autocomplete="off" placeholder="For example 1024" maxlength="12" value="${escapeHtml(values.order ?? "")}" required></label>
        <label>Phone<input name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="01XXXXXXXXX" maxlength="20" value="${escapeHtml(values.phone ?? "")}" required></label>
        <button class="btn btn-dark" type="submit">Track order</button>
      </form>
      ${result}
    </main>${storeFooter()}`, { noindex: true }), status);
}

async function renderCheckout(request, details, { error = "", values = {}, status = 200 } = {}) {
  const items = details.map(item => `
    <li>
      <span class="summary-thumb">${item.imagePath ? `<img src="${escapeHtml(item.imagePath)}" alt="">` : `<span class="media-placeholder" aria-hidden="true">B</span>`}<b>${item.quantity}</b></span>
      <span class="summary-name">${escapeHtml(item.product.name)}${item.variant ? `<small>${escapeHtml(item.variant.name)}: ${escapeHtml(item.variant.value)}</small>` : ""}</span>
      <strong>${taka(item.lineTotal)}</strong>
    </li>
  `).join("");
  const subtotal = totalForCart(details);
  const area = values.deliveryArea === "Outside Dhaka" ? "Outside Dhaka" : "Inside Dhaka";
  const payment = ["bKash", "Nagad"].includes(values.payment) ? values.payment : "Cash on Delivery";
  const checked = (on) => on ? "checked" : "";

  const view = await readView("checkout.html");
  return html(page("Checkout", fill(view, {
    HEADER: storeHeader(request, "bag"),
    FOOTER: storeFooter(),
    BREADCRUMBS: breadcrumbs([["Home", "/"], ["Bag", "/cart"], ["Checkout", ""]]),
    ERROR: error ? `<p class="error-box" role="alert">${escapeHtml(error)}</p>` : "",
    NAME: escapeHtml(values.name ?? ""),
    PHONE: escapeHtml(values.phone ?? ""),
    PHONE_CONFIRMATION: escapeHtml(values.phoneConfirmation ?? ""),
    EMAIL: escapeHtml(values.email ?? ""),
    ADDRESS: escapeHtml(values.address ?? ""),
    NOTES: escapeHtml(values.notes ?? ""),
    TRANSACTION_ID: escapeHtml(values.transactionId ?? ""),
    PAYMENT_STEPS: ["bKash", "Nagad"].map(method => PAYMENT_NUMBERS[method]
      ? `<div class="payment-steps" data-method="${method}" ${payment === method ? "" : "hidden"}>
          <p><b>Pay with ${method}:</b> use <b>Send Money</b> to <b class="payment-number">${PAYMENT_NUMBERS[method]}</b> for your order total of <b class="payment-total">${taka(subtotal + DELIVERY_CHARGES[area])}</b>, then enter the transaction ID from your ${method} message below.</p>
        </div>`
      : "").join(""),
    TRANSACTION_HIDDEN: PAYMENT_NUMBERS[payment] ? "" : "hidden",
    DISTRICT_PLACEHOLDER_SELECTED: DISTRICTS.includes(values.district) ? "" : "selected",
    INSIDE_CHECKED: checked(area === "Inside Dhaka"),
    OUTSIDE_CHECKED: checked(area === "Outside Dhaka"),
    COD_CHECKED: checked(payment === "Cash on Delivery"),
    BKASH_CHECKED: checked(payment === "bKash"),
    NAGAD_CHECKED: checked(payment === "Nagad"),
    ITEMS: items,
    SUBTOTAL: String(subtotal),
    SUBTOTAL_DISPLAY: taka(subtotal),
    INSIDE_CHARGE: DELIVERY_CHARGES["Inside Dhaka"],
    OUTSIDE_CHARGE: DELIVERY_CHARGES["Outside Dhaka"],
    DISTRICT_OPTIONS: DISTRICTS.map(district => `<option value="${escapeHtml(district)}" ${district === values.district ? "selected" : ""}>${escapeHtml(district)}</option>`).join("")
  }), { noindex: true }), status);
}

// The stylesheet and storefront script are read once. Their links carry a content hash, so
// browsers can keep them for a year and still fetch the new file straight after a deploy.
async function contentVersion(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest).slice(0, 6), byte => byte.toString(16).padStart(2, "0")).join("");
}
const STYLESHEET = await Deno.readTextFile(`${publicDir}/css/style.css`);
const STYLESHEET_VERSION = await contentVersion(STYLESHEET);
const STORE_SCRIPT = await Deno.readTextFile(`${publicDir}/js/store.js`);
const STORE_SCRIPT_VERSION = await contentVersion(STORE_SCRIPT);

// Inline scripts and styles are part of the pages, so they stay allowed; everything else
// must come from this site or Google Fonts, and no other site may frame these pages.
const SECURITY_HEADERS = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "script-src 'self' 'unsafe-inline'",
    "form-action 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'"
  ].join("; "),
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
};

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

cleanUpStoredData();
setInterval(cleanUpStoredData, 6 * 60 * 60 * 1000);

Deno.serve({ port: PORT }, async (request, info) => withSecurityHeaders(await handleRequest(request, info)));

async function handleRequest(request, info) {
  const url = new URL(request.url);

  try {
    // ---------- Static files ----------
    if (url.pathname === "/css/style.css") {
      const versioned = url.searchParams.get("v") === STYLESHEET_VERSION;
      return new Response(STYLESHEET, {
        headers: {
          "content-type": "text/css; charset=utf-8",
          "cache-control": versioned ? "public, max-age=31536000, immutable" : "public, max-age=300"
        }
      });
    }

    if (url.pathname === "/js/store.js") {
      const versioned = url.searchParams.get("v") === STORE_SCRIPT_VERSION;
      return new Response(STORE_SCRIPT, {
        headers: {
          "content-type": "text/javascript; charset=utf-8",
          "cache-control": versioned ? "public, max-age=31536000, immutable" : "public, max-age=300"
        }
      });
    }

    if (url.pathname.startsWith("/images/")) {
      const safePath = url.pathname.replaceAll("..", "");
      try {
        const data = await Deno.readFile(`${publicDir}${safePath}`);
        // Fingerprinted URLs never change content, so they cache for a year; bare URLs
        // (old links, shared previews) recheck often so a replaced photo appears quickly.
        const versioned = url.searchParams.get("v") === imageVersion(safePath);
        return new Response(data, { headers: { "content-type": imageMime(safePath), "cache-control": versioned ? "public, max-age=31536000, immutable" : "public, max-age=300" } });
      } catch {
        return new Response("Image not found", { status: 404 });
      }
    }

    if (url.pathname.startsWith("/uploads/products/")) {
      const safePath = url.pathname.replaceAll("..", "");
      // Uploads live in DATA_DIR; images bundled with the repo stay in ./public.
      for (const root of new Set([dataDir, publicDir])) {
        try {
          const data = await Deno.readFile(`${root}${safePath}`);
          return new Response(data, { headers: { "content-type": imageMime(safePath), "cache-control": "public, max-age=86400" } });
        } catch {
          // Try the next location.
        }
      }
      return new Response("Image not found", { status: 404 });
    }

    if (url.pathname === "/sitemap.xml" && request.method === "GET") {
      // Products carry their last update date and main photo, so search engines notice
      // changes and can list the photos in image search.
      const base = siteOrigin(request);
      const products = db.query(`
        SELECT p.id, p.slug, date(COALESCE(p.updated_at, p.created_at)),
          COALESCE((SELECT image_path FROM product_images WHERE product_id = p.id ORDER BY is_main DESC, id LIMIT 1), '')
        FROM products p WHERE p.is_active = 1 ORDER BY p.id
      `);
      const entries = [
        { loc: `${base}/` },
        { loc: `${base}/products` },
        ...COLLECTIONS.map(collection => ({ loc: `${base}/collections/${collection.key}` })),
        ...products.map(([id, slug, updated, image]) => ({
          loc: `${base}${productPath({ id, slug })}`,
          lastmod: updated,
          image: image ? `${base}${image}` : ""
        }))
      ];
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${entries.map(entry => `<url><loc>${escapeHtml(entry.loc)}</loc>${entry.lastmod ? `<lastmod>${escapeHtml(entry.lastmod)}</lastmod>` : ""}${entry.image ? `<image:image><image:loc>${escapeHtml(entry.image)}</image:loc></image:image>` : ""}</url>`).join("\n")}
</urlset>`;
      return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8" } });
    }

    if (url.pathname === "/robots.txt" && request.method === "GET") {
      const base = siteOrigin(request);
      const body = [
        "User-agent: *",
        "Disallow: /admin",
        "Disallow: /cart",
        "Disallow: /checkout",
        "Disallow: /order-success",
        "Disallow: /track-order",
        "",
        `Sitemap: ${base}/sitemap.xml`,
        ""
      ].join("\n");
      return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
    }

    // For Railway's health check: the app is up and the database answers.
    if (url.pathname === "/health" && request.method === "GET") {
      try {
        db.query("SELECT 1");
        return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
      } catch {
        return Response.json({ ok: false }, { status: 503, headers: { "cache-control": "no-store" } });
      }
    }

    // ---------- Home ----------
    if (url.pathname === "/" && request.method === "GET") {
      const collections = collectionMap();
      const tiles = COLLECTIONS.map(collection => {
        const ids = collections[collection.key].ids;
        const count = countActive(ids);
        const media = `<img src="${collection.image}" alt="" loading="lazy" decoding="async">`;
        return `<a class="collection-tile" href="/collections/${collection.key}">
          <span class="tile-media">${media}</span>
          <span class="tile-text">
            <span class="tile-title">${collection.title}</span>
            <span class="tile-meta">${count ? `${count} ${count === 1 ? "product" : "products"}` : "New pieces arriving soon"}</span>
          </span>
        </a>`;
      }).join("");

      // The sale grid needs four products to fill its row; with fewer, the banner is text only.
      const saleItems = shelf("sale", 4);
      const saleBanner = saleItems.length ? `<section class="sale-banner">
        <div class="wrap sale-inner${saleItems.length < 4 ? " sale-inner-text" : ""}">
          <div class="sale-copy">
            <h2>The sale edit</h2>
            <p>Selected makeup, skincare and jewellery at reduced prices, while stock lasts.</p>
            <a class="btn btn-dark" href="/products?sale=1">Shop the sale</a>
          </div>
          ${saleItems.length >= 4 ? productGrid(saleItems, "grid-compact") : ""}
        </div>
      </section>` : "";

      // New arrivals fill whole rows of four: 5 to 7 products show as 4, never 4 plus a straggler.
      const newest = shelf("newest", 8);
      const newArrivals = newest.length > 4 ? newest.slice(0, newest.length >= 8 ? 8 : 4) : newest;

      const assurance = [
        ["Delivery across Bangladesh", `${taka(DELIVERY_CHARGES["Inside Dhaka"])} inside Dhaka and ${taka(DELIVERY_CHARGES["Outside Dhaka"])} everywhere else.`],
        ["Pay the way you prefer", "Cash on delivery, bKash or Nagad."],
        SHOP_WHATSAPP_NUMBER
          ? ["Questions before you order?", `<a class="text-link" target="_blank" rel="noreferrer" href="https://wa.me/${SHOP_WHATSAPP_NUMBER}">Message us on WhatsApp</a>`]
          : ["Clear stock levels", "Every product shows what is left before you order."]
      ].map(([title, text]) => `<div><h3>${title}</h3><p>${text}</p></div>`).join("");

      // A full row of real bestsellers is titled as such. With fewer, the row is topped up
      // with the most viewed products and called "Popular right now", so it is never half empty.
      const bestsellers = shelf("bestsellers", 4);
      const bestsellersSection = bestsellers.length >= 4
        ? shelfSection("Bestsellers", bestsellers, "", "")
        : shelfSection("Popular right now", [...bestsellers, ...popularProducts(4 - bestsellers.length, bestsellers.map(product => product.id))], "", "");

      const view = await readView("home.html");
      return html(page("Makeup, skincare and jewellery", fill(view, {
        HEADER: storeHeader(request, "home"),
        FOOTER: storeFooter(),
        COLLECTION_TILES: tiles,
        NEW_ARRIVALS: shelfSection("New arrivals", newArrivals, "/products?sort=newest", "View all"),
        SALE_BANNER: saleBanner,
        BESTSELLERS: bestsellersSection,
        FEATURED: shelfSection("Our picks", shelf("featured", 4), "/products?sort=featured", "View all", "shelf-soft"),
        ASSURANCE: assurance
      }), {
        canonical: "/",
        jsonLd: [{
          "@context": "https://schema.org",
          "@type": "OnlineStore",
          name: BRAND,
          url: `${siteOrigin(request)}/`,
          logo: `${siteOrigin(request)}${asset("/images/bellora-logo.png")}`,
          sameAs: [SHOP_CONTACT.facebook, SHOP_CONTACT.instagram, SHOP_CONTACT.tiktok].filter(Boolean),
          ...(SHOP_CONTACT.phone ? { telephone: SHOP_CONTACT.phone } : {})
        }, {
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: BRAND,
          url: `${siteOrigin(request)}/`,
          potentialAction: {
            "@type": "SearchAction",
            target: `${siteOrigin(request)}/products?q={search_term_string}`,
            "query-input": "required name=search_term_string"
          }
        }]
      }));
    }

    // ---------- Shop and collections ----------
    const collectionMatch = url.pathname.match(/^\/collections\/([a-z-]+)\/?$/);
    if ((url.pathname === "/products" || collectionMatch) && request.method === "GET") {
      const collection = collectionMatch ? getCollection(collectionMatch[1]) : null;
      if (collectionMatch && !collection) return notFound(request);

      const params = url.searchParams;
      const numberParam = (name) => {
        const value = params.get(name)?.trim() ?? "";
        return value !== "" && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
      };
      const state = {
        q: params.get("q")?.trim() ?? "",
        category: params.get("category")?.trim() ?? "",
        min_price: numberParam("min_price") ?? "",
        max_price: numberParam("max_price") ?? "",
        skin_concern: params.get("skin_concern")?.trim() ?? "",
        material: params.get("material")?.trim() ?? "",
        design: params.get("design")?.trim() ?? "",
        in_stock: params.get("in_stock") === "1" ? "1" : "",
        sale: params.get("sale") === "1" ? "1" : "",
        sort: SORTS[params.get("sort")] ? params.get("sort") : "newest"
      };
      const base = collection ? `/collections/${collection.key}` : "/products";
      const hrefWith = (changes = {}) => {
        const query = new URLSearchParams();
        for (const [key, value] of Object.entries({ ...state, ...changes })) {
          if (value === "" || value === null || value === undefined) continue;
          if (key === "sort" && value === "newest") continue;
          if (key === "page" && Number(value) === 1) continue;
          query.set(key, String(value));
        }
        const text = query.toString();
        return text ? `${base}?${text}` : base;
      };

      // Category scope: a collection, optionally narrowed to one of its categories, or a single category.
      const collectionIds = collection ? collectionMap()[collection.key].ids : null;
      const scoped = state.category ? categoryScope(state.category) : null;
      let categoryIds = collectionIds;
      if (scoped) {
        categoryIds = collectionIds ? scoped.ids.filter(id => collectionIds.includes(id)) : scoped.ids;
      }

      const filters = {
        q: state.q,
        categoryIds,
        minPrice: state.min_price === "" ? null : state.min_price,
        maxPrice: state.max_price === "" ? null : state.max_price,
        skinConcern: state.skin_concern,
        material: state.material,
        design: state.design,
        inStock: Boolean(state.in_stock),
        onSale: Boolean(state.sale)
      };
      const listing = listProducts({ ...filters, sort: state.sort, page: Number(params.get("page")) || 1 });
      const facets = listingFacets(filters);

      let title = "Shop all";
      let intro = "Makeup, skincare and jewellery, with new pieces added every week.";
      const crumbs = [["Home", "/"]];
      if (collection) {
        title = collection.title;
        intro = getSetting(`collection_intro_${collection.key}`) || collection.intro;
        crumbs.push([collection.title, scoped?.category ? base : ""]);
      } else {
        crumbs.push(["Shop", scoped?.category || state.sale || state.q ? "/products" : ""]);
      }
      if (scoped?.category) {
        title = scoped.category.name.charAt(0).toUpperCase() + scoped.category.name.slice(1);
        crumbs.push([title, ""]);
      }
      if (state.sale && !collection && !scoped?.category) {
        title = "Sale";
        intro = "Reduced prices across makeup, skincare and jewellery, while stock lasts.";
        crumbs.push(["Sale", ""]);
      }
      if (state.q) {
        title = `Results for “${state.q}”`;
        intro = "";
        if (!scoped?.category && !state.sale) crumbs.push(["Search", ""]);
      }

      // Category chips: collections on the main shop page, sub-categories inside a collection.
      let chips = "";
      if (collection) {
        const children = categoriesWithCounts(collectionIds);
        if (children.length > 1) {
          chips = `<nav class="chips" aria-label="${collection.title} categories">
            <a href="${hrefWith({ category: "", page: 1 })}" ${!state.category ? `aria-current="page"` : ""}>All ${collection.title.toLowerCase()}</a>
            ${children.map(child => `<a href="${hrefWith({ category: child.slug, page: 1 })}" ${state.category === child.slug ? `aria-current="page"` : ""}>${escapeHtml(displayName(child.name))}</a>`).join("")}
          </nav>`;
        }
      } else if (!state.q) {
        const map = collectionMap();
        chips = `<nav class="chips" aria-label="Collections">${COLLECTIONS.map(entry =>
          `<a href="/collections/${entry.key}">${entry.title} <span>${countActive(map[entry.key].ids)}</span></a>`).join("")}</nav>`;
      }

      const FILTER_VISIBLE = 6;
      const radioGroup = (name, legend, options) => {
        if (!options.length && !state[name]) return "";
        const values = options.some(option => option.value.toLowerCase() === state[name].toLowerCase()) || !state[name]
          ? options
          : [{ value: state[name], count: null }, ...options];
        const isChosen = (option) => state[name].toLowerCase() === option.value.toLowerCase();
        const optionHtml = (option) => `<label class="filter-option"><input type="radio" name="${name}" value="${escapeHtml(option.value)}" ${isChosen(option) ? "checked" : ""}><span>${escapeHtml(option.value)}</span>${option.count ? `<small>${option.count}</small>` : ""}</label>`;
        // Long lists show the first few; the rest open under "Show more" (already open when the choice is among them).
        const shown = values.slice(0, FILTER_VISIBLE);
        const more = values.slice(FILTER_VISIBLE);
        return `<fieldset class="filter-group">
          <legend>${legend}</legend>
          <label class="filter-option"><input type="radio" name="${name}" value="" ${!state[name] ? "checked" : ""}><span>Any</span></label>
          ${shown.map(optionHtml).join("")}
          ${more.length ? `<details class="filter-more" ${more.some(isChosen) ? "open" : ""}><summary>Show ${more.length} more</summary>${more.map(optionHtml).join("")}</details>` : ""}
        </fieldset>`;
      };
      const filterGroups = [
        `<fieldset class="filter-group">
          <legend>Price</legend>
          <div class="price-range">
            <label><span class="visually-hidden">Minimum price</span><input name="min_price" type="number" min="0" inputmode="numeric" value="${escapeHtml(state.min_price)}" placeholder="${facets.minPrice !== null ? `Min ৳${facets.minPrice}` : "Min ৳"}"></label>
            <span aria-hidden="true">to</span>
            <label><span class="visually-hidden">Maximum price</span><input name="max_price" type="number" min="0" inputmode="numeric" value="${escapeHtml(state.max_price)}" placeholder="${facets.maxPrice !== null ? `Max ৳${facets.maxPrice}` : "Max ৳"}"></label>
          </div>
        </fieldset>`,
        `<fieldset class="filter-group">
          <legend>Availability</legend>
          <label class="filter-option"><input type="checkbox" name="in_stock" value="1" ${state.in_stock ? "checked" : ""}><span>In stock only</span></label>
          ${facets.saleCount || state.sale ? `<label class="filter-option"><input type="checkbox" name="sale" value="1" ${state.sale ? "checked" : ""}><span>On sale</span><small>${facets.saleCount}</small></label>` : ""}
        </fieldset>`,
        radioGroup("material", "Material", facets.materials),
        radioGroup("design", collection?.key === "makeup" ? "Shade" : "Shade or design", facets.shades),
        radioGroup("skin_concern", "Skin concern", facets.skinConcerns)
      ].join("");

      const hidden = (fields) => fields.filter(([, value]) => value !== "").map(([name, value]) =>
        `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`).join("");
      const activeFilters = ["min_price", "max_price", "skin_concern", "material", "design", "in_stock", "sale"].filter(key => state[key] !== "").length;
      const firstShown = (listing.page - 1) * PAGE_SIZE + 1;
      const resultsText = listing.total
        ? `Showing ${firstShown}–${firstShown + listing.items.length - 1} of ${listing.total} ${listing.total === 1 ? "product" : "products"}`
        : "No products found";
      const clearHref = collection ? base + (state.category ? `?category=${encodeURIComponent(state.category)}` : "") : (state.q ? `/products?q=${encodeURIComponent(state.q)}` : "/products");

      const products = listing.items.length
        ? productGrid(listing.items)
        : `<div class="empty-state">
            <h2>Nothing matches yet</h2>
            <p>Try removing a filter, or search for something else.</p>
            <a class="btn btn-dark" href="${clearHref}">Clear filters</a>
          </div>`;

      const view = await readView("products.html");
      const active = collection ? collection.key : state.sale ? "sale" : "shop";
      return html(page(title.replace(/[“”]/g, ""), fill(view, {
        HEADER: storeHeader(request, active, state.q),
        FOOTER: storeFooter(),
        BREADCRUMBS: breadcrumbs(crumbs),
        TITLE: escapeHtml(title),
        INTRO: escapeHtml(intro),
        SUBCATEGORIES: chips,
        FILTERS_OPEN: activeFilters ? "open" : "",
        ACTIVE_FILTER_COUNT: activeFilters ? ` <span class="filter-count">${activeFilters}</span>` : "",
        FORM_ACTION: base,
        HIDDEN_FIELDS: hidden([["q", state.q], ["category", state.category], ["sort", state.sort === "newest" ? "" : state.sort]]),
        CLEAR_HREF: clearHref,
        FILTER_GROUPS: filterGroups,
        RESULTS_TEXT: resultsText,
        SORT_HIDDEN_FIELDS: hidden(Object.entries(state).filter(([key]) => key !== "sort").map(([key, value]) => [key, String(value)])),
        SORT_OPTIONS: Object.entries(SORTS).map(([key, sort]) => `<option value="${key}" ${state.sort === key ? "selected" : ""}>${sort.label}</option>`).join(""),
        PRODUCTS: products,
        PAGINATION: pagination(listing.page, listing.pages, (n) => hrefWith({ page: n })),
        // The longer collection text sits under the products on the collection's first, unfiltered page.
        COLLECTION_TEXT: (() => {
          const text = collection && !scoped?.category && listing.page === 1 && !activeFilters && !state.q
            ? getSetting(`collection_text_${collection.key}`) : "";
          return text ? `<section class="wrap collection-about" aria-labelledby="collection-about-title"><h2 id="collection-about-title">About our ${escapeHtml(collection.title.toLowerCase())}</h2>${textParagraphs(text)}</section>` : "";
        })()
      }), {
        description: intro || undefined,
        canonical: collection ? base : "/products",
        noindex: Boolean(state.q || activeFilters),
        jsonLd: [breadcrumbData(crumbs, siteOrigin(request), base)]
      }));
    }

    // ---------- Product details ----------
    // Products live at /product/<slug>. Old /product/<id> links and the earlier slugs of a
    // renamed product redirect there permanently, so shared links and search results keep working.
    if (url.pathname.startsWith("/product/") && request.method === "GET") {
      let key = "";
      try {
        key = decodeURIComponent(url.pathname.split("/")[2] ?? "");
      } catch {
        return notFound(request);
      }
      let productId = null;
      if (/^\d+$/.test(key)) productId = Number(key);
      else productId = db.query("SELECT id FROM products WHERE slug = ?", [key])[0]?.[0]
        ?? db.query("SELECT product_id FROM product_slug_history WHERE slug = ?", [key])[0]?.[0]
        ?? null;
      const product = productId === null ? null : getProduct(productId);

      if (!product || !product.active) return notFound(request);
      const path = productPath(product);
      if (url.pathname !== path) {
        return new Response(null, { status: 301, headers: { Location: path + url.search } });
      }
      trackEvent("product_view", product.id);

      const gallery = [...new Set([
        product.imagePath,
        ...product.images.map(image => image.path),
        ...product.variants.map(variant => variant.imagePath)
      ].filter(Boolean))];
      const mainImage = gallery[0] ?? "";
      const image = mainImage
        ? `<img src="${escapeHtml(mainImage)}" alt="${escapeHtml(product.name)}">`
        : `<span class="media-placeholder large" aria-hidden="true">B</span>`;
      // A gallery photo that is also a shade's photo is labelled with that shade, so the
      // thumbnails, the caption and the shade buttons can stay in step.
      const variantLabelFor = (path) => product.variants.find(variant => variant.imagePath === path)?.value ?? "";
      const thumbnails = gallery.length > 1
        ? `<div class="pd-thumbs">${gallery.map((path, index) => {
            const label = variantLabelFor(path);
            return `<button type="button" class="pd-thumb" data-image="${escapeHtml(path)}" data-label="${escapeHtml(label)}" aria-pressed="${index === 0}" aria-label="${label ? `Show ${escapeHtml(label)}` : `Show image ${index + 1} of ${gallery.length}`}"><img src="${escapeHtml(path)}" alt="" loading="lazy">${label ? `<span class="pd-thumb-badge">${escapeHtml(label)}</span>` : ""}</button>`;
          }).join("")}</div>`
        : "";

      const variantStock = (variant) => variant.stock ?? product.stock;
      const firstAvailable = product.variants.find(variant => variantStock(variant) > 0);
      const anyVariantPhoto = product.variants.some(variant => variant.imagePath);
      const variantSelector = product.variants.length
        ? `<fieldset class="pd-variants">
            <legend>${escapeHtml(product.variants[0].name)}: <span id="variant-choice">${escapeHtml(firstAvailable?.value ?? "Sold out")}</span></legend>
            <div class="swatches">
              ${product.variants.map(variant => {
                const stock = variantStock(variant);
                // When other shades have photos, a shade without one says so instead of looking broken.
                const media = variant.imagePath
                  ? `<img src="${escapeHtml(variant.imagePath)}" alt="" loading="lazy">`
                  : anyVariantPhoto ? `<span class="swatch-nophoto">No photo yet</span>` : "";
                return `<label class="swatch${anyVariantPhoto ? " has-image" : ""}${stock < 1 ? " is-soldout" : ""}">
                  <input type="radio" name="variant_id" value="${variant.id}" data-image="${escapeHtml(variant.imagePath)}" data-stock="${stock}" data-label="${escapeHtml(variant.value)}" ${variant === firstAvailable ? "checked" : ""} ${stock < 1 ? "disabled" : ""} required>
                  <span>${media}<span class="swatch-name">${escapeHtml(variant.value)}${stock < 1 ? `<small>Sold out</small>` : ""}</span></span>
                </label>`;
              }).join("")}
            </div>
          </fieldset>`
        : "";
      const purchasable = product.stock > 0 && (!product.variants.length || Boolean(firstAvailable));

      const onSale = product.unitPrice < product.price;
      const priceHtml = onSale
        ? `<span class="price-sale">${taka(product.unitPrice)}</span> <s>${taka(product.price)}</s> <span class="save">Save ${Math.round((1 - product.unitPrice / product.price) * 100)}%</span>`
        : taka(product.price);
      const stockText = product.stock < 1 ? "Sold out" : product.stock <= 5 ? `Only ${product.stock} left` : "In stock";
      const stockClass = product.stock < 1 ? "is-out" : product.stock <= 5 ? "is-low" : "is-in";

      const detailSections = [
        ["Ingredients", product.ingredients], ["How to use", product.howToUse], ["Skin concern", product.skinConcern],
        ["Material", product.material], ["Size", product.sizeInfo], ["Care", product.careInstructions]
      ].filter(([, value]) => value).map(([label, value], index) =>
        `<details ${index === 0 ? "open" : ""}><summary>${label}</summary><div class="pd-detail-body rich-text">${formatText(value)}</div></details>`
      ).join("");

      const collections = collectionMap();
      const collection = COLLECTIONS.find(entry => collections[entry.key].ids.includes(Number(product.categoryId)));
      const category = product.categoryId ? categoryById(product.categoryId) : null;
      const crumbs = [["Home", "/"], collection ? [collection.title, `/collections/${collection.key}`] : ["Shop", "/products"]];
      if (category && !collections[collection?.key]?.roots.some(root => root.id === category.id)) {
        crumbs.push([category.name.charAt(0).toUpperCase() + category.name.slice(1), collection ? `/collections/${collection.key}?category=${encodeURIComponent(category.slug)}` : `/products?category=${encodeURIComponent(category.slug)}`]);
      }
      crumbs.push([product.name, ""]);

      const related = relatedProducts(product.id, product.categoryId, 4, collection ? collections[collection.key].ids : []);
      const origin = siteOrigin(request);
      const absolute = (path) => `${origin}${path}`;
      const jsonLd = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Product",
        name: product.name,
        description: product.description || undefined,
        sku: product.sku || undefined,
        category: product.categoryName,
        image: gallery.map(absolute),
        brand: { "@type": "Brand", name: BRAND },
        offers: {
          "@type": "Offer",
          priceCurrency: "BDT",
          price: product.unitPrice.toFixed(2),
          availability: product.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
          url: absolute(productPath(product))
        }
      }).replaceAll("<", "\\u003c");

      const view = await readView("product.html");
      return html(page(product.name, fill(view, {
        HEADER: storeHeader(request, collection?.key ?? "shop"),
        FOOTER: storeFooter(),
        BREADCRUMBS: breadcrumbs(crumbs),
        IMAGE: image,
        THUMBNAILS: thumbnails,
        VARIANT_TYPE: escapeHtml(product.variants[0]?.name ?? ""),
        CATEGORY: escapeHtml(product.categoryName),
        NAME: escapeHtml(product.name),
        PRICE_HTML: priceHtml,
        STICKY_PRICE: taka(product.unitPrice),
        STOCK_CLASS: stockClass,
        STOCK_TEXT: stockText,
        DESCRIPTION: product.description ? `<div class="pd-desc rich-text">${formatText(product.description)}</div>` : "",
        PRODUCT_ID: String(product.id),
        VARIANT: variantSelector,
        STOCK: String(Math.max(product.stock, 1)),
        DISABLED: purchasable ? "" : "disabled",
        ADD_LABEL: purchasable ? "Add to bag" : "Sold out",
        SOLD_OUT_ASK: !purchasable && SHOP_WHATSAPP_NUMBER
          ? `<a class="btn btn-ghost full pd-ask" target="_blank" rel="noreferrer" href="https://wa.me/${SHOP_WHATSAPP_NUMBER}?text=${encodeURIComponent(`Hello! Is "${product.name}" back in stock?`)}">Ask on WhatsApp when it's back</a>`
          : "",
        CHECK: icons.check,
        INSIDE_DHAKA: taka(DELIVERY_CHARGES["Inside Dhaka"]),
        OUTSIDE_DHAKA: taka(DELIVERY_CHARGES["Outside Dhaka"]),
        PRODUCT_DETAILS: detailSections,
        RETURNS_POLICY: escapeHtml(RETURNS_POLICY),
        RELATED_PRODUCTS: related.length ? `<section class="related"><div class="shelf-head"><h2>You may also like</h2></div>${productGrid(related)}</section>` : "",
        JSON_LD: jsonLd
      }), {
        description: (product.description || `${product.name} at ${BRAND}.`).replace(/\s+/g, " ").slice(0, 155),
        image: mainImage || undefined,
        canonical: productPath(product),
        jsonLd: [breadcrumbData(crumbs, origin, productPath(product))],
        ogType: "product",
        // Facebook and WhatsApp show these with the link preview.
        meta: [
          ["product:price:amount", product.unitPrice.toFixed(2)],
          ["product:price:currency", "BDT"],
          ["product:availability", product.stock > 0 ? "in stock" : "out of stock"]
        ]
      }));
    }

    // ---------- Cart add ----------
    // "Add to bag" from the product page script asks for JSON and stays on the page;
    // a plain form post (no script) goes to the bag as before. "Buy now" (next=checkout)
    // goes straight to checkout.
    if (url.pathname === "/cart/add" && request.method === "POST") {
      const form = await request.formData();
      const productId = Number(form.get("product_id"));
      const quantity = Number(form.get("quantity") || 1);
      const variantId = Number(form.get("variant_id")) || null;
      const buyNow = form.get("next") === "checkout";
      const wantsJson = (request.headers.get("accept") ?? "").includes("application/json");
      const fail = (message, status = 400) => wantsJson
        ? Response.json({ ok: false, error: message }, { status })
        : new Response(message, { status });

      const product = getProduct(productId);
      if (!product || !product.active) return fail("This product is no longer available.", 404);
      const selectedVariant = product.variants.find(variant => variant.id === variantId);
      if (product.variants.length && !selectedVariant) {
        return fail("Please choose a valid design.");
      }
      const availableStock = selectedVariant?.stock ?? product.stock;
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > product.stock || quantity > availableStock) {
        return fail(availableStock < 1 ? "Sorry, this is sold out." : `Sorry, only ${Math.min(product.stock, availableStock)} left.`);
      }

      const id = ensureCart(request);
      const cart = carts.get(id);
      const existing = cart.find(i => i.productId === productId && i.variantId === variantId);

      if (existing && buyNow) {
        // Buying now what is already in the bag: use the chosen quantity, never add it twice.
        existing.quantity = Math.max(existing.quantity, quantity);
      } else if (existing) {
        if (existing.quantity + quantity > availableStock) {
          return fail(`You already have ${existing.quantity} in your bag, and only ${availableStock} ${availableStock === 1 ? "is" : "are"} available.`);
        }
        existing.quantity += quantity;
      } else {
        cart.push({ productId, quantity, variantId });
      }

      carts.set(id, cart);
      trackEvent("add_to_cart", productId);
      if (buyNow) return cartResponse(request, redirect("/checkout"), id);
      if (wantsJson) {
        const count = cart.reduce((sum, item) => sum + item.quantity, 0);
        return cartResponse(request, Response.json({
          ok: true,
          count,
          name: product.name,
          variant: selectedVariant ? `${selectedVariant.name}: ${selectedVariant.value}` : ""
        }), id);
      }
      return cartResponse(request, redirect("/cart"), id);
    }

    // ---------- Cart ----------
    if (url.pathname === "/cart" && request.method === "GET") {
      const details = getCartDetails(request);
      const itemCount = details.reduce((sum, item) => sum + item.quantity, 0);
      const lines = details.map(item => {
        const onSale = item.product.unitPrice < item.product.price;
        const hiddenFields = `<input type="hidden" name="product_id" value="${item.product.id}"><input type="hidden" name="variant_id" value="${item.variantId ?? ""}">`;
        return `<article class="bag-line">
          <a class="bag-media" href="${productPath(item.product)}" tabindex="-1" aria-hidden="true">
            ${item.imagePath ? `<img src="${escapeHtml(item.imagePath)}" alt="">` : `<span class="media-placeholder" aria-hidden="true">B</span>`}
          </a>
          <div class="bag-info">
            <h2><a href="${productPath(item.product)}">${escapeHtml(item.product.name)}</a></h2>
            ${item.variant ? `<p class="bag-variant">${escapeHtml(item.variant.name)}: ${escapeHtml(item.variant.value)}</p>` : ""}
            <p class="bag-unit">${taka(item.product.unitPrice)}${onSale ? ` <s>${taka(item.product.price)}</s>` : ""}</p>
            <form method="POST" action="/cart/remove">${hiddenFields}<button class="link-remove" type="submit">Remove</button></form>
          </div>
          <div class="qty qty-small" role="group" aria-label="Quantity of ${escapeHtml(item.product.name)}">
            <form method="POST" action="/cart/update">${hiddenFields}<input type="hidden" name="quantity" value="${Math.max(1, item.quantity - 1)}"><button type="submit" ${item.quantity <= 1 ? "disabled" : ""} aria-label="Decrease quantity">−</button></form>
            <span>${item.quantity}</span>
            <form method="POST" action="/cart/update">${hiddenFields}<input type="hidden" name="quantity" value="${item.quantity + 1}"><button type="submit" ${item.quantity >= item.availableStock ? "disabled" : ""} aria-label="Increase quantity">+</button></form>
          </div>
          <p class="bag-total">${taka(item.lineTotal)}</p>
        </article>`;
      }).join("");

      const subtotal = totalForCart(details);
      const content = details.length
        ? `<div class="bag-layout">
            <section class="bag-lines" aria-label="Items in your bag">
              ${lines}
              <form method="POST" action="/cart/clear" onsubmit="return confirm('Remove everything from your bag?')">
                <button class="link-remove" type="submit">Clear bag</button>
              </form>
            </section>
            <aside class="summary" aria-labelledby="summary-title">
              <h2 id="summary-title">Order summary</h2>
              <dl class="summary-lines">
                <div><dt>Subtotal</dt><dd>${taka(subtotal)}</dd></div>
                <div><dt>Delivery</dt><dd>${taka(DELIVERY_CHARGES["Inside Dhaka"])} or ${taka(DELIVERY_CHARGES["Outside Dhaka"])}</dd></div>
                <div class="summary-total"><dt>Total</dt><dd>from ${taka(subtotal + DELIVERY_CHARGES["Inside Dhaka"])}</dd></div>
              </dl>
              <p class="summary-note">Delivery is ${taka(DELIVERY_CHARGES["Inside Dhaka"])} inside Dhaka and ${taka(DELIVERY_CHARGES["Outside Dhaka"])} outside. You choose your area at checkout.</p>
              <a class="btn btn-dark full" href="/checkout">Proceed to checkout</a>
              <ul class="pd-assure">
                <li>${icons.check}Cash on delivery, bKash or Nagad</li>
                <li>${icons.check}Stock is checked again when you place your order</li>
              </ul>
            </aside>
          </div>`
        : `<div class="empty-state">
            <h2>Your bag is empty</h2>
            <p>Start with one of our collections.</p>
            <div class="empty-links">${COLLECTIONS.map(collection => `<a class="btn btn-ghost" href="/collections/${collection.key}">Shop ${collection.title.toLowerCase()}</a>`).join("")}</div>
          </div>`;

      return html(page("Your bag", `${storeHeader(request, "bag")}
        <main id="main-content" class="wrap bag-page">
          ${breadcrumbs([["Home", "/"], ["Bag", ""]])}
          <div class="bag-head"><h1>Your bag</h1>${itemCount ? `<p>${itemCount} ${itemCount === 1 ? "item" : "items"}</p>` : ""}</div>
          ${content}
        </main>${storeFooter()}`, { noindex: true }));
    }

    if (url.pathname === "/cart/update" && request.method === "POST") {
      const form = await request.formData();
      const productId = Number(form.get("product_id"));
      const quantity = Number(form.get("quantity"));
      const variantId = Number(form.get("variant_id")) || null;
      const id = cartIdFor(request);
      const cart = id ? (carts.get(id) ?? []) : [];

      const item = cart.find(i => i.productId === productId && i.variantId === variantId);
      const product = getProduct(productId);

      const selectedVariant = product?.variants.find(variant => variant.id === variantId);
      const availableStock = selectedVariant?.stock ?? product?.stock;
      if (!item || !product || !Number.isInteger(quantity) || quantity < 1 || quantity > availableStock) {
        return new Response("Invalid cart update", { status: 400 });
      }

      item.quantity = quantity;
      carts.set(id, cart);
      return redirect("/cart");
    }

    if (url.pathname === "/cart/remove" && request.method === "POST") {
      const form = await request.formData();
      const productId = Number(form.get("product_id"));
      const variantId = Number(form.get("variant_id")) || null;
      const id = cartIdFor(request);
      const cart = id ? (carts.get(id) ?? []) : [];

      carts.set(
        id,
        cart.filter(i => !(i.productId === productId && i.variantId === variantId))
      );
      return redirect("/cart");
    }

    if (url.pathname === "/cart/clear" && request.method === "POST") {
      const id = cartIdFor(request);
      if (id) carts.set(id, []);
      return redirect("/cart");
    }

    // ---------- Checkout ----------
    if (url.pathname === "/checkout" && request.method === "GET") {
      const details = getCartDetails(request);
      if (!details.length) return redirect("/cart");
      trackEvent("checkout_started");
      return await renderCheckout(request, details);
    }

    if (url.pathname === "/checkout" && request.method === "POST") {
      const details = getCartDetails(request);
      if (!details.length) return redirect("/cart");

      const form = await request.formData();
      const field = (key) => form.get(key)?.toString().trim() ?? "";
      const values = {
        name: field("customer_name"),
        phone: field("phone"),
        phoneConfirmation: field("phone_confirmation"),
        email: field("email"),
        address: field("address"),
        payment: field("payment_method"),
        deliveryArea: field("delivery_area"),
        district: field("district"),
        notes: field("order_notes"),
        transactionId: field("transaction_id").replace(/\s+/g, "").toUpperCase()
      };
      const retry = (error, status = 400) => renderCheckout(request, details, { error, values, status });

      const clientIp = clientAddress(request, info);
      if (!checkoutAllowed(clientIp)) {
        return retry(`Too many orders from this connection in the last hour. Please wait a little${SHOP_WHATSAPP_NUMBER ? " or message us on WhatsApp" : ""} and we will help you finish your order.`, 429);
      }

      if (!values.name || !values.phone || !values.address || !DISTRICTS.includes(values.district) || !["Cash on Delivery", "bKash", "Nagad"].includes(values.payment) || !DELIVERY_CHARGES[values.deliveryArea]) {
        return retry("Please fill in your name, phone, delivery address and district.");
      }
      for (const [label, value, max] of [["Full name", values.name, 100], ["Delivery address", values.address, 300], ["Order note", values.notes, 500], ["Email", values.email, 120]]) {
        if (value.length > max) return retry(`${label} is too long. Please keep it to ${max} characters or fewer.`);
      }
      const phone = normalizeBdPhone(values.phone);
      if (!phone) {
        return retry("Please enter a valid Bangladeshi mobile number, for example 01712345678.");
      }
      if (normalizeBdPhone(values.phoneConfirmation) !== phone) {
        return retry("The two phone numbers do not match. Please check them.");
      }
      if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
        return retry("Please enter a valid email address, or leave it empty.");
      }
      // With a payment number set, a bKash / Nagad order needs the transaction ID of the payment.
      const transactionId = PAYMENT_NUMBERS[values.payment] ? values.transactionId : "";
      if (PAYMENT_NUMBERS[values.payment]) {
        if (!/^[A-Z0-9]{6,20}$/.test(transactionId)) {
          return retry(`Please send the payment by ${values.payment} and enter the transaction ID from your ${values.payment} message (letters and numbers only).`);
        }
        if (db.query("SELECT 1 FROM orders WHERE transaction_id = ? AND status <> 'Cancelled'", [transactionId]).length) {
          return retry("This transaction ID has already been used for another order. Please check it, or contact us if you need help.");
        }
      }
      const { name, address, payment, deliveryArea, district } = values;
      const email = values.email || null;
      const orderNotes = values.notes || null;

      for (const item of details) {
        const current = getProduct(item.product.id);
        const currentVariant = item.variantId
          ? current?.variants.find(variant => variant.id === item.variantId)
          : null;
        const availableStock = currentVariant?.stock ?? current?.stock ?? 0;
        if (!current || !current.active || current.stock < item.quantity || availableStock < item.quantity) {
          return retry(`Sorry, there isn't enough stock left for ${item.product.name}. Please update your bag.`);
        }
      }

      const subtotal = totalForCart(details);
      const deliveryCharge = DELIVERY_CHARGES[deliveryArea];
      const total = subtotal + deliveryCharge;

      let orderId;
      const publicToken = crypto.randomUUID();
      db.exec("BEGIN IMMEDIATE");
      try {
      db.query(`
        INSERT INTO orders
        (customer_name, phone, email, address, payment_method, status, delivery_area, district, subtotal, delivery_charge, order_notes, total, public_token, transaction_id)
        VALUES (?, ?, ?, ?, ?, 'Pending', ?, ?, ?, ?, ?, ?, ?, ?)
      `, [name, phone, email, address, payment, deliveryArea, district, subtotal, deliveryCharge, orderNotes, total, publicToken, transactionId || null]);

      orderId = db.query("SELECT last_insert_rowid()")[0][0];

      for (const item of details) {
        const displayName = item.variant
          ? `${item.product.name} (${item.variant.name}: ${item.variant.value})`
          : item.product.name;

        db.query(`
          INSERT INTO order_items
          (order_id, product_id, variant_id, product_name, price, quantity)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [
          orderId,
          item.product.id,
          item.variantId,
          displayName,
          item.product.unitPrice,
          item.quantity
        ]);

        db.query(
          "UPDATE products SET stock = stock - ? WHERE id = ?",
          [item.quantity, item.product.id]
        );
        if (item.variantId) {
          db.query(
            "UPDATE product_variants SET stock = stock - ? WHERE id = ? AND stock IS NOT NULL",
            [item.quantity, item.variantId]
          );
        }
      }
      db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }

      const id = cartIdFor(request);
      if (id) carts.set(id, []);
      trackEvent("order_complete");
      recordCheckout(clientIp);

      return redirect(`/order-success/${publicToken}`);
    }

    // Looked up by the order's random token, never its number, so orders can't be browsed.
    if (url.pathname.startsWith("/order-success/") && request.method === "GET") {
      const token = url.pathname.split("/")[2] ?? "";
      const row = UUID_PATTERN.test(token) ? db.query(
        "SELECT customer_name, total, payment_method, id, transaction_id FROM orders WHERE public_token = ?",
        [token]
      ) : [];

      if (!row.length) return notFound(request);
      const orderId = row[0][3];

      return html(page("Order placed", `${storeHeader(request)}<main id="main-content" class="wrap success-page">
          <div class="success-card">
            <span class="success-mark" aria-hidden="true">${icons.check}</span>
            <h1>Thank you, your order is placed</h1>
            <p>Your order number is <strong>#${orderId}</strong>. Keep it handy if you contact us about delivery. You can <a class="text-link" href="/track-order">track your order</a> any time with this number and your phone.</p>
            <dl class="summary-lines">
              <div><dt>Payment</dt><dd>${escapeHtml(row[0][2])}</dd></div>
              ${row[0][4] ? `<div><dt>Transaction ID</dt><dd>${escapeHtml(row[0][4])}</dd></div>` : ""}
              <div class="summary-total"><dt>Total</dt><dd>${taka(row[0][1])}</dd></div>
            </dl>
            <div class="success-actions">
              ${SHOP_WHATSAPP_NUMBER ? `<a class="btn btn-dark" target="_blank" rel="noreferrer" href="https://wa.me/${SHOP_WHATSAPP_NUMBER}?text=${encodeURIComponent(`Hello! I placed ${BRAND} order #${orderId} for ${taka(row[0][1])}.`)}">Confirm on WhatsApp</a>` : ""}
              <a class="btn btn-ghost" href="/products">Continue shopping</a>
            </div>
          </div>
        </main>${storeFooter()}`, { noindex: true }));
    }

    // ---------- Order tracking ----------
    if (url.pathname === "/track-order" && request.method === "GET") {
      return trackingPage(request);
    }

    if (url.pathname === "/track-order" && request.method === "POST") {
      const form = await request.formData();
      const values = { order: form.get("order")?.toString().trim() ?? "", phone: form.get("phone")?.toString().trim() ?? "" };
      const clientIp = clientAddress(request, info);
      if (recentTrackFailures(clientIp).length >= TRACK_FAILURE_LIMIT) {
        return trackingPage(request, { values, error: "Too many attempts. Please wait an hour, or contact us and we'll check your order for you.", status: 429 });
      }
      const orderId = Number(values.order.replace(/^#/, ""));
      const phone = normalizeBdPhone(values.phone);
      const row = Number.isInteger(orderId) && orderId > 0 && phone
        ? db.query("SELECT id, status, datetime(created_at, '+6 hours'), district, payment_method, total FROM orders WHERE id = ? AND phone = ?", [orderId, phone])[0]
        : null;
      if (!row) {
        trackFailures.set(clientIp, [...recentTrackFailures(clientIp), Date.now()]);
        return trackingPage(request, { values, error: "We couldn't find an order with that number and phone. Please check both and try again.", status: 404 });
      }
      const items = db.query("SELECT product_name, quantity FROM order_items WHERE order_id = ? ORDER BY id", [row[0]]);
      return trackingPage(request, {
        values,
        order: { id: row[0], status: row[1], placed: String(row[2]).slice(0, 16), district: row[3], payment: row[4], total: row[5], items }
      });
    }

    // ---------- Admin login ----------
    if (url.pathname === "/admin/login" && request.method === "GET") {
      if (isAdmin(request)) return redirect("/admin/dashboard");
      const html = await readView("admin/login.html");
      return new Response(
        html.replace("{{ERROR}}", ""),
        { headers: { "content-type": "text/html; charset=utf-8" } }
      );
    }

    if (url.pathname === "/admin/login" && request.method === "POST") {
      const loginError = async (message, status) => {
        const view = await readView("admin/login.html");
        return new Response(
          view.replace("{{ERROR}}", `<p class="error-box">${escapeHtml(message)}</p>`),
          { status, headers: { "content-type": "text/html; charset=utf-8" } }
        );
      };

      const clientIp = clientAddress(request, info);
      if (recentLoginFailures(clientIp).length >= LOGIN_LIMIT) {
        return loginError("Too many failed attempts. Please wait 15 minutes and try again.", 429);
      }

      const form = await request.formData();
      const username = form.get("username")?.toString() ?? "";
      const password = form.get("password")?.toString() ?? "";

      const [usernameOk, passwordOk] = await Promise.all([
        sameSecret(username.trim(), ADMIN_USERNAME),
        sameSecret(password, ADMIN_PASSWORD)
      ]);
      if (!usernameOk || !passwordOk) {
        loginFailures.set(clientIp, [...recentLoginFailures(clientIp), Date.now()]);
        return loginError("Invalid username or password.", 401);
      }
      loginFailures.delete(clientIp);

      const token = crypto.randomUUID();
      db.query("INSERT INTO admin_sessions (token, username, expires_at) VALUES (?, ?, ?)", [
        token, ADMIN_USERNAME, Date.now() + ADMIN_SESSION_HOURS * 60 * 60 * 1000
      ]);

      const response = redirect("/admin/dashboard");
      response.headers.append(
        "Set-Cookie",
        `spark_admin=${encodeURIComponent(token)}; Path=/; Max-Age=${ADMIN_SESSION_HOURS * 60 * 60}; HttpOnly; SameSite=Lax${isSecureRequest(request) ? "; Secure" : ""}`
      );
      return response;
    }

    if (url.pathname === "/admin/logout" && request.method === "POST") {
      const token = cookie(request, "spark_admin");
      if (token) db.query("DELETE FROM admin_sessions WHERE token = ?", [token]);

      const response = redirect("/");
      response.headers.append(
        "Set-Cookie",
        "spark_admin=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax"
      );
      return response;
    }

    // ---------- Admin dashboard ----------
    if (url.pathname === "/admin/dashboard" && request.method === "GET") {
      const denied = adminGuard(request);
      if (denied) return denied;

      const productCount = db.query("SELECT COUNT(*) FROM products")[0][0];
      const categoryCount = db.query("SELECT COUNT(*) FROM categories")[0][0];
      const orderCount = db.query("SELECT COUNT(*) FROM orders")[0][0];
      const pendingCount = db.query("SELECT COUNT(*) FROM orders WHERE status = 'Pending'")[0][0];
      const lowStockCount = db.query("SELECT COUNT(*) FROM products WHERE is_active = 1 AND stock <= 5")[0][0];
      const events = Object.fromEntries(db.query(`
        SELECT event_type, COUNT(*) FROM analytics_events
        WHERE created_at >= datetime('now', '-30 days') GROUP BY event_type
      `));
      const eventCount = (type) => Number(events[type] ?? 0);

      const content = `
        <div class="page-title"><p class="eyebrow">Admin</p><h1>Dashboard</h1></div>
        <div class="stats-grid">
          <a class="stat-card" href="/admin/products"><span>Products</span><strong>${productCount}</strong></a>
          <a class="stat-card" href="/admin/categories"><span>Categories</span><strong>${categoryCount}</strong></a>
          <a class="stat-card" href="/admin/orders"><span>Orders</span><strong>${orderCount}</strong></a>
          <a class="stat-card" href="/admin/orders?status=Pending"><span>Pending</span><strong>${pendingCount}</strong></a>
          <a class="stat-card" href="/admin/products?stock=low"><span>Low stock (5 or fewer)</span><strong>${lowStockCount}</strong></a>
        </div>
        <section class="panel analytics-panel">
          <h2>Last 30 days</h2>
          <dl class="analytics-grid">
            <div><dt>Product views</dt><dd>${eventCount("product_view")}</dd></div>
            <div><dt>Added to bag</dt><dd>${eventCount("add_to_cart")}</dd></div>
            <div><dt>Checkouts started</dt><dd>${eventCount("checkout_started")}</dd></div>
            <div><dt>Orders placed</dt><dd>${eventCount("order_complete")}</dd></div>
          </dl>
          <form method="POST" action="/admin/analytics/reset" onsubmit="return confirm('Reset all analytics? Views, bag adds, checkouts and order counts will start from zero.')">
            <button class="danger-button" type="submit">Reset analytics</button>
          </form>
        </section>
        <section class="panel backup-panel">
          <h2>Backup</h2>
          <p class="muted">Download a copy of your products, categories and orders. Save one before every update, and once a week. Product photos are not included.</p>
          <p><a class="btn" href="/admin/backup">Download backup</a></p>
        </section>
        <div class="admin-grid">
          <a class="action-card" href="/admin/products/add"><h2>Add product</h2><p>Upload a photo, price, stock and variants.</p></a>
          <a class="action-card" href="/admin/categories"><h2>Manage categories</h2><p>Create and organise product categories.</p></a>
          <a class="action-card" href="/admin/orders"><h2>Manage orders</h2><p>Review customers and update order status.</p></a>
        </div>`;

      return new Response(adminPage("Dashboard", content), {
        headers: { "content-type": "text/html; charset=utf-8" }
      });
    }

    // ---------- Admin products ----------
    if (url.pathname === "/admin/products" && request.method === "GET") {
      const denied = adminGuard(request);
      if (denied) return denied;

      const search = url.searchParams.get("q")?.trim() ?? "";
      const lowStock = url.searchParams.get("stock") === "low";
      const where = [];
      const params = [];
      if (search) {
        where.push("(p.name LIKE ? OR COALESCE(p.sku, '') LIKE ? OR COALESCE(c.name, '') LIKE ?)");
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }
      if (lowStock) where.push("p.is_active = 1 AND p.stock <= 5");
      const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
      const total = Number(db.query(`SELECT COUNT(*) FROM products p LEFT JOIN categories c ON c.id = p.category_id ${whereSql}`, params)[0][0]);
      const perPage = 50;
      const pages = Math.max(1, Math.ceil(total / perPage));
      const pageNumber = Math.min(pages, Math.max(1, Number(url.searchParams.get("page")) || 1));
      const rows = db.query(`
        SELECT p.id, p.name, p.price, p.sale_price, p.stock, p.sku, p.is_featured, c.name,
               COALESCE((SELECT image_path FROM product_images WHERE product_id = p.id AND is_main = 1 LIMIT 1), '')
        FROM products p LEFT JOIN categories c ON c.id = p.category_id
        ${whereSql} ORDER BY p.id DESC LIMIT ? OFFSET ?
      `, [...params, perPage, (pageNumber - 1) * perPage])
        .map(([id, name, price, salePrice, stock, sku, featured, categoryName, image]) =>
          ({ id, name, price: Number(price), salePrice, stock: Number(stock), sku, featured: Number(featured) === 1, categoryName, image }));
      const adminPageHref = (n) => {
        const query = new URLSearchParams();
        if (search) query.set("q", search);
        if (lowStock) query.set("stock", "low");
        if (n > 1) query.set("page", String(n));
        return `/admin/products${query.size ? `?${query}` : ""}`;
      };
      const productRows = rows.map(product => `
        <tr>
          <td class="cell-media" data-label="">${product.image ? `<img class="table-image" src="${escapeHtml(product.image)}" alt="">` : "—"}</td>
          <td class="cell-title" data-label=""><strong><a href="/product/${product.id}" target="_blank" rel="noreferrer">${escapeHtml(product.name)}</a></strong>${product.featured ? ` <span class="status">Featured</span>` : ""}<br><small>${escapeHtml(product.categoryName ?? "")}</small></td>
          <td data-label="Price">${effectivePrice(product.price, product.salePrice) < product.price ? `${taka(product.salePrice)} <s>${taka(product.price)}</s>` : taka(product.price)}</td>
          <td data-label="Stock">${product.stock > 0 ? product.stock : `<span class="out">Out of stock</span>`}</td>
          <td data-label="SKU">${product.sku ? escapeHtml(product.sku) : "—"}</td>
          <td class="cell-actions" data-label="">
            <a class="btn btn-small" href="/admin/products/edit/${product.id}">Edit</a>
            <form class="inline-form" method="POST" action="/admin/products/delete/${product.id}" onsubmit="return confirm('Delete this product?')">
              <button class="danger-button" type="submit">Delete</button>
            </form>
          </td>
        </tr>
      `).join("");

      const content = `
        <div class="page-title page-title-row">
          <div><p class="eyebrow">Catalogue</p><h1>Products</h1></div>
          <a class="btn" href="/admin/products/add">+ Add product</a>
        </div>
        <form class="search-bar" method="GET" action="/admin/products">
          <input name="q" value="${escapeHtml(search)}" placeholder="Search name, SKU or category" aria-label="Search products">
          ${lowStock ? `<input type="hidden" name="stock" value="low">` : ""}
          <button class="btn" type="submit">Search</button>
        </form>
        <div class="filters">
          <a class="${!lowStock ? "active-filter" : ""}" href="/admin/products${search ? `?q=${encodeURIComponent(search)}` : ""}">All products</a>
          <a class="${lowStock ? "active-filter" : ""}" href="/admin/products?stock=low${search ? `&q=${encodeURIComponent(search)}` : ""}">Low stock</a>
          <span class="muted">${total} ${total === 1 ? "product" : "products"}</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Image</th><th>Product</th><th>Price</th><th>Stock</th><th>SKU</th><th>Actions</th></tr></thead>
            <tbody>${productRows || `<tr><td colspan="6">${search || lowStock ? "No products match." : "No products yet."}</td></tr>`}</tbody>
          </table>
        </div>
        ${pagination(pageNumber, pages, adminPageHref)}`;

      return new Response(adminPage("Products", content), {
        headers: { "content-type": "text/html; charset=utf-8" }
      });
    }

    // ---------- Admin add product ----------
    if (url.pathname === "/admin/products/add" && request.method === "GET") {
      const denied = adminGuard(request);
      if (denied) return denied;

      const html = await readView("admin/product-form.html");

return new Response(
  page(
    "Add product",
    html
      .replaceAll("{{FORM_TITLE}}", "Add product")
      .replaceAll("{{ACTION}}", "/admin/products/add")
      .replaceAll("{{NAME}}", "")
      .replaceAll("{{DESCRIPTION}}", "")
      .replaceAll("{{PRICE}}", "")
      .replaceAll("{{STOCK}}", "")
       .replaceAll("{{SKU}}", "")
       .replaceAll("{{SALE_PRICE}}", "")
       .replaceAll("{{FEATURED_CHECKED}}", "")
       .replaceAll("{{SKIN_CONCERN}}", "")
       .replaceAll("{{INGREDIENTS}}", "")
       .replaceAll("{{HOW_TO_USE}}", "")
       .replaceAll("{{MATERIAL}}", "")
       .replaceAll("{{SIZE_INFO}}", "")
       .replaceAll("{{CARE_INSTRUCTIONS}}", "")
       .replaceAll("{{SEARCH_KEYWORDS}}", "")
       .replaceAll("{{CATEGORIES}}", categoryOptions())
       .replaceAll("{{VARIANT_NAME}}", "Design")
       .replaceAll("{{VARIANT_VALUES}}", "")
       .replaceAll("{{VARIANT_STOCKS}}", "")
       .replaceAll("{{CURRENT_DESIGN_IMAGES}}", "")
      .replaceAll("{{CURRENT_IMAGE}}", "")
      .replaceAll("{{ID}}", "")
  ),
  { headers: { "content-type": "text/html; charset=utf-8" } }
);
    }

    if (url.pathname === "/admin/products/add" && request.method === "POST") {
      const denied = adminGuard(request);
      if (denied) return denied;

      const form = await request.formData();
      const name = form.get("name")?.toString().trim();
      const description = form.get("description")?.toString().trim() ?? "";
      const price = Number(form.get("price"));
      const stock = Number(form.get("stock"));
      const sku = form.get("sku")?.toString().trim() || null;
      const skinConcern = form.get("skin_concern")?.toString().trim() || null;
      const ingredients = form.get("ingredients")?.toString().trim() || null;
      const howToUse = form.get("how_to_use")?.toString().trim() || null;
      const material = form.get("material")?.toString().trim() || null;
      const sizeInfo = form.get("size_info")?.toString().trim() || null;
      const careInstructions = form.get("care_instructions")?.toString().trim() || null;
      const searchKeywords = form.get("search_keywords")?.toString().trim().slice(0, 300) || null;
      const categoryId = Number(form.get("category_id")) || null;
      const variantName = form.get("variant_name")?.toString().trim();
      const variantValue = form.get("variant_value")?.toString().trim();
      const variantStock = form.get("variant_stock")?.toString();
      const variantImages = form.getAll("variant_images");
      const images = form.getAll("images");

      if (!name) return productFormError("Please enter a product name.");
      if (!Number.isFinite(price) || price < 0) return productFormError("Price must be a number of 0 or more.");
      if (!Number.isInteger(stock) || stock < 0) return productFormError("Stock must be a whole number of 0 or more.");
      const sale = saleFields(form, price);
      if (sale.error) return productFormError(sale.error);
      const variantPlan = planVariants(variantName, variantValue, variantStock, variantImages);
      if (variantPlan.error) return productFormError(variantPlan.error);
      const imageError = await uploadsProblem([...images, ...variantImages]);
      if (imageError) return productFormError(imageError);

      const slugBase = slugify(name);
      let slug = slugBase || `product-${Date.now()}`;
      let n = 2;
      while (db.query("SELECT id FROM products WHERE slug = ?", [slug]).length) {
        slug = `${slugBase}-${n++}`;
      }
      // A new product takes over this address even if a renamed product used to have it.
      db.query("DELETE FROM product_slug_history WHERE slug = ?", [slug]);

      db.query(`
        INSERT INTO products
        (category_id, name, slug, description, price, sale_price, is_featured, sku, stock, skin_concern, ingredients, how_to_use, material, size_info, care_instructions, search_keywords)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [categoryId, name, slug, description, price, sale.salePrice, sale.featured, sku, stock, skinConcern, ingredients, howToUse, material, sizeInfo, careInstructions, searchKeywords]);

      const productId = db.query("SELECT last_insert_rowid()")[0][0];

      await saveDesignVariants(productId, variantPlan);

      for (const [index, image] of images.entries()) {
  const uploaded = await saveUploadedImage(image);

  if (uploaded) {
    db.query(
      "INSERT INTO product_images (product_id, image_path, is_main) VALUES (?, ?, ?)",
      [productId, uploaded.webPath, index === 0 ? 1 : 0]
    );
  }
}

      return redirect("/admin/products");
    }

    // ---------- Admin edit product ----------
    if (url.pathname.startsWith("/admin/products/edit/") && request.method === "GET") {
      const denied = adminGuard(request);
      if (denied) return denied;

      const id = Number(url.pathname.split("/").pop());
      const product = getProduct(id);
      if (!product) return new Response("Product not found", { status: 404 });

      const html = await readView("admin/product-form.html");
      const currentImage = galleryManager(product.images);

return new Response(
  page(
    "Edit product",
    html
      .replaceAll("{{FORM_TITLE}}", "Edit product")
      .replaceAll("{{ACTION}}", `/admin/products/edit/${id}`)
      .replaceAll("{{NAME}}", escapeHtml(product.name))
      .replaceAll("{{DESCRIPTION}}", escapeHtml(product.description))
      .replaceAll("{{PRICE}}", String(product.price))
      .replaceAll("{{STOCK}}", String(product.stock))
       .replaceAll("{{SKU}}", escapeHtml(product.sku))
       .replaceAll("{{SALE_PRICE}}", product.salePrice === null ? "" : String(product.salePrice))
       .replaceAll("{{FEATURED_CHECKED}}", product.featured ? "checked" : "")
       .replaceAll("{{SKIN_CONCERN}}", escapeHtml(product.skinConcern))
       .replaceAll("{{INGREDIENTS}}", escapeHtml(product.ingredients))
       .replaceAll("{{HOW_TO_USE}}", escapeHtml(product.howToUse))
       .replaceAll("{{MATERIAL}}", escapeHtml(product.material))
       .replaceAll("{{SIZE_INFO}}", escapeHtml(product.sizeInfo))
       .replaceAll("{{CARE_INSTRUCTIONS}}", escapeHtml(product.careInstructions))
       .replaceAll("{{SEARCH_KEYWORDS}}", escapeHtml(product.searchKeywords))
       .replaceAll("{{CATEGORIES}}", categoryOptions(product.categoryId))
       .replaceAll("{{VARIANT_NAME}}", escapeHtml(product.variants[0]?.name || "Design"))
       .replaceAll("{{VARIANT_VALUES}}", escapeHtml(product.variants.map(variant => variant.value).join("\n")))
       .replaceAll("{{VARIANT_STOCKS}}", escapeHtml(product.variants.map(variant => variant.stock ?? "").join("\n")))
       .replaceAll("{{CURRENT_DESIGN_IMAGES}}", designImagePreview(product.variants))
      .replaceAll("{{CURRENT_IMAGE}}", currentImage)
      .replaceAll("{{ID}}", String(id))
  ),
  {
    headers: { "content-type": "text/html; charset=utf-8" }
  }
);
    }

    if (url.pathname.startsWith("/admin/products/edit/") && request.method === "POST") {
      const denied = adminGuard(request);
      if (denied) return denied;

      const id = Number(url.pathname.split("/").pop());
      const product = getProduct(id);
      if (!product) return new Response("Product not found", { status: 404 });

      const form = await request.formData();
      const name = form.get("name")?.toString().trim();
      const description = form.get("description")?.toString().trim() ?? "";
      const price = Number(form.get("price"));
      const stock = Number(form.get("stock"));
      const sku = form.get("sku")?.toString().trim() || null;
      const skinConcern = form.get("skin_concern")?.toString().trim() || null;
      const ingredients = form.get("ingredients")?.toString().trim() || null;
      const howToUse = form.get("how_to_use")?.toString().trim() || null;
      const material = form.get("material")?.toString().trim() || null;
      const sizeInfo = form.get("size_info")?.toString().trim() || null;
      const careInstructions = form.get("care_instructions")?.toString().trim() || null;
      const searchKeywords = form.get("search_keywords")?.toString().trim().slice(0, 300) || null;
      const categoryId = Number(form.get("category_id")) || null;
      const variantName = form.get("variant_name")?.toString().trim();
      const variantValue = form.get("variant_value")?.toString().trim();
      const variantStock = form.get("variant_stock")?.toString();
      const variantImages = form.getAll("variant_images");
      const images = form.getAll("images");

      if (!name) return productFormError("Please enter a product name.");
      if (!Number.isFinite(price) || price < 0) return productFormError("Price must be a number of 0 or more.");
      if (!Number.isInteger(stock) || stock < 0) return productFormError("Stock must be a whole number of 0 or more.");
      const sale = saleFields(form, price);
      if (sale.error) return productFormError(sale.error);
      const variantPlan = planVariants(variantName, variantValue, variantStock, variantImages, product.variants);
      if (variantPlan.error) return productFormError(variantPlan.error);
      const imageError = await uploadsProblem([...images, ...variantImages]);
      if (imageError) return productFormError(imageError);

      let slug = slugify(name) || `product-${id}`;
      const duplicate = db.query("SELECT id FROM products WHERE slug = ? AND id <> ?", [slug, id]);
      if (duplicate.length) slug = `${slug}-${id}`;
      // Keep the old address so links to it redirect to the renamed product.
      if (product.slug && product.slug !== slug) {
        db.query("INSERT OR REPLACE INTO product_slug_history (slug, product_id) VALUES (?, ?)", [product.slug, id]);
      }
      db.query("DELETE FROM product_slug_history WHERE slug = ?", [slug]);

      db.query(`
        UPDATE products
        SET category_id = ?, name = ?, slug = ?, description = ?,
            price = ?, sale_price = ?, is_featured = ?, sku = ?, stock = ?, skin_concern = ?, ingredients = ?, how_to_use = ?,
            material = ?, size_info = ?, care_instructions = ?, search_keywords = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [categoryId, name, slug, description, price, sale.salePrice, sale.featured, sku, stock, skinConcern, ingredients, howToUse, material, sizeInfo, careInstructions, searchKeywords, id]);

      // Shade photos ticked "Remove photo" are cleared, unless a new photo was chosen for that shade.
      const removeVariantImages = new Set(form.getAll("remove_variant_image").map(Number));
      const clearedVariantPaths = [];
      for (const entry of variantPlan.planned) {
        if (entry.old && removeVariantImages.has(entry.old.id) && !(entry.file instanceof File && entry.file.size > 0)) {
          if (entry.old.imagePath) clearedVariantPaths.push(entry.old.imagePath);
          entry.old = { ...entry.old, imagePath: "" };
        }
      }
      await saveDesignVariants(id, variantPlan);

      // Gallery: ticked photos are removed, new uploads are added, and the chosen photo
      // (or else the first remaining one) is the main photo.
      const removeImages = new Set(form.getAll("remove_image").map(Number));
      const removedPaths = product.images.filter(image => removeImages.has(image.id)).map(image => image.path);
      for (const imageId of removeImages) {
        db.query("DELETE FROM product_images WHERE id = ? AND product_id = ?", [imageId, id]);
      }
      for (const image of images) {
        const uploaded = await saveUploadedImage(image);
        if (uploaded) {
          db.query("INSERT INTO product_images (product_id, image_path, is_main) VALUES (?, ?, 0)", [id, uploaded.webPath]);
        }
      }
      const remaining = db.query("SELECT id FROM product_images WHERE product_id = ? ORDER BY is_main DESC, id ASC", [id]).map(([imageId]) => Number(imageId));
      const chosenMain = Number(form.get("main_image"));
      const mainId = remaining.includes(chosenMain) ? chosenMain : remaining[0];
      if (mainId) {
        db.query("UPDATE product_images SET is_main = CASE WHEN id = ? THEN 1 ELSE 0 END WHERE product_id = ?", [mainId, id]);
      }
      const deletedShadePaths = variantPlan.unmatched.map(variant => variant.imagePath).filter(Boolean);
      for (const path of [...removedPaths, ...clearedVariantPaths, ...deletedShadePaths]) await removeUnusedUpload(path);

      return redirect("/admin/products");
    }

    if (url.pathname.startsWith("/admin/products/delete/") && request.method === "POST") {
      const denied = adminGuard(request);
      if (denied) return denied;

      const id = Number(url.pathname.split("/").pop());
      db.query("DELETE FROM products WHERE id = ?", [id]);
      return redirect("/admin/products");
    }

    // ---------- Admin collections ----------
    // Collection texts: the short introduction under each collection's title and a longer
    // text under its products. Empty fields fall back to the built-in introduction / no text.
    if (url.pathname === "/admin/collections" && request.method === "GET") {
      const denied = adminGuard(request);
      if (denied) return denied;
      const saved = url.searchParams.get("saved") === "1";
      const panels = COLLECTIONS.map(collection => `
        <section class="panel collection-panel">
          <h2>${collection.title} <a class="text-link" href="/collections/${collection.key}" target="_blank" rel="noreferrer">View</a></h2>
          <label>Introduction (under the title)
            <textarea name="intro_${collection.key}" rows="2" maxlength="300" placeholder="${escapeHtml(collection.intro)}">${escapeHtml(getSetting(`collection_intro_${collection.key}`))}</textarea>
          </label>
          <label>About this collection (under the products)
            <textarea name="text_${collection.key}" rows="6" maxlength="3000" placeholder="A few paragraphs about what you sell in this collection, materials, how to choose, delivery. Leave a blank line between paragraphs.">${escapeHtml(getSetting(`collection_text_${collection.key}`))}</textarea>
          </label>
        </section>`).join("");
      return html(adminPage("Collections", `
        <div class="page-title"><p class="eyebrow">Storefront</p><h1>Collection texts</h1></div>
        ${saved ? `<p class="success-box" role="status">Saved.</p>` : ""}
        <p class="muted">Useful, specific text helps customers choose and helps Google show your collections in search. Leave a field empty to use the default.</p>
        <form method="POST" action="/admin/collections" class="form-grid">
          ${panels}
          <button class="btn" type="submit">Save collection texts</button>
        </form>`));
    }

    if (url.pathname === "/admin/collections" && request.method === "POST") {
      const denied = adminGuard(request);
      if (denied) return denied;
      const form = await request.formData();
      for (const collection of COLLECTIONS) {
        setSetting(`collection_intro_${collection.key}`, form.get(`intro_${collection.key}`)?.toString().trim().slice(0, 300) ?? "");
        setSetting(`collection_text_${collection.key}`, form.get(`text_${collection.key}`)?.toString().trim().slice(0, 3000) ?? "");
      }
      return redirect("/admin/collections?saved=1");
    }

    // ---------- Admin categories ----------
    if (url.pathname === "/admin/categories" && request.method === "GET") {
      const denied = adminGuard(request);
      if (denied) return denied;

      const rows = db.query(`
        SELECT c.id, c.name, c.slug, c.description, c.parent_id, p.name
        FROM categories c LEFT JOIN categories p ON p.id = c.parent_id
        ORDER BY CASE WHEN c.parent_id IS NULL THEN 0 ELSE 1 END, c.name
      `);
      const list = rows.map(([id, name, slug, description, parentId]) => `
        <tr>
          <td class="cell-title" data-label="">${escapeHtml(name)}</td>
          <td data-label="Parent">
            <form class="inline-form" method="POST" action="/admin/categories/parent/${id}">
              <select name="parent_id" aria-label="Parent category for ${escapeHtml(name)}">
                <option value="">Main category</option>${parentCategoryOptions(parentId, id)}
              </select>
              <button class="btn btn-small" type="submit">Save</button>
            </form>
          </td>
          <td data-label="Slug">${escapeHtml(slug)}</td>
          <td data-label="Description">${escapeHtml(description ?? "")}</td>
          <td class="cell-actions" data-label="">
            <form method="POST" action="/admin/categories/delete/${id}" onsubmit="return confirm('Delete this category?')">
              <button class="danger-button" type="submit">Delete</button>
            </form>
          </td>
        </tr>
      `).join("");

      const content = `
        <div class="page-title"><p class="eyebrow">Catalogue</p><h1>Categories</h1></div>
        <div class="two-column">
          <section class="panel">
            <h2>Add category</h2>
            <form method="POST" action="/admin/categories">
              <label>Name<input name="name" required></label>
              <label>Parent category
                <select name="parent_id"><option value="">None — this is a main category</option>${parentCategoryOptions()}</select>
              </label>
              <label>Description<textarea name="description"></textarea></label>
              <button class="btn" type="submit">Add category</button>
            </form>
          </section>
          <section class="panel">
            <h2>Existing categories</h2>
            <div class="table-wrap"><table>
              <thead><tr><th>Name</th><th>Parent</th><th>Slug</th><th>Description</th><th></th></tr></thead>
              <tbody>${list || `<tr><td colspan="5">No categories yet.</td></tr>`}</tbody>
            </table></div>
          </section>
        </div>`;

      return new Response(adminPage("Categories", content), {
        headers: { "content-type": "text/html; charset=utf-8" }
      });
    }

    if (url.pathname === "/admin/categories" && request.method === "POST") {
      const denied = adminGuard(request);
      if (denied) return denied;

      const form = await request.formData();
      const name = form.get("name")?.toString().trim();
      const description = form.get("description")?.toString().trim() ?? "";
      const parentId = Number(form.get("parent_id")) || null;
      if (!name) return new Response("Category name is required.", { status: 400 });
      if (parentId && !db.query("SELECT id FROM categories WHERE id = ? AND parent_id IS NULL", [parentId]).length) {
        return new Response("Please choose a valid main category.", { status: 400 });
      }

      let slug = slugify(name);
      let n = 2;
      while (db.query("SELECT id FROM categories WHERE slug = ?", [slug]).length) {
        slug = `${slugify(name)}-${n++}`;
      }

      db.query(
        "INSERT INTO categories (name, slug, description, parent_id) VALUES (?, ?, ?, ?)",
        [name, slug, description, parentId]
      );
      return redirect("/admin/categories");
    }

    if (url.pathname.startsWith("/admin/categories/parent/") && request.method === "POST") {
      const denied = adminGuard(request);
      if (denied) return denied;

      const id = Number(url.pathname.split("/").pop());
      const form = await request.formData();
      const parentId = Number(form.get("parent_id")) || null;
      if (!db.query("SELECT id FROM categories WHERE id = ?", [id]).length) {
        return new Response("Category not found.", { status: 404 });
      }
      if (parentId && (!db.query("SELECT id FROM categories WHERE id = ? AND parent_id IS NULL", [parentId]).length || parentId === id)) {
        return new Response("Please choose a valid main category.", { status: 400 });
      }
      db.query("UPDATE categories SET parent_id = ? WHERE id = ?", [parentId, id]);
      return redirect("/admin/categories");
    }

    if (url.pathname.startsWith("/admin/categories/delete/") && request.method === "POST") {
      const denied = adminGuard(request);
      if (denied) return denied;

      const id = Number(url.pathname.split("/").pop());
      db.query("DELETE FROM categories WHERE id = ?", [id]);
      return redirect("/admin/categories");
    }

    // ---------- Admin orders ----------
    if (url.pathname === "/admin/orders" && request.method === "GET") {
      const denied = adminGuard(request);
      if (denied) return denied;

      const { state, where, params: orderParams } = orderFilters(url.searchParams);
      const rows = db.query(`
        SELECT id, customer_name, phone, payment_method, status, total, datetime(created_at, '+6 hours'), transaction_id
        FROM orders ${where} ORDER BY id DESC
      `, orderParams);
      const totals = db.query(`SELECT COUNT(*), COALESCE(SUM(total), 0) FROM orders ${where ? `${where} AND` : "WHERE"} status <> 'Cancelled'`, orderParams)[0];

      const orderRows = rows.map(row => `
        <tr>
          <td class="cell-title" data-label="">#${row[0]}</td>
          <td data-label="Customer">${escapeHtml(row[1])}<br><small>${escapeHtml(row[2])}</small></td>
          <td data-label="Payment">${escapeHtml(row[3])}${row[7] ? `<br><small>${escapeHtml(row[7])}</small>` : ""}</td>
          <td data-label="Status"><span class="status">${escapeHtml(row[4])}</span></td>
          <td data-label="Total">৳${Number(row[5]).toFixed(0)}</td>
          <td data-label="Date">${escapeHtml(String(row[6]).slice(0, 16))}</td>
          <td class="cell-actions" data-label=""><a class="btn btn-small" href="/admin/orders/${row[0]}">View</a></td>
        </tr>
      `).join("");

      const hrefWith = (changes) => {
        const query = new URLSearchParams(Object.entries({ ...state, ...changes }).filter(([, value]) => value));
        const text = query.toString();
        return text ? `/admin/orders?${text}` : "/admin/orders";
      };
      const filterLinks = (key, options) => options.map(([value, label]) =>
        `<a class="${state[key] === value ? "active-filter" : ""}" href="${hrefWith({ [key]: value })}">${label}</a>`
      ).join(" ");
      const exportQuery = new URLSearchParams(Object.entries(state).filter(([, value]) => value)).toString();

      const content = `
        <div class="page-title page-title-row">
          <div><p class="eyebrow">Sales</p><h1>Orders</h1></div>
          <a class="btn btn-light" href="/admin/orders/export.csv${exportQuery ? `?${exportQuery}` : ""}">Download for Excel (CSV)</a>
        </div>
        <form class="search-bar" method="GET" action="/admin/orders">
          ${state.status ? `<input type="hidden" name="status" value="${escapeHtml(state.status)}">` : ""}
          ${state.range ? `<input type="hidden" name="range" value="${escapeHtml(state.range)}">` : ""}
          <input name="q" value="${escapeHtml(state.q)}" placeholder="Search order number, customer, phone or transaction ID"><button class="btn" type="submit">Search</button>
        </form>
        <div class="filters"><span class="filter-label">Status</span>${filterLinks("status", [["", "All"], ...ORDER_STATUSES.map(status => [status, status])])}</div>
        <div class="filters"><span class="filter-label">Date</span>${filterLinks("range", ORDER_RANGES.map(([key, label]) => [key, label]))}</div>
        <p class="orders-summary">${rows.length} ${rows.length === 1 ? "order" : "orders"} shown · <strong>${Number(totals[0])} not cancelled, ${taka(totals[1])}</strong></p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Order</th><th>Customer</th><th>Payment</th><th>Status</th><th>Total</th><th>Date</th><th></th></tr></thead>
            <tbody>${orderRows || `<tr><td colspan="7">No orders found.</td></tr>`}</tbody>
          </table>
        </div>`;

      return new Response(adminPage("Orders", content), {
        headers: { "content-type": "text/html; charset=utf-8" }
      });
    }

    // The orders currently filtered in the admin list, one row per order, for Excel.
    if (url.pathname === "/admin/orders/export.csv" && request.method === "GET") {
      const denied = adminGuard(request);
      if (denied) return denied;

      const { where, params: orderParams } = orderFilters(url.searchParams);
      const orders = db.query(`
        SELECT id, datetime(created_at, '+6 hours'), status, customer_name, phone, email, address, district, delivery_area,
               payment_method, transaction_id, subtotal, delivery_charge, total, order_notes
        FROM orders ${where} ORDER BY id DESC
      `, orderParams);
      const itemsByOrder = new Map();
      if (orders.length) {
        const ids = orders.map(order => order[0]);
        for (const [orderId, name, quantity] of db.query(`SELECT order_id, product_name, quantity FROM order_items WHERE order_id IN (${ids.map(() => "?").join(", ")}) ORDER BY id`, ids)) {
          itemsByOrder.set(orderId, [...(itemsByOrder.get(orderId) ?? []), `${name} x${quantity}`]);
        }
      }
      const header = ["Order", "Date", "Status", "Customer", "Phone", "Email", "Address", "District", "Delivery area", "Payment", "Transaction ID", "Items", "Subtotal", "Delivery", "Total", "Note"];
      const lines = orders.map(order => [
        order[0], String(order[1]).slice(0, 16), order[2], order[3], { phone: order[4] }, order[5], order[6], order[7], order[8],
        order[9], order[10], (itemsByOrder.get(order[0]) ?? []).join("; "), order[11], order[12], order[13], order[14]
      ]);
      const csv = [header, ...lines].map(cells => cells.map(csvCell).join(",")).join("\r\n");
      const date = new Date().toISOString().slice(0, 10);
      // The byte order mark tells Excel the file is UTF-8, so Bangla text displays correctly.
      return new Response(`\uFEFF${csv}\r\n`, {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="bellora-orders-${date}.csv"`,
          "cache-control": "no-store"
        }
      });
    }

    if (url.pathname.startsWith("/admin/orders/") && url.pathname.endsWith("/status") && request.method === "POST") {
      const denied = adminGuard(request);
      if (denied) return denied;

      const parts = url.pathname.split("/");
      const orderId = Number(parts[3]);
      const form = await request.formData();
      const status = form.get("status")?.toString();

      if (!ORDER_STATUSES.includes(status)) {
        return new Response("Invalid status", { status: 400 });
      }

      // Cancelling returns the order's stock; un-cancelling takes it again. The status
      // read and the stock change share one transaction so a double submit can't apply twice.
      db.exec("BEGIN IMMEDIATE");
      try {
        const current = db.query("SELECT status FROM orders WHERE id = ?", [orderId]);
        if (!current.length) {
          db.exec("ROLLBACK");
          return new Response("Order not found", { status: 404 });
        }
        const previous = current[0][0];
        const items = db.query("SELECT product_id, variant_id, quantity FROM order_items WHERE order_id = ?", [orderId]);

        if (previous !== "Cancelled" && status === "Cancelled") {
          for (const [productId, variantId, quantity] of items) {
            if (productId) db.query("UPDATE products SET stock = stock + ? WHERE id = ?", [quantity, productId]);
            if (variantId) db.query("UPDATE product_variants SET stock = stock + ? WHERE id = ? AND stock IS NOT NULL", [quantity, variantId]);
          }
        } else if (previous === "Cancelled" && status !== "Cancelled") {
          const needByProduct = new Map();
          const needByVariant = new Map();
          for (const [productId, variantId, quantity] of items) {
            if (productId) needByProduct.set(productId, (needByProduct.get(productId) ?? 0) + Number(quantity));
            if (variantId) needByVariant.set(variantId, (needByVariant.get(variantId) ?? 0) + Number(quantity));
          }
          for (const [productId, need] of needByProduct) {
            const row = db.query("SELECT name, stock FROM products WHERE id = ?", [productId])[0];
            if (row && Number(row[1]) < need) {
              db.exec("ROLLBACK");
              return new Response(`Not enough stock to reopen this order: ${row[0]} has ${row[1]}, the order needs ${need}.`, { status: 400 });
            }
          }
          for (const [variantId, need] of needByVariant) {
            const row = db.query("SELECT variant_value, stock FROM product_variants WHERE id = ?", [variantId])[0];
            if (row && row[1] !== null && Number(row[1]) < need) {
              db.exec("ROLLBACK");
              return new Response(`Not enough stock to reopen this order: ${row[0]} has ${row[1]}, the order needs ${need}.`, { status: 400 });
            }
          }
          for (const [productId, need] of needByProduct) db.query("UPDATE products SET stock = stock - ? WHERE id = ?", [need, productId]);
          for (const [variantId, need] of needByVariant) db.query("UPDATE product_variants SET stock = stock - ? WHERE id = ? AND stock IS NOT NULL", [need, variantId]);
        }

        db.query("UPDATE orders SET status = ? WHERE id = ?", [status, orderId]);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      return redirect(`/admin/orders/${orderId}`);
    }

    if (url.pathname.startsWith("/admin/orders/") && url.pathname.endsWith("/delete") && request.method === "POST") {
      const denied = adminGuard(request);
      if (denied) return denied;

      const orderId = Number(url.pathname.split("/")[3]);
      const order = db.query("SELECT status FROM orders WHERE id = ?", [orderId]);
      if (!order.length) return new Response("Order not found", { status: 404 });
      if (order[0][0] !== "Cancelled") {
        return new Response("Only cancelled orders can be deleted. Cancel the order first.", { status: 400 });
      }
      // Stock was already returned when the order was cancelled; order_items cascade.
      db.query("DELETE FROM orders WHERE id = ? AND status = 'Cancelled'", [orderId]);
      return redirect("/admin/orders");
    }

    // A consistent copy of the whole database, made with VACUUM INTO while the shop keeps running.
    if (url.pathname === "/admin/backup" && request.method === "GET") {
      const denied = adminGuard(request);
      if (denied) return denied;
      const folder = await Deno.makeTempDir({ prefix: "bellora-backup-" });
      const path = `${folder}/shop.sqlite`;
      try {
        db.exec(`VACUUM INTO '${path.replaceAll("'", "''")}'`);
        const data = await Deno.readFile(path);
        const date = new Date().toISOString().slice(0, 10);
        return new Response(data, {
          headers: {
            "content-type": "application/vnd.sqlite3",
            "content-disposition": `attachment; filename="bellora-backup-${date}.sqlite"`,
            "cache-control": "no-store"
          }
        });
      } finally {
        await Deno.remove(folder, { recursive: true }).catch(() => {});
      }
    }

    if (url.pathname === "/admin/analytics/reset" && request.method === "POST") {
      const denied = adminGuard(request);
      if (denied) return denied;
      db.query("DELETE FROM analytics_events");
      return redirect("/admin/dashboard");
    }

    if (url.pathname.startsWith("/admin/orders/") && url.pathname.endsWith("/print") && request.method === "GET") {
      const denied = adminGuard(request);
      if (denied) return denied;
      const orderId = Number(url.pathname.split("/")[3]);
      const order = db.query("SELECT customer_name, phone, address, payment_method, delivery_area, district, delivery_charge, total, order_notes, transaction_id FROM orders WHERE id = ?", [orderId]);
      if (!order.length) return new Response("Order not found", { status: 404 });
      const items = db.query("SELECT product_name, price, quantity FROM order_items WHERE order_id = ? ORDER BY id", [orderId]);
      const row = order[0];
      const itemRows = items.map(item => `<tr><td>${escapeHtml(item[0])}</td><td>${item[2]}</td><td>${Number(item[1]).toFixed(0)}</td></tr>`).join("");
      return new Response(page(`Packing slip #${orderId}`, `<main id="main-content" class="print-slip"><h1>${BRAND}</h1><p>Packing slip · Order #${orderId}</p><hr><h2>${escapeHtml(row[0])}</h2><p>${escapeHtml(row[1])}<br>${escapeHtml(row[2])}</p><p>Delivery: ${escapeHtml(row[5] ?? "")} (${escapeHtml(row[4] ?? "")}) · ৳${Number(row[6] ?? 0).toFixed(0)}<br>Payment: ${escapeHtml(row[3])}${row[9] ? ` (Transaction ID ${escapeHtml(row[9])})` : ""}</p><table><thead><tr><th>Item</th><th>Qty</th><th>Price</th></tr></thead><tbody>${itemRows}</tbody></table><p><strong>Total: ৳${Number(row[7]).toFixed(0)}</strong></p>${row[8] ? `<p>Note: ${escapeHtml(row[8])}</p>` : ""}</main><script>window.print()</script>`), { headers: { "content-type": "text/html; charset=utf-8" } });
    }

    if (url.pathname.startsWith("/admin/orders/") && request.method === "GET") {
      const denied = adminGuard(request);
      if (denied) return denied;

      const orderId = Number(url.pathname.split("/")[3]);
      const order = db.query(`
        SELECT id, customer_name, phone, email, address, payment_method, status, total, datetime(created_at, '+6 hours'), transaction_id
        FROM orders WHERE id = ?
      `, [orderId]);

      if (!order.length) return new Response("Order not found", { status: 404 });

      const row = order[0];
      const whatsappPhone = String(row[2]).replace(/\D/g, "").replace(/^0/, "880");
      const delivery = db.query(
        "SELECT delivery_area, district, subtotal, delivery_charge FROM orders WHERE id = ?",
        [orderId]
      )[0];
      const items = db.query(`
        SELECT product_name, price, quantity
        FROM order_items WHERE order_id = ? ORDER BY id
      `, [orderId]);

      const itemRows = items.map(item => `
        <tr>
          <td class="cell-title" data-label="">${escapeHtml(item[0])}</td>
          <td data-label="Price">৳${Number(item[1]).toFixed(0)}</td>
          <td data-label="Qty">${item[2]}</td>
          <td data-label="Total">৳${(Number(item[1]) * Number(item[2])).toFixed(0)}</td>
        </tr>
      `).join("");

      const statusOptions = ORDER_STATUSES.map(s =>
        `<option ${s === row[6] ? "selected" : ""}>${s}</option>`
      ).join("");

      const content = `
        <div class="page-title page-title-row">
          <div><p class="eyebrow">Order #${orderId}</p><h1>Order details</h1></div>
          <a class="btn btn-light" href="/admin/orders">Back to orders</a>
        </div>
        <div class="two-column">
          <section class="panel">
            <h2>Customer</h2>
            <p><strong>${escapeHtml(row[1])}</strong></p>
            <p>${escapeHtml(row[2])}</p>
            <p>${escapeHtml(row[3] ?? "")}</p>
            <p>${escapeHtml(row[4])}</p>
            <p><a class="btn btn-small" target="_blank" rel="noreferrer" href="https://wa.me/${whatsappPhone}?text=${encodeURIComponent(`Hello ${row[1]}, regarding your ${BRAND} order #${orderId}.`)}">Message on WhatsApp</a></p>
            <hr>
            <p>Payment: <strong>${escapeHtml(row[5])}</strong></p>
            ${row[9] ? `<p>Transaction ID: <strong>${escapeHtml(row[9])}</strong> <small class="muted">Check it in your ${escapeHtml(row[5])} account before confirming.</small></p>` : ""}
            <p>Delivery: <strong>${escapeHtml(delivery?.[0] ?? "Not recorded")}</strong></p>
            <p>District / city: <strong>${escapeHtml(delivery?.[1] ?? "Not recorded")}</strong></p>
            <p>Delivery charge: <strong>৳${Number(delivery?.[3] ?? 0).toFixed(0)}</strong></p>
            <p>Total: <strong>৳${Number(row[7]).toFixed(0)}</strong></p>
            <p>Created: ${escapeHtml(row[8])}</p>
          </section>
           <section class="panel">
             <h2>Update status</h2>
            <form method="POST" action="/admin/orders/${orderId}/status">
              <label>Status<select name="status">${statusOptions}</select></label>
               <button class="btn" type="submit">Save status</button>
             </form>
             <p><a class="text-link" target="_blank" href="/admin/orders/${orderId}/print">Print packing slip</a></p>
             ${row[6] === "Cancelled" ? `<form method="POST" action="/admin/orders/${orderId}/delete" onsubmit="return confirm('Delete order #${orderId} permanently? This cannot be undone.')">
               <button class="danger-button" type="submit">Delete order</button>
             </form>` : ""}
          </section>
        </div>
        <section class="panel">
          <h2>Items</h2>
          <div class="table-wrap"><table>
            <thead><tr><th>Product</th><th>Price</th><th>Qty</th><th>Total</th></tr></thead>
            <tbody>${itemRows}</tbody>
          </table></div>
        </section>`;

      return new Response(adminPage(`Order #${orderId}`, content), {
        headers: { "content-type": "text/html; charset=utf-8" }
      });
    }

    return new Response("404 - Page Not Found", { status: 404 });
  } catch (error) {
    console.error(error);
    // Generic page with no database calls, so it still renders when the database is the
    // problem. Error details go to the server log only.
    return html(page("Something went wrong", `
      <main id="main-content" class="wrap empty-state not-found">
        <h1>Something went wrong. Please try again.</h1>
        <p>If it keeps happening, please contact us and we will help.</p>
        <div class="empty-links"><a class="btn btn-dark" href="/">Go to the homepage</a></div>
      </main>`, { noindex: true }), 500);
  }
}

console.log(`${BRAND} running at http://localhost:${PORT}`);
