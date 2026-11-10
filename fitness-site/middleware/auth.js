// Who is allowed in. The session only stores the user's id; role and status are read from
// the database on every request, so suspending or demoting someone takes effect at once.
const db = require('../db/database');

const findUser = db.prepare('SELECT u.*, p.slug AS plan FROM users u JOIN plans p ON p.id = u.plan_id WHERE u.id = ?');

function currentUser(req) {
  if (!req.session || !req.session.userId) return null;
  const user = findUser.get(req.session.userId);
  if (!user || user.status !== 'active') { delete req.session.userId; return null; }
  return user;
}

function requireLogin(req, res, next) {
  req.user = currentUser(req);
  if (!req.user) return res.status(401).json({ error: 'Please log in.' });
  next();
}

function requireAdmin(req, res, next) {
  req.user = currentUser(req);
  if (!req.user) return res.status(401).json({ error: 'Please log in.' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Only administrators can do this.' });
  next();
}

// For the admin HTML pages: anyone who is not an admin is sent to the log in page.
function requireAdminPage(req, res, next) {
  const user = currentUser(req);
  if (user && user.role === 'admin') return next();
  res.redirect('/auth.html');
}

module.exports = { currentUser, requireLogin, requireAdmin, requireAdminPage };
