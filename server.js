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

const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const DB_PATH = path.join(DATA_DIR, 'db.json');

// Railway/GitHub boş klasörleri taşımayabilir. Uygulama açılırken kesin oluştur.
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 }
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(session({
  secret: process.env.SESSION_SECRET || 'moduler_masraf_v18_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 12 }
}));

function ensureDb(){
  if(!fs.existsSync(DB_PATH)){
    const initialDb = { users: [], expenses: [] };
    fs.writeFileSync(DB_PATH, JSON.stringify(initialDb, null, 2), 'utf8');
  }
}

function readDb(){
  ensureDb();
  const raw = fs.readFileSync(DB_PATH, 'utf8').trim();
  if(!raw) return { users: [], expenses: [] };

  const db = JSON.parse(raw);
  if(!Array.isArray(db.users)) db.users = [];
  if(!Array.isArray(db.expenses)) db.expenses = [];
  return db;
}

function writeDb(db){
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tempPath = `${DB_PATH}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tempPath, DB_PATH);
}
function currentUser(req){ if(!req.session.userId) return null; return readDb().users.find(u=>u.id===req.session.userId && u.active); }
function requireAuth(req,res,next){ const u=currentUser(req); if(!u) return res.redirect('/login'); req.user=u; next(); }
function isManager(u){ return (u.roles||[]).some(r=>['Şirket Ortağı','Sistem Yöneticisi','Satış Müdürü','Finans Müdürü','Muhasebe Müdürü','Teknik Müdür'].includes(r)); }
function money(v){ const n=Number(String(v||'').replace(',','.')); return Number.isFinite(n)?n.toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2}):''; }
function esc(s){ return String(s ?? '').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }

function layout(req, title, body){
  const u=currentUser(req);
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><link rel="stylesheet" href="/public/style.css"></head><body>
<header><div class="brand">MODÜLER MASRAF v18.12.1</div>${u?`<nav><a href="/">Ana Sayfa</a><a href="/expenses/new">Masraf Ekle</a><a href="/expenses">Masraflarım</a>${isManager(u)?'<a href="/approvals">Onaylar</a><a href="/admin">Yönetim</a>':''}<a href="/logout">Çıkış</a></nav>`:''}</header>
<main>${body}</main>
${u?`<div class="bottomnav"><a href="/"><span>⌂</span>Ana</a><a href="/expenses/new"><span>＋</span>Ekle</a><a href="/expenses"><span>☰</span>Masraf</a><a href="${isManager(u)?'/approvals':'/profile'}"><span>✓</span>${isManager(u)?'Onay':'Profil'}</a></div>`:''}
<script src="/public/ocr.js?v=1812"></script></body></html>`;
}

app.get('/health',(req,res)=>res.json({ok:true,version:'18.12.1'}));
app.get('/api/version',(req,res)=>res.json({version:'18.12.1',name:'v18.12.1 OCR Parser Tool + Save Fix'}));
app.get('/api/ocr-status',(req,res)=>res.json({provider:process.env.OCR_PROVIDER||'google',googleVision:!!process.env.GOOGLE_VISION_API_KEY,openai:!!process.env.OPENAI_API_KEY,openaiModel:process.env.OPENAI_MODEL||'gpt-4o-mini',version:'18.12.1',currency:'TRY'}));

app.get('/login',(req,res)=>res.send(layout(req,'Giriş',`<section class="card small"><h1>Giriş</h1><form method="post" action="/login"><label>Email</label><input name="email" type="email" required value="ozan@modulerotomasyon.com"><label>Şifre</label><input name="password" type="password" required value="123456"><button>Giriş Yap</button></form><p class="muted">Varsayılan şifre: 123456</p></section>`)));
app.post('/login',(req,res)=>{ const {email,password}=req.body; const db=readDb(); const u=db.users.find(x=>x.email.toLowerCase()===String(email||'').toLowerCase() && x.active); if(!u || u.password!==password) return res.send(layout(req,'Giriş',`<section class="card small"><h1>Giriş</h1><p style="color:#b42318;font-weight:800">Giriş hatalı.</p><form method="post" action="/login"><label>Email</label><input name="email" type="email" required value="${esc(email)}"><label>Şifre</label><input name="password" type="password" required><button>Giriş Yap</button></form></section>`)); req.session.userId=u.id; res.redirect('/'); });
app.get('/logout',(req,res)=>req.session.destroy(()=>res.redirect('/login')));

