require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./db');

function run() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      manager_user_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      department_id INTEGER,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(department_id) REFERENCES departments(id)
    );

    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS user_roles (
      user_id INTEGER NOT NULL,
      role_id INTEGER NOT NULL,
      PRIMARY KEY(user_id, role_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(role_id) REFERENCES roles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS expense_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      requires_receipt INTEGER DEFAULT 1,
      monthly_limit REAL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      department_id INTEGER,
      category_id INTEGER,
      title TEXT NOT NULL,
      description TEXT,
      company_name TEXT,
      document_date TEXT,
      document_number TEXT,
      subtotal REAL DEFAULT 0,
      vat_amount REAL DEFAULT 0,
      total_amount REAL DEFAULT 0,
      currency TEXT DEFAULT 'TRY',
      status TEXT DEFAULT 'draft',
      risk_level TEXT DEFAULT 'normal',
      risk_notes TEXT,
      current_step INTEGER DEFAULT 0,
      submitted_at TEXT,
      approved_at TEXT,
      rejected_at TEXT,
      paid_at TEXT,
      deleted_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(department_id) REFERENCES departments(id),
      FOREIGN KEY(category_id) REFERENCES expense_categories(id)
    );

    CREATE TABLE IF NOT EXISTS expense_receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_id INTEGER NOT NULL,
      original_filename TEXT,
      stored_filename TEXT NOT NULL,
      mime_type TEXT,
      file_size INTEGER,
      storage_path TEXT NOT NULL,
      ocr_text TEXT,
      parsed_ai_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(expense_id) REFERENCES expenses(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS approval_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      step_order INTEGER NOT NULL,
      role_name TEXT NOT NULL,
      label TEXT NOT NULL,
      min_amount REAL DEFAULT 0,
      max_amount REAL,
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS expense_approvals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_id INTEGER NOT NULL,
      step_order INTEGER NOT NULL,
      role_name TEXT NOT NULL,
      approver_user_id INTEGER,
      action TEXT DEFAULT 'pending',
      note TEXT,
      acted_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
      FOREIGN KEY(approver_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      action TEXT NOT NULL,
      detail TEXT,
      ip_address TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);

  const roles = ['personel', 'departman_yoneticisi', 'muhasebe', 'finans', 'admin'];
  const insertRole = db.prepare('INSERT OR IGNORE INTO roles (name) VALUES (?)');
  roles.forEach(r => insertRole.run(r));

  db.prepare('INSERT OR IGNORE INTO departments (name) VALUES (?)').run('Genel');
  const genel = db.prepare('SELECT id FROM departments WHERE name=?').get('Genel');

  const cats = ['Yemek', 'Yakıt', 'Konaklama', 'Ulaşım', 'Ofis', 'Müşteri Ziyareti', 'Diğer'];
  const insertCat = db.prepare('INSERT OR IGNORE INTO expense_categories (name) VALUES (?)');
  cats.forEach(c => insertCat.run(c));

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@modulerotomasyon.com';
  const adminPass = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
  const existing = db.prepare('SELECT id FROM users WHERE email=?').get(adminEmail);
  let adminId;
  if (!existing) {
    const hash = bcrypt.hashSync(adminPass, 10);
    const res = db.prepare('INSERT INTO users (name,email,password_hash,department_id) VALUES (?,?,?,?)')
      .run('Sistem Yöneticisi', adminEmail, hash, genel.id);
    adminId = res.lastInsertRowid;
  } else {
    adminId = existing.id;
  }

  const roleRows = db.prepare('SELECT id, name FROM roles').all();
  const addUserRole = db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?,?)');
  roleRows.forEach(r => addUserRole.run(adminId, r.id));

  db.prepare('UPDATE departments SET manager_user_id=? WHERE id=?').run(adminId, genel.id);

  const countSteps = db.prepare('SELECT COUNT(*) as c FROM approval_steps').get().c;
  if (countSteps === 0) {
    const insertStep = db.prepare('INSERT INTO approval_steps (step_order, role_name, label) VALUES (?,?,?)');
    insertStep.run(1, 'departman_yoneticisi', 'Departman Yöneticisi Onayı');
    insertStep.run(2, 'muhasebe', 'Muhasebe Kontrolü');
    insertStep.run(3, 'finans', 'Finans Onayı');
  }

  console.log('Database initialized. Admin:', adminEmail);
}

run();
