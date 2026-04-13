const sqlite3 = require("sqlite3").verbose();
const path    = require("path");
const crypto  = require("crypto");
const fs      = require("fs");

const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new sqlite3.Database(path.join(DATA_DIR, "kkh.db"));

// Включаем WAL для надёжности
db.run("PRAGMA journal_mode=WAL");

// ─── Хелперы промисов ─────────────────────────────────────────────────────────

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

// ─── Создание таблиц ─────────────────────────────────────────────────────────

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT    NOT NULL,
      name          TEXT    NOT NULL DEFAULT '',
      surname       TEXT    NOT NULL DEFAULT '',
      phone         TEXT    NOT NULL DEFAULT '',
      email         TEXT    NOT NULL DEFAULT '',
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      token       TEXT    PRIMARY KEY,
      user_id     INTEGER NOT NULL,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      expires_at  TEXT    NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS history (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id               INTEGER NOT NULL,
      calc_date             TEXT    NOT NULL DEFAULT (datetime('now')),
      tariff_electric_day   REAL    NOT NULL DEFAULT 0,
      tariff_electric_night REAL    NOT NULL DEFAULT 0,
      tariff_water          REAL    NOT NULL DEFAULT 0,
      tariff_heat           REAL    NOT NULL DEFAULT 0,
      tariff_gas            REAL    NOT NULL DEFAULT 0,
      electric_used_day     REAL    NOT NULL DEFAULT 0,
      electric_sum_day      REAL    NOT NULL DEFAULT 0,
      electric_used_night   REAL    NOT NULL DEFAULT 0,
      electric_sum_night    REAL    NOT NULL DEFAULT 0,
      electric_sum          REAL    NOT NULL DEFAULT 0,
      water_used            REAL    NOT NULL DEFAULT 0,
      water_sum             REAL    NOT NULL DEFAULT 0,
      heat_used             REAL    NOT NULL DEFAULT 0,
      heat_sum              REAL    NOT NULL DEFAULT 0,
      gas_used              REAL    NOT NULL DEFAULT 0,
      gas_sum               REAL    NOT NULL DEFAULT 0,
      total                 REAL    NOT NULL DEFAULT 0
    )
  `);
});

// ─── Пароли ───────────────────────────────────────────────────────────────────

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  try {
    const [salt, hash] = stored.split(":");
    const verify = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(verify, "hex"));
  } catch {
    return false;
  }
}

function generateToken() {
  return crypto.randomBytes(48).toString("hex");
}

// ─── Users ────────────────────────────────────────────────────────────────────

async function createUser({ username, password, name, surname = "" }) {
  const existing = await get(
    "SELECT id FROM users WHERE username = ? COLLATE NOCASE",
    [username.trim()]
  );
  if (existing) return { ok: false, error: "username_taken" };

  try {
    const { lastID } = await run(
      "INSERT INTO users (username, password_hash, name, surname) VALUES (?, ?, ?, ?)",
      [username.trim().toLowerCase(), hashPassword(password), name.trim(), surname.trim()]
    );
    return { ok: true, userId: lastID };
  } catch (e) {
    return { ok: false, error: "db_error" };
  }
}

async function getUserByUsername(username) {
  return get(
    "SELECT * FROM users WHERE username = ? COLLATE NOCASE",
    [username.trim()]
  );
}

async function getUserById(id) {
  return get("SELECT * FROM users WHERE id = ?", [id]);
}

async function updateUserProfile(userId, { name, surname, phone, email }) {
  await run(
    "UPDATE users SET name=?, surname=?, phone=?, email=?, updated_at=datetime('now') WHERE id=?",
    [name, surname, phone, email, userId]
  );
}

async function updateUserPassword(userId, newPassword) {
  await run(
    "UPDATE users SET password_hash=?, updated_at=datetime('now') WHERE id=?",
    [hashPassword(newPassword), userId]
  );
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

async function createSession(userId) {
  const token   = generateToken();
  const expires = new Date();
  expires.setDate(expires.getDate() + 30);
  await run(
    "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)",
    [token, userId, expires.toISOString()]
  );
  return token;
}

async function getSession(token) {
  if (!token) return null;
  return get(`
    SELECT s.user_id, s.token, s.expires_at,
           u.id, u.username, u.name, u.surname, u.phone, u.email,
           u.password_hash
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > datetime('now')
  `, [token]);
}

async function deleteSession(token) {
  await run("DELETE FROM sessions WHERE token = ?", [token]);
}

// Чистим просроченные сессии раз в час
setInterval(() => {
  db.run("DELETE FROM sessions WHERE expires_at <= datetime('now')");
}, 60 * 60 * 1000);

// ─── Login ────────────────────────────────────────────────────────────────────

async function loginUser(username, password) {
  const user = await getUserByUsername(username);
  if (!user) return { ok: false };
  if (!verifyPassword(password, user.password_hash)) return { ok: false };
  const token = await createSession(user.id);
  return { ok: true, token, user };
}

// ─── History ──────────────────────────────────────────────────────────────────

async function addHistory(userId, data) {
  await run(`
    INSERT INTO history (
      user_id,
      tariff_electric_day, tariff_electric_night, tariff_water, tariff_heat, tariff_gas,
      electric_used_day, electric_sum_day, electric_used_night, electric_sum_night, electric_sum,
      water_used, water_sum, heat_used, heat_sum, gas_used, gas_sum, total
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    userId,
    data.tariff_electric_day   || 0, data.tariff_electric_night || 0,
    data.tariff_water          || 0, data.tariff_heat            || 0, data.tariff_gas || 0,
    data.electric_used_day     || 0, data.electric_sum_day       || 0,
    data.electric_used_night   || 0, data.electric_sum_night     || 0, data.electric_sum || 0,
    data.water_used            || 0, data.water_sum              || 0,
    data.heat_used             || 0, data.heat_sum               || 0,
    data.gas_used              || 0, data.gas_sum                || 0,
    data.total
  ]);
}

async function getHistory(userId, limit = 50) {
  return all(
    "SELECT * FROM history WHERE user_id = ? ORDER BY calc_date DESC LIMIT ?",
    [userId, limit]
  );
}

async function clearHistory(userId) {
  await run("DELETE FROM history WHERE user_id = ?", [userId]);
}

// ─── Export ───────────────────────────────────────────────────────────────────

module.exports = {
  createUser, getUserByUsername, getUserById,
  updateUserProfile, updateUserPassword,
  createSession, getSession, deleteSession,
  loginUser, verifyPassword,
  addHistory, getHistory, clearHistory
};
