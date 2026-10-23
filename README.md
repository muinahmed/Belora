# Bellora BD — Deno e-commerce

Jewellery, makeup and skincare store built on Deno and SQLite.

## Run locally

Copy `.env.example` to `.env`, set a long, unique `ADMIN_PASSWORD`, then run:

    deno task --env-file=.env start

Then open http://localhost:8000. Do not commit `.env`.

## Admin

URL: http://localhost:8000/admin/login (also linked as "Staff login" in the footer).

Credentials come from the `ADMIN_USERNAME` and `ADMIN_PASSWORD` environment variables; they are not stored in the code.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | Required. Admin login. |
| `DATA_DIR` | Where `shop.sqlite` and uploaded product images live. Defaults to `./database` for the database and `./public` for uploads. |
| `PORT` | Defaults to `8000`. Railway sets it automatically. |
| `PUBLIC_BASE_URL` | Optional. Absolute site URL used for canonical links, social previews and the sitemap. |
| `SHOP_WHATSAPP_NUMBER` | Optional. Shows "Message us on WhatsApp" links and a floating WhatsApp button. International format without `+`, for example `8801712345678`. |
| `BKASH_NUMBER`, `NAGAD_NUMBER` | Optional. The number customers send money to. When set, checkout shows it and asks for the transaction ID. |
| `SHOP_PHONE` | Optional. Phone number shown in the footer's "Contact us" column. |
| `FACEBOOK_URL`, `INSTAGRAM_URL`, `TIKTOK_URL` | Optional. Full `https://` links shown in the footer. |
| `RETURNS_POLICY` | Optional. Text shown under "Delivery and returns" on product pages. Set this to your real policy. |

## Tests

    deno task test

Starts the shop against an empty temporary database and checks the main flows: login lockout, uploads, filters, add to bag, buy now, bags surviving a restart, checkout stock, bKash transaction IDs, cancelling and reopening orders, order tracking, CSV download and backup.

## Dependencies

Third-party code (the SQLite driver and its helpers) is kept in `vendor/` and committed (`"vendor": true` in `deno.json`). Builds therefore don't download from jsr.io, which has served the same package metadata with different byte orderings, so lockfile integrity checks failed at random. After changing a dependency, run `deno install --entrypoint main.js` and commit `vendor/` and `deno.lock`.

## Railway deployment

1. Add a Railway Volume mounted at `/app/data`.
2. Set `DATA_DIR=/app/data` so orders and uploaded product images persist after deployments.
3. Set `ADMIN_USERNAME` and a long, unique `ADMIN_PASSWORD` in Railway Variables.
4. Railway provides `PORT` automatically.

Bundled storefront images, including the hero banner, are served from `./public/images`. Uploaded product images are served from `DATA_DIR/uploads/products`, falling back to `./public/uploads/products`.

Railway deploys every push to `main`. If a merge lands while Railway builds are paused (check status.railway.app), that deploy is skipped: use **Deploy latest commit** on the service, or push or merge a new commit. **Redeploy** on an old deployment rebuilds that old version, not the latest code. To confirm the live version, open `/health` (it returns `{"ok":true}`) and check that the active deployment's commit matches the latest on `main`.

## Collections

The storefront has three collections: Jewellery (`/collections/jewellery`), Makeup (`/collections/makeup`) and Skincare (`/collections/skincare`). Each one includes the top-level categories whose name matches it (for example "Jewellery", "Earrings", "Lipstick", "Skincare", "Serum") plus their sub-categories. Keyword lists are in `storefront.js` under `COLLECTIONS`.

## Features

- Homepage with collection tiles, new arrivals, sale edit, bestsellers (from real orders) and featured picks
- Collection pages with search, sub-category chips, price, availability, material, shade and skin-concern filters, sorting and pagination (24 per page)
- Product pages with gallery, sale pricing, stock levels, shade or design options, product details, related products and structured data
- Bag and guest checkout with Cash on Delivery, bKash or Nagad (with transaction ID when a payment number is set)
- Sale prices and featured products, managed in admin; customers are charged the sale price
- Server-side price, stock and order validation
- "Add to bag" keeps shoppers on the page (product page and product cards); "Buy now" goes straight to checkout
- Sold-out products offer "Ask on WhatsApp" when `SHOP_WHATSAPP_NUMBER` is set
- Order tracking at `/track-order` with the order number and phone
- Admin: products (search, low stock, pagination), categories, orders (status and date filters, totals, CSV download for Excel), packing slips, 30-day analytics, one-click database backup
- Readable product addresses (`/product/pearl-drop-earrings`); old `/product/<id>` links and a renamed product's earlier address redirect permanently
- Photos are shrunk in the admin's browser before upload (at most 1600px, WebP or JPEG)
- Optional search keywords per product (any language, including Bangla and Banglish), used by the shop search
- Collection introductions and longer collection texts, edited at Admin → Collections
- Structured data for search engines: store details and site search on the homepage, breadcrumbs on product and collection pages, product details on product pages
- Sitemap at `/sitemap.xml` (with last-updated dates and product photos), `robots.txt`, and a health check at `/health` (Railway → Settings → Healthcheck Path)

## Important

There is no live payment gateway or courier integration. For bKash and Nagad, customers send money to your number and enter the transaction ID; check it in your bKash or Nagad account before confirming the order. A transaction ID can only be used on one order.

Bags (kept for 30 days) and admin logins (12 hours) are stored in the database, so they survive restarts and deployments. Admin login locks for 15 minutes after 5 wrong passwords from the same address. Analytics older than 90 days are removed automatically.

Before every update, download a backup from Admin → Dashboard → **Download backup**. It saves a copy of `shop.sqlite` (products, categories and orders; photos are not included). To restore, replace `shop.sqlite` in `DATA_DIR` with the downloaded file while the app is stopped.
