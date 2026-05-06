const db = require('./db');

function audit(req, entityType, entityId, action, detail = '') {
  try {
    db.prepare(`
      INSERT INTO audit_logs (user_id, entity_type, entity_id, action, detail, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(req.session?.user?.id || null, entityType, entityId || null, action, detail, req.ip || '');
  } catch (err) {
    console.error('audit error', err.message);
  }
}

module.exports = audit;