app.get('/',requireAuth,(req,res)=>{ const db=readDb(); const mine=db.expenses.filter(e=>e.userId===req.user.id); const pending=db.expenses.filter(e=>e.status==='Onay Bekliyor').length; res.send(layout(req,'Ana Sayfa',`<section class="grid"><div class="card"><h2>Masraflarım</h2><p class="big">${mine.length}</p></div><div class="card"><h2>Onay Bekleyen</h2><p class="big">${pending}</p></div><div class="card"><h2>OCR</h2><p><span class="badge">Google Vision</span></p><p class="muted">v18.12 Google Vision + OpenAI Parser Tool - tüm tutarlar TL</p></div></section><section class="card"><h1>Hızlı İşlem</h1><a class="buttonlink" href="/expenses/new">Yeni Masraf Ekle</a></section>`)); });

app.get('/expenses/new',requireAuth,(req,res)=>res.send(layout(req,'Masraf Ekle',`<section class="card"><h1>Yeni Masraf</h1><form method="post" action="/expenses" enctype="multipart/form-data"><div class="grid"><div><label>Masraf Türü</label><select id="expenseType" name="expenseType"><option>Yakıt</option><option>Araç Yıkama</option><option>Yemek</option><option>Taksi</option><option>Otopark</option><option>Kargo/Kurye</option><option>Uçak Bileti</option><option>Konaklama</option><option>Ofis Gideri</option><option>Temsil/Ağırlama</option><option>Diğer</option></select></div><div><label>Masraf Tarihi</label><input id="expenseDate" name="expenseDate" type="date"></div><div><label>Toplam Tutar (TL)</label><input id="amount" name="amount" inputmode="decimal" required></div><div><label>Ödeme Şekli</label><select id="paymentType" name="paymentType"><option>Kişisel Kart</option><option>Nakit</option><option>Şirket Kartı</option><option>Avans</option></select><input type="hidden" name="currency" value="TRY"></div><div><label>Firma Ünvanı</label><input id="companyName" name="companyName"></div><div><label>Belge Tarihi</label><input id="documentDate" name="documentDate" type="date"></div><div><label>Belge Numarası</label><input id="documentNo" name="documentNo"></div><div><label>Fiş No</label><input id="receiptNo" name="receiptNo"></div><div><label>Vergi Matrahı (TL)</label><input id="taxBase" name="taxBase" inputmode="decimal"></div><div><label>KDV Tutarı (TL)</label><input id="vatAmount" name="vatAmount" inputmode="decimal"></div><div><label>Araç Plakası</label><input id="vehiclePlate" name="vehiclePlate" placeholder="34 ABC 123"></div><div><label>Müşteri / Bayi</label><input name="customer"></div><div class="full"><label>Fiş / Fatura Görseli</label><input id="receipt" name="receipt" type="file" accept="image/*,.heic,.heif,application/pdf" capture="environment"></div></div><button id="ocrBtn" class="secondary" type="button">Fişi Oku</button><div id="ocrStatus" class="ocr-status">Fiş seçip Fişi Oku butonuna basınız. Tüm tutarlar TL kabul edilir.</div><details class="ocr-details"><summary>OCR teknik detayları</summary><div id="ocrDebug" class="ocr-debug"></div></details><label>Açıklama</label><textarea name="description"></textarea><button>Masrafı Kaydet</button></form></section>`)));

