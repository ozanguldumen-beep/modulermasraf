require("dotenv").config();

const express = require("express");
const session = require("express-session");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, "data");
const UPLOADS_DIR = path.join(__dirname, "uploads");
const DB_FILE = path.join(DATA_DIR, "db.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

function defaultDb() {
  return {
    users: [],
    expenses: [],
    approvals: [],
    counters: { users: 1, expenses: 1, approvals: 1 }
  };
}

function loadDb() {
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify(defaultDb(), null, 2));
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function saveDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function ensureAdmin() {
  const db = loadDb();
  const email = process.env.ADMIN_EMAIL || "admin@modulermasraf.com";
  const password = process.env.ADMIN_PASSWORD || "123456";
  if (!db.users.find(u => u.email === email)) {
    db.users.push({
      id: db.counters.users++,
      name: "Admin",
      email,
      password_hash: bcrypt.hashSync(password, 10),
      role: "admin",
      manager_id: null,
      iban: "",
      active: true,
      created_at: new Date().toISOString()
    });
    saveDb(db);
    console.log("Admin oluşturuldu:", email);
  }
}
ensureAdmin();

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

function roleLabel(role) {
  return {
    salesperson: "Satışçı",
    manager: "Yönetici / Onaycı",
    accounting: "Muhasebe",
    finance: "Finans",
    admin: "Admin"
  }[role] || role;
}

function statusLabel(status) {
  return {
    manager_approval: "Yönetici Onayı Bekliyor",
    accounting_review: "Muhasebe Kontrolünde",
    payment_waiting: "Finans / Ödeme Bekliyor",
    paid: "Ödendi",
    rejected: "Reddedildi",
    missing_document: "Eksik Evrak"
  }[status] || status;
}

function nextStatus(status) {
  return {
    manager_approval: "accounting_review",
    accounting_review: "payment_waiting",
    payment_waiting: "paid",
    missing_document: "manager_approval"
  }[status] || status;
}

function canSeeExpense(user, expense, db) {
  if (["admin", "accounting", "finance"].includes(user.role)) return true;
  if (user.role === "salesperson") return expense.user_id === user.id;
  if (user.role === "manager") {
    const owner = db.users.find(u => u.id === expense.user_id);
    return owner && owner.manager_id === user.id;
  }
  return false;
}

function canActOnExpense(user, expense, db) {
  if (user.role === "admin") return true;
  if (user.role === "manager" && expense.status === "manager_approval") {
    const owner = db.users.find(u => u.id === expense.user_id);
    return owner && owner.manager_id === user.id;
  }
  if (user.role === "accounting" && expense.status === "accounting_review") return true;
  if (user.role === "finance" && expense.status === "payment_waiting") return true;
  return false;
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
    ${user.role === "salesperson" || user.role === "admin" ? `<a href="/expenses/new">Masraf Ekle</a>` : ""}
    <a href="/expenses">Masraflar</a>
    ${["manager","accounting","finance","admin"].includes(user.role) ? `<a href="/approvals">İş Listem</a>` : ""}
    ${["finance","admin"].includes(user.role) ? `<a href="/payments">Ödeme Listesi</a>` : ""}
    ${user.role === "admin" ? `<a href="/users">Personel</a>` : ""}
    <a href="/logout">Çıkış</a>
  </nav>` : ""}
</header>
<main>${content}</main>
</body>
</html>`;
}

app.get("/login", (req, res) => {
  res.send(layout("Giriş", null, `
    <div class="card small">
      <h1>Modüler Masraf</h1>
      <p class="muted">Bağımsız masraf, onay ve ödeme takip sistemi</p>
      <form method="post" action="/login">
        <label>E-posta</label>
        <input name="email" type="email" required>
        <label>Şifre</label>
        <input name="password" type="password" required>
        <button>Giriş Yap</button>
      </form>
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
      <h2>Akış</h2>
      <ol>
        <li>Satışçı masraf girer ve fiş yükler.</li>
        <li>Yönetici / Onaycı onaylar veya reddeder.</li>
        <li>Muhasebe fiş ve uygunluk kontrolü yapar.</li>
        <li>Finans ödeme listesine alır.</li>
        <li>Ödeme yapılınca kayıt “Ödendi” olur.</li>
      </ol>
    </div>
  `));
});

app.get("/expenses/new", requireLogin, (req, res) => {
  const user = req.session.user;
  if (!["salesperson","admin"].includes(user.role)) return res.status(403).send("Masraf girişi yetkiniz yok.");
  res.send(layout("Masraf Ekle", user, `
    <div class="card">
      <h1>Yeni Masraf Talebi</h1>
      <form method="post" action="/expenses" enctype="multipart/form-data">
        <label>Masraf Türü</label>
        <select name="expense_type" required>
          <option>Otopark</option>
          <option>Yemek</option>
          <option>Yakıt / Yol</option>
          <option>Konaklama</option>
          <option>Kargo</option>
          <option>Genel Harcama</option>
          <option>Demirbaş</option>
          <option>Diğer</option>
        </select>

        <label>Tutar</label>
        <input name="amount" type="number" step="0.01" required>

        <label>Para Birimi</label>
        <select name="currency">
          <option>TRY</option>
          <option>USD</option>
          <option>EUR</option>
        </select>

        <label>Masraf Tarihi</label>
        <input name="expense_date" type="date" required>

        <label>Açıklama</label>
        <textarea name="description"></textarea>

        <label>Fiş / Fatura Görseli</label>
        <input name="receipt" type="file" accept="image/*,.pdf">

        <button>Yönetici Onayına Gönder</button>
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
    status: "manager_approval",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
  saveDb(db);
  res.redirect("/expenses");
});

app.get("/expenses", requireLogin, (req, res) => {
  const db = loadDb();
  const user = req.session.user;
  const rows = db.expenses
    .filter(e => canSeeExpense(user, e, db))
    .map(e => ({...e, user_name: (db.users.find(u => u.id === e.user_id) || {}).name || "-"}))
    .sort((a,b) => b.id - a.id);

  res.send(layout("Masraflar", user, `
    <div class="card wide">
      <h1>Masraflar</h1>
      <table>
        <thead><tr><th>ID</th><th>Personel</th><th>Tür</th><th>Tutar</th><th>Tarih</th><th>Durum</th><th>Fiş</th><th></th></tr></thead>
        <tbody>
          ${rows.map(r => `<tr>
            <td>#${r.id}</td>
            <td>${r.user_name}</td>
            <td>${r.expense_type}</td>
            <td>${r.amount} ${r.currency}</td>
            <td>${r.expense_date}</td>
            <td><span class="badge">${statusLabel(r.status)}</span></td>
            <td>${r.receipt_path ? `<a href="${r.receipt_path}" target="_blank">Fiş</a>` : "-"}</td>
            <td><a href="/expenses/${r.id}">Aç</a></td>
          </tr>`).join("") || `<tr><td colspan="8">Kayıt yok.</td></tr>`}
        </tbody>
      </table>
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
  const approvals = db.approvals
    .filter(a => a.expense_id === exp.id)
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
      ` : `<p class="muted">Bu aşamada işlem yetkiniz yok.</p>`}
    </div>

    <div class="card">
      <h2>Onay Geçmişi</h2>
      ${approvals.map(a => `<p><b>${a.user_name}</b> - ${a.action}<br><small>${a.created_at}</small><br>${a.note || ""}</p>`).join("") || "<p>Kayıt yok.</p>"}
    </div>
  `));
});

app.post("/expenses/:id/action", requireLogin, (req, res) => {
  const db = loadDb();
  const user = req.session.user;
  const exp = db.expenses.find(e => e.id === Number(req.params.id));
  if (!exp) return res.status(404).send("Bulunamadı");
  if (!canActOnExpense(user, exp, db)) return res.status(403).send("Bu işlem için yetkiniz yok.");

  const { action, note } = req.body;
  let newStatus = exp.status;

  if (action === "reject") newStatus = "rejected";
  else if (action === "missing_document") newStatus = "missing_document";
  else if (action === "paid" && ["finance","admin"].includes(user.role)) newStatus = "paid";
  else if (action === "approve") newStatus = nextStatus(exp.status);

  exp.status = newStatus;
  exp.updated_at = new Date().toISOString();

  db.approvals.push({
    id: db.counters.approvals++,
    expense_id: exp.id,
    user_id: user.id,
    action: action + " → " + statusLabel(newStatus),
    note: note || "",
    created_at: new Date().toISOString()
  });

  saveDb(db);
  res.redirect("/expenses/" + exp.id);
});

app.get("/approvals", requireLogin, requireRole(["manager","accounting","finance","admin"]), (req, res) => {
  const db = loadDb();
  const user = req.session.user;

  let rows = db.expenses.filter(e => !["paid","rejected"].includes(e.status));

  if (user.role === "manager") {
    rows = rows.filter(e => e.status === "manager_approval" && e.manager_id === user.id);
  } else if (user.role === "accounting") {
    rows = rows.filter(e => e.status === "accounting_review");
  } else if (user.role === "finance") {
    rows = rows.filter(e => e.status === "payment_waiting");
  }

  rows = rows
    .map(e => ({...e, user_name: (db.users.find(u => u.id === e.user_id) || {}).name || "-"}))
    .sort((a,b) => b.id - a.id);

  res.send(layout("İş Listem", user, `
    <div class="card wide">
      <h1>İş Listem</h1>
      <table>
        <thead><tr><th>ID</th><th>Personel</th><th>Tür</th><th>Tutar</th><th>Durum</th><th></th></tr></thead>
        <tbody>
          ${rows.map(r => `<tr>
            <td>#${r.id}</td>
            <td>${r.user_name}</td>
            <td>${r.expense_type}</td>
            <td>${r.amount} ${r.currency}</td>
            <td>${statusLabel(r.status)}</td>
            <td><a href="/expenses/${r.id}">Aç</a></td>
          </tr>`).join("") || `<tr><td colspan="6">Bekleyen kayıt yok.</td></tr>`}
        </tbody>
      </table>
    </div>
  `));
});

app.get("/payments", requireLogin, requireRole(["finance","admin"]), (req, res) => {
  const db = loadDb();
  const rows = db.expenses
    .filter(e => e.status === "payment_waiting")
    .map(e => {
      const u = db.users.find(x => x.id === e.user_id) || {};
      return {...e, user_name: u.name || "-", iban: u.iban || "-"};
    });

  const totalTRY = rows.filter(r => r.currency === "TRY").reduce((sum, r) => sum + Number(r.amount || 0), 0);

  res.send(layout("Ödeme Listesi", req.session.user, `
    <div class="card wide">
      <h1>Ödeme Listesi</h1>
      <p><b>TRY Toplam:</b> ${totalTRY.toFixed(2)} TRY</p>
      <table>
        <thead><tr><th>ID</th><th>Personel</th><th>IBAN</th><th>Tutar</th><th>Tür</th><th></th></tr></thead>
        <tbody>
          ${rows.map(r => `<tr>
            <td>#${r.id}</td>
            <td>${r.user_name}</td>
            <td>${r.iban}</td>
            <td>${r.amount} ${r.currency}</td>
            <td>${r.expense_type}</td>
            <td><a href="/expenses/${r.id}">Aç</a></td>
          </tr>`).join("") || `<tr><td colspan="6">Ödeme bekleyen kayıt yok.</td></tr>`}
        </tbody>
      </table>
    </div>
  `));
});

app.get("/users", requireLogin, requireRole(["admin"]), (req, res) => {
  const db = loadDb();
  const managers = db.users.filter(u => ["manager","admin"].includes(u.role));
  const managerOptions = managers.map(m => `<option value="${m.id}">${m.name}</option>`).join("");

  res.send(layout("Personel", req.session.user, `
    <div class="card">
      <h1>Personel Ekle</h1>
      <form method="post" action="/users">
        <label>Ad Soyad</label>
        <input name="name" required>

        <label>E-posta</label>
        <input name="email" type="email" required>

        <label>Şifre</label>
        <input name="password" type="password" required>

        <label>Rol</label>
        <select name="role">
          <option value="salesperson">Satışçı</option>
          <option value="manager">Yönetici / Onaycı</option>
          <option value="accounting">Muhasebe</option>
          <option value="finance">Finans</option>
          <option value="admin">Admin</option>
        </select>

        <label>Bağlı Olduğu Yönetici</label>
        <select name="manager_id">
          <option value="">Yok</option>
          ${managerOptions}
        </select>

        <label>IBAN</label>
        <input name="iban">

        <button>Personel Oluştur</button>
      </form>
    </div>

    <div class="card wide">
      <h1>Personel Listesi</h1>
      <table>
        <thead><tr><th>ID</th><th>Ad</th><th>E-posta</th><th>Rol</th><th>Yönetici</th><th>IBAN</th></tr></thead>
        <tbody>
          ${db.users.map(u => {
            const m = db.users.find(x => x.id === u.manager_id);
            return `<tr>
              <td>${u.id}</td>
              <td>${u.name}</td>
              <td>${u.email}</td>
              <td>${roleLabel(u.role)}</td>
              <td>${m ? m.name : "-"}</td>
              <td>${u.iban || "-"}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>
  `));
});

app.post("/users", requireLogin, requireRole(["admin"]), (req, res) => {
  const db = loadDb();
  const { name, email, password, role, manager_id, iban } = req.body;

  if (db.users.find(u => u.email === email)) return res.send("Bu e-posta zaten var.");

  db.users.push({
    id: db.counters.users++,
    name,
    email,
    password_hash: bcrypt.hashSync(password, 10),
    role,
    manager_id: manager_id ? Number(manager_id) : null,
    iban: iban || "",
    active: true,
    created_at: new Date().toISOString()
  });

  saveDb(db);
  res.redirect("/users");
});

app.listen(PORT, () => console.log("Modüler Masraf çalışıyor: http://localhost:" + PORT));
