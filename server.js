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

function roleLabel(role) {
  return {
    salesperson: "Satışçı",
    sales_manager: "Satış Müdürü",
    technical_manager: "Teknik Müdür",
    technical_staff: "Teknik Destek",
    accounting_staff: "Muhasebe Sorumlusu",
    accounting_manager: "Muhasebe Müdürü",
    front_office: "Ön Büro Sorumlusu",
    marketing_manager: "Pazarlama Yöneticisi",
    warehouse: "Depo Sorumlusu",
    finance: "Finans",
    admin: "Gizli Admin"
  }[role] || role;
}

function statusLabel(status) {
  return {
    sales_manager_approval: "Satış Müdürü Onayı Bekliyor",
    technical_manager_review: "Teknik Müdür Kontrolünde",
    finance_approval: "Finans Onayı Bekliyor",
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

function upsertUser(db, user) {
  const existing = db.users.find(u => u.email === user.email);
  if (existing) {
    // Mevcut kullanıcıyı bozmayalım; eksik yeni alanları tamamlayalım.
    existing.name = existing.name || user.name;
    existing.role = existing.role || user.role;
    existing.department = existing.department || user.department || "";
    existing.title = existing.title || user.title || "";
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
    title: "Elektronik Mühendisi / Satış Müdürü",
    department: "Modüler Otomasyon Yönetim",
    extension: "113",
    full_access: true
  });

  const celalId = upsertUser(db, {
    name: "Celal Eşli",
    email: process.env.CELAL_EMAIL || "celal@modulerotomasyon.com",
    password: process.env.CELAL_PASSWORD || DEFAULT_PASSWORD,
    role: "finance",
    title: "Finans / Ortak",
    department: "Modüler Otomasyon Yönetim",
    full_access: true
  });

  const ferhatId = upsertUser(db, {
    name: "Ferhat Halis Polat",
    email: "halis.polat@modulerotomasyon.com",
    role: "technical_manager",
    title: "Teknik Ekip Müdürü",
    department: "Teknik Departmanı",
    extension: "120",
    manager_id: ozanId
  });

  const serenId = upsertUser(db, {
    name: "Seren Sarıkaya",
    email: "seren.sarikaya@modulerotomasyon.com",
    role: "accounting_manager",
    title: "Muhasebe Müdürü",
    department: "Muhasebe Departmanı",
    extension: "111",
    manager_id: ozanId
  });

  const users = [
    ["Duygu Genç", "duygu.genc@modulerotomasyon.com", "accounting_staff", "Muhasebe", "Muhasebe Departmanı", "112", serenId],
    ["Sıla Sağlam", "sila.saglam@modulerotomasyon.com", "front_office", "Ön Büro Sorumlusu", "Muhasebe Departmanı", "122", serenId],
    ["Abdullah Uğraş", "abdullah.ugras@modulerotomasyon.com", "salesperson", "Satış Yöneticisi", "Satış Departmanı", "117", ozanId],
    ["Özmen Aykaç", "ozmen.aykac@modulerotomasyon.com", "salesperson", "Satış Yöneticisi", "Satış Departmanı", "128", ozanId],
    ["Mustafa Sezgin", "mustafa.sezgin@modulerotomasyon.com", "salesperson", "Satış Yöneticisi", "Satış Departmanı", "126", ozanId],
    ["Berkay Ulufer", "berkay.ulufer@modulerotomasyon.com", "salesperson", "Satış Yöneticisi", "Satış Departmanı", "114", ozanId],
    ["Semih Vardarboylu", "semih.vardarboylu@modulerotomasyon.com", "salesperson", "Satış Yöneticisi", "Satış Departmanı", "123", ozanId],
    ["Gizem Özdamar", "gizem.ozdamar@modulerotomasyon.com", "marketing_manager", "Pazarlama Yöneticisi", "Pazarlama Departmanı", "121", ozanId],
    ["Onur Can Yıldırım", "onurcan.yildirim@modulerotomasyon.com", "technical_staff", "Teknik Destek", "Teknik Departmanı", "115", ferhatId],
    ["Güven İrgin", "guven.irgin@modulerotomasyon.com", "technical_staff", "Teknik Destek", "Teknik Departmanı", "119", ferhatId],
    ["Furkan Türkmenli", "furkan.turkmenli@akuvoxinterkom.com", "warehouse", "Depo Sorumlusu", "Teknik Departmanı", "116", ferhatId],
    ["Efe Atıl", "efe.atil@modulerotomasyon.com", "technical_staff", "Teknik Destek", "Teknik Departmanı", "124", ferhatId],
    ["Destek Mail", "destek@akuvoxinterkom.com", "technical_staff", "Destek Mail", "Teknik Departmanı", "", ferhatId]
  ];

  users.forEach(([name, email, role, title, department, extension, manager_id]) => {
    upsertUser(db, { name, email, role, title, department, extension, manager_id });
  });

  saveDb(db);
}
ensureSeedUsers();

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
      sales_manager_approval: "technical_manager_review",
      technical_manager_review: "finance_approval",
      finance_approval: "accounting_payment_list",
      accounting_payment_list: "paid",
      missing_document: "sales_manager_approval"
    }[status] || status;
  }
  if (user.role === "sales_manager" && status === "sales_manager_approval") return "technical_manager_review";
  if (user.role === "technical_manager" && status === "technical_manager_review") return "finance_approval";
  if (user.role === "finance" && status === "finance_approval") return "accounting_payment_list";
  if (["accounting_manager","accounting_staff"].includes(user.role) && status === "accounting_payment_list") return "paid";
  return status;
}