app.post('/expenses', requireAuth, upload.single('receipt'), (req, res) => {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });

    const db = readDb();
    const id = 'e' + Date.now();
    let imagePath = '';

    if (req.file) {
      const originalExt = path.extname(req.file.originalname || '').toLowerCase();
      const allowedExtensions = new Set([
        '.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.pdf'
      ]);

      let ext = allowedExtensions.has(originalExt) ? originalExt : '';
      if (!ext) {
        const mimeToExt = {
          'image/jpeg': '.jpg',
          'image/png': '.png',
          'image/webp': '.webp',
          'image/heic': '.heic',
          'image/heif': '.heif',
          'application/pdf': '.pdf'
        };
        ext = mimeToExt[req.file.mimetype] || '.jpg';
      }

      const filename = `${id}${ext}`;
      fs.writeFileSync(path.join(UPLOAD_DIR, filename), req.file.buffer);
      imagePath = `/uploads/${filename}`;
    }

    db.expenses.unshift({
      id,
      userId: req.user.id,
      userName: req.user.name,
      status: 'Onay Bekliyor',
      createdAt: new Date().toISOString(),
      imagePath,
      ...req.body,
      currency: 'TRY'
    });

    writeDb(db);
    return res.redirect('/expenses');
  } catch (error) {
    console.error('Masraf kayıt hatası:', error);
    return res.status(500).send(
      layout(
        req,
        'Kayıt Hatası',
        `<section class="card small">
          <h1>Masraf kaydedilemedi</h1>
          <p style="color:#b42318;font-weight:800">${esc(error.message)}</p>
          <p class="muted">Lütfen tekrar deneyin. Hata devam ederse Railway loglarını kontrol edin.</p>
          <a class="buttonlink" href="/expenses/new">Masraf ekranına dön</a>
        </section>`
      )
    );
  }
});

app.get('/expenses',requireAuth,(req,res)=>{ const db=readDb(); const rows=db.expenses.filter(e=>e.userId===req.user.id || isManager(req.user)).map(e=>`<tr><td>${esc(e.createdAt?.slice(0,10))}</td><td>${esc(e.userName)}</td><td>${esc(e.expenseType)}</td><td>${esc(e.companyName)}</td><td>${money(e.amount)} TL</td><td><span class="badge">${esc(e.status)}</span></td><td><a href="/expenses/${e.id}">Aç</a></td></tr>`).join(''); res.send(layout(req,'Masraflar',`<section class="card"><h1>Masraflar</h1><table><thead><tr><th>Tarih</th><th>Personel</th><th>Tür</th><th>Firma</th><th>Tutar</th><th>Durum</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="7">Kayıt yok.</td></tr>'}</tbody></table></section>`)); });
app.get('/expenses/:id',requireAuth,(req,res)=>{ const db=readDb(); const e=db.expenses.find(x=>x.id===req.params.id); if(!e) return res.status(404).send('Bulunamadı'); if(e.userId!==req.user.id && !isManager(req.user)) return res.status(403).send('Yetki yok'); res.send(layout(req,'Masraf Detay',`<section class="card"><h1>Masraf Detay</h1><div class="grid two"><div>${e.imagePath?`<img src="${esc(e.imagePath)}" style="width:100%;border-radius:14px;border:1px solid #e5e7eb">`:'<p>Görsel yok</p>'}</div><div><p><b>Personel:</b> ${esc(e.userName)}</p><p><b>Firma:</b> ${esc(e.companyName)}</p><p><b>Belge Tarihi:</b> ${esc(e.documentDate)}</p><p><b>Belge No:</b> ${esc(e.documentNo)}</p><p><b>Fiş No:</b> ${esc(e.receiptNo)}</p><p><b>Matrah:</b> ${money(e.taxBase)} TL</p><p><b>KDV:</b> ${money(e.vatAmount)} TL</p><p><b>Toplam:</b> ${money(e.amount)} TL</p><p><b>Para Birimi:</b> TL</p>${e.vehiclePlate?`<p><b>Araç Plakası:</b> ${esc(e.vehiclePlate)}</p>`:''}<p><b>Durum:</b> <span class="badge">${esc(e.status)}</span></p>${isManager(req.user)?`<form method="post" action="/expenses/${e.id}/status"><button name="status" value="Onaylandı">Onayla</button><button class="danger" name="status" value="Reddedildi">Reddet</button></form>`:''}</div></div></section>`)); });
app.post('/expenses/:id/status',requireAuth,(req,res)=>{ if(!isManager(req.user)) return res.status(403).send('Yetki yok'); const db=readDb(); const e=db.expenses.find(x=>x.id===req.params.id); if(e){ e.status=req.body.status; e.updatedAt=new Date().toISOString(); e.updatedBy=req.user.name; writeDb(db); } res.redirect('/expenses/'+req.params.id); });
app.get('/approvals',requireAuth,(req,res)=>res.redirect('/expenses'));
app.get('/admin',requireAuth,(req,res)=>{ if(!isManager(req.user)) return res.status(403).send('Yetki yok'); const db=readDb(); const users=db.users.map(u=>`<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${esc((u.roles||[]).join(', '))}</td><td>${u.active?'Aktif':'Pasif'}</td></tr>`).join(''); res.send(layout(req,'Yönetim',`<section class="card"><h1>Yönetim</h1><p class="muted">v18.12: Google Vision + OpenAI OCR Parser Tool. Risk/onay/finans modülleri sonraki fazda eklenecek.</p><table><thead><tr><th>Ad</th><th>Email</th><th>Rol</th><th>Durum</th></tr></thead><tbody>${users}</tbody></table></section>`)); });
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

  const guessed=guessExpenseType(joined);
  return { companyName, documentDate, documentNo, receiptNo, taxBase, vatAmount, totalAmount, expenseType: guessed.expenseType, expenseTypeConfidence: guessed.confidence };
}

