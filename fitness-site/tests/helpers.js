// Shared test set-up: an in-memory database with the demo data, fast password hashing,
// and helpers that log in as the demo admin or the demo student.
const os = require('os');
const fs = require('fs');
const path = require('path');
process.env.DB_PATH = ':memory:';
process.env.BCRYPT_COST = '4';
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'kinetic-uploads-'));

const request = require('supertest');
const app = require('../server');
const db = require('../db/database');
const { seed, DEMO_ADMIN, DEMO_USER } = require('../db/seed');
const limiter = require('../utils/rateLimit');

const HEADER = ['X-Requested-With', 'kinetic'];

// A browser-like client that keeps its cookie between requests
async function loginAs(account) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').set(...HEADER).send(account);
  if (res.status !== 200) throw new Error('Test login failed: ' + res.text);
  return agent;
}
const asAdmin = () => loginAs(DEMO_ADMIN);
const asUser = () => loginAs(DEMO_USER);
const reset = () => { seed(); limiter.reset(); };

// 1×1 pixel PNG
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

module.exports = { request, app, db, HEADER, asAdmin, asUser, reset, DEMO_ADMIN, DEMO_USER, TINY_PNG };