function canSeeExpense(user, expense, db) {
  const u = dbUserFor(user, db);
  if (user.role === "admin" || (u && u.full_access)) return true;
  if (["accounting_manager", "accounting_staff", "finance"].includes(user.role)) return true;
  if (user.role === "salesperson" || ["technical_staff","warehouse","front_office","marketing_manager"].includes(user.role)) return expense.user_id === user.id;
  if (user.role === "sales_manager") {
    const owner = db.users.find(x => x.id === expense.user_id);
    return owner && owner.manager_id === user.id;
  }
  if (user.role === "technical_manager") {
    const owner = db.users.find(x => x.id === expense.user_id);
    return (owner && owner.manager_id === user.id) || ["technical_manager_review", "finance_approval", "accounting_payment_list", "paid"].includes(expense.status);
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
  if (user.role === "technical_manager" && expense.status === "technical_manager_review") return true;
  if (user.role === "finance" && expense.status === "finance_approval") return true;
  if (["accounting_manager","accounting_staff"].includes(user.role) && expense.status === "accounting_payment_list") return true;
  return false;
}

function actionOptions(user, expense) {
  if (["accounting_manager","accounting_staff"].includes(user.role) && expense.status === "accounting_payment_list") {
    return `<option value="paid">Ödendi Yap</option><option value="missing_document">Eksik Evrak</option>`;
  }
  return `<option value="approve">Onayla / Sonraki Aşamaya Geçir</option><option value="missing_document">Eksik Evrak</option><option value="reject">Reddet</option>`;
}

function canCreateExpense(role) {
  return ["salesperson","technical_staff","warehouse","front_office","marketing_manager","admin"].includes(role);
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
<title>${title}</title><link rel="stylesheet" href="/public/style.css">
</head><body>
<header><div class="brand">Modüler Masraf</div>
${user ? `<nav>
  <a href="/">Panel</a>
  ${canCreateExpense(user.role) ? `<a href="/expenses/new">Masraf Ekle</a>` : ""}
  <a href="/expenses">Masraflar</a>
  ${["sales_manager","technical_manager","finance","accounting_manager","accounting_staff","admin"].includes(user.role) ? `<a href="/work">İş Listem</a>` : ""}
  ${["accounting_manager","accounting_staff","finance","admin"].includes(user.role) ? `<a href="/reports">Rapor / Excel</a>` : ""}
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
        <li>Personel masraf girer ve fiş yükler.</li>
        <li>İlk yetkili müdür kontrol eder.</li>
        <li>Teknik Müdür Ferhat teknik uygunluğu kontrol eder.</li>
        <li>Finans Celal onaylar.</li>
        <li>Onaylanan ödeme listesi muhasebe birimine düşer.</li>
        <li>Muhasebe ödeme sonrası “Ödendi” yapar.</li>
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
        <label>Tutar</label><input name="amount" type="number" step="0.01" required>
        <label>Para Birimi</label><select name="currency"><option>TRY</option><option>USD</option><option>EUR</option></select>
        <label>Masraf Tarihi</label><input name="expense_date" type="date" required>
        <label>Açıklama</label><textarea name="description"></textarea>
        <label>Fiş / Fatura Görseli</label><input name="receipt" type="file" accept="image/*,.pdf">
        <button>Onaya Gönder</button>
      </form>
    </div>
  `));
});

