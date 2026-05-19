const prisma = require('../lib/prisma');
const { Prisma } = require('@prisma/client');
async function userByRole(role){ return prisma.user.findFirst({where:{role,active:true},orderBy:{id:'asc'}}); }
async function buildApprovalSteps(expense){
  await prisma.approvalStep.deleteMany({where:{expenseId:expense.id}});
  const flow=await prisma.approvalFlow.findFirst({where:{enabled:true,OR:[{expenseType:expense.expenseType},{expenseType:null}],AND:[{OR:[{minAmount:null},{minAmount:{lte:new Prisma.Decimal(expense.totalAmount)}}]},{OR:[{maxAmount:null},{maxAmount:{gte:new Prisma.Decimal(expense.totalAmount)}}]}]},orderBy:{minAmount:'desc'}});
  let steps=flow?.steps || [{type:'MANAGER',label:'Bağlı Müdür'},{type:'ACCOUNTING',label:'Muhasebe Kontrol'},{type:'FINANCE',label:'Finans Onay'}];
  const findings=await prisma.riskFinding.findMany({where:{expenseId:expense.id,action:'ADD_APPROVAL'}});
  for(const f of findings){ const rule=await prisma.riskRule.findUnique({where:{code:f.ruleCode}}); if(rule?.extraApproverRole) steps.push({type:rule.extraApproverRole,label:`Risk Ek Onay - ${rule.name}`}); }
  const owner=await prisma.user.findUnique({where:{id:expense.ownerId}});
  let order=1;
  for(const step of steps){ let approver=null; if(step.type==='MANAGER') approver=owner.managerId? await prisma.user.findUnique({where:{id:owner.managerId}}):null; else approver=await userByRole(step.type); if(approver) await prisma.approvalStep.create({data:{expenseId:expense.id,approverId:approver.id,label:step.label||step.type,stepOrder:order++}}); }
  const critical=await prisma.riskFinding.findFirst({where:{expenseId:expense.id,riskLevel:'CRITICAL',action:'BLOCK'}});
  const status=critical?'BLOCKED':'PENDING_APPROVAL';
  await prisma.expense.update({where:{id:expense.id},data:{status}});
}
async function advanceExpense(expenseId){ const next=await prisma.approvalStep.findFirst({where:{expenseId,status:'PENDING'},orderBy:{stepOrder:'asc'}}); if(next) return prisma.expense.update({where:{id:expenseId},data:{status: next.label.toLowerCase().includes('muhasebe')?'PENDING_ACCOUNTING':'PENDING_APPROVAL'}}); return prisma.expense.update({where:{id:expenseId},data:{status:'PAYMENT_WAITING'}}); }
module.exports={buildApprovalSteps,advanceExpense};
