require("dotenv").config();

const express = require("express");
const session = require("express-session");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, "data");
const UPLOADS_DIR = path.join(__dirname, "uploads");
const DB_FILE = path.join(DATA_DIR, "db.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

const DEFAULT_PASSWORD = process.env.DEFAULT_USER_PASSWORD || "123456";


function getManagerCandidates(db, excludeId = null) {
  return db.users.filter(u => {
    if (u.active === false) return false;
    if (excludeId && u.id === excludeId) return false;
    return ["sales_manager", "technical_manager", "accounting_manager", "finance", "admin"].includes(u.role);
  });
}

function roleLabel(role) {
  return {
    sales_responsible: "Satış Sorumlusu",
    salesperson: "Satış Sorumlusu",
    sales_manager: "Satış Yöneticisi",
    sales_director: "Satış Müdürü",
    technical_manager: "Teknik Müdür",
    technical_staff: "Teknik Destek",
    accounting_staff: "Muhasebe Sorumlusu",
    accounting_manager: "Muhasebe Müdürü",
    front_office: "Ön Büro Sorumlusu",
    marketing_manager: "Pazarlama Yöneticisi",
    warehouse: "Depo Sorumlusu",
    finance_manager: "Finans Müdürü",
    finance: "Finans Müdürü",
    admin: "Sistem Yöneticisi"
  }[role] || role;
}

function displayCompanyRole(u) {
  return u.company_role || u.title || roleLabel(u.role);
}

function statusLabel(status) {
  return {
    sales_manager_approval: "Satış Yöneticisi Onayı Bekliyor",
    sales_director_approval: "Satış Müdürü Onayı Bekliyor",
    technical_manager_review: "Teknik Müdür Kontrolünde",
    accounting_manager_approval: "Muhasebe Müdürü Onayı Bekliyor",
    finance_manager_approval: "Finans Müdürü Onayı Bekliyor",
    finance_approval: "Finans Müdürü Onayı Bekliyor",
    accounting_payment_list: "Muhasebe Ödeme Listesinde",
    paid: "Ödendi",
    rejected: "Reddedildi",
    missing_document: "Eksik Evrak"
  }[status] || status;
}

function defaultDb() {
  return { users: [], expenses: [], approvals: [], mails: [], counters: { users: 1, expenses: 1, approvals: 1, mails: 1 } };
}

function loadDb() {
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify(defaultDb(), null, 2));
  const db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  if (!db.mails) db.mails = [];
  if (!db.counters.mails) db.counters.mails = 1;
  return db;
}

function saveDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function isProtectedUser(user) {
  if (!user) return false;
  const email = String(user.email || "").toLowerCase();
  return (
    email === "ozan@modulerotomasyon.com" ||
    email === "celal@modulerotomasyon.com" ||
    email === "celal.esli@modulerotomasyon.com" ||
    user.full_access === true
  );
}

function normalizeSeedData(db) {
  // Destek Mail hiçbir şekilde kullanıcı listesinde kalmasın.
  db.users = db.users.filter(u => String(u.email || "").toLowerCase() !== "destek@akuvoxinterkom.com");

  // Ozan ve Celal kritik kullanıcıdır; pasif yapılamaz, silinemez.
  db.users.forEach(u => {
    const email = String(u.email || "").toLowerCase();
    if (email === "ozan@modulerotomasyon.com" || email === "celal@modulerotomasyon.com" || email === "celal.esli@modulerotomasyon.com") {
      u.active = true;
      u.full_access = true;
    }
  });

  saveDb(db);
}

function upsertUser(db, user) {
  const existing = db.users.find(u => u.email === user.email);
  if (existing) {
    // Mevcut kullanıcıyı bozmayalım; eksik yeni alanları tamamlayalım.
    existing.name = existing.name || user.name;
    existing.role = existing.role || user.role;
    existing.department = existing.department || user.department || "";
    existing.title = existing.title || user.title || "";
    existing.company_role = existing.company_role || user.company_role || user.title || roleLabel(user.role);
    existing.extension = existing.extension || user.extension || "";
    if (existing.manager_id === undefined) existing.manager_id = user.manager_id || null;
    if (existing.full_access === undefined) existing.full_access = !!user.full_access;
    if (existing.active === undefined) existing.active = true;
    return existing.id;
  }
  const id = db.counters.users++;
  db.users.push({
    id,
    name: user.name,
    email: user.email,
    password_hash: bcrypt.hashSync(user.password || DEFAULT_PASSWORD, 10),
    role: user.role,
    manager_id: user.manager_id || null,
    extension: user.extension || "",
    department: user.department || "",
    title: user.title || "",
    company_role: user.company_role || user.title || roleLabel(user.role),
    iban: user.iban || "",
    active: user.active !== false,
    full_access: !!user.full_access,
    created_at: new Date().toISOString()
  });
  return id;
}

