require('dotenv').config();
const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
let heicConvert = null;
try { heicConvert = require('heic-convert'); } catch (_) {}

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'data', 'db.json');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'moduler_masraf_v18_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 12 }
}));

function readDb(){ return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
function writeDb(db){ fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }
function currentUser(req){ if(!req.session.userId) return null; return readDb().users.find(u=>u.id===req.session.userId && u.active); }
function requireAuth(req,res,next){ const u=currentUser(req); if(!u) return res.redirect('/login'); req.user=u; next(); }
function isManager(u){ return (u.roles||[]).some(r=>['Şirket Ortağı','Sistem Yöneticisi','Satış Müdürü','Finans Müdürü','Muhasebe Müdürü','Teknik Müdür'].includes(r)); }
function money(v){ const n=Number(String(v||'').replace(',','.')); return Number.isFinite(n)?n.toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2}):''; }
function esc(s){ return String(s ?? '').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }

function layout(req, title, body){
  const u=currentUser(req);
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><link rel="stylesheet" href="/public/style.css"></head><body>
<header><div class="brand">MODÜLER MASRAF v18.10</div>${u?`<nav><a href="/">Ana Sayfa</a><a href="/expenses/new">Masraf Ekle</a><a href="/expenses">Masraflarım</a>${isManager(u)?'<a href="/approvals">Onaylar</a><a href="/admin">Yönetim</a>':''}<a href="/logout">Çıkış</a></nav>`:''}</header>
<main>${body}</main>
${u?`<div class="bottomnav"><a href="/"><span>⌂</span>Ana</a><a href="/expenses/new"><span>＋</span>Ekle</a><a href="/expenses"><span>☰</span>Masraf</a><a href="${isManager(u)?'/approvals':'/profile'}"><span>✓</span>${isManager(u)?'Onay':'Profil'}</a></div>`:''}
<script src="/public/ocr.js?v=1891"></script></body></html>`;
}

app.get('/health',(req,res)=>res.json({ok:true,version:'18.10.0'}));
app.get('/api/version',(req,res)=>res.json({version:'18.10.0',name:'v18.10 rollback'}));
app.get('/api/ocr-status',(req,res)=>res.json({provider:process.env.OCR_PROVIDER||'google',googleVision:!!process.env.GOOGLE_VISION_API_KEY,openai:false,version:'18.10.0'}));

app.get('/login',(req,res)=>res.send(layout(req,'Giriş',`<section class="card small"><h1>Giriş</h1><form method="post" action="/login"><label>Email</label><input name="email" type="email" required value="ozan@modulerotomasyon.com"><label>Şifre</label><input name="password" type="password" required value="123456"><button>Giriş Yap</button></form><p class="muted">Varsayılan şifre: 123456</p></section>`)));
app.post('/login',(req,res)=>{ const {email,password}=req.body; const db=readDb(); const u=db.users.find(x=>x.email.toLowerCase()===String(email||'').toLowerCase() && x.active); if(!u || u.password!==password) return res.send(layout(req,'Giriş',`<section class="card small"><h1>Giriş</h1><p style="color:#b42318;font-weight:800">Giriş hatalı.</p><form method="post" action="/login"><label>Email</label><input name="email" type="email" required value="${esc(email)}"><label>Şifre</label><input name="password" type="password" required><button>Giriş Yap</button></form></section>`)); req.session.userId=u.id; res.redirect('/'); });
app.get('/logout',(req,res)=>req.session.destroy(()=>res.redirect('/login')));

app.get('/',requireAuth,(req,res)=>{ const db=readDb(); const mine=db.expenses.filter(e=>e.userId===req.user.id); const pending=db.expenses.filter(e=>e.status==='Onay Bekliyor').length; res.send(layout(req,'Ana Sayfa',`<section class="grid"><div class="card"><h2>Masraflarım</h2><p class="big">${mine.length}</p></div><div class="card"><h2>Onay Bekleyen</h2><p class="big">${pending}</p></div><div class="card"><h2>OCR</h2><p><span class="badge">Google Vision</span></p><p class="muted">v18.10 çalışan OCR hattı</p></div></section><section class="card"><h1>Hızlı İşlem</h1><a class="buttonlink" href="/expenses/new">Yeni Masraf Ekle</a></section>`)); });

app.get('/expenses/new',requireAuth,(req,res)=>res.send(layout(req,'Masraf Ekle',`<section class="card"><h1>Yeni Masraf</h1><form method="post" action="/expenses" enctype="multipart/form-data"><div class="grid"><div><label>Masraf Tarihi</label><input id="expenseDate" name="expenseDate" type="date"></div><div><label>Masraf Türü</label><select name="expenseType"><option>Yakıt</option><option>Araç Yıkama</option><option>Yemek</option><option>Taksi</option><option>Otopark</option><option>Kargo/Kurye</option><option>Uçak Bileti</option><option>Konaklama</option><option>Ofis Gideri</option><option>Temsil/Ağırlama</option><option>Diğer</option></select></div><div><label>Firma Ünvanı</label><input id="companyName" name="companyName"></div><div><label>Belge Tarihi</label><input id="documentDate" name="documentDate" type="date"></div><div><label>Belge Numarası</label><input id="documentNo" name="documentNo"></div><div><label>Fiş No</label><input id="receiptNo" name="receiptNo"></div><div><label>Vergi Matrahı</label><input id="taxBase" name="taxBase" inputmode="decimal"></div><div><label>KDV Tutarı</label><input id="vatAmount" name="vatAmount" inputmode="decimal"></div><div><label>Toplam Tutar</label><input id="amount" name="amount" inputmode="decimal" required></div><div><label>Ödeme Şekli</label><select name="paymentType"><option>Kişisel Kart</option><option>Nakit</option><option>Şirket Kartı</option><option>Avans</option></select></div><div><label>Müşteri / Bayi</label><input name="customer"></div><div><label>Fiş / Fatura Görseli</label><input id="receipt" name="receipt" type="file" accept="image/*,.heic,.heif,application/pdf" capture="environment"></div></div><button id="ocrBtn" class="secondary" type="button">Fişi Oku</button><div id="ocrStatus" class="ocr-status">Fiş seçip Fişi Oku butonuna basınız.</div><div id="ocrDebug" class="ocr-debug"></div><label>Açıklama</label><textarea name="description"></textarea><button>Masrafı Kaydet</button></form></section>`)));

app.post('/expenses',requireAuth,upload.single('receipt'),(req,res)=>{ const db=readDb(); const id='e'+Date.now(); let imagePath=''; if(req.file){ const ext=path.extname(req.file.originalname||'').toLowerCase() || '.jpg'; const filename=id+ext; fs.writeFileSync(path.join(__dirname,'uploads',filename),req.file.buffer); imagePath='/uploads/'+filename; } db.expenses.unshift({ id, userId:req.user.id, userName:req.user.name, status:'Onay Bekliyor', createdAt:new Date().toISOString(), imagePath, ...req.body }); writeDb(db); res.redirect('/expenses'); });

app.get('/expenses',requireAuth,(req,res)=>{ const db=readDb(); const rows=db.expenses.filter(e=>e.userId===req.user.id || isManager(req.user)).map(e=>`<tr><td>${esc(e.createdAt?.slice(0,10))}</td><td>${esc(e.userName)}</td><td>${esc(e.expenseType)}</td><td>${esc(e.companyName)}</td><td>${money(e.amount)}</td><td><span class="badge">${esc(e.status)}</span></td><td><a href="/expenses/${e.id}">Aç</a></td></tr>`).join(''); res.send(layout(req,'Masraflar',`<section class="card"><h1>Masraflar</h1><table><thead><tr><th>Tarih</th><th>Personel</th><th>Tür</th><th>Firma</th><th>Tutar</th><th>Durum</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="7">Kayıt yok.</td></tr>'}</tbody></table></section>`)); });
app.get('/expenses/:id',requireAuth,(req,res)=>{ const db=readDb(); const e=db.expenses.find(x=>x.id===req.params.id); if(!e) return res.status(404).send('Bulunamadı'); if(e.userId!==req.user.id && !isManager(req.user)) return res.status(403).send('Yetki yok'); res.send(layout(req,'Masraf Detay',`<section class="card"><h1>Masraf Detay</h1><div class="grid two"><div>${e.imagePath?`<img src="${esc(e.imagePath)}" style="width:100%;border-radius:14px;border:1px solid #e5e7eb">`:'<p>Görsel yok</p>'}</div><div><p><b>Personel:</b> ${esc(e.userName)}</p><p><b>Firma:</b> ${esc(e.companyName)}</p><p><b>Belge Tarihi:</b> ${esc(e.documentDate)}</p><p><b>Belge No:</b> ${esc(e.documentNo)}</p><p><b>Fiş No:</b> ${esc(e.receiptNo)}</p><p><b>Matrah:</b> ${esc(e.taxBase)}</p><p><b>KDV:</b> ${esc(e.vatAmount)}</p><p><b>Toplam:</b> ${money(e.amount)}</p><p><b>Durum:</b> <span class="badge">${esc(e.status)}</span></p>${isManager(req.user)?`<form method="post" action="/expenses/${e.id}/status"><button name="status" value="Onaylandı">Onayla</button><button class="danger" name="status" value="Reddedildi">Reddet</button></form>`:''}</div></div></section>`)); });
app.post('/expenses/:id/status',requireAuth,(req,res)=>{ if(!isManager(req.user)) return res.status(403).send('Yetki yok'); const db=readDb(); const e=db.expenses.find(x=>x.id===req.params.id); if(e){ e.status=req.body.status; e.updatedAt=new Date().toISOString(); e.updatedBy=req.user.name; writeDb(db); } res.redirect('/expenses/'+req.params.id); });
app.get('/approvals',requireAuth,(req,res)=>res.redirect('/expenses'));
app.get('/admin',requireAuth,(req,res)=>{ if(!isManager(req.user)) return res.status(403).send('Yetki yok'); const db=readDb(); const users=db.users.map(u=>`<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${esc((u.roles||[]).join(', '))}</td><td>${u.active?'Aktif':'Pasif'}</td></tr>`).join(''); res.send(layout(req,'Yönetim',`<section class="card"><h1>Yönetim</h1><p class="muted">v18.10 rollback: kullanıcı ve OCR kontrol ekranı. Risk/onay/finans modülleri sonraki fazda eklenecek.</p><table><thead><tr><th>Ad</th><th>Email</th><th>Rol</th><th>Durum</th></tr></thead><tbody>${users}</tbody></table></section>`)); });
app.get('/profile',requireAuth,(req,res)=>res.send(layout(req,'Profil',`<section class="card"><h1>Profil</h1><p>${esc(req.user.name)}</p><p>${esc(req.user.email)}</p></section>`)));

async function normalizeImage(file){
  let input=file.buffer; const mim=(file.mimetype||'').toLowerCase(); const name=(file.originalname||'').toLowerCase();
  const isHeic=mim.includes('heic')||mim.includes('heif')||name.endsWith('.heic')||name.endsWith('.heif');
  if(isHeic && heicConvert){ input=Buffer.from(await heicConvert({buffer:input,format:'JPEG',quality:0.88})); }
  return await sharp(input).rotate().resize({ width:1800, height:1800, fit:'inside', withoutEnlargement:true }).jpeg({quality:88}).toBuffer();
}
async function googleVision(buffer){
  const key=process.env.GOOGLE_VISION_API_KEY; if(!key) throw new Error('GOOGLE_VISION_API_KEY eksik');
  const body={ requests:[{ image:{ content: buffer.toString('base64') }, features:[{ type:'DOCUMENT_TEXT_DETECTION' }] }] };
  let r=await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${key}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  let j=await r.json();
  if(j.error) throw new Error(j.error.message||'Google Vision hatası');
  let text=j.responses?.[0]?.fullTextAnnotation?.text || '';
  if(!text){
    body.requests[0].features=[{type:'TEXT_DETECTION'}];
    r=await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${key}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    j=await r.json();
    if(j.error) throw new Error(j.error.message||'Google Vision hatası');
    text=j.responses?.[0]?.textAnnotations?.[0]?.description || '';
  }
  return text;
}
function cleanNum(s){
  if(!s) return '';
  let x=String(s).replace(/[^0-9,\.]/g,'');
  if(!x) return '';
  // TR format: 2.353,00 -> 2353.00 / 213,91 -> 213.91
  if(x.includes(',') && x.includes('.')) x=x.replace(/\./g,'').replace(',','.');
  else if(x.includes(',')) x=x.replace(',','.');
  const n=Number(x);
  return Number.isFinite(n)?n.toFixed(2):'';
}
function parseDateTR(text){
  const all=[...String(text||'').matchAll(/\b(\d{1,2})[\.\/-](\d{1,2})[\.\/-](\d{2,4})\b/g)];
  const nowYear=new Date().getFullYear();
  for(const m of all){
    let y=m[3].length===2?'20'+m[3]:m[3];
    const yyyy=Number(y), mm=Number(m[2]), dd=Number(m[1]);
    if(yyyy>=2020 && yyyy<=nowYear+1 && mm>=1 && mm<=12 && dd>=1 && dd<=31){
      return `${String(yyyy).padStart(4,'0')}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
    }
  }
  return '';
}
function firstMatch(text, regexes){
  for(const rx of regexes){ const m=String(text||'').match(rx); if(m && m[1]) return String(m[1]).trim(); }
  return '';
}
function extractMoneyAfter(text, keywords){
  const raw=String(text||'');
  for(const kw of keywords){
    const rx=new RegExp(kw + '[^0-9]{0,25}(\\d{1,3}(?:[\\. ]\\d{3})*[,.]\\d{2}|\\d+[,.]\\d{2})','i');
    const m=raw.match(rx);
    if(m) return cleanNum(m[1]);
  }
  return '';
}
function parseReceipt(text){
  const raw=String(text||'');
  const lines=raw.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const joined=lines.join('\n');
  const oneLine=joined.replace(/\s+/g,' ');

  let companyName='';
  for(const l of lines.slice(0,10)){
    const clean=l.replace(/\s*%\s*\d+\s*$/,'').trim();
    if(!/^(tarih|tarıh|fis|fiş|fış|belge|saat|z\s*no|ekü|eku|kdv|toplam|ara\s*toplam|pos|visa|master|onay|işlem|islem)/i.test(clean) && clean.length>3 && !/^\d/.test(clean)){
      companyName=clean; break;
    }
  }

  const documentDate=parseDateTR(joined);

  // Türkçe büyük İ yüzünden klasik /fiş/i regex'i bazen kaçırıyor. Bu yüzden geniş desen kullanıyoruz.
  let receiptNo=firstMatch(oneLine,[
    /F[İIıi][ŞşS]\s*NO\s*[:\-]?\s*([A-Z0-9\-\/]{2,})/i,
    /F[İIıi][ŞşS]\s*NUMARA\w*\s*[:\-]?\s*([A-Z0-9\-\/]{2,})/i,
    /NO\s*[:\-]?\s*(\d{3,})\s+TAR[İIıi]H/i
  ]);
  if(receiptNo) receiptNo=receiptNo.replace(/^n+/i,'').trim();

  let documentNo=firstMatch(oneLine,[
    /BELGE\s*(?:NO|NUMARA\w*)\s*[:\-]?\s*([A-Z0-9\-\/]{3,})/i,
    /FATURA\s*(?:NO|NUMARA\w*)\s*[:\-]?\s*([A-Z0-9\-\/]{3,})/i,
    /ONAY\s*KODU\s*[:\-]?\s*([A-Z0-9\-\/]{3,})/i
  ]);
  // BELGEY / TARİH / SAAT gibi hatalı OCR kelimelerini belge no yapma.
  if(/^(BELGEY|BELGE|TARIH|TARİH|SAAT|NO)$/i.test(documentNo)) documentNo='';

  let totalAmount=extractMoneyAfter(oneLine,['TOPLAM','TOPLAM TUTAR','GENEL TOPLAM','KRED[İIıi]','NAK[İIıi]T','TUTAR']);
  if(!totalAmount){
    const moneyMatches=[...joined.matchAll(/(?:₺|tl)?\s*(\d{1,3}(?:[\. ]\d{3})*[,.]\d{2}|\d+[,.]\d{2})\s*(?:tl|₺)?/gi)].map(m=>cleanNum(m[1])).filter(Boolean).map(Number);
    totalAmount=moneyMatches.length?Math.max(...moneyMatches).toFixed(2):'';
  }

  let vatAmount=extractMoneyAfter(oneLine,['TOPKDV','KDV TUTARI','HESAPLANAN KDV','KDV']);
  // KDV satırında iki para varsa genelde son değer KDV tutarıdır.
  const vatLine=lines.find(l=>/(TOPKDV|KDV)/i.test(l) && /\d+[,.]\d{2}/.test(l));
  if(vatLine){
    const ms=[...vatLine.matchAll(/(\d{1,3}(?:[\. ]\d{3})*[,.]\d{2}|\d+[,.]\d{2})/g)].map(m=>Number(cleanNum(m[1]))).filter(Number.isFinite);
    if(ms.length) vatAmount=ms[ms.length-1].toFixed(2);
  }
  if(totalAmount && (!vatAmount || Number(vatAmount)>Number(totalAmount)) && /%\s*20|KDV\s*%?\s*20/i.test(joined)) vatAmount=(Number(totalAmount)*20/120).toFixed(2);
  if(totalAmount && (!vatAmount || Number(vatAmount)>Number(totalAmount)) && /%\s*10|KDV\s*%?\s*10/i.test(joined)) vatAmount=(Number(totalAmount)*10/110).toFixed(2);
  if(totalAmount && (!vatAmount || Number(vatAmount)>Number(totalAmount)) && /%\s*1|KDV\s*%?\s*1/i.test(joined)) vatAmount=(Number(totalAmount)*1/101).toFixed(2);

  let taxBase='';
  const explicitBase=extractMoneyAfter(oneLine,['MATRAH','VERG[İIıi] MATRAHI','ARA TOPLAM']);
  if(explicitBase && (!totalAmount || Number(explicitBase)<Number(totalAmount))) taxBase=explicitBase;
  if(totalAmount && vatAmount && !taxBase) taxBase=(Number(totalAmount)-Number(vatAmount)).toFixed(2);

  return { companyName, documentDate, documentNo, receiptNo, taxBase, vatAmount, totalAmount };
}
app.post('/api/ocr',requireAuth,upload.single('receipt'),async(req,res)=>{
  try{
    if(!req.file) return res.status(400).json({ok:false,error:'Dosya yok'});
    const jpeg=await normalizeImage(req.file);
    const text=await googleVision(jpeg);
    if(!text || text.trim().length<5) return res.json({ok:false,error:'OCR metni boş döndü',debug:{mimeType:req.file.mimetype,fileSize:req.file.size}});
    const parsed=parseReceipt(text);
    res.json({ok:true,provider:'google',version:'18.10.0',textLength:text.length,mimeType:req.file.mimetype,fileSize:req.file.size,parsed,text:text.slice(0,2500)});
  }catch(e){ res.status(500).json({ok:false,error:e.message,provider:'google',debug:{mimeType:req.file?.mimetype,fileSize:req.file?.size}}); }
});

app.listen(PORT,()=>console.log(`Modüler Masraf v18.10.0 çalışıyor: ${PORT}`));