app.post("/expenses", requireLogin, upload.single("receipt"), (req, res) => {
  const db = loadDb();
  const user = db.users.find(u => u.id === req.session.user.id);
  const { expense_type, amount, currency, expense_date, description } = req.body;
  db.expenses.push({
    id: db.counters.expenses++,
    user_id: user.id,
    manager_id: user.manager_id || null,
    expense_type,
    amount: Number(amount),
    currency: currency || "TRY",
    expense_date,
    description: description || "",
    receipt_path: req.file ? "/uploads/" + req.file.filename : "",
    status: "sales_manager_approval",
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

app.get("/work", requireLogin, requireRole(["sales_manager","technical_manager","finance","accounting_manager","accounting_staff","admin"]), (req, res) => {
  const db = loadDb();
  const user = req.session.user;
  let rows = db.expenses.filter(e => !["paid","rejected"].includes(e.status));
  if (user.role === "sales_manager") rows = rows.filter(e => e.status === "sales_manager_approval" && e.manager_id === user.id);
  if (user.role === "technical_manager") rows = rows.filter(e => e.status === "technical_manager_review");
  if (user.role === "finance") rows = rows.filter(e => e.status === "finance_approval");
  if (["accounting_manager","accounting_staff"].includes(user.role)) rows = rows.filter(e => e.status === "accounting_payment_list");
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

app.get("/reports", requireLogin, requireRole(["accounting_manager","accounting_staff","finance","admin"]), (req, res) => {
  res.send(layout("Rapor / Excel", req.session.user, `
    <div class="card">
      <h1>Rapor / Excel</h1>
      <p><a class="buttonlink" href="/export/expenses.csv">Tüm Masraflar CSV / Excel</a></p>
      <p><a class="buttonlink" href="/export/payments.csv">Muhasebe Ödeme Listesi CSV / Excel</a></p>
      <p><a class="buttonlink" href="/export/users.csv">Personel Listesi CSV / Excel</a></p>
    </div>
  `));
});

app.get("/export/expenses.csv", requireLogin, requireRole(["accounting_manager","accounting_staff","finance","admin"]), (req, res) => {
  const db = loadDb();
  const rows = [["ID","Personel","Masraf Türü","Tutar","Para Birimi","Tarih","Durum","Açıklama","IBAN"]];
  db.expenses.forEach(e => {
    const u = db.users.find(x => x.id === e.user_id) || {};
    rows.push([e.id, u.name || "", e.expense_type, e.amount, e.currency, e.expense_date, statusLabel(e.status), e.description || "", u.iban || ""]);
  });
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=masraflar.csv");
  res.send(makeCsv(rows));
});

app.get("/export/payments.csv", requireLogin, requireRole(["accounting_manager","accounting_staff","finance","admin"]), (req, res) => {
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

app.get("/export/users.csv", requireLogin, requireRole(["accounting_manager","accounting_staff","finance","admin"]), (req, res) => {
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
  const managers = db.users.filter(u => ["sales_manager","technical_manager","admin"].includes(u.role) && u.active);
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
          <option value="salesperson">Satışçı</option><option value="sales_manager">Satış Müdürü</option>
          <option value="technical_manager">Teknik Müdür</option><option value="technical_staff">Teknik Destek</option>
          <option value="accounting_staff">Muhasebe Sorumlusu</option><option value="accounting_manager">Muhasebe Müdürü</option>
          <option value="front_office">Ön Büro Sorumlusu</option><option value="marketing_manager">Pazarlama Yöneticisi</option>
          <option value="warehouse">Depo Sorumlusu</option><option value="finance">Finans</option><option value="admin">Gizli Admin</option>
        </select>
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
        ${db.users.map(u => {
          const m = db.users.find(x => x.id === u.manager_id);
          const deleteDisabled = u.role === "admin" || u.id === req.session.user.id;
          return `<tr>
            <td>${u.id}</td><td>${u.name}</td><td>${u.email}</td><td>${u.department || "-"}</td>
            <td>${roleLabel(u.role)}${u.full_access ? " / Tam Yetki" : ""}</td><td>${m ? m.name : "-"}</td>
            <td>${u.extension || "-"}</td><td>${u.active ? "Aktif" : "Pasif"}</td>
            <td><a href="/users/${u.id}/edit">Düzenle</a></td>
            <td>${deleteDisabled ? "-" : `<form method="post" action="/users/${u.id}/delete" onsubmit="return confirm('Bu personel pasife alınacak. Emin misiniz?');"><button class="danger" type="submit">Sil</button></form>`}</td>
          </tr>`;
        }).join("")}
      </tbody></table>
    </div>
  `));
});

app.post("/users", requireLogin, requireRole(["admin"]), (req, res) => {
  const db = loadDb();
  const { name, email, password, role, manager_id, iban, title, department, extension, full_access } = req.body;
  if (db.users.find(u => u.email === email)) return res.send("Bu e-posta zaten var.");
  db.users.push({
    id: db.counters.users++, name, email, password_hash: bcrypt.hashSync(password, 10),
    role, manager_id: manager_id ? Number(manager_id) : null, iban: iban || "",
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
  const managers = db.users.filter(x => ["sales_manager","technical_manager","admin"].includes(x.role) && x.id !== u.id && x.active);
  const opt = managers.map(m => `<option value="${m.id}" ${u.manager_id === m.id ? "selected" : ""}>${m.name}</option>`).join("");
  const roles = ["salesperson","sales_manager","technical_manager","technical_staff","accounting_staff","accounting_manager","front_office","marketing_manager","warehouse","finance","admin"].map(r => `<option value="${r}" ${u.role === r ? "selected" : ""}>${roleLabel(r)}</option>`).join("");
  res.send(layout("Personel Düzenle", req.session.user, `
    <div class="card">
      <h1>Personel Düzenle</h1>
      <form method="post" action="/users/${u.id}/edit">
        <label>Ad Soyad</label><input name="name" value="${u.name}" required>
        <label>E-posta</label><input name="email" type="email" value="${u.email}" required>
        <label>Yeni Şifre</label><input name="password" type="password" placeholder="Boş bırakırsan değişmez">
        <label>Rol</label><select name="role">${roles}</select>
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
  const { name, email, password, role, manager_id, iban, title, department, extension, full_access, active } = req.body;
  const emailExists = db.users.find(x => x.email === email && x.id !== u.id);
  if (emailExists) return res.send("Bu e-posta başka kullanıcıda var.");
  u.name = name; u.email = email;
  if (password) u.password_hash = bcrypt.hashSync(password, 10);
  u.role = role; u.manager_id = manager_id ? Number(manager_id) : null;
  u.iban = iban || ""; u.title = title || ""; u.department = department || ""; u.extension = extension || "";
  u.full_access = full_access === "true"; u.active = active === "true";
  saveDb(db);
  res.redirect("/users");
});

app.post("/users/:id/delete", requireLogin, requireRole(["admin"]), (req, res) => {
  const db = loadDb();
  const id = Number(req.params.id);
  const u = db.users.find(x => x.id === id);
  if (!u) return res.status(404).send("Kullanıcı bulunamadı");
  if (u.role === "admin" || u.id === req.session.user.id) return res.status(403).send("Admin veya kendi kullanıcınız silinemez.");
  // Güvenli silme: geçmiş kayıtlar bozulmasın diye fiziki silmiyoruz, pasife alıyoruz.
  u.active = false;
  saveDb(db);
  res.redirect("/users");
});

app.get("/settings", requireLogin, requireRole(["admin"]), (req, res) => {
  res.send(layout("Ayarlar", req.session.user, `
    <div class="card"><h1>Akış Ayarları</h1>
      <ol>
        <li>Personel masraf girer</li>
        <li>Yetkili müdür kontrol eder</li>
        <li>Teknik Müdür kontrol eder</li>
        <li>Finans onaylar</li>
        <li>Muhasebe ödeme listesine düşer</li>
        <li>Muhasebe ödeme sonrası “Ödendi” yapar</li>
      </ol>
      <p class="muted">Sil butonu güvenli silme yapar: kullanıcıyı pasife alır, geçmiş masraf kayıtlarını bozmaz.</p>
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
