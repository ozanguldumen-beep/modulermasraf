require('dotenv').config();
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const cron = require('node-cron');

const db = require('./src/db');
const initDb = require('./src/initDb');
initDb();
const audit = require('./src/audit');
const { getRoles, requireLogin, requireRole, canAccessExpense } = require('./src/auth');
const { monthDir, makeStoredName, ensureDir } = require('./src/storage');
const { runGoogleVision } = require('./src/ocr');
const { parseReceiptText } = require('./src/aiParser');
const { evaluateRisk } = require('./src/risk');
const { createApprovalFlow, currentApproval, approveOrReject } = require('./src/approval');
const { cleanupOldReceipts } = require('./src/retention');

const app = express();
const PORT = process.env.PORT || 3000;

ensureDir(path.join(__dirname, 'private_uploads', 'receipts'));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public')));

app.use(session({
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: './' }),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 1000 * 60 * 60 * 8 }
}));

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
});

function flash(req, type, message) { req.session.flash = { type, message }; }

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, monthDir()),
    filename: (req, file, cb) => cb(null, makeStoredName(file.originalname))
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.mimetype);
    cb(ok ? null : new Error('Sadece JPG, PNG, WEBP veya PDF yüklenebilir.'), ok);
  }
});

app.get('/', requireLogin, (req, res) => res.redirect('/dashboard'));

app.get('/login', (req, res) => res.render('login', { title: 'Giriş' }));
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email=? AND is_active=1').get(email);
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(401).render('login', { title: 'Giriş', error: 'E-posta veya şifre hatalı.' });
  }
  const roles = getRoles(user.id);
  req.session.user = { id: user.id, name: user.name, email: user.email, department_id: user.department_id, roles };
  audit(req, 'user', user.id, 'login', 'Kullanıcı giriş yaptı');
  res.redirect('/dashboard');
});
app.post('/logout', requireLogin, (req, res) => req.session.destroy(() => res.redirect('/login')));

app.get('/dashboard', requireLogin, (req, res) => {
  const u = req.session.user;
  const roles = u.roles || [];
  let expenses;
  if (roles.includes('admin') || roles.includes('muhasebe') || roles.includes('finans')) {
    expenses = db.prepare(`SELECT e.*, u.name user_name FROM expenses e JOIN users u ON u.id=e.user_id WHERE e.deleted_at IS NULL ORDER BY e.created_at DESC LIMIT 50`).all();
  } else if (roles.includes('departman_yoneticisi')) {
    expenses = db.prepare(`SELECT e.*, u.name user_name FROM expenses e JOIN users u ON u.id=e.user_id WHERE e.deleted_at IS NULL AND e.department_id=? ORDER BY e.created_at DESC LIMIT 50`).all(u.department_id);
  } else {
    expenses = db.prepare(`SELECT e.*, u.name user_name FROM expenses e JOIN users u ON u.id=e.user_id WHERE e.deleted_at IS NULL AND e.user_id=? ORDER BY e.created_at DESC LIMIT 50`).all(u.id);
  }
  res.render('dashboard', { title: 'Dashboard', expenses });
});

app.get('/expenses/new', requireLogin, (req, res) => {
  const categories = db.prepare('SELECT * FROM expense_categories ORDER BY name').all();
  res.render('expense_new', { title: 'Yeni Masraf', categories });
});