function ensureSeedUsers() {
  const db = loadDb();

  const ozanId = upsertUser(db, {
    name: "Ozan Güldümen",
    email: process.env.ADMIN_EMAIL || "ozan@modulerotomasyon.com",
    password: process.env.ADMIN_PASSWORD || DEFAULT_PASSWORD,
    role: "admin",
    title: "Satış Müdürü / Şirket Ortağı",
    company_role: "Satış Müdürü / Şirket Ortağı",
    department: "Modüler Otomasyon Yönetim",
    extension: "113",
    full_access: true
  });

  const celalId = upsertUser(db, {
    name: "Celal Eşli",
    email: process.env.CELAL_EMAIL || "celal@modulerotomasyon.com",
    password: process.env.CELAL_PASSWORD || DEFAULT_PASSWORD,
    role: "finance_manager",
    title: "Finans Müdürü / Şirket Ortağı",
    company_role: "Finans Müdürü / Şirket Ortağı",
    department: "Modüler Otomasyon Yönetim",
    full_access: true
  });

  const ferhatId = upsertUser(db, {
    name: "Ferhat Halis Polat",
    email: "halis.polat@modulerotomasyon.com",
    role: "technical_manager",
    title: "Teknik Müdür",
    company_role: "Teknik Müdür",
    department: "Teknik Departmanı",
    extension: "120",
    manager_id: ozanId
  });

  const serenId = upsertUser(db, {
    name: "Seren Sarıkaya",
    email: "seren.sarikaya@modulerotomasyon.com",
    role: "accounting_manager",
    title: "Muhasebe Müdürü",
    company_role: "Muhasebe Müdürü",
    department: "Muhasebe Departmanı",
    extension: "111",
    manager_id: ozanId
  });

  const users = [
    ["Duygu Genç", "duygu.genc@modulerotomasyon.com", "accounting_staff", "Muhasebe Sorumlusu", "Muhasebe Departmanı", "112", serenId],
    ["Sıla Sağlam", "sila.saglam@modulerotomasyon.com", "front_office", "Ön Büro Sorumlusu", "Muhasebe Departmanı", "122", serenId],
    ["Abdullah Uğraş", "abdullah.ugras@modulerotomasyon.com", "sales_manager", "Satış Yöneticisi", "Satış Departmanı", "117", ozanId],
    ["Özmen Aykaç", "ozmen.aykac@modulerotomasyon.com", "sales_manager", "Satış Yöneticisi", "Satış Departmanı", "128", ozanId],
    ["Mustafa Sezgin", "mustafa.sezgin@modulerotomasyon.com", "sales_responsible", "Satış Sorumlusu", "Satış Departmanı", "126", ozanId],
    ["Berkay Ulufer", "berkay.ulufer@modulerotomasyon.com", "sales_manager", "Satış Yöneticisi", "Satış Departmanı", "114", ozanId],
    ["Semih Vardarboylu", "semih.vardarboylu@modulerotomasyon.com", "sales_manager", "Satış Yöneticisi", "Satış Departmanı", "123", ozanId],
    ["Gizem Özdamar", "gizem.ozdamar@modulerotomasyon.com", "marketing_manager", "Pazarlama Yöneticisi", "Pazarlama Departmanı", "121", ozanId],
    ["Onur Can Yıldırım", "onurcan.yildirim@modulerotomasyon.com", "technical_staff", "Teknik Destek", "Teknik Departmanı", "115", ferhatId],
    ["Güven İrgin", "guven.irgin@modulerotomasyon.com", "technical_staff", "Teknik Destek", "Teknik Departmanı", "119", ferhatId],
    ["Furkan Türkmenli", "furkan.turkmenli@akuvoxinterkom.com", "warehouse", "Depo Sorumlusu", "Teknik Departmanı", "116", ferhatId],
    ["Efe Atıl", "efe.atil@modulerotomasyon.com", "technical_staff", "Teknik Destek", "Teknik Departmanı", "124", ferhatId],
    ["Destek Mail", "destek@akuvoxinterkom.com", "technical_staff", "Destek Mail", "Teknik Departmanı", "", ferhatId]
  ];

  users.forEach(([name, email, role, title, department, extension, manager_id]) => {
    upsertUser(db, { name, email, role, title, company_role: title, department, extension, manager_id });
  });

  // Mevcut Railway veritabanında daha önce yanlış rol ile oluşan kullanıcıları güvenli şekilde düzelt.
  const salesManagerEmails = [
    "abdullah.ugras@modulerotomasyon.com",
    "ozmen.aykac@modulerotomasyon.com",
    "berkay.ulufer@modulerotomasyon.com",
    "semih.vardarboylu@modulerotomasyon.com"
  ];
  db.users.forEach(u => {
    if (salesManagerEmails.includes(u.email)) { u.role = "sales_manager"; u.company_role = u.company_role || "Satış Yöneticisi"; u.title = u.title || "Satış Yöneticisi"; u.manager_id = u.manager_id || ozanId; }
    if (u.email === "mustafa.sezgin@modulerotomasyon.com") { u.role = u.role || "sales_responsible"; u.company_role = u.company_role || "Satış Sorumlusu"; u.title = u.title || "Satış Sorumlusu"; }
    if (u.email === "celal@modulerotomasyon.com" || u.name === "Celal Eşli") { u.role = "finance_manager"; u.company_role = "Finans Müdürü / Şirket Ortağı"; u.full_access = true; }
    if (u.email === (process.env.ADMIN_EMAIL || "ozan@modulerotomasyon.com") || u.name === "Ozan Güldümen") { u.company_role = "Satış Müdürü / Şirket Ortağı"; u.full_access = true; }
  });

  saveDb(db);
}
ensureSeedUsers();
normalizeSeedData(loadDb());

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use("/uploads", express.static(UPLOADS_DIR));
app.use("/public", express.static(path.join(__dirname, "public")));

app.use(session({
  secret: process.env.SESSION_SECRET || "change-this-secret",
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 }
}));

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOADS_DIR),
  filename: (_, file, cb) => {
    const safe = file.originalname.replace(/[^\w.\-çğıöşüÇĞİÖŞÜ]/g, "_");
    cb(null, Date.now() + "_" + safe);
  }
});
const upload = multer({ storage });
const ocrUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect("/login");
  next();
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.session.user) return res.redirect("/login");
    if (!roles.includes(req.session.user.role)) return res.status(403).send("Yetkiniz yok.");
    next();
  };
}

function dbUserFor(sessionUser, db) {
  return db.users.find(u => u.id === sessionUser.id);
}

function nextStatusFor(user, status, db) {
  const u = dbUserFor(user, db);
  if (user.role === "admin" || (u && u.full_access && status !== "accounting_payment_list")) {
    return {
      sales_manager_approval: "sales_director_approval",
      sales_director_approval: "accounting_manager_approval",
      accounting_manager_approval: "finance_manager_approval",
      finance_manager_approval: "accounting_payment_list",
      finance_approval: "accounting_payment_list",
      accounting_payment_list: "paid",
      missing_document: "sales_manager_approval"
    }[status] || status;
  }
  if (user.role === "sales_manager" && status === "sales_manager_approval") return "sales_director_approval";
  if ((user.role === "sales_director" || user.role === "admin") && status === "sales_director_approval") return "accounting_manager_approval";
  if (user.role === "accounting_manager" && status === "accounting_manager_approval") return "finance_manager_approval";
  if (user.role === "finance_manager" && status === "finance_manager_approval") return "accounting_payment_list";
  if (["accounting_manager","accounting_staff"].includes(user.role) && status === "accounting_payment_list") return "paid";
  return status;
}

function canSeeExpense(user, expense, db) {
  const u = dbUserFor(user, db);
  if (user.role === "admin" || (u && u.full_access)) return true;
  if (["accounting_manager", "accounting_staff", "finance_manager", "finance"].includes(user.role)) return true;
  if (["sales_responsible","salesperson","technical_staff","warehouse","front_office","marketing_manager"].includes(user.role)) return expense.user_id === user.id;
  if (user.role === "sales_manager") {
    const owner = db.users.find(x => x.id === expense.user_id);
    return expense.user_id === user.id || (owner && owner.manager_id === user.id);
  }
  if (user.role === "technical_manager") {
    const owner = db.users.find(x => x.id === expense.user_id);
    return expense.user_id === user.id || (owner && owner.manager_id === user.id) || ["technical_manager_review", "finance_manager_approval", "finance_approval", "accounting_payment_list", "paid"].includes(expense.status);
  }
  return false;
}

function canActOnExpense(user, expense, db) {
  const u = dbUserFor(user, db);
  if (user.role === "admin") return true;
  if (u && u.full_access && expense.status !== "accounting_payment_list") return true;
  if (user.role === "sales_manager" && expense.status === "sales_manager_approval") {
    const owner = db.users.find(x => x.id === expense.user_id);
    return owner && owner.manager_id === user.id;
  }
  if ((user.role === "sales_director" || (u && u.full_access)) && expense.status === "sales_director_approval") return true;
  if (user.role === "accounting_manager" && ["accounting_manager_approval","accounting_payment_list"].includes(expense.status)) return true;
  if (user.role === "finance_manager" && expense.status === "finance_manager_approval") return true;
  return false;
}

