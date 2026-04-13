// ─── db.js — база данных на sql.js (чистый JS, не требует компилятора) ────────
const path   = require("path");
const fs     = require("fs");
const crypto = require("crypto");

// sql.js — SQLite скомпилированный в WebAssembly, работает везде без сборки
const initSqlJs = require("sql.js");

const DB_PATH = path.join(__dirname, "data", "kkh.db");

// ─── Singleton: единственный экземпляр БД в памяти ───────────────────────────
let _db = null;

async function getDb() {
  if (_db) return _db;

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    // Загружаем существующую БД из файла
    const fileBuffer = fs.readFileSync(DB_PATH);
    _db = new SQL.Database(fileBuffer);
  } else {
    // Создаём новую БД
    _db = new SQL.Database();
  }

  // Создаём таблицы если их нет
  _db.run(`
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
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token       TEXT PRIMARY KEY,
      user_id     INTEGER NOT NULL,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      expires_at  TEXT    NOT NULL
    );

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
    );
  `);

  persist(); // сохраняем на диск сразу после создания таблиц
  return _db;
}

// Сохранить БД на диск (вызывать после каждой записи)
function persist() {
  if (!_db) return;
  const data = _db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// Хелперы для работы с sql.js (синхронный интерфейс поверх async getDb)
function run(db, sql, params = []) {
  db.run(sql, params);
  persist();
}

function get(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function all(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

// ─── Helpers: пароли и токены ─────────────────────────────────────────────────

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  const verify = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(verify, "hex"));
  } catch { return false; }
}

function generateToken() {
  return crypto.randomBytes(48).toString("hex");
}

// ─── Users ────────────────────────────────────────────────────────────────────

async function createUser({ username, password, name, surname = "" }) {
  const db = await getDb();
  const existing = get(db, "SELECT id FROM users WHERE username = ?", [username.trim().toLowerCase()]);
  if (existing) return { ok: false, error: "username_taken" };

  try {
    run(db,
      "INSERT INTO users (username, password_hash, name, surname) VALUES (?, ?, ?, ?)",
      [username.trim().toLowerCase(), hashPassword(password), name.trim(), surname.trim()]
    );
    const user = get(db, "SELECT * FROM users WHERE username = ?", [username.trim().toLowerCase()]);
    return { ok: true, userId: user.id };
  } catch (e) {
    return { ok: false, error: "db_error" };
  }
}

async function getUserByUsername(username) {
  const db = await getDb();
  return get(db, "SELECT * FROM users WHERE username = ?", [username.trim().toLowerCase()]);
}

async function getUserById(id) {
  const db = await getDb();
  return get(db, "SELECT * FROM users WHERE id = ?", [id]);
}

async function updateUserProfile(userId, { name, surname, phone, email }) {
  const db = await getDb();
  run(db,
    "UPDATE users SET name=?, surname=?, phone=?, email=?, updated_at=datetime('now') WHERE id=?",
    [name, surname, phone, email, userId]
  );
}

async function updateUserPassword(userId, newPassword) {
  const db = await getDb();
  run(db,
    "UPDATE users SET password_hash=?, updated_at=datetime('now') WHERE id=?",
    [hashPassword(newPassword), userId]
  );
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

async function createSession(userId) {
  const db = await getDb();
  const token = generateToken();
  const expires = new Date();
  expires.setDate(expires.getDate() + 30);
  run(db,
    "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)",
    [token, userId, expires.toISOString()]
  );
  return token;
}

async function getSession(token) {
  if (!token) return null;
  const db = await getDb();
  const row = get(db, `
    SELECT s.token, s.user_id, s.expires_at,
           u.username, u.name, u.surname, u.phone, u.email, u.id
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > datetime('now')
  `, [token]);
  return row || null;
}

async function deleteSession(token) {
  const db = await getDb();
  run(db, "DELETE FROM sessions WHERE token = ?", [token]);
}

async function cleanExpiredSessions() {
  const db = await getDb();
  run(db, "DELETE FROM sessions WHERE expires_at <= datetime('now')");
}

// ─── History ──────────────────────────────────────────────────────────────────

async function addHistory(userId, data) {
  const db = await getDb();
  run(db, `
    INSERT INTO history (
      user_id,
      tariff_electric_day, tariff_electric_night, tariff_water, tariff_heat, tariff_gas,
      electric_used_day, electric_sum_day, electric_used_night, electric_sum_night, electric_sum,
      water_used, water_sum, heat_used, heat_sum, gas_used, gas_sum, total
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    userId,
    data.tariff_electric_day,   data.tariff_electric_night,
    data.tariff_water,          data.tariff_heat,    data.tariff_gas,
    data.electric_used_day,     data.electric_sum_day,
    data.electric_used_night,   data.electric_sum_night,  data.electric_sum,
    data.water_used,            data.water_sum,
    data.heat_used,             data.heat_sum,
    data.gas_used,              data.gas_sum,
    data.total
  ]);
}

async function getHistory(userId, limit = 50) {
  const db = await getDb();
  return all(db,
    "SELECT * FROM history WHERE user_id = ? ORDER BY calc_date DESC LIMIT ?",
    [userId, limit]
  );
}

async function clearHistory(userId) {
  const db = await getDb();
  run(db, "DELETE FROM history WHERE user_id = ?", [userId]);
}

// ─── Login ────────────────────────────────────────────────────────────────────

async function loginUser(username, password) {
  const user = await getUserByUsername(username);
  if (!user) return { ok: false, error: "invalid_credentials" };
  if (!verifyPassword(password, user.password_hash))
    return { ok: false, error: "invalid_credentials" };
  const token = await createSession(user.id);
  return { ok: true, token, user };
}

// Чистим просроченные сессии раз в час
setInterval(cleanExpiredSessions, 60 * 60 * 1000);

module.exports = {
  createUser, getUserByUsername, getUserById,
  updateUserProfile, updateUserPassword,
  createSession, getSession, deleteSession,
  addHistory, getHistory, clearHistory,
  loginUser
};
