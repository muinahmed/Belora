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

## Railway deployment

1. Add a Railway Volume mounted at `/app/data`.
2. Set `DATA_DIR=/app/data` so orders and uploaded product images persist after deployments.
3. Set `ADMIN_USERNAME` and a long, unique `ADMIN_PASSWORD` in Railway Variables.
4. Railway provides `PORT` automatically.

Bundled storefront images, including the hero banner, are served from `./public/images`. Uploaded product images are served from `DATA_DIR/uploads/products`, falling back to `./public/uploads/products`.

## Collections

The storefront has three collections: Jewellery (`/collections/jewellery`), Makeup (`/collections/makeup`) and Skincare (`/collections/skincare`). Each one includes the top-level categories whose name matches it (for example "Jewellery", "Earrings", "Lipstick", "Skincare", "Serum") plus their sub-categories. Keyword lists are in `storefront.js` under `COLLECTIONS`.

## Features

- Homepage with collection tiles, new arrivals, sale edit, bestsellers (from real orders) and featured picks
- Collection pages with search, sub-category chips, price, availability, material, shade and skin-concern filters, sorting and pagination (24 per page)
- Product pages with gallery, sale pricing, stock levels, shade or design options, product details, related products and structured data
- Bag and guest checkout with Cash on Delivery, bKash or Nagad (with transaction ID when a payment number is set)
- Sale prices and featured products, managed in admin; customers are charged the sale price
- Server-side price, stock and order validation
- Admin: products (search, low stock, pagination), categories, orders, packing slips, 30-day analytics, one-click database backup
- Sitemap at `/sitemap.xml`

## Important

There is no live payment gateway or courier integration. For bKash and Nagad, customers send money to your number and enter the transaction ID; check it in your bKash or Nagad account before confirming the order. A transaction ID can only be used on one order.

Bags (kept for 30 days) and admin logins (12 hours) are stored in the database, so they survive restarts and deployments. Admin login locks for 15 minutes after 5 wrong passwords from the same address. Analytics older than 90 days are removed automatically.

Before every update, download a backup from Admin → Dashboard → **Download backup**. It saves a copy of `shop.sqlite` (products, categories and orders; photos are not included). To restore, replace `shop.sqlite` in `DATA_DIR` with the downloaded file while the app is stopped.