function actionOptions(user, expense) {
  if (["accounting_manager","accounting_staff"].includes(user.role) && expense.status === "accounting_payment_list") {
    return `<option value="paid">Ödendi Yap</option><option value="missing_document">Eksik Evrak</option>`;
  }
  return `<option value="approve">Onayla / Sonraki Aşamaya Geçir</option><option value="missing_document">Eksik Evrak</option><option value="reject">Reddet</option>`;
}

function canCreateExpense(role) {
  return ["sales_responsible","salesperson","sales_manager","technical_staff","warehouse","front_office","marketing_manager","technical_manager","admin"].includes(role);
}

function layout(title, user, content) {
  const adminLinks = user && user.role === "admin" ? `
    <a href="/users">Personel</a>
    <a href="/settings">Ayarlar</a>
    <a href="/mailbox">Mail Log</a>
  ` : "";
  return `<!doctype html>
<html lang="tr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title><link rel="stylesheet" href="/public/style.css"><script src="/public/ocr.js?v=18" defer></script>
</head><body>
<header><div class="brand">Modüler Masraf</div>
${user ? `<nav>
  <a href="/">Panel</a>
  ${canCreateExpense(user.role) ? `<a href="/expenses/new">Masraf Ekle</a>` : ""}
  <a href="/expenses">Masraflar</a>
  ${["sales_manager","sales_director","technical_manager","finance_manager","finance","accounting_manager","accounting_staff","admin"].includes(user.role) ? `<a href="/work">İş Listem</a>` : ""}
  ${["accounting_manager","accounting_staff","finance_manager","finance","admin"].includes(user.role) ? `<a href="/reports">Rapor / Excel</a>` : ""}
  ${["accounting_manager","accounting_staff","admin"].includes(user.role) ? `<a href="/payments">Muhasebe Ödeme Listesi</a>` : ""}
  ${adminLinks}
  <a href="/logout">Çıkış</a>
</nav>` : ""}
</header><main>${content}</main></body></html>`;
}

function csvEscape(value) {
  const v = String(value ?? "");
  return '"' + v.replace(/"/g, '""') + '"';
}

function makeCsv(rows) {
  return "\uFEFF" + rows.map(r => r.map(csvEscape).join(";")).join("\n");
}

async function logOrSendMail(db, subject, text) {
  const recipients = process.env.ACCOUNTING_PAYMENT_MAIL || "seren.sarikaya@modulerotomasyon.com,duygu.genc@modulerotomasyon.com,sila.saglam@modulerotomasyon.com";
  db.mails.push({ id: db.counters.mails++, to: recipients, subject, text, created_at: new Date().toISOString(), sent: false });
  saveDb(db);
  if (!process.env.SMTP_HOST || !recipients) return;

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
  });
  await transporter.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to: recipients, subject, text });
  const latest = loadDb();
  const last = latest.mails[latest.mails.length - 1];
  if (last) last.sent = true;
  saveDb(latest);
}


function normalizeAmountValue(value) {
  if (!value) return "";
  let v = String(value).trim();

  if (v.includes(".") && v.includes(",")) {
    v = v.replace(/\./g, "").replace(",", ".");
  } else {
    v = v.replace(",", ".");
  }

  const num = parseFloat(v);
  return isNaN(num) ? "" : num.toFixed(2);
}

function extractAmountFromText(text) {
  if (!text) return null;
  const raw = normalizeReceiptText(text);
  const cleaned = raw.replace(/\s+/g, " ");
  const amountPattern = "(\*?\s*\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\*?\s*\d+[.,]\d{2})";

  const priorityRegex = new RegExp("(GENEL\s*TOPLAM|TOPLAM|TOTAL|ÖDENECEK|ODENECEK|KRED[İI]|NAK[İI]T|KART)[^0-9]{0,60}" + amountPattern, "i");
  const priorityMatch = cleaned.match(priorityRegex);
  if (priorityMatch && priorityMatch[2]) return normalizeAmountValue(priorityMatch[2].replace(/\*/g, ""));

  const lines = raw.split("\n").map(x => x.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    if (/^(GENEL\s*)?TOPLAM|TOTAL|ÖDENECEK|ODENECEK|KRED[İI]|NAK[İI]T/i.test(lines[i])) {
      const nearby = [lines[i], lines[i+1] || "", lines[i+2] || ""].join(" ");
      const m = nearby.match(new RegExp(amountPattern, "i"));
      if (m && m[1]) return normalizeAmountValue(m[1].replace(/\*/g, ""));
    }
  }

  const matches = cleaned.match(/\*?\s*\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\*?\s*\d+[.,]\d{2}/g);
  if (!matches || !matches.length) return null;

  const sorted = matches
    .map(v => ({ raw: v, num: parseFloat(normalizeAmountValue(v.replace(/\*/g, ""))) }))
    .filter(x => !isNaN(x.num) && x.num > 0)
    .sort((a, b) => b.num - a.num);

  return sorted.length ? sorted[0].num.toFixed(2) : null;
}

function extractDateFromText(text) {
  if (!text) return null;
  const m = text.match(/(\d{1,2})[./-](\d{1,2})[./-](20\d{2}|\d{2})/);
  if (!m) return null;

  let day = m[1].padStart(2, "0");
  let month = m[2].padStart(2, "0");
  let year = m[3];
  if (year.length === 2) year = "20" + year;

  return `${year}-${month}-${day}`;
}

function normalizeReceiptText(text) {
  return String(text || "").replace(/\r/g, "");
}

function toTrAmount(value) {
  const normalized = normalizeAmountValue(value);
  if (!normalized) return "";
  return normalized.replace(".", ",");
}

function extractAfterLabel(text, labels) {
  const lines = normalizeReceiptText(text).split("\n").map(x => x.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const label of labels) {
      const re = new RegExp(label + "\\s*[:：-]?\\s*(.*)$", "i");
      const m = line.match(re);
      if (m) {
        const v = (m[1] || "").trim();
        if (v) return v;
        if (lines[i + 1]) return lines[i + 1].trim();
      }
    }
  }
  return "";
}

function extractReceiptNo(text) {
  const t = normalizeReceiptText(text);
  const patterns = [
    /F[İI]Ş\s*NO\s*[:：-]?\s*([A-Z0-9\/-]+)/i,
    /FIS\s*NO\s*[:：-]?\s*([A-Z0-9\/-]+)/i,
    /FİŞNO\s*[:：-]?\s*([A-Z0-9\/-]+)/i,
    /BELGE\s*NO\s*[:：-]?\s*([A-Z0-9\/-]+)/i,
    /Z\s*NO\s*[:：-]?\s*([A-Z0-9\/-]+)/i
  ];
  for (const p of patterns) {
    const m = t.match(p);
    if (m && m[1]) return m[1].replace(/^0+(?=\d)/, '') || m[1];
  }
  return "";
}