function guessExpenseType(text){
  const t=String(text||'').toLocaleUpperCase('tr-TR');
  const rules=[
    {type:'Yemek', score:95, words:['YİYECEK','YEMEK','CAFE','KAFE','RESTAURANT','RESTORAN','LOKANTA','STARBUCKS','KAHVE','PASTANE']},
    {type:'Yakıt', score:95, words:['OPET','SHELL','BP','PETROL','AKARYAKIT','BENZİN','MOTORİN','TOTALENERGIES','AYTEMİZ','PETROL OFİSİ']},
    {type:'Araç Yıkama', score:95, words:['OTO YIKAMA','YIKAMA','CAR WASH']},
    {type:'Otopark', score:92, words:['OTOPARK','PARK ÜCRETİ','PARKING']},
    {type:'Taksi', score:92, words:['TAKSİ','TAXI']},
    {type:'Kargo/Kurye', score:90, words:['KARGO','KURYE','YURTİÇİ','MNG','ARAS','SÜRAT','PTT KARGO']},
    {type:'Uçak Bileti', score:90, words:['THY','TÜRK HAVA YOLLARI','PEGASUS','UÇAK','AIRLINES','BİLET']},
    {type:'Konaklama', score:90, words:['OTEL','HOTEL','KONAKLAMA']},
    {type:'Ofis Gideri', score:78, words:['OFİS','KIRTASİYE','KOÇTAŞ','IKEA','TEKNOSA','VATAN','AMAZON','TRENDYOL']},
  ];
  for(const r of rules){ if(r.words.some(w=>t.includes(w))) return {expenseType:r.type,confidence:r.score,source:'keyword'}; }
  return {expenseType:'',confidence:0,source:'none'};
}

