const db = require('./db');

function getRoles(userId) {
  return db.prepare(`
    SELECT r.name FROM roles r
    JOIN user_roles ur ON ur.role_id = r.id
    WHERE ur.user_id = ?
  `).all(userId).map(r => r.name);
}

function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user) return res.redirect('/login');
    const userRoles = req.session.user.roles || [];
    if (userRoles.includes('admin') || roles.some(r => userRoles.includes(r))) return next();
    return res.status(403).render('error', { title: 'Yetkisiz', message: 'Bu işlem için yetkiniz yok.' });
  };
}

function canAccessExpense(user, expense) {
  if (!user || !expense) return false;
  const roles = user.roles || [];
  if (roles.includes('admin') || roles.includes('muhasebe') || roles.includes('finans')) return true;
  if (expense.user_id === user.id) return true;
  if (roles.includes('departman_yoneticisi') && expense.department_id === user.department_id) return true;
  return false;
}

module.exports = { getRoles, requireLogin, requireRole, canAccessExpense };
