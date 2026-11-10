// Records what an administrator did, for the Activity log page in the admin panel.
const db = require('../db/database');
const insert = db.prepare('INSERT INTO audit_log (admin_id, admin_name, action, target, detail) VALUES (?, ?, ?, ?, ?)');

function audit(req, action, target = '', detail = '') {
  insert.run(req.user.id, req.user.name, action, String(target).slice(0, 120), String(detail).slice(0, 300));
}

module.exports = { audit };
