const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const root = path.join(__dirname, '..', 'private_uploads', 'receipts');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function monthDir(date = new Date()) {
  const y = String(date.getFullYear());
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const dir = path.join(root, y, m);
  ensureDir(dir);
  return dir;
}

function safeExt(filename = '') {
  const ext = path.extname(filename).toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.pdf', '.webp'].includes(ext)) return ext;
  return '.bin';
}

function makeStoredName(original) {
  return `${uuidv4()}${safeExt(original)}`;
}

module.exports = { root, ensureDir, monthDir, makeStoredName };
