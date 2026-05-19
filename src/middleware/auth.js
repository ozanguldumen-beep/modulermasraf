function requireAuth(req,res,next){ if(!req.session.user) return res.redirect('/login'); next(); }
function requireRole(...roles){ return (req,res,next)=>{ const u=req.session.user; if(!u) return res.redirect('/login'); if(!roles.includes(u.role)) return res.status(403).send('Yetkiniz yok'); next(); }; }
function isPrivileged(user){ return ['ADMIN','PARTNER','PROCESS_MANAGER','ACCOUNTING','FINANCE','MANAGER'].includes(user?.role); }
module.exports={requireAuth,requireRole,isPrivileged};
