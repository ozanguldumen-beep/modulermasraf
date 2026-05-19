const prisma = require('../lib/prisma');
async function log(userId, action, detail={}, expenseId=null){ try{ await prisma.auditLog.create({data:{userId:userId||null,expenseId,action,detail}}); }catch(e){ console.error('Audit log error:', e.message); } }
module.exports={log};
