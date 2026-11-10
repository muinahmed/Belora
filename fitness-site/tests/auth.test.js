const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { request, app, db, HEADER, asAdmin, reset, DEMO_USER } = require('./helpers');

describe('Accounts', () => {
  beforeEach(reset);

  test('sign up creates an account, hashes the password and logs in', async () => {
    const agent = request.agent(app);
    const res = await agent.post('/api/auth/signup').set(...HEADER).send({ name: 'New Person', email: 'New@Example.com', password: 'Welcome123' });
    assert.equal(res.status, 201);
    assert.equal(res.body.user.email, 'new@example.com');
    const row = db.prepare('SELECT * FROM users WHERE email = ?').get('new@example.com');
    assert.notEqual(row.password_hash, 'Welcome123');
    assert.match(row.password_hash, /^\$2[aby]\$/);
    assert.equal((await agent.get('/api/auth/me')).status, 200);
  });

  test('sign up rejects weak passwords, bad emails and duplicates', async () => {
    const post = body => request(app).post('/api/auth/signup').set(...HEADER).send(body);
    assert.equal((await post({ name: 'A', email: 'a@example.com', password: 'short1' })).status, 400);
    assert.equal((await post({ name: 'A', email: 'a@example.com', password: 'nodigitshere' })).status, 400);
    assert.equal((await post({ name: 'A', email: 'not-an-email', password: 'Welcome123' })).status, 400);
    assert.equal((await post({ name: '', email: 'a@example.com', password: 'Welcome123' })).status, 400);
    assert.equal((await post({ name: 'A', email: DEMO_USER.email, password: 'Welcome123' })).status, 409);
  });

  test('log in fails with a wrong password and does not say which part was wrong', async () => {
    const wrong = await request(app).post('/api/auth/login').set(...HEADER).send({ email: DEMO_USER.email, password: 'wrong-password1' });
    const unknown = await request(app).post('/api/auth/login').set(...HEADER).send({ email: 'nobody@example.com', password: 'wrong-password1' });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(wrong.body.error, unknown.body.error);
  });

  test('five wrong passwords lock further attempts, even with the right password', async () => {
    const attempt = password => request(app).post('/api/auth/login').set(...HEADER).send({ email: DEMO_USER.email, password });
    for (let i = 0; i < 5; i++) assert.equal((await attempt('wrong-password1')).status, 401);
    assert.equal((await attempt(DEMO_USER.password)).status, 429);
  });

  test('a suspended account cannot log in and loses its open session', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').set(...HEADER).send(DEMO_USER);
    db.prepare("UPDATE users SET status = 'suspended' WHERE email = ?").run(DEMO_USER.email);
    assert.equal((await agent.get('/api/bootstrap')).status, 401);
    const again = await request(app).post('/api/auth/login').set(...HEADER).send(DEMO_USER);
    assert.equal(again.status, 403);
  });

  test('log out ends the session', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').set(...HEADER).send(DEMO_USER);
    await agent.post('/api/auth/logout').set(...HEADER);
    assert.equal((await agent.get('/api/auth/me')).status, 401);
  });

  test('requests that change data are refused without the site header', async () => {
    const res = await request(app).post('/api/auth/login').send(DEMO_USER);
    assert.equal(res.status, 403);
  });

  test('sign-ups can be closed by an administrator', async () => {
    const admin = await asAdmin();
    await admin.put('/api/admin/settings').set(...HEADER).send({ announcement: '', signupsOpen: false });
    const res = await request(app).post('/api/auth/signup').set(...HEADER).send({ name: 'Late', email: 'late@example.com', password: 'Welcome123' });
    assert.equal(res.status, 403);
  });

  test('admin pages redirect visitors and students to the log in page', async () => {
    assert.equal((await request(app).get('/admin/')).status, 302);
    const student = request.agent(app);
    await student.post('/api/auth/login').set(...HEADER).send(DEMO_USER);
    assert.equal((await student.get('/admin/')).status, 302);
    const admin = await asAdmin();
    assert.equal((await admin.get('/admin/')).status, 200);
  });
});
