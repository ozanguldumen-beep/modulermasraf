const fs = require('fs');
const db = require('./db');

function cleanupOldReceipts() {
  const years = Number(process.env.RETENTION_YEARS || 2);
  const rows = db.prepare(`
    SELECT r.id, r.storage_path
    FROM expense_receipts r
    JOIN expenses e ON e.id = r.expense_id
    WHERE datetime(e.created_at) < datetime('now', ?)
  `).all(`-${years} years`);

  const delReceipt = db.prepare('DELETE FROM expense_receipts WHERE id=?');
  rows.forEach(row => {
    try { if (fs.existsSync(row.storage_path)) fs.unlinkSync(row.storage_path); } catch {}
    delReceipt.run(row.id);
  });
  return rows.length;
}

module.exports = { cleanupOldReceipts };