app.post('/expenses', requireLogin, upload.single('receipt'), async (req, res) => {
  try {
    const closeDay = Number(process.env.PERIOD_CLOSE_DAY || 3);
    const now = new Date();
    const docDate = req.body.document_date ? new Date(req.body.document_date) : now;
    if (now.getDate() > closeDay && docDate.getMonth() < now.getMonth() && docDate.getFullYear() === now.getFullYear()) {
      throw new Error(`Ayın ${closeDay}. gününden sonra önceki aya masraf girişi kapalıdır.`);
    }

    const insert = db.prepare(`
      INSERT INTO expenses (user_id, department_id, category_id, title, description, company_name, document_date, document_number, subtotal, vat_amount, total_amount, currency, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')
    `);
    const result = insert.run(
      req.session.user.id,
      req.session.user.department_id,
      req.body.category_id || null,
      req.body.title || 'Masraf',
      req.body.description || '',
      req.body.company_name || '',
      req.body.document_date || '',
      req.body.document_number || '',
      Number(req.body.subtotal || 0),
      Number(req.body.vat_amount || 0),
      Number(req.body.total_amount || 0),
      req.body.currency || 'TRY'
    );
    const expenseId = result.lastInsertRowid;

    if (req.file) {
      db.prepare(`
        INSERT INTO expense_receipts (expense_id, original_filename, stored_filename, mime_type, file_size, storage_path)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(expenseId, req.file.originalname, req.file.filename, req.file.mimetype, req.file.size, req.file.path);
    }

    const expense = db.prepare('SELECT * FROM expenses WHERE id=?').get(expenseId);
    const risk = evaluateRisk(expense);
    db.prepare('UPDATE expenses SET risk_level=?, risk_notes=? WHERE id=?').run(risk.level, risk.notes, expenseId);
    audit(req, 'expense', expenseId, 'create', 'Masraf oluşturuldu');
    flash(req, 'success', 'Masraf kaydı oluşturuldu. OCR okumayı kayıt detayından başlatabilirsiniz.');
    res.redirect(`/expenses/${expenseId}`);
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    const categories = db.prepare('SELECT * FROM expense_categories ORDER BY name').all();
    res.status(400).render('expense_new', { title: 'Yeni Masraf', categories, error: err.message });
  }
});

app.get('/expenses/:id', requireLogin, (req, res) => {
  const expense = db.prepare(`SELECT e.*, u.name user_name FROM expenses e JOIN users u ON u.id=e.user_id WHERE e.id=?`).get(req.params.id);
  if (!canAccessExpense(req.session.user, expense)) return res.status(403).render('error', { title: 'Yetkisiz', message: 'Bu masrafa erişemezsiniz.' });
  const receipts = db.prepare('SELECT * FROM expense_receipts WHERE expense_id=?').all(expense.id);
  const approvals = db.prepare('SELECT * FROM expense_approvals WHERE expense_id=? ORDER BY step_order ASC').all(expense.id);
  const current = currentApproval(expense.id);
  res.render('expense_detail', { title: `Masraf #${expense.id}`, expense, receipts, approvals, current });
});

app.post('/expenses/:id/ocr', requireLogin, async (req, res) => {
  const expense = db.prepare('SELECT * FROM expenses WHERE id=?').get(req.params.id);
  if (!canAccessExpense(req.session.user, expense)) return res.status(403).json({ ok: false, error: 'Yetkisiz' });
  const receipt = db.prepare('SELECT * FROM expense_receipts WHERE expense_id=? ORDER BY id DESC LIMIT 1').get(expense.id);
  if (!receipt) return res.status(400).json({ ok: false, error: 'Fiş dosyası yok.' });

  try {
    const ocrText = await runGoogleVision(receipt.storage_path);
    let parsed = {};
    try { parsed = await parseReceiptText(ocrText); } catch (parseErr) { parsed = { parse_error: parseErr.message }; }
    db.prepare('UPDATE expense_receipts SET ocr_text=?, parsed_ai_json=? WHERE id=?').run(ocrText, JSON.stringify(parsed), receipt.id);

    if (!parsed.parse_error) {
      db.prepare(`
        UPDATE expenses SET company_name=?, document_date=?, document_number=?, subtotal=?, vat_amount=?, total_amount=?, currency=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
      `).run(parsed.company_name || '', parsed.document_date || '', parsed.document_number || '', Number(parsed.subtotal || 0), Number(parsed.vat_amount || 0), Number(parsed.total_amount || 0), parsed.currency || 'TRY', expense.id);
      const updated = db.prepare('SELECT * FROM expenses WHERE id=?').get(expense.id);
      const risk = evaluateRisk(updated);
      db.prepare('UPDATE expenses SET risk_level=?, risk_notes=? WHERE id=?').run(risk.level, risk.notes, expense.id);
    }
    audit(req, 'expense', expense.id, 'ocr_parse', 'OCR ve AI parse çalıştırıldı');
    res.json({ ok: true, ocrText, parsed });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/expenses/:id/submit', requireLogin, (req, res) => {
  const expense = db.prepare('SELECT * FROM expenses WHERE id=?').get(req.params.id);
  if (!canAccessExpense(req.session.user, expense) || expense.user_id !== req.session.user.id) return res.status(403).render('error', { title: 'Yetkisiz', message: 'Sadece kendi masrafınızı gönderebilirsiniz.' });
  const receiptCount = db.prepare('SELECT COUNT(*) c FROM expense_receipts WHERE expense_id=?').get(expense.id).c;
  if (!receiptCount) { flash(req, 'error', 'Fiş/fatura eklemeden gönderemezsiniz.'); return res.redirect(`/expenses/${expense.id}`); }
  if (!expense.description) { flash(req, 'error', 'Açıklama zorunludur.'); return res.redirect(`/expenses/${expense.id}`); }
  db.prepare(`UPDATE expenses SET status='in_approval', submitted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(expense.id);
  createApprovalFlow(expense.id, expense.total_amount);
  const current = currentApproval(expense.id);
  if (current) db.prepare('UPDATE expenses SET current_step=? WHERE id=?').run(current.step_order, expense.id);
  audit(req, 'expense', expense.id, 'submit', 'Masraf onaya gönderildi');
  res.redirect(`/expenses/${expense.id}`);
});

app.post('/expenses/:id/decision', requireLogin, (req, res) => {
  try {
    const expense = db.prepare('SELECT * FROM expenses WHERE id=?').get(req.params.id);
    if (!canAccessExpense(req.session.user, expense)) return res.status(403).render('error', { title: 'Yetkisiz', message: 'Yetkisiz işlem.' });
    approveOrReject(expense.id, req.session.user, req.body.action, req.body.note);
    audit(req, 'expense', expense.id, req.body.action, req.body.note || '');
    res.redirect(`/expenses/${expense.id}`);
  } catch (err) {
    flash(req, 'error', err.message);
    res.redirect(`/expenses/${req.params.id}`);
  }
});

app.post('/expenses/:id/paid', requireRole('finans'), (req, res) => {
  db.prepare(`UPDATE expenses SET status='paid', paid_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='approved'`).run(req.params.id);
  audit(req, 'expense', req.params.id, 'paid', 'Finans ödeme tamamlandı');
  res.redirect(`/expenses/${req.params.id}`);
});

app.get('/receipt/:id/view', requireLogin, (req, res) => {
  const receipt = db.prepare(`SELECT r.*, e.user_id, e.department_id FROM expense_receipts r JOIN expenses e ON e.id=r.expense_id WHERE r.id=?`).get(req.params.id);
  if (!receipt || !canAccessExpense(req.session.user, receipt)) return res.status(403).render('error', { title: 'Yetkisiz', message: 'Bu fişe erişemezsiniz.' });
  res.type(receipt.mime_type);
  res.sendFile(path.resolve(receipt.storage_path));
});

app.get('/admin/users', requireRole('admin'), (req, res) => {
  const users = db.prepare(`SELECT u.*, d.name department_name FROM users u LEFT JOIN departments d ON d.id=u.department_id ORDER BY u.created_at DESC`).all();
  const roles = db.prepare('SELECT * FROM roles ORDER BY name').all();
  const departments = db.prepare('SELECT * FROM departments ORDER BY name').all();
  res.render('admin_users', { title: 'Kullanıcılar', users, roles, departments });
});

app.post('/admin/users', requireRole('admin'), (req, res) => {
  const hash = bcrypt.hashSync(req.body.password || 'ChangeMe123!', 10);
  const info = db.prepare('INSERT INTO users (name,email,password_hash,department_id) VALUES (?,?,?,?)')
    .run(req.body.name, req.body.email, hash, req.body.department_id || null);
  const selectedRoles = Array.isArray(req.body.roles) ? req.body.roles : [req.body.roles].filter(Boolean);
  const roleMap = db.prepare('SELECT id,name FROM roles').all().reduce((a,r)=>{a[r.name]=r.id; return a;}, {});
  const add = db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?,?)');
  selectedRoles.forEach(r => roleMap[r] && add.run(info.lastInsertRowid, roleMap[r]));
  audit(req, 'user', info.lastInsertRowid, 'create', 'Admin kullanıcı oluşturdu');
  res.redirect('/admin/users');
});

app.get('/reports', requireRole('admin', 'muhasebe', 'finans'), (req, res) => {
  const rows = db.prepare(`
    SELECT status, COUNT(*) count, COALESCE(SUM(total_amount),0) total
    FROM expenses WHERE deleted_at IS NULL GROUP BY status
  `).all();
  res.render('reports', { title: 'Raporlar', rows });
});

cron.schedule('10 3 * * *', () => {
  const count = cleanupOldReceipts();
  if (count) console.log('Retention cleanup removed receipts:', count);
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { title: 'Hata', message: err.message || 'Beklenmeyen hata oluştu.' });
});

app.listen(PORT, () => console.log(`Modüler Masraf running on port ${PORT}`));
