
require("dotenv").config();
const express = require("express");
const session = require("express-session");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

const PRIVATE_DIR = path.join(__dirname, "private_uploads", "receipts");
fs.mkdirSync(PRIVATE_DIR, { recursive: true });

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use("/public", express.static(path.join(__dirname, "public")));
app.use(session({
  secret: process.env.SESSION_SECRET || "dev-secret",
  resave: false,
  saveUninitialized: true
}));

const storage = multer.diskStorage({
  destination: function(req, file, cb){
    const now = new Date();
    const dir = path.join(PRIVATE_DIR, String(now.getFullYear()), String(now.getMonth()+1).padStart(2,"0"));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function(req, file, cb){
    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    cb(null, crypto.randomUUID() + ext);
  }
});
const upload = multer({ storage });

function moneyToNumberString(v){
  if(!v) return "";
  let s = String(v).trim().replace(/[^\d,\.]/g, "");
  if(!s) return "";
  if(s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if(s.includes(",")) s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n.toFixed(2) : "";
}

function parseReceiptText(text){
  const lines = String(text || "").split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const joined = lines.join("\n");

  const out = {
    company_name: "",
    document_date: "",
    document_number: "",
    receipt_no: "",
    subtotal: "",
    vat_amount: "",
    total_amount: ""
  };

  // Firma: fişte "AFYON LOKUM DÜNYASI" gibi büyük harfli ticari satırı yakala
  const blacklist = /^(TARIH|TARİH|SAAT|FIS|FİŞ|TOPLAM|TOPKDV|KDV|KREDI|KREDİ|NAKIT|NAKİT|SATIS|SATIŞ|MERSIS|MERSİS|EKU|Z NO|ISYERI|İŞYERİ|TERMINAL|REF|QNB|AID|RRN|ONAY|KART|BU BELGE|ÇAYYOLU|DB|->)$/i;
  for(let i=0;i<Math.min(lines.length, 18);i++){
    const l = lines[i];
    if(l.length >= 4 && /[A-ZÇĞİÖŞÜ]/.test(l) && !blacklist.test(l) && !/\d{2}[\/\.]\d{2}/.test(l)){
      if(/LTD|ŞTİ|STI|A\.Ş|AS|TIC|TİC|DÜNYASI|MARKET|PETROL|RESTAURANT|LOKUM|OTOPARK/i.test(l)){
        out.company_name = l;
        break;
      }
    }
  }
  if(!out.company_name){
    out.company_name = lines.find(l => l.length >= 4 && /[A-ZÇĞİÖŞÜ]/.test(l) && !blacklist.test(l)) || "";
  }

  const dateMatch = joined.match(/(?:TAR[Iİ]H\s*:?\s*)?(\d{1,2}[\/\.]\d{1,2}[\/\.]\d{4})/i);
  if(dateMatch){
    const p = dateMatch[1].replace(/\./g, "/").split("/");
    out.document_date = `${p[0].padStart(2,"0")}.${p[1].padStart(2,"0")}.${p[2]}`;
  }

  const receiptMatch = joined.match(/(?:F[Iİ]Ş\s*NO|FIS\s*NO|BELGE\s*NO|FATURA\s*NO)\s*:?\s*([A-Z0-9\-\/]+)/i);
  if(receiptMatch) out.receipt_no = receiptMatch[1];

  const docMatch = joined.match(/(?:REF\s*NO|SIRA\s*NO|Z\s*NO|EK[ÜU]\s*NO)\s*:?\s*([A-Z0-9\-\/]+)/i);
  if(docMatch) out.document_number = docMatch[1];

  // KDV: TOPKDV satırından sonraki veya aynı satırdaki para değerini al
  let vat = "";
  let vatSame = joined.match(/(?:TOP\s*KDV|TOPKDV|KDV)\s*:?\s*\*?\s*([\d\.\,]+)\b/i);
  if(vatSame) vat = vatSame[1];
  if(!vat){
    for(let i=0;i<lines.length;i++){
      if(/TOP\s*KDV|TOPKDV|KDV/i.test(lines[i])){
        for(let j=i+1;j<=Math.min(i+3,lines.length-1);j++){
          const m = lines[j].match(/\*?\s*([\d]{1,3}(?:[\.\,]\d{2,3})*(?:[\.,]\d{2})|\d+[\,\.]\d{2})/);
          if(m){ vat = m[1]; break; }
        }
      }
      if(vat) break;
    }
  }
  out.vat_amount = moneyToNumberString(vat);

  // Toplam: en güvenilir satırları önceliklendir
  let candidates = [];
  for(const l of lines){
    if(/TOPLAM|GENEL\s*TOPLAM|ÖDENECEK|ODENECEK|KRED[Iİ]|NAK[Iİ]T|SATIŞ|SATIS/i.test(l)){
      const nums = l.match(/[\d]{1,3}(?:\.\d{3})*(?:,\d{2})|[\d]+[\,\.]\d{2}/g);
      if(nums) nums.forEach(n => candidates.push(n));
    }
  }
  if(candidates.length === 0){
    const all = joined.match(/[\d]{1,3}(?:\.\d{3})*(?:,\d{2})|[\d]+[\,\.]\d{2}/g) || [];
    candidates = all;
  }
  const numeric = candidates.map(x => ({ raw:x, n:Number(moneyToNumberString(x)) })).filter(x => Number.isFinite(x.n));
  if(numeric.length){
    numeric.sort((a,b)=>b.n-a.n);
    out.total_amount = numeric[0].n.toFixed(2);
  }

  if(out.total_amount && out.vat_amount){
    const sub = Number(out.total_amount) - Number(out.vat_amount);
    if(Number.isFinite(sub)) out.subtotal = sub.toFixed(2);
  }

  return out;
}

async function googleVisionOcr(filePath){
  const key = process.env.GOOGLE_VISION_API_KEY;
  if(!key) throw new Error("GOOGLE_VISION_API_KEY Railway Variables içinde yok.");

  const imageBase64 = fs.readFileSync(filePath).toString("base64");

  async function callVision(type){
    const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [{
          image: { content: imageBase64 },
          features: [{ type, maxResults: 1 }],
          imageContext: { languageHints: ["tr", "en"] }
        }]
      })
    });
    const data = await response.json();
    if(!response.ok || data.error) throw new Error(data.error?.message || "Google Vision API hata verdi.");
    const r = data.responses && data.responses[0] ? data.responses[0] : {};
    return r.fullTextAnnotation?.text || r.textAnnotations?.[0]?.description || "";
  }

  // v15 gibi: önce TEXT_DETECTION. Eğer boşsa DOCUMENT_TEXT_DETECTION denenir.
  let text = await callVision("TEXT_DETECTION");
  if(!text || !text.trim()) text = await callVision("DOCUMENT_TEXT_DETECTION");
  return text || "";
}