function safeJsonFromText(content){
  if(!content) return null;
  let s=String(content).trim();
  s=s.replace(/^```json\s*/i,'').replace(/^```\s*/,'').replace(/```$/,'').trim();
  const start=s.indexOf('{'); const end=s.lastIndexOf('}');
  if(start>=0 && end>start) s=s.slice(start,end+1);
  try{return JSON.parse(s);}catch(_){return null;}
}
function normalizeAiParsed(ai, fallback){
  const out={...fallback};
  if(!ai || typeof ai!=='object') return out;
  const str=(v)=>v===undefined||v===null?'':String(v).trim();
  const num=(v)=>cleanNum(str(v));
  if(str(ai.companyName)) out.companyName=str(ai.companyName);
  if(str(ai.documentDate) && /^\d{4}-\d{2}-\d{2}$/.test(str(ai.documentDate))) out.documentDate=str(ai.documentDate);
  if(str(ai.documentNo) && !/^(BELGEY|BELGE|TARIH|TARİH|SAAT|NO|ONAY KODU)$/i.test(str(ai.documentNo))) out.documentNo=str(ai.documentNo);
  if(str(ai.receiptNo)) out.receiptNo=str(ai.receiptNo);
  if(num(ai.taxBase)) out.taxBase=num(ai.taxBase);
  if(num(ai.vatAmount)) out.vatAmount=num(ai.vatAmount);
  if(num(ai.totalAmount)) out.totalAmount=num(ai.totalAmount);
  if(str(ai.expenseType)) out.expenseType=str(ai.expenseType);
  if(str(ai.paymentMethod)) out.paymentMethod=str(ai.paymentMethod);
  out.currency='TRY';
  out.confidence=Number(ai.confidence)||out.confidence||0;
  out.notes=str(ai.notes||'');
  if(out.totalAmount && out.vatAmount && !out.taxBase) out.taxBase=(Number(out.totalAmount)-Number(out.vatAmount)).toFixed(2);
  return out;
}
async function openAiReceiptParser(text, fallback){
  const apiKey=process.env.OPENAI_API_KEY;
  if(!apiKey) return { parsed:fallback, ai:false, aiError:null };
  const model=process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const systemPrompt=`Sen Türkçe fiş/fatura OCR ayrıştırma aracısın. Sadece geçerli JSON döndür. Açıklama yazma.
Alanlar: companyName, documentDate, documentNo, receiptNo, taxBase, vatAmount, totalAmount, expenseType, paymentMethod, currency, confidence, notes.
Kurallar:
- Tarih ISO formatında YYYY-MM-DD olsun. Emin değilsen boş bırak.
- FİŞ NO varsa receiptNo alanına yaz.
- ONAY KODU, YIĞIN, SIRA NO, terminal ve işlem kodunu belge numarası sanma. Belge No açık değilse documentNo boş olsun.
- Tutarların para birimi TRY/TL kabul edilir. Sayılar 2353.00 formatında olsun.
- TOPKDV/KDV varsa vatAmount yap. Matrah yoksa toplam-KDV olarak hesapla.
- YİYECEK/CAFE/RESTAURANT/LOKANTA varsa expenseType=Yemek.
- PETROL/OPET/SHELL/BP varsa expenseType=Yakıt.
- OTO YIKAMA/YIKAMA varsa expenseType=Araç Yıkama.
- KREDİ/KART/Visa/Mastercard varsa paymentMethod=Kişisel Kart, NAKİT varsa Nakit.
- Emin olmadığın alanı uydurma, boş bırak.`;
  const userPrompt=`OCR TEXT:\n${String(text||'').slice(0,6000)}\n\nFallback JSON:\n${JSON.stringify(fallback)}`;
  try{
    const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`},body:JSON.stringify({model,temperature:0,response_format:{type:'json_object'},messages:[{role:'system',content:systemPrompt},{role:'user',content:userPrompt}]})});
    const j=await r.json();
    if(!r.ok) throw new Error(j.error?.message || 'OpenAI parser hatası');
    const content=j.choices?.[0]?.message?.content || '';
    const ai=safeJsonFromText(content);
    if(!ai) throw new Error('OpenAI JSON parse edilemedi');
    return { parsed:normalizeAiParsed(ai,fallback), ai:true, aiModel:model, aiError:null, aiRaw:ai };
  }catch(e){ return { parsed:fallback, ai:false, aiModel:model, aiError:e.message }; }
}

app.post('/api/ocr',requireAuth,upload.single('receipt'),async(req,res)=>{
  try{
    if(!req.file) return res.status(400).json({ok:false,error:'Dosya yok'});
    const jpeg=await normalizeImage(req.file);
    const text=await googleVision(jpeg);
    if(!text || text.trim().length<5) return res.json({ok:false,error:'OCR metni boş döndü',debug:{mimeType:req.file.mimetype,fileSize:req.file.size}});
    const fallback=parseReceipt(text);
    const aiResult=await openAiReceiptParser(text, fallback);
    const parsed=aiResult.parsed;
    res.json({ok:true,provider:'google',version:'18.12.1',textLength:text.length,mimeType:req.file.mimetype,fileSize:req.file.size,ai:aiResult.ai,aiModel:aiResult.aiModel||null,aiError:aiResult.aiError||null,parsed,aiRaw:aiResult.aiRaw||null,text:text.slice(0,2500)});
  }catch(e){ res.status(500).json({ok:false,error:e.message,provider:'google',debug:{mimeType:req.file?.mimetype,fileSize:req.file?.size}}); }
});

app.listen(PORT,()=>console.log(`Modüler Masraf v18.12.1 çalışıyor: ${PORT}`));