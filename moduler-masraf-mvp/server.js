require("dotenv").config();

const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

const db = new Database(path.join(__dirname, "data.sqlite"));

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'employee',
  manager1_id INTEGER,
  manager2_id INTEGER,
  iban TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  expense_type TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'TRY',
  expense_date TEXT NOT NULL,
  description TEXT,
  receipt_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending_approval_1',
  manager1_id INTEGER,
  manager2_id INTEGER,
  accounting_note TEXT,
  finance_note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS approvals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(expense_id) REFERENCES expenses(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);
`);

function ensureAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL || "ozan@modulerotomasyon.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "123456";
  const existing = db.prepare("SELECT * FROM users WHERE email = ?").get(adminEmail);
  if (!existing) {
    const hash = bcrypt.hashSync(adminPassword, 10);
    db.prepare(`
      INSERT INTO users (name, email, password_hash, role)
      VALUES (?, ?, ?, ?)
    `).run("Ozan Güldümen", adminEmail, hash, "admin");
    console.log("Admin kullanıcı oluşturuldu:", adminEmail);
  }
}
ensureAdmin();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use("/uploads", express.static(uploadsDir));
app.use("/public", express.static(path.join(__dirname, "public")));

app.use(session({
  store: new SQLiteStore({ db: "sessions.sqlite", dir: __dirname }),
  secret: process.env.SESSION_SECRET || "change-this-secret",
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 }
}));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
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

function layout(title, user, content) {
  return `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <link rel="stylesheet" href="/public/style.css">
</head>
<body>
  <header>
    <div class="brand">Modüler Masraf</div>
    ${user ? `<nav>
      <a href="/">Panel</a>
      <a href="/expenses/new">Masraf Ekle</a>
      <a href="/expenses">Masraflar</a>
      ${["admin","approver","accounting","finance"].includes(user.role) ? `<a href="/approvals">Onaylar</a>` : ""}
      ${user.role === "admin" ? `<a href="/users">Personel</a>` : ""}
      <a href="/logout">Çıkış</a>
    </nav>` : ""}
  </header>
  <main>${content}</main>
</body>
</html>`;
}

function statusLabel(status) {
  const map = {
    pending_approval_1: "1. Onay Bekliyor",
    pending_approval_2: "2. Onay Bekliyor",
    accounting_review: "Muhasebe Kontrolünde",
    payment_waiting: "Ödeme Bekliyor",
    paid: "Ödendi",
    rejected: "Reddedildi",
    missing_document: "Eksik Evrak"
  };
  return map[status] || status;
}

function roleLabel(role) {
  const map = {
    admin: "Admin",
    employee: "Personel",
    approver: "Onaycı",
    accounting: "Muhasebe",
    finance: "Finans"
  };
  return map[role] || role;
}

app.get("/login", (req, res) => {
  res.send(layout("Giriş", null, `
    <div class="card small">
      <h1>Giriş</h1>
      <form method="post" action="/login">
        <label>E-posta</label>
        <input name="email" type="email" required>
        <label>Şifre</label>
        <input name="password" type="password" required>
        <button>Giriş Yap</button>
      </form>
      <p class="muted">Varsayılan admin bilgileri .env dosyasındadır.</p>
    </div>
  `));
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE email = ? AND active = 1").get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.send(layout("Giriş", null, `<div class="card small"><h1>Hatalı giriş</h1><a href="/login">Tekrar dene</a></div>`));
  }
  req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
  res.redirect("/");
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

app.get("/", requireLogin, (req, res) => {
  const user = req.session.user;
  const myCount = db.prepare("SELECT COUNT(*) c FROM expenses WHERE user_id = ?").get(user.id).c;
  const pending = db.prepare("SELECT COUNT(*) c FROM expenses WHERE status IN ('pending_approval_1','pending_approval_2','accounting_review','payment_waiting')").get().c;
  res.send(layout("Panel", user, `
    <div class="grid">
      <div class="card"><h2>Hoş geldin</h2><p>${user.name}</p><p class="badge">${roleLabel(user.role)}</p></div>
      <div class="card"><h2>Benim Masraflarım</h2><p class="big">${myCount}</p></div>
      <div class="card"><h2>Açık İşler</h2><p class="big">${pending}</p></div>
    </div>
    <div class="card">
      <h2>Akış</h2>
      <ol>
        <li>Personel masraf girer.</li>
        <li>1. onaycı kontrol eder.</li>
        <li>2. onaycı kontrol eder.</li>
        <li>Muhasebe evrakı kontrol eder.</li>
        <li>Finans ödeme bekliyor aşamasına alır.</li>
        <li>Ödendi olarak kapatılır.</li>
      </ol>
    </div>
  `));
});

app.get("/expenses/new", requireLogin, (req, res) => {
  const user = req.session.user;
  res.send(layout("Masraf Ekle", user, `
    <div class="card">
      <h1>Yeni Masraf Talebi</h1>
      <form method="post" action="/expenses" enctype="multipart/form-data">
        <label>Masraf Türü</label>
        <select name="expense_type" required>
          <option>Otopark</option><option>Yemek</option><option>Yakıt / Yol</option>
          <option>Konaklama</option><option>Kargo</option><option>Genel Harcama</option>
          <option>Demirbaş</option><option>Diğer</option>
        </select>
        <label>Tutar</label>
        <input name="amount" type="number" step="0.01" required>
        <label>Para Birimi</label>
        <select name="currency"><option>TRY</option><option>USD</option><option>EUR</option></select>
        <label>Masraf Tarihi</label>
        <input name="expense_date" type="date" required>
        <label>Açıklama</label>
        <textarea name="description"></textarea>
        <label>Fiş / Fatura Görseli</label>
        <input name="receipt" type="file" accept="image/*,.pdf">
        <button>Onaya Gönder</button>
      </form>
    </div>
  `));
});

app.post("/expenses", requireLogin, upload.single("receipt"), (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.session.user.id);
  const { expense_type, amount, currency, expense_date, description } = req.body;
  const receiptPath = req.file ? "/uploads/" + req.file.filename : null;

  db.prepare(`
    INSERT INTO expenses
    (user_id, expense_type, amount, currency, expense_date, description, receipt_path, status, manager1_id, manager2_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    user.id,
    expense_type,
    Number(amount),
    currency || "TRY",
    expense_date,
    description || "",
    receiptPath,
    "pending_approval_1",
    user.manager1_id,
    user.manager2_id
  );

  res.redirect("/expenses");
});

