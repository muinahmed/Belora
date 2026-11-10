// Opens the SQLite database and creates the tables if they are missing.
// DB_PATH can point somewhere else; the tests use ":memory:" so real data is never touched.
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const file = process.env.DB_PATH || path.join(__dirname, 'kinetic.db');
const db = new Database(file);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

module.exports = db;
