const fs = require('fs');
const sharp = require('sharp');
let heicConvert;
try { heicConvert = require('heic-convert'); } catch { heicConvert = null; }

function toISODate(value){
  if(!value) return null;
  const s = String(value).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(m) return s;
  m = s.match(/(\d{1,2})[\.\/\-](\d{1,2})[\.\/\-](\d{2,4})/);
  if(!m) return null;
  let y = m[3].length === 2 ? '20' + m[3] : m[3];
  const year = Number(y);
  if(year < 2000 || year > 2100) return null;
  const month = m[2].padStart(2,'0');
  const day = m[1].padStart(2,'0');
  return `${y}-${month}-${day}`;
}

function parseAmount(raw){
  if(raw === undefined || raw === null || raw === '') return null;
  const s = String(raw).replace(/\s/g,'').replace(/TL|TRY/ig,'').replace(/\./g,'').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function bestAmount(text){
  const lines = text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const keyLine = [...lines].reverse().find(l => /(TOPLAM|GENEL\s*TOPLAM|TUTAR|KREDİ|KREDI|NAKİT|NAKIT)/i.test(l) && /(\d+[\.,]\d{2})/.test(l));
  const source = keyLine || text;
  const nums = [...source.matchAll(/\d{1,3}(?:\.\d{3})*[\.,]\d{2}|\d+[\.,]\d{2}/g)].map(m=>parseAmount(m[0])).filter(Boolean);
  return nums.length ? Math.max(...nums) : null;
}

function regexParseReceiptText(text){
  const clean = text || '';
  const lines = clean.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const dateMatch = clean.match(/\d{1,2}[\.\/\-]\d{1,2}[\.\/\-]\d{2,4}/);
  const vatLine = lines.find(l=>/KDV/i.test(l)&&/(\d+[\.,]\d{2})/.test(l));
  const taxLine = lines.find(l=>/(MATRAH|ARA\s*TOPLAM|NET)/i.test(l)&&/(\d+[\.,]\d{2})/.test(l));
  const receiptLine = lines.find(l=>/(FİŞ|FIS|F NO|FİŞ NO|FIS NO)/i.test(l));
  const docLine = lines.find(l=>/(BELGE|FATURA|EVRAK)/i.test(l));
  return {
    companyName: lines[0] || '',
    documentDate: toISODate(dateMatch?.[0]),
    expenseDate: toISODate(dateMatch?.[0]),
    documentNo: docLine?.match(/[A-Z0-9\-]{4,}/i)?.[0] || '',
    receiptNo: receiptLine?.match(/[A-Z0-9\-]{3,}/i)?.[0] || '',
    taxBase: parseAmount(taxLine?.match(/\d{1,3}(?:\.\d{3})*[\.,]\d{2}|\d+[\.,]\d{2}/)?.[0]),
    vatAmount: parseAmount(vatLine?.match(/\d{1,3}(?:\.\d{3})*[\.,]\d{2}|\d+[\.,]\d{2}/)?.[0]),
    totalAmount: bestAmount(clean),
    rawText: clean
  };
}

async function normalizeImage(file){
  let input = fs.readFileSync(file.path);
  const lower = (file.originalname || '').toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();
  if((lower.endsWith('.heic') || lower.endsWith('.heif') || mime.includes('heic') || mime.includes('heif')) && heicConvert){
    input = await heicConvert({buffer:input, format:'JPEG', quality:0.9});
  }
  return sharp(input).rotate().resize({width:1800,height:1800,fit:'inside',withoutEnlargement:true}).jpeg({quality:88}).toBuffer();
}

async function googleVision(buffer){
  const key = process.env.GOOGLE_VISION_API_KEY;
  if(!key) throw new Error('GOOGLE_VISION_API_KEY eksik');
  const body = {requests:[{image:{content:buffer.toString('base64')},features:[{type:'DOCUMENT_TEXT_DETECTION'}]}]};
  const r = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${key}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const json = await r.json();
  if(!r.ok || json.error) throw new Error(json.error?.message || 'Google Vision OCR hatası');
  const text = json.responses?.[0]?.fullTextAnnotation?.text || json.responses?.[0]?.textAnnotations?.[0]?.description || '';
  if(!text.trim()) throw new Error('OCR metni boş döndü');
  return {text, provider:'google', textLength:text.length};
}

function safeJson(text){
  const raw = String(text || '').trim().replace(/^```json/i,'').replace(/^```/,'').replace(/```$/,'').trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if(start >= 0 && end > start) return JSON.parse(raw.slice(start,end+1));
  return JSON.parse(raw);
}

function normalizeAiParsed(ai){
  return {
    companyName: ai.companyName || ai.firmaUnvani || '',
    documentDate: toISODate(ai.documentDate || ai.belgeTarihi),
    expenseDate: toISODate(ai.expenseDate || ai.masrafTarihi || ai.documentDate || ai.belgeTarihi),
    documentNo: ai.documentNo || ai.belgeNumarasi || '',
    receiptNo: ai.receiptNo || ai.fisNo || '',
    taxBase: parseAmount(ai.taxBase ?? ai.vergiMatrahi),
    vatAmount: parseAmount(ai.vatAmount ?? ai.kdvTutari),
    totalAmount: parseAmount(ai.totalAmount ?? ai.toplamTutar),
    suggestedExpenseType: ai.suggestedExpenseType || ai.masrafTuru || '',
    confidence: typeof ai.confidence === 'number' ? ai.confidence : null,
    notes: ai.notes || ''
  };
}

async function openAiParseReceiptText(text){
  const key = process.env.OPENAI_API_KEY;
  if(!key) return {parsed:null, error:'OPENAI_API_KEY eksik'};
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const prompt = `Sen Türkçe fiş/fatura OCR ayrıştırma asistanısın. Aşağıdaki OCR metninden alanları çıkar. Yalnızca JSON döndür. Tarihleri YYYY-MM-DD formatında ver. Saçma tarih varsa null yap. Tutarları sayı olarak ver. Fişte KDV %20 ve toplam varsa matrah ve KDV hesaplanabiliyorsa hesapla. Belge no ile saat/EKÜ/Z no değerlerini karıştırma.\n\nJSON şeması:\n{\n  "companyName":"",\n  "documentDate":null,\n  "expenseDate":null,\n  "documentNo":"",\n  "receiptNo":"",\n  "taxBase":null,\n  "vatAmount":null,\n  "totalAmount":null,\n  "suggestedExpenseType":"",\n  "confidence":0,\n  "notes":""\n}\n\nOCR METNİ:\n${text.slice(0,12000)}`;
  const r = await fetch('https://api.openai.com/v1/chat/completions',{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},
    body:JSON.stringify({
      model,
      temperature:0,
      response_format:{type:'json_object'},
      messages:[{role:'user',content:prompt}]
    })
  });
  const json = await r.json();
  if(!r.ok) return {parsed:null, error:json.error?.message || 'OpenAI parser hatası'};
  const content = json.choices?.[0]?.message?.content || '{}';
  return {parsed:normalizeAiParsed(safeJson(content)), error:null, model};
}

async function runOcr(file){
  const buffer = await normalizeImage(file);
  const result = await googleVision(buffer);
  const regexParsed = regexParseReceiptText(result.text);
  const aiResult = await openAiParseReceiptText(result.text);
  const ai = aiResult.parsed;
  const parsed = ai ? {...regexParsed, ...Object.fromEntries(Object.entries(ai).filter(([,v]) => v !== null && v !== undefined && v !== ''))} : regexParsed;
  return {
    ...parsed,
    rawText: result.text,
    debug:{
      provider:result.provider,
      textLength:result.textLength,
      mimeType:file.mimetype,
      fileSize:file.size,
      ai: !!ai,
      aiModel: aiResult.model || null,
      aiError: aiResult.error || null,
      confidence: ai?.confidence ?? null,
      notes: ai?.notes || null
    }
  };
}

module.exports={runOcr,parseReceiptText:regexParseReceiptText};