app.get("/expenses", requireLogin, (req, res) => {
  const user = req.session.user;
  let rows;
  if (["admin","accounting","finance","approver"].includes(user.role)) {
    rows = db.prepare(`
      SELECT e.*, u.name user_name FROM expenses e
      JOIN users u ON u.id = e.user_id
      ORDER BY e.id DESC
    `).all();
  } else {
    rows = db.prepare(`
      SELECT e.*, u.name user_name FROM expenses e
      JOIN users u ON u.id = e.user_id
      WHERE e.user_id = ?
      ORDER BY e.id DESC
    `).all(user.id);
  }

  const table = rows.map(r => `
    <tr>
      <td>#${r.id}</td>
      <td>${r.user_name}</td>
      <td>${r.expense_type}</td>
      <td>${r.amount} ${r.currency}</td>
      <td>${r.expense_date}</td>
      <td><span class="badge">${statusLabel(r.status)}</span></td>
      <td>${r.receipt_path ? `<a href="${r.receipt_path}" target="_blank">Fiş</a>` : "-"}</td>
      <td><a href="/expenses/${r.id}">Aç</a></td>
    </tr>
  `).join("");

  res.send(layout("Masraflar", user, `
    <div class="card wide">
      <h1>Masraflar</h1>
      <table>
        <thead><tr><th>ID</th><th>Personel</th><th>Tür</th><th>Tutar</th><th>Tarih</th><th>Durum</th><th>Fiş</th><th></th></tr></thead>
        <tbody>${table || `<tr><td colspan="8">Kayıt yok.</td></tr>`}</tbody>
      </table>
    </div>
  `));
});

app.get("/expenses/:id", requireLogin, (req, res) => {
  const user = req.session.user;
  const exp = db.prepare(`
    SELECT e.*, u.name user_name FROM expenses e
    JOIN users u ON u.id = e.user_id
    WHERE e.id = ?
  `).get(req.params.id);

  if (!exp) return res.status(404).send("Bulunamadı");
  if (user.role === "employee" && exp.user_id !== user.id) return res.status(403).send("Yetkiniz yok.");

  const approvals = db.prepare(`
    SELECT a.*, u.name user_name FROM approvals a
    JOIN users u ON u.id = a.user_id
    WHERE a.expense_id = ?
    ORDER BY a.id DESC
  `).all(exp.id);

  const canAction = ["admin","approver","accounting","finance"].includes(user.role);

  res.send(layout("Masraf Detay", user, `
    <div class="card">
      <h1>Masraf #${exp.id}</h1>
      <p><b>Personel:</b> ${exp.user_name}</p>
      <p><b>Tür:</b> ${exp.expense_type}</p>
      <p><b>Tutar:</b> ${exp.amount} ${exp.currency}</p>
      <p><b>Tarih:</b> ${exp.expense_date}</p>
      <p><b>Durum:</b> <span class="badge">${statusLabel(exp.status)}</span></p>
      <p><b>Açıklama:</b><br>${exp.description || "-"}</p>
      ${exp.receipt_path ? `<p><a class="buttonlink" href="${exp.receipt_path}" target="_blank">Fişi Aç</a></p>` : ""}
      ${canAction ? `
        <form method="post" action="/expenses/${exp.id}/action">
          <label>İşlem</label>
          <select name="action" required>
            <option value="approve">Onayla / Sonraki Aşamaya Geçir</option>
            <option value="missing_document">Eksik Evrak</option>
            <option value="reject">Reddet</option>
            <option value="paid">Ödendi Yap</option>
          </select>
          <label>Not</label>
          <textarea name="note"></textarea>
          <button>Kaydet</button>
        </form>
      ` : ""}
    </div>
    <div class="card">
      <h2>Onay Geçmişi</h2>
      ${approvals.map(a => `<p><b>${a.user_name}</b> - ${a.action}<br><small>${a.created_at}</small><br>${a.note || ""}</p>`).join("") || "<p>Kayıt yok.</p>"}
    </div>
  `));
});

