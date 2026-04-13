const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const crypto = require("crypto");

const dbPath = path.join(__dirname, "kkh.db");
const db = new sqlite3.Database(dbPath);

// ─── СОЗДАНИЕ ТАБЛИЦ ─────────────────────
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password_hash TEXT,
      name TEXT,
      surname TEXT,
      phone TEXT,
      email TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER,
      expires_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      total REAL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

// ─── ПАРОЛИ ──────────────────────────────
function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

// ─── USERS ───────────────────────────────
function createUser({ username, password, name, surname }) {
  return new Promise((resolve) => {
    db.run(
      "INSERT INTO users (username, password_hash, name, surname) VALUES (?, ?, ?, ?)",
      [username, hashPassword(password), name, surname],
      function (err) {
        if (err) return resolve({ ok: false });
        resolve({ ok: true, userId: this.lastID });
      }
    );
  });
}

function getUserByUsername(username) {
  return new Promise((resolve) => {
    db.get(
      "SELECT * FROM users WHERE username = ?",
      [username],
      (err, row) => resolve(row)
    );
  });
}

// ─── LOGIN ───────────────────────────────
async function loginUser(username, password) {
  const user = await getUserByUsername(username);
  if (!user) return { ok: false };

  if (user.password_hash !== hashPassword(password))
    return { ok: false };

  const token = generateToken();

  const expires = new Date();
  expires.setDate(expires.getDate() + 30);

  db.run(
    "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)",
    [token, user.id, expires.toISOString()]
  );

  return { ok: true, token, user };
}

// ─── СЕССИЯ ──────────────────────────────
function getSession(token) {
  return new Promise((resolve) => {
    db.get(
      `SELECT users.* FROM sessions 
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.token = ?`,
      [token],
      (err, row) => resolve(row)
    );
  });
}

// ─── EXPORT ──────────────────────────────
module.exports = {
  createUser,
  loginUser,
  getSession
};