function extractVatAmount(text) {
  const raw = normalizeReceiptText(text);
  const t = raw.replace(/\s+/g, " ");
  const amountPattern = "(\*?\s*\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\*?\s*\d+[.,]\d{2})";
  const patterns = [
    new RegExp("TOP\s*KDV[^0-9]{0,30}" + amountPattern, "i"),
    new RegExp("KDV\s*TOPLAMI[^0-9]{0,30}" + amountPattern, "i"),
    new RegExp("KDV[^0-9]{0,30}" + amountPattern, "i")
  ];
  for (const p of patterns) {
    const m = t.match(p);
    if (m && m[1]) return normalizeAmountValue(m[1].replace(/\*/g, ""));
  }
  const lines = raw.split("\n").map(x => x.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    if (/TOP\s*KDV|KDV\s*TOPLAMI|KDV/i.test(lines[i])) {
      const nearby = [lines[i], lines[i+1] || ""].join(" ");
      const m = nearby.match(new RegExp(amountPattern, "i"));
      if (m && m[1]) return normalizeAmountValue(m[1].replace(/\*/g, ""));
    }
  }
  return "";
}

function extractCompanyName(text) {
  const lines = normalizeReceiptText(text).split("\n").map(x => x.trim()).filter(Boolean);
  const bad = /^(TAR[İI]H|SAAT|F[İI]Ş|FIS|TOPLAM|TOPKDV|KDV|KRED[İI]|NAK[İI]T|SATIŞ|SATIS|MERS[İI]S|EK[ÜU]|Z\s*NO|ISYERI|TERMINAL|REF|ONAY|AID|RRN|KART|BU BELGE|QNB|DB|->|\*+)/i;
  const candidates = [];
  for (const line of lines.slice(0, 18)) {
    if (bad.test(line)) continue;
    if (/cad|sok|mah|no:|ankara|istanbul|aksaray|köy|koyu|cd\./i.test(line)) continue;
    if (/\d{2}[./-]\d{2}[./-]\d{2,4}/.test(line)) continue;
    if (line.length < 4) continue;
    if (/^[A-ZÇĞİÖŞÜ0-9 .&'-]+$/.test(line.toUpperCase())) candidates.push(line);
  }
  const company = candidates.find(x => /LTD|ŞT[İI]|ST[İI]|A\.Ş|AS\b|T[İI]C|DÜNYASI|OTOPARK|MARKET|PETROL/i.test(x)) || candidates[0] || "";
  return company;
}

function parseReceiptFields(text) {
  const amount = extractAmountFromText(text) || "";
  const date = extractDateFromText(text) || "";
  const vat = extractVatAmount(text) || "";
  let subtotal = "";
  if (amount && vat) {
    const a = parseFloat(amount);
    const v = parseFloat(vat);
    if (!isNaN(a) && !isNaN(v)) subtotal = (a - v).toFixed(2);
  }
  const receiptNo = extractReceiptNo(text);
  const documentNo = extractAfterLabel(text, ["BELGE\\s*NO", "FATURA\\s*NO", "SER[İI]\\s*NO", "REF\\s*NO"]);
  return {
    company_name: extractCompanyName(text),
    document_date: date,
    document_number: documentNo || receiptNo,
    receipt_no: receiptNo,
    subtotal,
    vat_amount: vat,
    total_amount: amount,
    amount,
    date
  };
}

async function callGoogleVision(fileBuffer, featureType) {
  const apiKey = process.env.GOOGLE_VISION_API_KEY;
  const body = {
    requests: [
      {
        image: { content: fileBuffer.toString("base64") },
        features: [{ type: featureType }],
        imageContext: { languageHints: ["tr", "en"] }
      }
    ]
  };

  const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(data.error?.message || "Google Vision OCR hatası.");
  }

  return data.responses?.[0]?.fullTextAnnotation?.text ||
         data.responses?.[0]?.textAnnotations?.[0]?.description ||
         "";
}

async function runGoogleVisionOCR(fileBuffer) {
  const apiKey = process.env.GOOGLE_VISION_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_VISION_API_KEY tanımlı değil.");

  // v15/v16 çalışan mantık: önce TEXT_DETECTION denenir.
  let text = await callGoogleVision(fileBuffer, "TEXT_DETECTION");

  // Boş dönerse belge/fiş modu ikinci deneme olarak çalışır.
  if (!text || !text.trim()) {
    text = await callGoogleVision(fileBuffer, "DOCUMENT_TEXT_DETECTION");
  }

  return text || "";
}

async function runAzureVisionOCR(fileBuffer, mimeType) {
  const endpoint = (process.env.AZURE_VISION_ENDPOINT || "").replace(/\/$/, "");
  const key = process.env.AZURE_VISION_KEY;
  if (!endpoint || !key) throw new Error("AZURE_VISION_ENDPOINT veya AZURE_VISION_KEY tanımlı değil.");

  const url = `${endpoint}/computervision/imageanalysis:analyze?api-version=2024-02-01&features=read&language=tr`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Content-Type": mimeType || "application/octet-stream"
    },
    body: fileBuffer
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || "Azure Vision OCR hatası.");
  }

  const lines = [];
  const blocks = data.readResult?.blocks || [];
  for (const block of blocks) {
    for (const line of (block.lines || [])) {
      if (line.text) lines.push(line.text);
    }
  }

  return lines.join("\n");
}

async function runProfessionalOCR(fileBuffer, mimeType) {
  const provider = (process.env.OCR_PROVIDER || "google").toLowerCase();

  if (provider === "azure") {
    return await runAzureVisionOCR(fileBuffer, mimeType);
  }

  return await runGoogleVisionOCR(fileBuffer);
}


app.get("/api/ocr-status", requireLogin, (req, res) => {
  res.json({
    ok: true,
    provider: (process.env.OCR_PROVIDER || "google").toLowerCase(),
    googleKey: !!process.env.GOOGLE_VISION_API_KEY,
    azureEndpoint: !!process.env.AZURE_VISION_ENDPOINT,
    azureKey: !!process.env.AZURE_VISION_KEY
  });
});

app.post("/api/ocr", requireLogin, ocrUpload.single("receipt"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: "Fiş dosyası gelmedi." });

    const text = await runProfessionalOCR(req.file.buffer, req.file.mimetype);
    if (!text || !text.trim()) {
      return res.status(422).json({
        ok: false,
        error: "Google OCR görselden metin okuyamadı. Fotoğrafı JPG/PNG olarak, daha net ve dik açıyla tekrar yükleyin.",
        provider: (process.env.OCR_PROVIDER || "google").toLowerCase(),
        text: ""
      });
    }

    const parsed = parseReceiptFields(text);

    res.json({
      ok: true,
      provider: (process.env.OCR_PROVIDER || "google").toLowerCase(),
      ...parsed,
      amount: parsed.total_amount || parsed.amount || "",
      date: parsed.document_date || parsed.date || "",
      parsed,
      text: text.substring(0, 3000),
      textLength: text.length
    });
  } catch (err) {
    console.error("OCR error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/login", (req, res) => {
  res.send(layout("Giriş", null, `
    <div class="card small">
      <h1>Modüler Masraf</h1>
      <p class="muted">Bağımsız masraf, onay ve muhasebe ödeme takip sistemi</p>
      <form method="post" action="/login">
        <label>E-posta</label><input name="email" type="email" required>
        <label>Şifre</label><input name="password" type="password" required>
        <button>Giriş Yap</button>
      </form>
      <p class="muted">Varsayılan şifre: 123456</p>
    </div>
  `));
});

app.post("/login", (req, res) => {
  const db = loadDb();
  const { email, password } = req.body;
  const user = db.users.find(u => u.email === email && u.active);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.send(layout("Hatalı Giriş", null, `<div class="card small"><h1>Hatalı giriş</h1><a href="/login">Tekrar dene</a></div>`));
  }
  req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
  res.redirect("/");
});