app.post("/expenses/:id/action", requireLogin, requireRole(["admin","approver","accounting","finance"]), (req, res) => {
  const user = req.session.user;
  const exp = db.prepare("SELECT * FROM expenses WHERE id = ?").get(req.params.id);
  if (!exp) return res.status(404).send("Bulunamadı");

  const { action, note } = req.body;
  let newStatus = exp.status;

  if (action === "reject") newStatus = "rejected";
  else if (action === "missing_document") newStatus = "missing_document";
  else if (action === "paid") newStatus = "paid";
  else if (action === "approve") {
    const flow = {
      pending_approval_1: "pending_approval_2",
      pending_approval_2: "accounting_review",
      accounting_review: "payment_waiting",
      payment_waiting: "paid",
      missing_document: "pending_approval_1"
    };
    newStatus = flow[exp.status] || exp.status;
  }

  db.prepare("UPDATE expenses SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(newStatus, exp.id);
  db.prepare("INSERT INTO approvals (expense_id, user_id, action, note) VALUES (?, ?, ?, ?)").run(exp.id, user.id, action + " → " + statusLabel(newStatus), note || "");

  res.redirect("/expenses/" + exp.id);
});

app.get("/approvals", requireLogin, requireRole(["admin","approver","accounting","finance"]), (req, res) => {
  const user = req.session.user;
  const rows = db.prepare(`
    SELECT e.*, u.name user_name FROM expenses e
    JOIN users u ON u.id = e.user_id
    WHERE e.status NOT IN ('paid','rejected')
    ORDER BY e.id DESC
  `).all();

  res.send(layout("Onaylar", user, `
    <div class="card wide">
      <h1>Onay / Muhasebe / Finans Bekleyenler</h1>
      <table>
        <thead><tr><th>ID</th><th>Personel</th><th>Tür</th><th>Tutar</th><th>Durum</th><th></th></tr></thead>
        <tbody>${rows.map(r => `
          <tr><td>#${r.id}</td><td>${r.user_name}</td><td>${r.expense_type}</td><td>${r.amount} ${r.currency}</td><td>${statusLabel(r.status)}</td><td><a href="/expenses/${r.id}">Aç</a></td></tr>
        `).join("") || `<tr><td colspan="6">Bekleyen kayıt yok.</td></tr>`}</tbody>
      </table>
    </div>
  `));
});

app.get("/users", requireLogin, requireRole(["admin"]), (req, res) => {
  const user = req.session.user;
  const users = db.prepare("SELECT * FROM users ORDER BY id DESC").all();

  res.send(layout("Personel", user, `
    <div class="card">
      <h1>Personel Ekle</h1>
      <form method="post" action="/users">
        <label>Ad Soyad</label><input name="name" required>
        <label>E-posta</label><input name="email" type="email" required>
        <label>Şifre</label><input name="password" type="password" required>
        <label>Rol</label>
        <select name="role">
          <option value="employee">Personel</option>
          <option value="approver">Onaycı</option>
          <option value="accounting">Muhasebe</option>
          <option value="finance">Finans</option>
          <option value="admin">Admin</option>
        </select>
        <label>IBAN</label><input name="iban">
        <button>Personel Oluştur</button>
      </form>
    </div>
    <div class="card wide">
      <h1>Personel Listesi</h1>
      <table>
        <thead><tr><th>ID</th><th>Ad</th><th>E-posta</th><th>Rol</th><th>IBAN</th></tr></thead>
        <tbody>${users.map(u => `<tr><td>${u.id}</td><td>${u.name}</td><td>${u.email}</td><td>${roleLabel(u.role)}</td><td>${u.iban || "-"}</td></tr>`).join("")}</tbody>
      </table>
    </div>
  `));
});

app.post("/users", requireLogin, requireRole(["admin"]), (req, res) => {
  const { name, email, password, role, iban } = req.body;
  const hash = bcrypt.hashSync(password, 10);
  try {
    db.prepare(`
      INSERT INTO users (name, email, password_hash, role, iban)
      VALUES (?, ?, ?, ?, ?)
    `).run(name, email, hash, role, iban || "");
  } catch (err) {
    return res.send("Kullanıcı eklenemedi: " + err.message);
  }
  res.redirect("/users");
});

app.listen(PORT, () => {
  console.log("Modüler Masraf çalışıyor: http://localhost:" + PORT);
});
