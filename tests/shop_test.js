// End-to-end tests: start the shop against an empty temporary database and drive it over
// HTTP, the way a browser and the admin would. Run with `deno task test`.

const PORT = 18000 + Math.floor(Math.random() * 1000);
const BASE = `http://localhost:${PORT}`;
const ADMIN = { username: "admin", password: "test-password-123" };
const PHOTO = await Deno.readFile(new URL("../public/images/collection-makeup.jpg", import.meta.url));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEquals(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ---------- Server ----------

const dataDir = await Deno.makeTempDir({ prefix: "bellora-test-" });
let server = null;

async function startServer() {
  server = new Deno.Command(Deno.execPath(), {
    args: ["run", "--allow-net", "--allow-read", "--allow-write", "--allow-env", "--allow-ffi", "main.js"],
    cwd: new URL("..", import.meta.url),
    env: {
      ADMIN_USERNAME: ADMIN.username,
      ADMIN_PASSWORD: ADMIN.password,
      DATA_DIR: dataDir,
      PORT: String(PORT),
      BKASH_NUMBER: "01711111111",
      SHOP_WHATSAPP_NUMBER: "8801711111111"
    },
    stdout: "null",
    stderr: "inherit"
  }).spawn();
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const response = await fetch(`${BASE}/health`);
      await response.body?.cancel();
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error("The shop did not start");
}

async function stopServer() {
  server?.kill("SIGTERM");
  await server?.status;
  server = null;
}

// ---------- A browser with its own cookies ----------

function browser(address = `10.0.0.${Math.floor(Math.random() * 250) + 1}`) {
  const cookies = new Map();
  return {
    cookies,
    async request(path, { method = "GET", form = null, json = false } = {}) {
      const headers = { "X-Forwarded-For": address };
      if (cookies.size) headers.Cookie = [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
      if (json) headers.Accept = "application/json";
      let body;
      if (form instanceof FormData) body = form;
      else if (form) body = new URLSearchParams(form);
      const response = await fetch(`${BASE}${path}`, { method, headers, body, redirect: "manual" });
      for (const line of response.headers.getSetCookie()) {
        const [pair] = line.split(";");
        const [name, ...value] = pair.split("=");
        if (/Max-Age=0/.test(line)) cookies.delete(name);
        else cookies.set(name, value.join("="));
      }
      // Keep a leading byte order mark (the CSV download starts with one).
      const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(await response.arrayBuffer());
      return { status: response.status, location: response.headers.get("location"), headers: response.headers, text };
    }
  };
}

async function loggedInAdmin() {
  const admin = browser();
  const login = await admin.request("/admin/login", { method: "POST", form: ADMIN });
  assertEquals(login.location, "/admin/dashboard", "admin login redirect");
  return admin;
}

async function addProduct(admin, fields, { variants = "", photo = PHOTO, photoName = "photo.jpg" } = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, String(value));
  if (variants) {
    form.set("variant_name", "Shade");
    form.set("variant_value", variants);
  }
  form.set("images", new File([photo], photoName, { type: "image/jpeg" }));
  return await admin.request("/admin/products/add", { method: "POST", form });
}

// Reads a product's id from the admin product list, which links /product/<id>.
function productIdByName(html, name) {
  const pattern = new RegExp(`href="/product/(\\d+)"[^>]*>${name}<`);
  const match = html.match(pattern);
  assert(match, `product "${name}" is listed`);
  return Number(match[1]);
}

async function stockOf(admin, productId) {
  const page = await admin.request(`/admin/products/edit/${productId}`);
  const match = page.text.match(/name="stock"[^>]*value="(\d+)"/) ?? page.text.match(/value="(\d+)"[^>]*name="stock"/);
  assert(match, "stock field on the edit form");
  return Number(match[1]);
}

const customer = (overrides = {}) => ({
  customer_name: "Test Customer",
  phone: "01712345678",
  phone_confirmation: "01712345678",
  address: "House 1, Road 2",
  district: "Dhaka",
  delivery_area: "Inside Dhaka",
  payment_method: "Cash on Delivery",
  ...overrides
});

// ---------- Tests ----------

Deno.test({
  name: "Bellora shop",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn(t) {
    await startServer();
    const ids = {};
    try {
      await t.step("pages carry security headers", async () => {
        const home = await browser().request("/");
        assertEquals(home.status, 200, "homepage status");
        assertEquals(home.headers.get("x-frame-options"), "DENY", "X-Frame-Options");
        assert(home.headers.get("content-security-policy")?.includes("frame-ancestors 'none'"), "Content-Security-Policy is set");
      });

      await t.step("admin login locks after 5 wrong passwords", async () => {
        const attacker = browser("10.200.0.1");
        for (let attempt = 0; attempt < 5; attempt++) {
          const wrong = await attacker.request("/admin/login", { method: "POST", form: { ...ADMIN, password: "wrong" } });
          assertEquals(wrong.status, 401, `wrong password ${attempt + 1}`);
        }
        const locked = await attacker.request("/admin/login", { method: "POST", form: ADMIN });
        assertEquals(locked.status, 429, "correct password while locked");
        await loggedInAdmin();
      });

      const admin = await loggedInAdmin();

      await t.step("uploads must be real photos", async () => {
        const fake = await addProduct(admin, { name: "Fake", price: 100, stock: 1 }, { photo: new TextEncoder().encode("not an image"), photoName: "fake.jpg" });
        assertEquals(fake.status, 400, "fake photo rejected");
      });

      await t.step("admin adds products", async () => {
        for (const [fields, options] of [
          [{ name: "Plain Ring", price: 1000, stock: 3 }, {}],
          [{ name: "Bangle", price: 500, stock: 10, search_keywords: "churi, চুড়ি" }, {}],
          [{ name: "Sale Lipstick", price: 900, sale_price: 700, stock: 5 }, { variants: "Mauve Dream\nRose Petal" }],
          [{ name: "Full Price Lipstick", price: 900, stock: 5 }, { variants: "Autumn Nude\nBoss Girl" }]
        ]) {
          const saved = await addProduct(admin, fields, options);
          assertEquals(saved.location, "/admin/products", `${fields.name} saved`);
        }
        const list = await admin.request("/admin/products");
        ids.ring = productIdByName(list.text, "Plain Ring");
        ids.bangle = productIdByName(list.text, "Bangle");
        ids.sale = productIdByName(list.text, "Sale Lipstick");
      });

      await t.step("product pages work for products outside the three collections", async () => {
        // A category that matches no collection, holding a single product: "You may also like"
        // has to be topped up from the rest of the shop.
        await admin.request("/admin/categories", { method: "POST", form: { name: "Gift Sets" } });
        const form = await admin.request("/admin/products/add");
        const categoryId = form.text.match(/<option value="(\d+)"[^>]*>Gift Sets<\/option>/)?.[1];
        assert(categoryId, "new category offered on the product form");
        await addProduct(admin, { name: "Gift Box", price: 1500, stock: 2, category_id: categoryId });
        const page = await browser().request("/product/gift-box");
        assertEquals(page.status, 200, "product page status");
      });

      await t.step("search finds products by their keywords, in any language", async () => {
        assert((await browser().request("/products?q=churi")).text.includes(">Bangle<"), "Banglish keyword");
        assert((await browser().request(`/products?q=${encodeURIComponent("চুড়ি")}`)).text.includes(">Bangle<"), "Bangla keyword");
      });

      await t.step("products have readable addresses; old number links redirect", async () => {
        const old = await browser().request(`/product/${ids.ring}`);
        assertEquals(old.status, 301, "number link redirects");
        assertEquals(old.location, "/product/plain-ring", "redirect target");
        assertEquals((await browser().request("/product/plain-ring")).status, 200, "readable address works");
        const listing = await browser().request("/products");
        assert(listing.text.includes('href="/product/plain-ring"'), "cards link to the readable address");
      });

      await t.step("sale page filters list only sale products' shades", async () => {
        const sale = await browser().request("/products?sale=1");
        assert(sale.text.includes('value="Mauve Dream"'), "sale shade offered");
        assert(!sale.text.includes('value="Autumn Nude"'), "full-price shade not offered");
      });

      await t.step("add to bag from a card answers with JSON and respects stock", async () => {
        const shopper = browser();
        const added = await shopper.request("/cart/add", { method: "POST", form: { product_id: ids.ring, quantity: 2 }, json: true });
        const result = JSON.parse(added.text);
        assertEquals(result.ok, true, "added");
        assertEquals(result.count, 2, "bag count");
        const tooMany = await shopper.request("/cart/add", { method: "POST", form: { product_id: ids.ring, quantity: 2 }, json: true });
        assertEquals(JSON.parse(tooMany.text).ok, false, "over stock refused");
      });

      await t.step("buy now goes straight to checkout", async () => {
        const shopper = browser();
        const buy = await shopper.request("/cart/add", { method: "POST", form: { product_id: ids.ring, quantity: 1, next: "checkout" } });
        assertEquals(buy.location, "/checkout", "redirect");
      });

      await t.step("bag survives a restart", async () => {
        const shopper = browser();
        await shopper.request("/cart/add", { method: "POST", form: { product_id: ids.ring, quantity: 1 } });
        await stopServer();
        await startServer();
        const bag = await shopper.request("/cart");
        assert(bag.text.includes("Plain Ring"), "item still in the bag");
      });

      const adminAfterRestart = await loggedInAdmin();

      await t.step("checkout takes stock; order page uses a secret link", async () => {
        const shopper = browser();
        await shopper.request("/cart/add", { method: "POST", form: { product_id: ids.ring, quantity: 2 } });
        const placed = await shopper.request("/checkout", { method: "POST", form: customer() });
        assert(/^\/order-success\/[0-9a-f-]{36}$/.test(placed.location ?? ""), `redirect to token link, got ${placed.location}`);
        const confirmation = await shopper.request(placed.location);
        const orderId = Number(confirmation.text.match(/order number is <strong>#(\d+)/)?.[1]);
        assert(orderId > 0, "order number shown");
        ids.order = orderId;
        assertEquals((await browser().request(`/order-success/${orderId}`)).status, 404, "order number alone is not a link");
        assertEquals(await stockOf(adminAfterRestart, ids.ring), 1, "stock after order");
      });

      await t.step("bKash orders need a transaction ID, used once", async () => {
        const order = async (transactionId) => {
          const shopper = browser();
          await shopper.request("/cart/add", { method: "POST", form: { product_id: ids.bangle, quantity: 1 } });
          return await shopper.request("/checkout", { method: "POST", form: customer({ payment_method: "bKash", transaction_id: transactionId }) });
        };
        assertEquals((await order("")).status, 400, "missing ID refused");
        assert((await order("9ab1cd2efg")).location?.startsWith("/order-success/"), "order with ID placed");
        const reused = await order("9AB1CD2EFG");
        assertEquals(reused.status, 400, "reused ID refused");
        assert(reused.text.includes("already been used"), "reuse explained");
        assertEquals(await stockOf(adminAfterRestart, ids.bangle), 9, "stock after bKash order");
      });

      await t.step("cancelling returns stock; reopening takes it again", async () => {
        const setStatus = (status) => adminAfterRestart.request(`/admin/orders/${ids.order}/status`, { method: "POST", form: { status } });
        await setStatus("Cancelled");
        assertEquals(await stockOf(adminAfterRestart, ids.ring), 3, "stock after cancelling");
        await setStatus("Cancelled");
        assertEquals(await stockOf(adminAfterRestart, ids.ring), 3, "cancelling twice returns stock once");
        await setStatus("Pending");
        assertEquals(await stockOf(adminAfterRestart, ids.ring), 1, "stock after reopening");
        await setStatus("Processing");
      });

      await t.step("customers track orders with number and phone", async () => {
        const visitor = browser();
        const found = await visitor.request("/track-order", { method: "POST", form: { order: String(ids.order), phone: "+880 1712-345678" } });
        assertEquals(found.status, 200, "found");
        assert(found.text.includes('aria-current="step"') && found.text.includes("Packing"), "shows the current step");
        const wrong = await visitor.request("/track-order", { method: "POST", form: { order: String(ids.order), phone: "01799999999" } });
        assertEquals(wrong.status, 404, "wrong phone");
      });

      await t.step("orders download for Excel", async () => {
        const csv = await adminAfterRestart.request("/admin/orders/export.csv");
        assertEquals(csv.status, 200, "status");
        assert(csv.text.startsWith("﻿Order,Date,Status"), "UTF-8 marker and header row");
        assert(csv.text.includes('"=""01712345678"""'), "phone keeps its leading zero");
        assertEquals((await browser().request("/admin/orders/export.csv")).location, "/admin/login", "needs admin login");
      });

      await t.step("Google data: sitemap, store details and breadcrumbs", async () => {
        const sitemap = await browser().request("/sitemap.xml");
        assert(sitemap.text.includes("/product/plain-ring</loc><lastmod>"), "sitemap lists readable address with date");
        assert(sitemap.text.includes("<image:loc>"), "sitemap lists product photos");
        assert((await browser().request("/")).text.includes('"@type":"OnlineStore"'), "store details on homepage");
        assert((await browser().request("/product/plain-ring")).text.includes('"@type":"BreadcrumbList"'), "breadcrumbs on product page");
      });

      await t.step("collection texts are edited in the admin and shown on the collection", async () => {
        const saved = await adminAfterRestart.request("/admin/collections", { method: "POST", form: { intro_jewellery: "Handpicked pieces for every day.", text_jewellery: "First paragraph.\n\nSecond paragraph." } });
        assertEquals(saved.location, "/admin/collections?saved=1", "saved");
        const collection = await browser().request("/collections/jewellery");
        assert(collection.text.includes("Handpicked pieces for every day."), "custom introduction");
        assert(collection.text.includes("<p>First paragraph.</p><p>Second paragraph.</p>"), "longer text in paragraphs");
      });

      await t.step("a renamed product keeps its old address working", async () => {
        const form = new FormData();
        for (const [key, value] of Object.entries({ name: "Gold Ring", price: 1000, stock: await stockOf(adminAfterRestart, ids.ring) })) form.set(key, String(value));
        const saved = await adminAfterRestart.request(`/admin/products/edit/${ids.ring}`, { method: "POST", form });
        assertEquals(saved.location, "/admin/products", "saved");
        const old = await browser().request("/product/plain-ring");
        assertEquals(old.status, 301, "old address redirects");
        assertEquals(old.location, "/product/gold-ring", "to the new address");
      });

      await t.step("admin removes single photos and chooses the main photo", async () => {
        const photo = (name) => new File([PHOTO], name, { type: "image/jpeg" });
        const form = new FormData();
        for (const [key, value] of Object.entries({ name: "Photo Palette", price: 1200, stock: 4, variant_name: "Shade", variant_value: "Peach\nBerry", variant_stock: "2\n2" })) form.set(key, String(value));
        for (const name of ["a.jpg", "b.jpg", "c.jpg"]) form.append("images", photo(name));
        for (const name of ["peach.jpg", "berry.jpg"]) form.append("variant_images", photo(name));
        assertEquals((await adminAfterRestart.request("/admin/products/add", { method: "POST", form })).location, "/admin/products", "product saved");
        const id = productIdByName((await adminAfterRestart.request("/admin/products")).text, "Photo Palette");

        const editPage = (await adminAfterRestart.request(`/admin/products/edit/${id}`)).text;
        const gallery = [...editPage.matchAll(/<img src="(\/uploads\/products\/[^"]+)" alt="Photo \d+">[\s\S]*?name="main_image" value="(\d+)"/g)].map(([, path, imageId]) => ({ path, imageId }));
        const shadeIds = [...editPage.matchAll(/name="remove_variant_image" value="(\d+)"/g)].map(match => match[1]);
        assertEquals(gallery.length, 3, "three gallery photos on the edit page");
        assertEquals(shadeIds.length, 2, "two shade photos on the edit page");

        const update = new FormData();
        for (const [key, value] of Object.entries({ name: "Photo Palette", price: 1200, stock: 4, variant_name: "Shade", variant_value: "Peach\nBerry", variant_stock: "2\n2", main_image: gallery[2].imageId, remove_image: gallery[1].imageId, remove_variant_image: shadeIds[0] })) update.set(key, String(value));
        update.append("images", photo("d.jpg"));
        assertEquals((await adminAfterRestart.request(`/admin/products/edit/${id}`, { method: "POST", form: update })).location, "/admin/products", "changes saved");

        const after = (await adminAfterRestart.request(`/admin/products/edit/${id}`)).text;
        const afterGallery = [...after.matchAll(/<img src="(\/uploads\/products\/[^"]+)" alt="Photo \d+">[\s\S]*?name="main_image" value="(\d+)"( checked)?/g)];
        assertEquals(afterGallery.length, 3, "one removed and one added: still three photos");
        assert(!after.includes(gallery[1].path), "removed photo is gone from the gallery");
        assertEquals(afterGallery.find(match => match[3])?.[2], gallery[2].imageId, "chosen photo is the main photo");
        assertEquals([...after.matchAll(/name="remove_variant_image"/g)].length, 1, "one shade photo left");
        const fileGone = await Deno.stat(`${dataDir}${gallery[1].path}`).then(() => false, () => true);
        assert(fileGone, "removed photo's file is deleted from the server");
      });

      await t.step("backup downloads a database file", async () => {
        const backup = await adminAfterRestart.request("/admin/backup");
        assertEquals(backup.status, 200, "status");
        assert(backup.text.startsWith("SQLite format 3"), "is a SQLite file");
      });
    } finally {
      await stopServer();
      await Deno.remove(dataDir, { recursive: true }).catch(() => {});
    }
  }
});