app.get("/logout", (req, res) => req.session.destroy(() => res.redirect("/login")));

app.get("/", requireLogin, (req, res) => {
  const db = loadDb();
  const user = req.session.user;
  const visible = db.expenses.filter(e => canSeeExpense(user, e, db));
  const waiting = visible.filter(e => !["paid","rejected"].includes(e.status));
  res.send(layout("Panel", user, `
    <div class="grid">
      <div class="card"><h2>Hoş geldin</h2><p>${user.name}</p><span class="badge">${roleLabel(user.role)}</span></div>
      <div class="card"><h2>Görünen Masraf</h2><p class="big">${visible.length}</p></div>
      <div class="card"><h2>Açık İş</h2><p class="big">${waiting.length}</p></div>
    </div>
    <div class="card">
      <h2>Final Akış</h2>
      <ol>
        <li>Satış Sorumlusu masraf girer.</li>
        <li>İlk Satış Yöneticisi onaylar.</li>
        <li>Satış Müdürü / Şirket Ortağı Ozan onaylar.</li>
        <li>Muhasebe Müdürü Seren onaylar.</li>
        <li>Finans Müdürü / Şirket Ortağı Celal onaylar.</li>
        <li>Finans onayından sonra kayıt muhasebe ödeme listesine düşer; muhasebe ödeme sonrası “Ödendi” yapar.</li>
      </ol>
    </div>
  `));
});

app.get("/expenses/new", requireLogin, (req, res) => {
  const user = req.session.user;
  if (!canCreateExpense(user.role)) return res.status(403).send("Masraf girişi yetkiniz yok.");
  res.send(layout("Masraf Ekle", user, `
    <div class="card">
      <h1>Yeni Masraf Talebi</h1>
      <form method="post" action="/expenses" enctype="multipart/form-data">
        <label>Masraf Türü</label>
        <select name="expense_type" required>
          <option>Otopark</option><option>Yemek</option><option>Yakıt / Yol</option><option>Konaklama</option>
          <option>Kargo</option><option>Genel Harcama</option><option>Demirbaş</option><option>Diğer</option>
        </select>
        <div class="grid">
          <div><label>Firma Ünvanı</label><input name="company_name" id="company_name" placeholder="OCR ile otomatik dolar"></div>
          <div><label>Belge Tarihi</label><input name="document_date" id="document_date" type="date"></div>
          <div><label>Belge Numarası</label><input name="document_number" id="document_number"></div>
          <div><label>Fiş No</label><input name="receipt_no" id="receipt_no"></div>
          <div><label>Vergi Matrahı</label><input name="subtotal" id="subtotal" type="number" step="0.01"></div>
          <div><label>KDV Tutarı</label><input name="vat_amount" id="vat_amount" type="number" step="0.01"></div>
          <div><label>Toplam Tutar</label><input name="total_amount" id="total_amount" type="number" step="0.01"></div>
        </div>
        <label>Tutar</label><input name="amount" id="amount" type="number" step="0.01" required>
        <label>Para Birimi</label><select name="currency"><option>TRY</option><option>USD</option><option>EUR</option></select>
        <label>Masraf Tarihi</label><input name="expense_date" id="expense_date" type="date" required>
        <label>Açıklama</label><textarea name="description"></textarea>
        <label>Fiş / Fatura Görseli</label><p class="muted">Fotoğraf seçince profesyonel OCR ile tutar ve tarih otomatik okunmaya çalışır. Göndermeden önce kontrol et.</p>
        <input name="receipt" id="receipt" type="file" accept="image/*,.pdf">
        <button type="button" id="ocrBtn" class="secondary" onclick="window.runOcrNow(event)">Fişi Oku / Tutarı Otomatik Doldur</button>
        <div id="ocrStatus" class="ocr-status">OCR hazır. Fiş seçip “Fişi Oku” butonuna bas.</div>
        <div id="ocrDebug" class="ocr-debug"></div>
        <button>Onaya Gönder</button>
      </form>
    </div>
  `));
});

