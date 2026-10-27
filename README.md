# Bellora BD

Online shop for makeup, skincare and jewellery in Bangladesh, with cash on delivery, bKash and Nagad. Built with [Deno](https://deno.com) and SQLite. There is no framework and no build step: one server program renders every page.

- **Live site:** https://belora-production-865f.up.railway.app (Railway)
- **Admin:** `/admin/login`, also linked as "Staff login" in the footer
- **Code:** https://github.com/muinahmed/Belora (deploys from `main`)

---

## Contents

1. [Features](#features)
2. [Run it on your computer](#run-it-on-your-computer)
3. [Settings (environment variables)](#settings-environment-variables)
4. [Using the admin panel](#using-the-admin-panel)
5. [How orders, stock and payments work](#how-orders-stock-and-payments-work)
6. [Deployment](#deployment)
7. [Data and backups](#data-and-backups)
8. [Project structure](#project-structure)
9. [Pages and addresses](#pages-and-addresses)
10. [Database](#database)
11. [Security](#security)
12. [Search engines (SEO)](#search-engines-seo)
13. [Tests](#tests)
14. [Dependencies](#dependencies)
15. [Troubleshooting](#troubleshooting)
16. [Not included](#not-included)

---

## Features

### For customers
- **Homepage:** banner, Makeup / Jewellery / Skincare tiles, new arrivals, a sale section, bestsellers ("Popular right now" until there are four real bestsellers), featured picks.
- **Shop and collection pages:** search; sub-category chips; filters for price, availability, sale, material, shade and skin concern; sorting; 24 products per page. Filter options only show values found among the products on screen.
- **Product cards:** **Add to bag** without leaving the page, **Choose option** for products with shades, **Ask on WhatsApp** when sold out.
- **Product pages:** photo gallery, shade or design options with their own photos and stock, sale price, stock level, details (ingredients, how to use, material, size, care), delivery and returns, "You may also like". There are two buttons: **Add to bag** (stays on the page and shows an "Added to bag" panel) and **Buy now** (straight to checkout). On phones a bar with both buttons stays at the bottom of the screen.
- **Bag and checkout:** guest checkout (no account needed), with Bangladeshi phone number validation, district list and delivery area (Inside Dhaka ৳70, Outside Dhaka ৳130). Payment by **Cash on Delivery**, **bKash** or **Nagad**. When a payment number is set, checkout shows it with the live total and asks for the **transaction ID**.
- **Order confirmation** on a private link that can't be guessed.
- **Order tracking** at `/track-order`, using the order number and phone: Order received → Confirmed → Packing → Out for delivery → Delivered.
- **Contact:** floating WhatsApp button, plus phone and social links in the footer.
- **Fast pages:** WebP banner, photos shrunk at upload, browser caching, images loaded as you scroll.
- **3D banner:** on the homepage a lipstick, gold rings, a compact, a pearl bracelet and a gem float and turn slowly, leaning towards the mouse (`public/js/hero3d.js`, plain WebGL with no library, only loaded on the homepage). It pauses when scrolled out of view. Visitors who ask for reduced motion, have data saver on, or whose device can't draw 3D see the photo banner instead.
- **Subtle animations:** pages cross-fade when navigating (header and bottom bar stay still); the banner headline rises in word by word and the banner settles in with a slow zoom; sections and products fade up as you scroll; photos show a soft shimmer while loading, then fade in; photos zoom slightly on hover; on **Add to bag** the product photo flies into the bag and the count pops; filters and product details slide open; photos cross-fade when switching shades; the header gains a soft shadow on scroll. All of them are off for visitors whose device asks for reduced motion, and browsers without a feature (for example page cross-fades or sliding details) simply skip it.

### For the shop owner (admin)
- **Dashboard:** counts, low stock, 30-day analytics (views, bag adds, checkouts started, orders), and **Download backup**.
- **Products:** add, edit and delete; search; low-stock filter; sale price; featured flag; shades or designs with photo and stock each; search keywords (any language). Photos are shrunk automatically before upload.
- **Categories:** main categories and sub-categories.
- **Collections:** edit each collection's introduction and its longer "About" text.
- **Orders:** filter by status and date (Today / 7 days / 30 days / This month, in Bangladesh time); search by order number, name, phone or transaction ID; totals for the filtered orders; change status; print a packing slip; message the customer on WhatsApp; **download for Excel (CSV)**; delete cancelled orders.

---

## Run it on your computer

**Needs:** [Deno](https://docs.deno.com/runtime/getting_started/installation/) 2.3 or newer. Railway currently uses Deno 2.9.

```sh
git clone https://github.com/muinahmed/Belora.git
cd Belora
cp .env.example .env          # then edit .env: set a long, unique ADMIN_PASSWORD
deno task --env-file=.env start
```

Open http://localhost:8000. The admin is at http://localhost:8000/admin/login.

- The database is created automatically at `DATA_DIR/shop.sqlite` (`./database/shop.sqlite` by default), and tables are added or updated on every start.
- **Never commit** `.env`, `database/*.sqlite` or `public/uploads/products/`. `.gitignore` already excludes them.
- To update your copy: `git checkout main && git pull`.

---

## Settings (environment variables)

Set these in `.env` when running locally, or in **Railway → service → Variables** on the live site.

| Variable | Required | What it does | Example |
| --- | --- | --- | --- |
| `ADMIN_USERNAME` | ✅ | Admin login name | `admin` |
| `ADMIN_PASSWORD` | ✅ | Admin password. Make it long and unique. The app won't start without it | |
| `DATA_DIR` | On servers | Folder for `shop.sqlite` and uploaded photos. **On Railway it must match the volume's mount path** | `/app/data` |
| `PORT` | | Web port. Railway sets it automatically | `8000` |
| `PUBLIC_BASE_URL` | Recommended | Full site address, with no `/` at the end. Used for canonical links, link previews, sitemap and structured data | `https://bellorabd.com` |
| `SHOP_WHATSAPP_NUMBER` | | WhatsApp links, the floating button and "Ask on WhatsApp". International format, digits only | `8801712345678` |
| `BKASH_NUMBER` | | bKash number shown at checkout. When set, bKash orders **require** a transaction ID | `01712345678` |
| `NAGAD_NUMBER` | | Same, for Nagad | `01812345678` |
| `SHOP_PHONE` | | Phone number in the footer | `01712345678` |
| `FACEBOOK_URL`, `INSTAGRAM_URL`, `TIKTOK_URL` | | Footer links and structured data. Must start with `https://` | `https://facebook.com/yourpage` |
| `RETURNS_POLICY` | | Text under "Delivery and returns" on product pages | `If there is a problem with your order, contact us after delivery and we will help sort it out.` |

Anything left unset is simply not shown.

---

## Using the admin panel

**Add a product:** Products → Add product.
- **Name, price, stock** are required. **Sale price** must be lower than the price; customers pay it while it's set. Tick **Feature** to show the product in "Our picks".
- **Category** decides which collection the product appears in (see below).
- **Beauty & product details:** fill in only what applies. Each filled field becomes a section on the product page.
- **Formatting** in the description and details is kept: line breaks, bullet points (start a line with `·`, `•`, `-` or `*`), indented sub-bullets, and a short line in CAPITALS (for example `CATEGORY`) as a small heading. Leave an empty line between paragraphs.
- **Search keywords:** other words people search for, for example `jhumka, kaner dul, কানের দুল`. They're used by the shop search and aren't shown on the page.
- **Design options (shades):** give an option label (for example "Shade"), then one name per line, one stock number per line in the same order, and photos in the same order. Set the main stock to the total.
- **Photos:** the first gallery photo is the main photo. Photos are shrunk in your browser before upload (at most 1600 px, WebP), and the status line under the form shows the savings. On the edit page you can choose the **main photo**, tick **Remove** on single gallery photos or **Remove photo** on a shade, and add more photos (new uploads are added to the gallery). Removed photo files are deleted from the server once nothing uses them. For a product with many shades but only a general photo and an all-shades photo, upload both as gallery photos and leave the design photos empty: either give every shade its own photo or none, otherwise shades without one show "No photo yet".

**Categories and collections:** the shop has three fixed collections, shown in this order: **Makeup**, **Jewellery** and **Skincare** (the order of `COLLECTIONS` in `storefront.js`). A main category joins a collection when its name contains a matching word: for example "Earrings", "Necklace" or "Jewellery" go to Jewellery; "Lipstick", "Blush" or "Kajal" to Makeup; "Serum", "Cleanser" or "Sunscreen" to Skincare. Sub-categories follow their main category. The word lists are `COLLECTIONS` in `storefront.js`. A category that matches no collection still works, but its products only appear under "Shop all" and in search.

**Collection texts:** Collections → write a short **introduction** (shown under the title) and a longer **About** text (shown under the products; leave a blank line between paragraphs). Leave a field empty to use the default.

**Orders:** Orders → open an order to see the customer, items, payment and transaction ID. Then you can change the status, print a packing slip, or message the customer on WhatsApp. Use the filters at the top and **Download for Excel (CSV)** for courier booking or accounts. The CSV opens correctly in Excel, including Bangla text and phone numbers with their leading 0.

**Backups:** Dashboard → **Download backup**. Do this before every update and at least weekly (see [Data and backups](#data-and-backups)).

---

## How orders, stock and payments work

- **Prices and stock are always checked on the server** at checkout. The browser can't change what a customer pays.
- **Placing an order** takes stock from the product and from the chosen shade.
- **Cancelling** an order puts its stock back. **Reopening** a cancelled order takes the stock again, and is refused if there isn't enough. Doing either twice has no extra effect.
- **Only cancelled orders can be deleted.**
- **bKash / Nagad:** there is no payment gateway. The customer sends money to your number and enters the transaction ID. **Check it in your bKash or Nagad account before confirming the order.** The same transaction ID can't be used on two orders that aren't cancelled.
- **Limits:** at most 10 orders per hour from one connection, and 10 failed order-tracking attempts per hour.
- **Bags** are saved for 30 days, so they survive restarts and deploys.

Order statuses: Pending → Confirmed → Processing ("Packing" for customers) → Out for Delivery → Delivered, or Cancelled.

---

## Deployment

### Railway (current)
1. The service is connected to the GitHub repo **muinahmed/Belora**, branch **main**. Every merge to `main` deploys automatically, and a build takes about 20 seconds.
2. A **volume** is mounted at `/app/data`, with `DATA_DIR=/app/data`. Without it, orders and photos are lost on every deploy.
3. Set the variables listed above. Optionally set **Settings → Healthcheck Path** to `/health`.
4. Railway's Trial plan stops the site when the credit runs out. Use the Hobby plan for a live shop.

**If a deploy is skipped** (for example a merge during a Railway outage; check status.railway.app): use **⋯ → Deploy latest commit**, or merge any new commit to `main`. **Redeploy** on an old deployment rebuilds that *old* version.

**To check the live version:** `/health` returns `{"ok":true}`, and the active deployment's commit should match the latest on `main`.

### Another server (VPS, Fly.io, Render…)
Any host that can run a long-running program **and keep files on a persistent disk** works:

```sh
deno task start   # = deno run --allow-net --allow-read --allow-write --allow-env --allow-ffi main.js
```

Set the same variables, point `DATA_DIR` at the persistent disk, and put an HTTPS proxy (for example Caddy) in front of it. It **won't** work on PHP-only shared hosting (cPanel) or on hosts without a persistent disk (Vercel, Netlify, Deno Deploy) unless the database is changed. The SQLite driver downloads its native library from GitHub on first start and caches it.

**Moving hosts:** copy `shop.sqlite` (or a downloaded backup) **and** the `uploads/products/` folder from the old `DATA_DIR` to the new one.

---

## Data and backups

Everything that changes lives in `DATA_DIR`:

| Path | Contents |
| --- | --- |
| `shop.sqlite` | Products, categories, orders, bags, admin logins, analytics, collection texts |
| `uploads/products/` | Uploaded product and shade photos |

Bundled site images (logo, banner, collection tiles) are in the code at `public/images/`.

- **Backup:** Admin → Dashboard → **Download backup** gives a consistent copy of `shop.sqlite` (made with `VACUUM INTO`, safe while the shop runs). **Photos are not included.** Copy `uploads/products/` separately when moving servers.
- **Restore:** stop the app, replace `DATA_DIR/shop.sqlite` with the backup file (renamed to `shop.sqlite`), and start it again.
- **Updates are safe for data:** schema changes only add tables, columns or indexes (`addColumnIfMissing` in `database/database.js`). Existing rows are never removed.
- **Automatic cleanup** (at start and every 6 hours): bags older than 30 days, expired admin logins, analytics older than 90 days.

---

## Project structure

```
main.js                 Server: every route, admin pages, checkout, security headers, caching
storefront.js           Shared storefront code: collections, product queries, filters, cards, header, footer
assets.js               Content fingerprints (?v=hash) for bundled images
database/database.js    SQLite connection, schema and migrations
views/                  HTML templates ({{PLACEHOLDER}} values are filled in by main.js)
  home.html, products.html, product.html, checkout.html
  admin/login.html, admin/product-form.html
public/css/style.css    All styles (storefront and admin)
public/js/store.js      Browser script: "Added to bag" panel, bag count, card Add to bag, scroll animations
public/js/hero3d.js     Browser script: the homepage 3D banner (WebGL)
public/images/          Logo, banner, collection photos
tests/shop_test.js      End-to-end tests
vendor/                 Copy of third-party code (see Dependencies)
deno.json, deno.lock    Tasks and pinned dependency versions
```

---

## Pages and addresses

**Storefront**

| Address | Page |
| --- | --- |
| `/` | Homepage |
| `/products` | Shop all (`?q=` search, `?sale=1` sale, plus filter and sort parameters) |
| `/collections/jewellery`, `/collections/makeup`, `/collections/skincare` | Collections (`?category=<slug>` for a sub-category) |
| `/product/<slug>` | Product, for example `/product/pearl-drop-earrings`. `/product/<id>` and old slugs redirect here |
| `/cart` | Bag |
| `/checkout` | Checkout |
| `/order-success/<token>` | Order confirmation (private link) |
| `/track-order` | Order tracking |
| `/sitemap.xml`, `/robots.txt`, `/health` | For search engines and monitoring |

**Admin** (needs login): `/admin/login`, `/admin/dashboard`, `/admin/products` (add, edit), `/admin/categories`, `/admin/collections`, `/admin/orders` (`/admin/orders/<id>`, `/admin/orders/<id>/print`, `/admin/orders/export.csv`), `/admin/backup`.

---

## Database

SQLite file `DATA_DIR/shop.sqlite`. Tables:

| Table | Purpose |
| --- | --- |
| `categories` | Categories, with an optional parent (`parent_id`) |
| `products` | Products: price, sale price, stock, details, `slug` (web address), `search_keywords`, featured and active flags |
| `product_images` | Gallery photos (`is_main` marks the main one) |
| `product_variants` | Shades or designs, each with an optional photo and stock |
| `product_slug_history` | Earlier web addresses of renamed products, for redirects |
| `orders` | Customer, delivery, payment, `transaction_id`, totals, status, `public_token` (confirmation link) |
| `order_items` | Items in each order, with name and price copied at the time of the order |
| `carts` | Saved bags (cookie id → items) |
| `admin_sessions` | Admin logins (12-hour expiry) |
| `analytics_events` | Product views, bag adds, checkouts, orders (kept 90 days) |
| `site_settings` | Editable texts, such as collection introductions |

Order dates are stored in UTC and shown in Bangladesh time (UTC+6).

---

## Security

- The admin password comes from environment variables, not from the code. It's compared in constant time.
- **Login lockout:** 5 wrong passwords from one address locks login for 15 minutes. Admin logins expire after 12 hours.
- Cookies are `HttpOnly` and `SameSite=Lax`, and `Secure` on HTTPS.
- **Security headers** on every page: Content-Security-Policy, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy, Permissions-Policy.
- All database queries use parameters, and all page text is escaped.
- Uploads are checked by their **contents** (real JPG, PNG, WebP or GIF), up to 5 MB each.
- Order confirmation links use random tokens. Order tracking needs the order number **and** phone, and is rate-limited.
- The CSV export guards against spreadsheet formula injection.

---

## Search engines (SEO)

Built in: page titles and descriptions; canonical links (when `PUBLIC_BASE_URL` is set); Open Graph and Twitter previews, with product price and availability; structured data (`Product`, `BreadcrumbList`, `OnlineStore`, and `WebSite` with site search); a sitemap with dates and product photos; `robots.txt` that keeps admin, bag, checkout and order pages out of search engines; `noindex` on search and filtered pages; readable product addresses.

To do outside the code:
1. Use a custom domain and set `PUBLIC_BASE_URL` to it.
2. Add the site to **Google Search Console** and submit `https://<your-domain>/sitemap.xml`.
3. Write real product descriptions and collection texts (Admin → Collections).
4. Add search keywords, including Bangla and Banglish, to popular products.

---

## Tests

```sh
deno task test
```

Starts the shop against an empty temporary database and drives it the way a customer and the admin would. It checks: security headers, login lockout, upload checks, product pages outside the collections, keyword search (including Bangla), readable addresses and redirects, sale filters, Add to bag and Buy now, bags surviving a restart, checkout stock, bKash transaction IDs, cancelling and reopening orders, order tracking, CSV download, sitemap and structured data, collection texts, renamed products, and backup.

Run it before every change goes live. Also run `deno lint`, which should report no problems.

---

## Dependencies

The only third-party library is the SQLite driver (`jsr:@db/sqlite`) and its helpers. They are **vendored**: copied into `vendor/` and committed (`"vendor": true` in `deno.json`), so builds don't download from jsr.io. jsr.io has served this package's metadata in different byte orders, which made lockfile checks fail at random.

After changing a dependency, run `deno install --entrypoint main.js`, then commit `vendor/` and `deno.lock`.

---

## Troubleshooting

| Problem | What to do |
| --- | --- |
| The app won't start: "ADMIN_USERNAME and ADMIN_PASSWORD … must be set" | Set both variables |
| Orders or photos disappeared after a deploy | `DATA_DIR` doesn't point at the Railway volume. It must be `/app/data`, matching the volume mount |
| A change was merged but the site didn't update | Railway skipped the deploy. Use **Deploy latest commit** (see [Deployment](#deployment)) |
| Build error "Integrity check failed" | `vendor/` is missing or out of date. Run `deno install --entrypoint main.js` and commit it |
| Link previews show no photo | Set `PUBLIC_BASE_URL` |
| bKash / Nagad has no "Transaction ID" box | Set `BKASH_NUMBER` / `NAGAD_NUMBER` |
| No WhatsApp button | Set `SHOP_WHATSAPP_NUMBER` (international format, for example `8801712345678`) |
| Locked out of admin | Wait 15 minutes after 5 wrong attempts |
| A product doesn't appear in a collection | Its category's name doesn't contain a collection keyword. Rename the category or move the product (see [Using the admin panel](#using-the-admin-panel)) |

---

## Not included

- **No payment gateway:** bKash and Nagad are confirmed by hand using the transaction ID.
- No courier integration. Use the CSV download for booking.
- No customer accounts. Customers check out as guests and track orders with order number and phone.
- No About, Privacy or Terms pages yet.
- Product photos aren't part of the database backup.
