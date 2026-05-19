const prisma = require('../lib/prisma');
const { Prisma } = require('@prisma/client');
function toNumber(v){ return Number(v||0); }
function add(findings, rule, message){ findings.push({ruleCode:rule.code,title:rule.name,message,riskLevel:rule.riskLevel,action:rule.testMode?'WARNING':rule.action}); }
async function evaluateExpense(expense){
  const rules=await prisma.riskRule.findMany({where:{enabled:true}});
  const findings=[];
  for(const rule of rules){
    if(rule.expenseType && rule.expenseType!==expense.expenseType) continue;
    if(rule.code==='CAR_WASH_MONTHLY_LIMIT' && expense.expenseType==='Araç Yıkama'){
      const since=new Date(expense.createdAt); since.setDate(1); since.setHours(0,0,0,0);
      const count=await prisma.expense.count({where:{ownerId:expense.ownerId,expenseType:'Araç Yıkama',vehiclePlate:expense.vehiclePlate||undefined,createdAt:{gte:since},id:{not:expense.id}}});
      if(count+1 > (rule.countLimit||5)) add(findings,rule,`Bu ay araç yıkama adedi ${count+1}. Limit: ${rule.countLimit||5}.`);
    }
    if(rule.code==='OLD_RECEIPT' && expense.documentDate){ const days=(Date.now()-new Date(expense.documentDate).getTime())/86400000; if(days>(rule.periodDays||30)) add(findings,rule,`Fiş tarihi yaklaşık ${Math.floor(days)} gün eski.`); }
    if(rule.code==='DUPLICATE_RECEIPT'){
      const dup=await prisma.expense.findFirst({where:{id:{not:expense.id},companyName:expense.companyName||undefined,receiptNo:expense.receiptNo||undefined,totalAmount:new Prisma.Decimal(expense.totalAmount),documentDate:expense.documentDate||undefined}});
      if(dup) add(findings,rule,`Benzer fiş bulundu. Eski kayıt ID: ${dup.id}.`);
    }
    if(rule.code==='SAME_DAY_SAME_AMOUNT' && expense.expenseDate){ const start=new Date(expense.expenseDate); start.setHours(0,0,0,0); const end=new Date(start); end.setDate(end.getDate()+1); const count=await prisma.expense.count({where:{ownerId:expense.ownerId,totalAmount:new Prisma.Decimal(expense.totalAmount),expenseDate:{gte:start,lt:end},id:{not:expense.id}}}); if(count>0) add(findings,rule,'Aynı gün aynı tutarda masraf bulundu.'); }
    if(rule.code==='SPLIT_LIMIT_CHECK' && expense.expenseDate){ const start=new Date(expense.expenseDate); start.setHours(0,0,0,0); const end=new Date(start); end.setDate(end.getDate()+1); const sum=await prisma.expense.aggregate({where:{ownerId:expense.ownerId,expenseDate:{gte:start,lt:end}},_sum:{totalAmount:true},_count:{id:true}}); if(toNumber(sum._sum.totalAmount)+toNumber(expense.totalAmount) > toNumber(rule.amountLimit||1000) && (sum._count.id+1)>=(rule.countLimit||3)) add(findings,rule,'Aynı gün limit bölme ihtimali var.'); }
    if(rule.code==='VAT_MATH_CHECK' && expense.taxBase && expense.vatAmount){ const expected=toNumber(expense.taxBase)+toNumber(expense.vatAmount); if(Math.abs(expected-toNumber(expense.totalAmount))>1) add(findings,rule,'Matrah + KDV toplam tutar ile uyuşmuyor.'); }
  }
  let score=0, level='LOW'; for(const f of findings){ if(f.riskLevel==='MEDIUM') score+=35; if(f.riskLevel==='CRITICAL') score+=70; if(f.riskLevel==='CRITICAL') level='CRITICAL'; else if(f.riskLevel==='MEDIUM' && level!=='CRITICAL') level='MEDIUM'; }
  score=Math.min(score,100);
  await prisma.riskFinding.deleteMany({where:{expenseId:expense.id}});
  for(const f of findings) await prisma.riskFinding.create({data:{expenseId:expense.id,...f}});
  return {riskScore:score,riskLevel:level,findings};
}
module.exports={evaluateExpense};