app.post("/expenses", requireLogin, upload.single("receipt"), (req, res) => {
  const db = loadDb();
  const user = db.users.find(u => u.id === req.session.user.id);
  const { expense_type, amount, currency, expense_date, description, company_name, document_date, document_number, receipt_no, subtotal, vat_amount, total_amount } = req.body;
  db.expenses.push({
    id: db.counters.expenses++,
    user_id: user.id,
    manager_id: user.manager_id || null,
    expense_type,
    amount: Number(amount),
    currency: currency || "TRY",
    expense_date,
    description: description || "",
    company_name: company_name || "",
    document_date: document_date || "",
    document_number: document_number || "",
    receipt_no: receipt_no || "",
    subtotal: subtotal ? Number(subtotal) : null,
    vat_amount: vat_amount ? Number(vat_amount) : null,
    total_amount: total_amount ? Number(total_amount) : (amount ? Number(amount) : null),
    receipt_path: req.file ? "/uploads/" + req.file.filename : "",
    status: user.role === "sales_responsible" || user.role === "salesperson" ? "sales_manager_approval" : "sales_director_approval",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
  saveDb(db);
  res.redirect("/expenses");
});

function expenseRowsHtml(rows) {
  return rows.map(r => `<tr>
    <td>#${r.id}</td><td>${r.user_name}</td><td>${r.expense_type}</td><td>${r.amount} ${r.currency}</td>
    <td>${r.expense_date}</td><td><span class="badge">${statusLabel(r.status)}</span></td>
    <td>${r.receipt_path ? `<a href="${r.receipt_path}" target="_blank">Fiş</a>` : "-"}</td>
    <td><a href="/expenses/${r.id}">Aç</a></td>
  </tr>`).join("");
}

app.get("/expenses", requireLogin, (req, res) => {
  const db = loadDb();
  const user = req.session.user;
  const rows = db.expenses.filter(e => canSeeExpense(user, e, db))
    .map(e => ({...e, user_name: (db.users.find(u => u.id === e.user_id) || {}).name || "-"}))
    .sort((a,b) => b.id - a.id);
  res.send(layout("Masraflar", user, `
    <div class="card wide"><h1>Masraflar</h1>
      <table><thead><tr><th>ID</th><th>Personel</th><th>Tür</th><th>Tutar</th><th>Tarih</th><th>Durum</th><th>Fiş</th><th></th></tr></thead>
      <tbody>${expenseRowsHtml(rows) || `<tr><td colspan="8">Kayıt yok.</td></tr>`}</tbody></table>
    </div>
  `));
});

app.get("/expenses/:id", requireLogin, (req, res) => {
  const db = loadDb();
  const user = req.session.user;
  const exp = db.expenses.find(e => e.id === Number(req.params.id));
  if (!exp) return res.status(404).send("Bulunamadı");
  if (!canSeeExpense(user, exp, db)) return res.status(403).send("Yetkiniz yok.");
  const owner = db.users.find(u => u.id === exp.user_id) || {};
  const approvals = db.approvals.filter(a => a.expense_id === exp.id)
    .map(a => ({...a, user_name: (db.users.find(u => u.id === a.user_id) || {}).name || "-"}))
    .sort((a,b) => b.id - a.id);
  const canAct = canActOnExpense(user, exp, db);
  res.send(layout("Masraf Detay", user, `
    <div class="card">
      <h1>Masraf #${exp.id}</h1>
      <p><b>Personel:</b> ${owner.name || "-"}</p>
      <p><b>Tür:</b> ${exp.expense_type}</p>
      <p><b>Tutar:</b> ${exp.amount} ${exp.currency}</p>
      <p><b>Tarih:</b> ${exp.expense_date}</p>
      <p><b>Durum:</b> <span class="badge">${statusLabel(exp.status)}</span></p>
      <p><b>Açıklama:</b><br>${exp.description || "-"}</p>
      ${exp.receipt_path ? `<p><a class="buttonlink" href="${exp.receipt_path}" target="_blank">Fişi Aç</a></p>` : ""}
      ${canAct ? `
        <form method="post" action="/expenses/${exp.id}/action">
          <label>İşlem</label><select name="action" required>${actionOptions(user, exp)}</select>
          <label>Not</label><textarea name="note"></textarea>
          <button>Kaydet</button>
        </form>` : `<p class="muted">Bu aşamada işlem yetkiniz yok.</p>`}
    </div>
    <div class="card"><h2>Onay Geçmişi</h2>
      ${approvals.map(a => `<p><b>${a.user_name}</b> - ${a.action}<br><small>${a.created_at}</small><br>${a.note || ""}</p>`).join("") || "<p>Kayıt yok.</p>"}
    </div>
  `));
});

app.post("/expenses/:id/action", requireLogin, async (req, res) => {
  const db = loadDb();
  const user = req.session.user;
  const exp = db.expenses.find(e => e.id === Number(req.params.id));
  if (!exp) return res.status(404).send("Bulunamadı");
  if (!canActOnExpense(user, exp, db)) return res.status(403).send("Bu işlem için yetkiniz yok.");
  const { action, note } = req.body;
  let newStatus = exp.status;
  if (action === "reject") newStatus = "rejected";
  else if (action === "missing_document") newStatus = "missing_document";
  else if (action === "paid" && ["accounting_manager","accounting_staff","admin"].includes(user.role)) newStatus = "paid";
  else if (action === "approve") newStatus = nextStatusFor(user, exp.status, db);
  exp.status = newStatus;
  exp.updated_at = new Date().toISOString();
  db.approvals.push({ id: db.counters.approvals++, expense_id: exp.id, user_id: user.id, action: action + " → " + statusLabel(newStatus), note: note || "", created_at: new Date().toISOString() });
  saveDb(db);
  if (newStatus === "accounting_payment_list") {
    const latest = loadDb();
    const owner = latest.users.find(u => u.id === exp.user_id) || {};
    const subject = "Finans Onaylı Masraf Muhasebeye Aktarıldı";
    const text = `Finans tarafından onaylanan masraf muhasebe ödeme listesine aktarılmıştır.

Masraf ID: #${exp.id}
Personel: ${owner.name || "-"}
Tutar: ${exp.amount} ${exp.currency}
Masraf Türü: ${exp.expense_type}
Tarih: ${exp.expense_date}

Muhasebe ödeme listesine alabilir.`;
    try { await logOrSendMail(latest, subject, text); } catch(e) { console.warn("Mail log/gönderim hatası:", e.message); }
  }
  res.redirect("/expenses/" + exp.id);
});

app.get("/work", requireLogin, requireRole(["sales_manager","sales_director","technical_manager","finance_manager","finance","accounting_manager","accounting_staff","admin"]), (req, res) => {
  const db = loadDb();
  const user = req.session.user;
  const u = db.users.find(x => x.id === user.id);
  let rows = db.expenses.filter(e => !["paid","rejected"].includes(e.status));
  if (user.role === "sales_manager") rows = rows.filter(e => e.status === "sales_manager_approval" && e.manager_id === user.id);
  if (user.role === "sales_director") rows = rows.filter(e => e.status === "sales_director_approval");
  if (u && u.full_access && user.role !== "admin") rows = rows.filter(e => ["sales_director_approval","finance_manager_approval"].includes(e.status));
  if (user.role === "technical_manager") rows = rows.filter(e => e.status === "technical_manager_review");
  if (["finance_manager","finance"].includes(user.role)) rows = rows.filter(e => e.status === "finance_manager_approval" || e.status === "finance_approval");
  if (["accounting_manager","accounting_staff"].includes(user.role)) rows = rows.filter(e => ["accounting_manager_approval","accounting_payment_list"].includes(e.status));
  rows = rows.map(e => ({...e, user_name: (db.users.find(u => u.id === e.user_id) || {}).name || "-"})).sort((a,b) => b.id - a.id);
  res.send(layout("İş Listem", user, `
    <div class="card wide"><h1>İş Listem</h1>
      <table><thead><tr><th>ID</th><th>Personel</th><th>Tür</th><th>Tutar</th><th>Tarih</th><th>Durum</th><th>Fiş</th><th></th></tr></thead>
      <tbody>${expenseRowsHtml(rows) || `<tr><td colspan="8">Bekleyen kayıt yok.</td></tr>`}</tbody></table>
    </div>
  `));
});

app.get("/payments", requireLogin, requireRole(["accounting_manager","accounting_staff","admin"]), (req, res) => {
  const db = loadDb();
  const rows = db.expenses.filter(e => ["accounting_payment_list","paid"].includes(e.status))
    .map(e => { const u = db.users.find(x => x.id === e.user_id) || {}; return {...e, user_name: u.name || "-", iban: u.iban || "-"}; })
    .sort((a,b)=>b.id-a.id);
  const waiting = rows.filter(r => r.status === "accounting_payment_list");
  const totalTRY = waiting.filter(r => r.currency === "TRY").reduce((sum, r) => sum + Number(r.amount || 0), 0);
  res.send(layout("Muhasebe Ödeme Listesi", req.session.user, `
    <div class="card wide"><h1>Muhasebe Ödeme Listesi</h1>
      <p><b>Finans Onaylı Ödeme Bekleyen TRY Toplam:</b> ${totalTRY.toFixed(2)} TRY</p>
      <p><a class="buttonlink" href="/export/payments.csv">CSV / Excel İndir</a></p>
      <table><thead><tr><th>ID</th><th>Personel</th><th>IBAN</th><th>Tutar</th><th>Tür</th><th>Durum</th><th></th></tr></thead>
      <tbody>${rows.map(r => `<tr><td>#${r.id}</td><td>${r.user_name}</td><td>${r.iban}</td><td>${r.amount} ${r.currency}</td><td>${r.expense_type}</td><td>${statusLabel(r.status)}</td><td><a href="/expenses/${r.id}">Aç</a></td></tr>`).join("") || `<tr><td colspan="7">Kayıt yok.</td></tr>`}</tbody></table>
    </div>
  `));
});

app.get("/reports", requireLogin, requireRole(["accounting_manager","accounting_staff","finance_manager","finance","admin"]), (req, res) => {
  res.send(layout("Rapor / Excel", req.session.user, `
    <div class="card">
      <h1>Rapor / Excel</h1>
      <p><a class="buttonlink" href="/export/expenses.csv">Tüm Masraflar CSV / Excel</a></p>
      <p><a class="buttonlink" href="/export/payments.csv">Muhasebe Ödeme Listesi CSV / Excel</a></p>
      <p><a class="buttonlink" href="/export/users.csv">Personel Listesi CSV / Excel</a></p>
    </div>
  `));
});

app.get("/export/expenses.csv", requireLogin, requireRole(["accounting_manager","accounting_staff","finance_manager","finance","admin"]), (req, res) => {
  const db = loadDb();
  const rows = [["ID","Personel","Masraf Türü","Tutar","Para Birimi","Tarih","Firma Ünvanı","Belge Tarihi","Belge Numarası","Fiş No","Vergi Matrahı","KDV Tutarı","Toplam Tutar","Durum","Açıklama","IBAN"]];
  db.expenses.forEach(e => {
    const u = db.users.find(x => x.id === e.user_id) || {};
    rows.push([e.id, u.name || "", e.expense_type, e.amount, e.currency, e.expense_date, e.company_name || "", e.document_date || "", e.document_number || "", e.receipt_no || "", e.subtotal ?? "", e.vat_amount ?? "", e.total_amount ?? "", statusLabel(e.status), e.description || "", u.iban || ""]);
  });
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=masraflar.csv");
  res.send(makeCsv(rows));
});

app.get("/export/payments.csv", requireLogin, requireRole(["accounting_manager","accounting_staff","finance_manager","finance","admin"]), (req, res) => {
  const db = loadDb();
  const rows = [["ID","Personel","IBAN","Tutar","Para Birimi","Masraf Türü","Durum","Tarih"]];
  db.expenses.filter(e => ["accounting_payment_list","paid"].includes(e.status)).forEach(e => {
    const u = db.users.find(x => x.id === e.user_id) || {};
    rows.push([e.id, u.name || "", u.iban || "", e.amount, e.currency, e.expense_type, statusLabel(e.status), e.expense_date]);
  });
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=muhasebe_odeme_listesi.csv");
  res.send(makeCsv(rows));
});

app.get("/export/users.csv", requireLogin, requireRole(["accounting_manager","accounting_staff","finance_manager","finance","admin"]), (req, res) => {
  const db = loadDb();
  const rows = [["ID","Ad Soyad","Email","Departman","Şirket Rolü","Yetkilisi","Dahili","Durum"]];
  db.users.forEach(u => {
    const m = db.users.find(x => x.id === u.manager_id);
    rows.push([u.id, u.name, u.email, u.department || "", roleLabel(u.role), m ? m.name : "-", u.extension || "", u.active ? "Aktif" : "Pasif"]);
  });
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=personel_listesi.csv");
  res.send(makeCsv(rows));
});

app.get("/users", requireLogin, requireRole(["admin"]), (req, res) => {
  const db = loadDb();
  normalizeSeedData(db);
  const managers = db.users.filter(u => u.active && u.id !== req.session.user.id && (["sales_manager","sales_director","technical_manager","accounting_manager","finance_manager","finance","admin"].includes(u.role) || u.full_access));
  const managerOptions = managers.map(m => `<option value="${m.id}">${m.name}</option>`).join("");
  res.send(layout("Personel", req.session.user, `
    <div class="card">
      <h1>Personel Ekle</h1>
      <form method="post" action="/users">
        <label>Ad Soyad</label><input name="name" required>
        <label>E-posta</label><input name="email" type="email" required>
        <label>Şifre</label><input name="password" type="password" required>
        <label>Rol</label>
        <select name="role">
          <option value="sales_responsible">Satış Sorumlusu</option><option value="sales_manager">Satış Yöneticisi</option><option value="sales_director">Satış Müdürü</option>
          <option value="technical_manager">Teknik Müdür</option><option value="technical_staff">Teknik Destek</option>
          <option value="accounting_staff">Muhasebe Sorumlusu</option><option value="accounting_manager">Muhasebe Müdürü</option>
          <option value="front_office">Ön Büro Sorumlusu</option><option value="marketing_manager">Pazarlama Yöneticisi</option>
          <option value="warehouse">Depo Sorumlusu</option><option value="finance_manager">Finans Müdürü</option><option value="admin">Sistem Yöneticisi</option>
        </select>
        <label>Şirket Rolü (Ekranda Görünen İsim)</label><input name="company_role" placeholder="Örn: Satış Yöneticisi / Şirket Ortağı">
        <label>Yetkilisi / Bağlı Olduğu Müdür</label><select name="manager_id"><option value="">Yok</option>${managerOptions}</select>
        <label>Unvan</label><input name="title">
        <label>Departman</label><input name="department">
        <label>Dahili</label><input name="extension">
        <label>IBAN</label><input name="iban">
        <label>Her şeyi görsün mü?</label><select name="full_access"><option value="false">Hayır</option><option value="true">Evet</option></select>
        <button>Personel Oluştur</button>
      </form>
    </div>
    <div class="card wide">
      <h1>Personel Listesi</h1>
      <p><a class="buttonlink" href="/export/users.csv">Personel CSV / Excel İndir</a></p>
      <table><thead><tr><th>ID</th><th>Ad</th><th>E-posta</th><th>Bölümü</th><th>Şirket Rolü</th><th>Yetkilisi</th><th>Dahili</th><th>Durum</th><th></th><th></th></tr></thead><tbody>
        ${db.users.filter(u => String(u.email || '').toLowerCase() !== 'destek@akuvoxinterkom.com').map(u => {
          const m = db.users.find(x => x.id === u.manager_id);
          const deleteDisabled = u.role === "admin" || u.full_access || u.id === req.session.user.id || u.name === "Celal Eşli" || u.name === "Ozan Güldümen";
          return `<tr>
            <td>${u.id}</td><td>${u.name}</td><td>${u.email}</td><td>${u.department || "-"}</td>
            <td>${displayCompanyRole(u)}</td><td>${m ? m.name : "-"}</td>
            <td>${u.extension || "-"}</td><td>${u.active ? "Aktif" : "Pasif"}</td>
            <td><a href="/users/${u.id}/edit">Düzenle</a></td>
            <td>${deleteDisabled ? "-" : `<a class="buttonlink danger" href="/users/${u.id}/deactivate" onclick="return confirm('Bu personel pasife alınacak. Emin misiniz?');">Pasife Al</a>`}</td>
          </tr>`;
        }).join("")}
      </tbody></table>
    </div>
  `));
});

app.post("/users", requireLogin, requireRole(["admin"]), (req, res) => {
  const db = loadDb();
  const { name, email, password, role, manager_id, iban, title, department, extension, full_access, company_role } = req.body;
  if (db.users.find(u => u.email === email)) return res.send("Bu e-posta zaten var.");
  db.users.push({
    id: db.counters.users++, name, email, password_hash: bcrypt.hashSync(password, 10),
    role, manager_id: manager_id ? Number(manager_id) : null, iban: iban || "",
    company_role: company_role || title || roleLabel(role),
    title: title || "", department: department || "", extension: extension || "",
    active: true, full_access: full_access === "true", created_at: new Date().toISOString()
  });
  saveDb(db);
  res.redirect("/users");
});

app.get("/users/:id/edit", requireLogin, requireRole(["admin"]), (req, res) => {
  const db = loadDb();
  const u = db.users.find(x => x.id === Number(req.params.id));
  if (!u) return res.status(404).send("Kullanıcı bulunamadı");
  const managers = db.users.filter(x => x.active && x.id !== u.id && (["sales_manager","sales_director","technical_manager","accounting_manager","finance_manager","finance","admin"].includes(x.role) || x.full_access));
  const opt = managers.map(m => `<option value="${m.id}" ${u.manager_id === m.id ? "selected" : ""}>${m.name}</option>`).join("");
  const roles = ["sales_responsible","salesperson","sales_manager","sales_director","technical_manager","technical_staff","accounting_staff","accounting_manager","front_office","marketing_manager","warehouse","finance_manager","finance","admin"].map(r => `<option value="${r}" ${u.role === r ? "selected" : ""}>${roleLabel(r)}</option>`).join("");
  res.send(layout("Personel Düzenle", req.session.user, `
    <div class="card">
      <h1>Personel Düzenle</h1>
      <form method="post" action="/users/${u.id}/edit">
        <label>Ad Soyad</label><input name="name" value="${u.name}" required>
        <label>E-posta</label><input name="email" type="email" value="${u.email}" required>
        <label>Yeni Şifre</label><input name="password" type="password" placeholder="Boş bırakırsan değişmez">
        <label>Rol</label><select name="role">${roles}</select>
        <label>Şirket Rolü (Ekranda Görünen İsim)</label><input name="company_role" placeholder="Örn: Satış Yöneticisi / Şirket Ortağı">
        <label>Yetkilisi / Bağlı Olduğu Müdür</label><select name="manager_id"><option value="">Yok</option>${opt}</select>
        <label>Unvan</label><input name="title" value="${u.title || ""}">
        <label>Departman</label><input name="department" value="${u.department || ""}">
        <label>Dahili</label><input name="extension" value="${u.extension || ""}">
        <label>IBAN</label><input name="iban" value="${u.iban || ""}">
        <label>Her şeyi görsün mü?</label><select name="full_access"><option value="false" ${!u.full_access ? "selected" : ""}>Hayır</option><option value="true" ${u.full_access ? "selected" : ""}>Evet</option></select>
        <label>Durum</label><select name="active"><option value="true" ${u.active ? "selected" : ""}>Aktif</option><option value="false" ${!u.active ? "selected" : ""}>Pasif</option></select>
        <button>Kaydet</button>
      </form>
    </div>
  `));
});

app.post("/users/:id/edit", requireLogin, requireRole(["admin"]), (req, res) => {
  const db = loadDb();
  const u = db.users.find(x => x.id === Number(req.params.id));
  if (!u) return res.status(404).send("Kullanıcı bulunamadı");
  const { name, email, password, role, manager_id, iban, title, department, extension, full_access, active, company_role } = req.body;
  const emailExists = db.users.find(x => x.email === email && x.id !== u.id);
  if (emailExists) return res.send("Bu e-posta başka kullanıcıda var.");
  u.name = name; u.email = email;
  if (password) u.password_hash = bcrypt.hashSync(password, 10);
  u.role = role; u.company_role = company_role || title || roleLabel(role); u.manager_id = manager_id ? Number(manager_id) : null;
  u.iban = iban || ""; u.title = title || ""; u.department = department || ""; u.extension = extension || "";
  u.full_access = full_access === "true"; u.active = active === "true";
  saveDb(db);
  res.redirect("/users");
});

app.get("/users/:id/deactivate", requireLogin, requireRole(["admin"]), (req, res) => {
  const db = loadDb();
  const id = Number(req.params.id);
  const u = db.users.find(x => x.id === id);
  if (!u) return res.status(404).send("Kullanıcı bulunamadı");
  if (u.role === "admin" || u.full_access || u.id === req.session.user.id || u.name === "Celal Eşli" || u.name === "Ozan Güldümen") return res.status(403).send("Bu kullanıcı pasife alınamaz.");
  u.active = false;
  saveDb(db);
  res.redirect("/users");
});

app.post("/users/:id/delete", requireLogin, requireRole(["admin"]), (req, res) => {
  const db = loadDb();
  const id = Number(req.params.id);
  const u = db.users.find(x => x.id === id);
  if (!u) return res.status(404).send("Kullanıcı bulunamadı");
  if (u.role === "admin" || u.full_access || u.id === req.session.user.id || u.name === "Celal Eşli" || u.name === "Ozan Güldümen") return res.status(403).send("Bu kullanıcı pasife alınamaz.");
  // Güvenli silme: geçmiş kayıtlar bozulmasın diye fiziki silmiyoruz, pasife alıyoruz.
  u.active = false;
  saveDb(db);
  res.redirect("/users");
});

app.get("/settings", requireLogin, requireRole(["admin"]), (req, res) => {
  res.send(layout("Ayarlar", req.session.user, `
    <div class="card"><h1>Akış Ayarları</h1>
      <ol>
        <li>Satış Sorumlusu masraf girer</li>
        <li>Satış Yöneticisi onaylar</li>
        <li>Satış Müdürü / Ozan onaylar</li>
        <li>Muhasebe Müdürü onaylar</li>
        <li>Finans Müdürü / Celal onaylar</li>
        <li>Muhasebe ödeme listesine düşer ve ödeme sonrası “Ödendi” yapılır</li>
      </ol>
      <p class="muted">Şirket rolü isimleri personel düzenleme ekranından değiştirilebilir. Silme işlemi güvenli şekilde “Pasife Al” mantığıyla çalışır.</p>
    </div>
  `));
});

app.get("/mailbox", requireLogin, requireRole(["admin"]), (req, res) => {
  const db = loadDb();
  res.send(layout("Mail Log", req.session.user, `
    <div class="card"><h1>Mail Log</h1><p class="muted">SMTP tanımlı değilse mail burada log olarak tutulur.</p>
      ${db.mails.slice().reverse().map(m => `<div class="mail"><b>${m.subject}</b><br><small>${m.created_at} | ${m.to} | ${m.sent ? "Gönderildi" : "Loglandı"}</small><pre>${m.text}</pre></div>`).join("") || "<p>Mail log yok.</p>"}
    </div>
  `));
});

app.listen(PORT, () => console.log("Modüler Masraf v4 çalışıyor: http://localhost:" + PORT));
