const bcrypt=require('bcryptjs');
const {PrismaClient}=require('@prisma/client');
const prisma=new PrismaClient();
async function upsertUser(name,email,role,title,department){ return prisma.user.upsert({where:{email},update:{role,title,department,active:true},create:{name,email,role,title,department,passwordHash:await bcrypt.hash('123456',10)}}); }
async function main(){
 const ozan=await upsertUser('Ozan Güldümen','ozan@modulerotomasyon.com','PARTNER','Şirket Ortağı / Satış Müdürü','Satış');
 const celal=await upsertUser('Celal Eşli','celal@modulerotomasyon.com','PARTNER','Şirket Ortağı / Finans Müdürü','Finans');
 const seren=await upsertUser('Seren Sarıkaya','seren@modulerotomasyon.com','ACCOUNTING','Muhasebe Müdürü','Muhasebe');
 const ferhat=await upsertUser('Ferhat Halis Polat','ferhat@modulerotomasyon.com','MANAGER','Teknik Müdür','Teknik');
 await prisma.user.upsert({where:{email:'personel@modulerotomasyon.com'},update:{managerId:ozan.id},create:{name:'Test Personel',email:'personel@modulerotomasyon.com',passwordHash:await bcrypt.hash('123456',10),role:'PERSONEL',department:'Satış',managerId:ozan.id}});
 const rules=[
  ['CAR_WASH_MONTHLY_LIMIT','Araç yıkama aylık limit','Araç Yıkama',30,5,null,'MEDIUM','ADD_APPROVAL','FINANCE'],
  ['DUPLICATE_RECEIPT','Aynı fiş tekrar kontrolü',null,null,null,null,'CRITICAL','BLOCK',null],
  ['SAME_DAY_SAME_AMOUNT','Aynı gün aynı tutar kontrolü',null,1,null,null,'MEDIUM','WARNING',null],
  ['OLD_RECEIPT','Eski fiş kontrolü',null,30,null,null,'MEDIUM','REQUIRE_EXPLANATION',null],
  ['SPLIT_LIMIT_CHECK','Limit bölme kontrolü',null,1,3,1000,'MEDIUM','ADD_APPROVAL','FINANCE'],
  ['VAT_MATH_CHECK','KDV matrah toplam kontrolü',null,null,null,null,'MEDIUM','WARNING',null]
 ];
 for(const [code,name,expenseType,periodDays,countLimit,amountLimit,riskLevel,action,extraApproverRole] of rules){ await prisma.riskRule.upsert({where:{code},update:{name,expenseType,periodDays,countLimit,amountLimit,riskLevel,action,extraApproverRole,enabled:true},create:{code,name,expenseType,periodDays,countLimit,amountLimit,riskLevel,action,extraApproverRole,enabled:true}}); }
 await prisma.approvalFlow.upsert({where:{id:1},update:{},create:{name:'0-1000 TL Standart',minAmount:0,maxAmount:1000,steps:[{type:'MANAGER',label:'Bağlı Müdür'},{type:'ACCOUNTING',label:'Muhasebe Kontrol'}]}});
 await prisma.approvalFlow.upsert({where:{id:2},update:{},create:{name:'1000-5000 TL Standart',minAmount:1000,maxAmount:5000,steps:[{type:'MANAGER',label:'Bağlı Müdür'},{type:'ACCOUNTING',label:'Muhasebe Kontrol'},{type:'FINANCE',label:'Finans Onay'}]}});
 await prisma.approvalFlow.upsert({where:{id:3},update:{},create:{name:'5000 TL Üstü Ortak Onayı',minAmount:5000,steps:[{type:'MANAGER',label:'Bağlı Müdür'},{type:'ACCOUNTING',label:'Muhasebe Kontrol'},{type:'FINANCE',label:'Finans Onay'},{type:'PARTNER',label:'Şirket Ortağı'}]}});
 console.log('Seed tamamlandı. Şifreler: 123456');
}
main().finally(()=>prisma.$disconnect());