app.get("/", (req,res)=>res.redirect("/expense/new"));

app.get("/expense/new", (req,res)=>{
  res.send(`<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Modüler Masraf</title>
  <link rel="stylesheet" href="/public/style.css">
</head>
<body>
<header><div class="brand">Modüler Masraf</div></header>
<main>
  <div class="card">
    <h1>Yeni Masraf Talebi</h1>
    <form method="post" action="/expense/new" enctype="multipart/form-data">
      <label>Masraf Türü</label>
      <select name="expense_type">
        <option>Otopark</option><option>Yemek</option><option>Yakıt</option><option>Konaklama</option><option>Diğer</option>
      </select>

      <div class="grid">
        <div><label>Firma Ünvanı</label><input name="company_name"></div>
        <div><label>Belge Tarihi</label><input name="document_date" placeholder="01.05.2026"></div>
        <div><label>Belge Numarası</label><input name="document_number"></div>
        <div><label>Fiş No</label><input name="receipt_no"></div>
        <div><label>Vergi Matrahı</label><input name="subtotal" inputmode="decimal"></div>
        <div><label>KDV Tutarı</label><input name="vat_amount" inputmode="decimal"></div>
        <div><label>Toplam Tutar</label><input name="amount" inputmode="decimal"></div>
        <div><label>Para Birimi</label><select name="currency"><option>TRY</option><option>USD</option><option>EUR</option></select></div>
      </div>

      <label>Masraf Tarihi</label>
      <input name="expense_date" placeholder="01.05.2026">

      <label>Açıklama</label>
      <textarea name="description"></textarea>

      <label>Fiş / Fatura Görseli</label>
      <p>Fotoğraf seçince “Fişi Oku” butonuna bas. OCR alanları otomatik doldurur.</p>
      <input type="file" name="receipt" accept="image/jpeg,image/png,image/webp,image/heic,image/heif">

      <button type="button" class="secondary" onclick="window.runOcrNow(event)">Fişi Oku / Tutarı Otomatik Doldur</button>
      <div id="ocrStatus" class="ocr-status">OCR hazır. Fiş seçip “Fişi Oku” butonuna bas.</div>
      <div id="ocrDebug" class="ocr-debug"></div>

      <button type="submit">Onaya Gönder</button>
    </form>
  </div>
</main>
<script src="/public/ocr.js?v=19"></script>
</body>
</html>`);
});

app.post("/api/ocr", upload.single("receipt"), async (req,res)=>{
  try{
    if(!req.file) return res.status(400).json({ ok:false, error:"Dosya gelmedi." });

    const text = await googleVisionOcr(req.file.path);
    if(!text || !text.trim()){
      return res.status(422).json({
        ok:false,
        error:"Google OCR görselden metin okuyamadı. Önce aynı görseli JPG/PNG olarak deneyin; sorun devam ederse Railway logunda Vision response kontrol edilmeli.",
        provider:"google",
        text:""
      });
    }

    const parsed = parseReceiptText(text);
    res.json({
      ok:true,
      provider:"google",
      text,
      ...parsed,
      amount: parsed.total_amount,
      expense_date: parsed.document_date
    });
  }catch(err){
    res.status(500).json({ ok:false, error:err.message || String(err), provider:"google" });
  }
});

app.post("/expense/new", upload.single("receipt"), (req,res)=>{
  res.send(`<pre>${JSON.stringify(req.body, null, 2)}</pre><p><a href="/expense/new">Yeni masraf</a></p>`);
});

app.listen(PORT, ()=>console.log("Modüler Masraf v19 running on port " + PORT));
