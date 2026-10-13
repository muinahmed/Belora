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
| `SHOP_WHATSAPP_NUMBER` | Optional. Shows "Message us on WhatsApp" links. |
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
- Bag and guest checkout with Cash on Delivery, bKash or Nagad
- Sale prices and featured products, managed in admin; customers are charged the sale price
- Server-side price, stock and order validation
- Admin: products (search, low stock, pagination), categories, orders, packing slips, 30-day analytics
- Sitemap at `/sitemap.xml`

## Important

bKash and Nagad are recorded as the chosen payment method; there is no live payment gateway or courier integration. Carts and admin sessions are kept in memory, so they reset when the server restarts.

Back up `shop.sqlite` before replacing project files.
