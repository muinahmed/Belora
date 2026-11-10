-- Kinetic database (SQLite, standard SQL).
-- Rows that belong to a user are removed with the user (ON DELETE CASCADE).
-- Allowed values are enforced with CHECK constraints.

CREATE TABLE IF NOT EXISTS plans (
  id        INTEGER PRIMARY KEY,
  slug      TEXT    NOT NULL UNIQUE,
  name      TEXT    NOT NULL,
  price     INTEGER NOT NULL DEFAULT 0 CHECK (price >= 0),   -- in taka
  period    TEXT    NOT NULL DEFAULT '',                     -- '', '/ month' or '/ year'
  tag       TEXT    NOT NULL DEFAULT '',
  featured  INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
  features  TEXT    NOT NULL DEFAULT '[]',                   -- JSON list of short lines
  sort      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  name          TEXT    NOT NULL,
  email         TEXT    NOT NULL UNIQUE,                     -- stored in lower case
  password_hash TEXT    NOT NULL,                            -- bcrypt
  role          TEXT    NOT NULL DEFAULT 'user'   CHECK (role IN ('user', 'admin')),
  status        TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  plan_id       INTEGER NOT NULL DEFAULT 1 REFERENCES plans(id),
  gender        TEXT    NOT NULL DEFAULT 'female' CHECK (gender IN ('female', 'male')),
  age           INTEGER NOT NULL DEFAULT 22  CHECK (age BETWEEN 13 AND 100),
  height        REAL    NOT NULL DEFAULT 165 CHECK (height BETWEEN 100 AND 230),   -- cm
  weight        REAL    NOT NULL DEFAULT 60  CHECK (weight BETWEEN 30 AND 250),    -- kg
  activity      REAL    NOT NULL DEFAULT 1.375,
  goal          TEXT    NOT NULL DEFAULT 'maintain' CHECK (goal IN ('lose', 'maintain', 'gain')),
  step_goal     INTEGER NOT NULL DEFAULT 8000 CHECK (step_goal BETWEEN 1000 AND 50000),
  photo         TEXT,                                        -- small profile picture as a data URL
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS foods (
  id      INTEGER PRIMARY KEY,
  name    TEXT    NOT NULL,
  emoji   TEXT    NOT NULL DEFAULT '🍽️',
  serving TEXT    NOT NULL DEFAULT '1 serving',
  kcal    INTEGER NOT NULL CHECK (kcal BETWEEN 0 AND 5000),
  protein REAL    NOT NULL DEFAULT 0,
  carbs   REAL    NOT NULL DEFAULT 0,
  fat     REAL    NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS workouts (
  id        INTEGER PRIMARY KEY,
  name      TEXT    NOT NULL,
  level     TEXT    NOT NULL DEFAULT 'Medium' CHECK (level IN ('Easy', 'Medium', 'Hard')),
  tone      TEXT    NOT NULL DEFAULT 'purple' CHECK (tone IN ('purple', 'orange', 'teal', 'yellow')),
  emoji     TEXT    NOT NULL DEFAULT '💪',
  image     TEXT    NOT NULL DEFAULT '',                     -- uploaded photo path or ''
  published INTEGER NOT NULL DEFAULT 1 CHECK (published IN (0, 1)),
  sort      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS rounds (
  id         INTEGER PRIMARY KEY,
  workout_id INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  focus      TEXT    NOT NULL DEFAULT '',
  sort       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS exercises (
  id       INTEGER PRIMARY KEY,
  round_id INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  name     TEXT    NOT NULL,
  emoji    TEXT    NOT NULL DEFAULT '💪',
  detail   TEXT    NOT NULL DEFAULT '',                      -- e.g. "3 × 12 reps"
  kcal     INTEGER NOT NULL DEFAULT 0 CHECK (kcal BETWEEN 0 AND 2000),
  minutes  INTEGER NOT NULL DEFAULT 0 CHECK (minutes BETWEEN 0 AND 240),
  sort     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS recipes (
  id         INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL,
  emoji      TEXT    NOT NULL DEFAULT '🍽️',
  tone       TEXT    NOT NULL DEFAULT 'orange' CHECK (tone IN ('purple', 'orange', 'teal', 'yellow')),
  kcal       INTEGER NOT NULL CHECK (kcal BETWEEN 0 AND 5000),
  minutes    INTEGER NOT NULL DEFAULT 0,
  protein    REAL    NOT NULL DEFAULT 0,
  carbs      REAL    NOT NULL DEFAULT 0,
  fat        REAL    NOT NULL DEFAULT 0,
  image      TEXT    NOT NULL DEFAULT '',
  published  INTEGER NOT NULL DEFAULT 1 CHECK (published IN (0, 1)),
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id        INTEGER PRIMARY KEY,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  name      TEXT    NOT NULL,
  amount    TEXT    NOT NULL DEFAULT '',
  sort      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS recipe_steps (
  id        INTEGER PRIMARY KEY,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  text      TEXT    NOT NULL,
  sort      INTEGER NOT NULL DEFAULT 0
);

-- One row per user per day they logged something.
CREATE TABLE IF NOT EXISTS days (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date    TEXT    NOT NULL,                                  -- YYYY-MM-DD
  water   INTEGER NOT NULL DEFAULT 0 CHECK (water BETWEEN 0 AND 20),
  steps   INTEGER NOT NULL DEFAULT 0 CHECK (steps BETWEEN 0 AND 200000),
  PRIMARY KEY (user_id, date)
);

CREATE TABLE IF NOT EXISTS meal_items (
  id      INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date    TEXT    NOT NULL,
  meal    TEXT    NOT NULL CHECK (meal IN ('breakfast', 'lunch', 'dinner', 'snacks')),
  food_id INTEGER REFERENCES foods(id) ON DELETE SET NULL,   -- NULL for a food the user typed in
  name    TEXT    NOT NULL,
  emoji   TEXT    NOT NULL DEFAULT '🍽️',
  serving TEXT    NOT NULL DEFAULT '',
  kcal    INTEGER NOT NULL DEFAULT 0,
  protein REAL    NOT NULL DEFAULT 0,
  carbs   REAL    NOT NULL DEFAULT 0,
  fat     REAL    NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS meal_items_user_date ON meal_items (user_id, date);

CREATE TABLE IF NOT EXISTS exercise_logs (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date        TEXT    NOT NULL,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, date, exercise_id)
);

-- What each administrator changed, and when.
CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY,
  admin_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  admin_name TEXT    NOT NULL,
  action     TEXT    NOT NULL,                               -- e.g. "user.suspend"
  target     TEXT    NOT NULL DEFAULT '',
  detail     TEXT    NOT NULL DEFAULT '',
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);
