const db = require('./db');

function createApprovalFlow(expenseId, amount) {
  const steps = db.prepare(`
    SELECT * FROM approval_steps
    WHERE is_active = 1
      AND min_amount <= ?
      AND (max_amount IS NULL OR max_amount >= ?)
    ORDER BY step_order ASC
  `).all(amount || 0, amount || 0);

  const insert = db.prepare(`
    INSERT INTO expense_approvals (expense_id, step_order, role_name)
    VALUES (?, ?, ?)
  `);
  const trx = db.transaction(() => {
    steps.forEach(s => insert.run(expenseId, s.step_order, s.role_name));
  });
  trx();
}

function currentApproval(expenseId) {
  return db.prepare(`
    SELECT * FROM expense_approvals
    WHERE expense_id = ? AND action = 'pending'
    ORDER BY step_order ASC
    LIMIT 1
  `).get(expenseId);
}

function approveOrReject(expenseId, user, action, note) {
  const current = currentApproval(expenseId);
  if (!current) throw new Error('Bekleyen onay adımı bulunamadı.');
  if (!user.roles.includes('admin') && !user.roles.includes(current.role_name)) {
    throw new Error('Bu onay adımı için yetkiniz yok.');
  }

  db.prepare(`
    UPDATE expense_approvals
    SET action=?, note=?, approver_user_id=?, acted_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(action, note || '', user.id, current.id);

  if (action === 'rejected') {
    db.prepare(`UPDATE expenses SET status='rejected', rejected_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(expenseId);
    return;
  }

  const next = currentApproval(expenseId);
  if (!next) {
    db.prepare(`UPDATE expenses SET status='approved', approved_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(expenseId);
  } else {
    db.prepare(`UPDATE expenses SET status='in_approval', current_step=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(next.step_order, expenseId);
  }
}

module.exports = { createApprovalFlow, currentApproval, approveOrReject };
