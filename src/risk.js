const db = require('./db');

function evaluateRisk(expense) {
  const notes = [];
  let level = 'normal';
  const total = Number(expense.total_amount || 0);

  if (total >= 10000) {
    level = 'high';
    notes.push('Yüksek tutarlı masraf.');
  } else if (total >= 3000) {
    level = 'medium';
    notes.push('Orta üstü tutarlı masraf.');
  }

  if (expense.document_number) {
    const dup = db.prepare(`
      SELECT COUNT(*) AS c FROM expenses
      WHERE document_number = ? AND id != ? AND deleted_at IS NULL
    `).get(expense.document_number, expense.id || 0).c;
    if (dup > 0) {
      level = 'high';
      notes.push('Aynı belge numarası ile kayıt mevcut olabilir.');
    }
  }

  return { level, notes: notes.join(' ') };
}

module.exports = { evaluateRisk };
