# Kinetic Fitness Tracker

A health and fitness web app for a university project. People create an account, log what they eat, track steps and water, follow workouts and cook from recipes. An administrator manages users and all the content from an admin panel.

It is separate from the Bellora shop in the rest of this repository and shares no code with it.

## Contents

1. [Features](#features)
2. [Tech stack](#tech-stack)
3. [Install, run, seed and test](#install-run-seed-and-test)
4. [Demo accounts](#demo-accounts)
5. [The admin panel](#the-admin-panel)
6. [Security](#security)
7. [Database](#database)
8. [API routes](#api-routes)
9. [Project structure](#project-structure)
10. [How the numbers are worked out](#how-the-numbers-are-worked-out)
11. [Design](#design)
12. [Deploying](#deploying)
13. [Not included](#not-included)

## Features

### For users

- **Sign in / register** on one page with two tabs.
- **Home:** today's workout, calorie ring, steps, water, active time, popular exercises, meal ideas, and an announcement set by the administrator.
- **Food diary:** pick any of the last 7 days, log food by meal from the food list or type your own, see protein, carbs and fat against targets, track water.
- **Activity:** step counter with distance, calories and time, plus a 7-day chart for steps, calories eaten and calories burned.
- **Workouts:** workouts split into rounds; tick off exercises and watch progress.
- **Recipes:** ingredients, directions and one-tap "add to diary".
- **Plans:** Free and Pro pricing (demo only, no payment is taken).
- **Profile:** personal details, profile photo, BMI, daily calorie budget and macro targets, change password, clear logs.

Everything is saved to the user's account, so it is there on any device they log in from.

### For administrators

A separate panel at `/admin/` – see [The admin panel](#the-admin-panel).

## Tech stack

- **Front end:** plain HTML, CSS and JavaScript. No framework, no CDN, no build step.
- **Back end:** Node.js + Express.
- **Database:** SQLite via `better-sqlite3`, plain standard SQL.
- **Accounts:** `express-session` (httpOnly cookie) + `bcrypt` (cost 10).
- **Tests:** `node:test` + `supertest`.

## Install, run, seed and test

Requires Node.js 22 or newer.

```bash
cd fitness-site
npm install
cp .env.example .env     # then set SESSION_SECRET to a long random string
npm start                # http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm start` | Starts the server on port 3000 (or `PORT`). The first start fills an empty database with demo data. |
| `npm run seed` | Deletes all data and recreates the demo data. |
| `npm test` | Runs all 40 API tests against an in-memory database. Real data is not touched. |

The database file is `db/kinetic.db` and uploaded photos go to `public/uploads/`. Both are ignored by git.

## Demo accounts

Demo data only. Do not reuse these passwords anywhere.

| Role | Email | Password |
|---|---|---|
| Administrator | `admin@kinetic.test` | `Admin123!` |
| User with a week of history | `nadia@example.com` | `Student123!` |
| Ten more users | `tanvir@example.com`, `sadia@example.com`, … | `Student123!` |

An administrator who logs in lands on the admin panel; everyone else lands on the app. Administrators can also use the app ("Open the app" in the admin sidebar).

## The admin panel

Open `/admin/` (only administrators get the page; anyone else is sent to the log in page).

| Section | What an administrator can do |
|---|---|
| **Dashboard** | Totals (users, active today, paid plans, meals logged, exercises done, suspended), charts of sign-ups and active users for the last 14 days, most logged foods, users per plan, recent admin activity. |
| **Users** | Search by name or email; filter by role, status and plan; sort; 10 per page. View a user's profile and last 7 days. Add a user, edit name / email / role / plan, suspend or reactivate, reset the password (a temporary one is shown once), delete. **Export CSV** downloads the filtered list for Excel. |
| **Foods** | Search, add, edit and delete the foods users pick from in the diary. |
| **Workouts** | Add, edit and delete workouts, with any number of rounds and exercises. Upload a photo. Hide a workout without deleting it. |
| **Recipes** | Add, edit and delete recipes with ingredients, directions and a photo. Hide without deleting. |
| **Plans** | Change each plan's name, price, billing period, label and feature list; see how many users are on it. |
| **Activity log** | Every change any administrator makes, with who, when and what. Filter by area. |
| **Site settings** | Set the announcement shown on every user's Home page; open or close registration. |

Safety rules built in: an administrator cannot delete, suspend or demote their own account, and the site always keeps at least one active administrator.

## Security

- **Passwords** are stored only as bcrypt hashes. They must be 8+ characters with a letter and a number.
- **Sessions** use an httpOnly, SameSite=Lax cookie (and Secure on HTTPS). A new session id is issued at log in.
- **Brute force:** five wrong passwords for one email lock further attempts for 10 minutes. The error message is the same for a wrong password and an unknown email.
- **Roles:** every `/api/admin` route checks the role in the database on each request, so demoting or suspending someone takes effect immediately.
- **SQL injection:** every query uses `?` placeholders. Sort columns come from a fixed list.
- **Cross-site scripting:** all text from users and administrators is escaped before it is put on a page, and a Content-Security-Policy header blocks inline scripts and scripts from other sites.
- **Cross-site request forgery:** requests that change data must carry a header only this site's pages add.
- **Uploads:** the file type is checked from the file's first bytes, not its name. Files get random names and a 1.5 MB limit.
- **CSV export:** cells that start with `=`, `+`, `-` or `@` are neutralised so a spreadsheet cannot run them as formulas.
- **Validation:** every input is checked on the server (`utils/validate.js`), with `CHECK` constraints in the database as a second line of defence.

## Database

All tables are created by [`db/schema.sql`](db/schema.sql). Foreign keys are on. Rows that belong to a user use `ON DELETE CASCADE`, so deleting a user also deletes everything they logged.

| Table | Purpose | Key columns |
|---|---|---|
| `users` | Accounts and profile | `id` PK, `email` UNIQUE, `password_hash`, `role` (user / admin), `status` (active / suspended), `plan_id` → plans, profile fields |
| `plans` | Free and Pro plans | `id` PK, `slug` UNIQUE, `price`, `period`, `features` (JSON list) |
| `foods` | Food list for the diary | `id` PK, `name`, `serving`, `kcal`, `protein`, `carbs`, `fat` |
| `workouts` | Workouts | `id` PK, `name`, `level`, `image`, `published` |
| `rounds` | Rounds of a workout | `id` PK, `workout_id` → workouts |
| `exercises` | Exercises of a round | `id` PK, `round_id` → rounds, `kcal`, `minutes` |
| `recipes` | Recipes | `id` PK, `name`, `kcal`, `image`, `published` |
| `recipe_ingredients` | Ingredients of a recipe | `id` PK, `recipe_id` → recipes |
| `recipe_steps` | Directions of a recipe | `id` PK, `recipe_id` → recipes |
| `days` | Water and steps per user per day | PK (`user_id`, `date`) |
| `meal_items` | Food diary entries | `id` PK, `user_id` → users, `date`, `meal`, `food_id` → foods (NULL for typed-in food) |
| `exercise_logs` | Exercises a user finished | PK (`user_id`, `date`, `exercise_id`) |
| `audit_log` | What administrators changed | `id` PK, `admin_id` → users, `action`, `target`, `detail` |
| `settings` | Announcement, registration open/closed | `key` PK |

A diary entry keeps its own copy of the food's name and calories, so deleting or editing a food never changes what someone already logged.

## API routes

All replies are JSON. Errors look like `{ "error": "message" }`.

### Accounts (`routes/auth.js`)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/signup` | Create an account and log in |
| POST | `/api/auth/login` | Log in |
| POST | `/api/auth/logout` | Log out |
| GET | `/api/auth/me` | Who is logged in |

### User app (`routes/app.js`, login required)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/bootstrap` | Profile, last 30 days, foods, workouts, recipes, plans, announcement |
| PUT | `/api/days/:date` | Save one day (meals, water, steps, finished exercises) |
| PUT | `/api/profile` | Save profile details and photo |
| PUT | `/api/plan` | Choose a plan |
| PUT | `/api/password` | Change password (needs the current one) |
| DELETE | `/api/data` | Clear the user's logs |

### Admin (`routes/admin.js`, administrator required)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/admin/stats` | Dashboard numbers and charts |
| GET | `/api/admin/users` | List with `q`, `role`, `status`, `plan`, `sort`, `dir`, `page` |
| GET | `/api/admin/users/export.csv` | Download the filtered list |
| GET | `/api/admin/users/:id` | One user and their last 7 days |
| POST / PUT / DELETE | `/api/admin/users[/:id]` | Add, edit, delete |
| POST | `/api/admin/users/:id/reset-password` | Set a temporary password |
| GET / POST / PUT / DELETE | `/api/admin/foods[/:id]` | Manage foods |
| GET / POST / PUT / DELETE | `/api/admin/workouts[/:id]` | Manage workouts with rounds and exercises |
| GET / POST / PUT / DELETE | `/api/admin/recipes[/:id]` | Manage recipes |
| GET / PUT | `/api/admin/plans[/:id]` | List and edit plans |
| POST | `/api/admin/uploads` | Upload a photo |
| GET | `/api/admin/log` | Activity log with `area` and `page` |
| GET / PUT | `/api/admin/settings` | Announcement and registration |

## Project structure

```
fitness-site/
├── server.js            web server, security headers, error handling
├── db/
│   ├── schema.sql       all tables
│   ├── database.js      opens the database
│   ├── queries.js       foods, workouts, recipes, plans, settings
│   └── seed.js          demo data
├── routes/
│   ├── auth.js          sign up, log in, log out
│   ├── app.js           the user's own data
│   └── admin.js         admin panel API
├── middleware/auth.js   requireLogin, requireAdmin, requireAdminPage
├── utils/               validation, uploads, dates, activity log, login rate limit
├── public/
│   ├── auth.html        sign in / register
│   ├── index.html       the app
│   ├── admin/index.html the admin panel
│   ├── css/             style.css (app), admin.css (admin panel)
│   ├── js/              common.js, auth.js, app.js, admin.js
│   ├── fonts/           Manrope (SIL Open Font License)
│   ├── img/             the demo workout and recipe photos
│   └── uploads/         photos uploaded by administrators
└── tests/               auth, app and admin API tests
```

## How the numbers are worked out

- **Calorie budget:** Mifflin-St Jeor resting energy (`10 × kg + 6.25 × cm − 5 × age + 5` for men, `− 161` for women) × activity level, then −500 kcal to lose weight or +300 kcal to gain. Never below 1,200 kcal.
- **Macro targets:** 25% of calories from protein, 50% from carbs, 25% from fat (4, 4 and 9 kcal per gram).
- **BMI:** weight in kg ÷ (height in m)².
- **Steps:** stride length is taken as 41.5% of height; calories as 0.04 kcal per step for a 70 kg person, scaled by weight; time as 110 steps a minute.

These are standard estimates for a student project, not medical advice.

## Design

- Font: Manrope, served from `public/fonts/`.
- Colours: purple `#8524DC`, orange `#FB6D37`, teal `#00CFC3`, yellow `#FDC102`.
- The app has a bottom tab bar on phones and a sidebar on screens 960px and wider. The admin panel has a dark sidebar so it is never mistaken for the app.
- Follows the device's light or dark setting.
- Every demo recipe and workout has a photo (`public/img/`). An administrator can replace it with an uploaded one; anything without a photo shows an emoji tile instead.

### Image credits

All ten photos in `public/img/` are **AI-generated** (made with ChatGPT) for this university project. They are illustrations, not pictures of real people or of dishes cooked from the recipes. Photos that administrators upload later are stored in `public/uploads/` and are not covered by this note.

## Deploying

Any host that runs Node works (Render, Railway). Use:

| Setting | Value |
|---|---|
| Root directory | `fitness-site` |
| Build command | `npm install` |
| Start command | `npm start` |
| Environment | `SESSION_SECRET` = a long random string; `TZ` = `Asia/Dhaka` |

On a free plan without a persistent disk, the database and uploaded photos are lost on each restart and the demo data is recreated. That is fine for a demo; keeping data needs a persistent disk.

After deploying, log in as the demo administrator and change its password, or create your own administrator and delete the demo one.

## Not included

- No real payments on the Plans page.
- No "forgot password" email; an administrator resets passwords instead.
- Steps are typed in by hand; a website cannot read a phone's step counter.
- Sessions are kept in memory, so everyone is logged out when the server restarts.
