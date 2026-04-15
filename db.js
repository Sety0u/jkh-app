const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");

const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new sqlite3.Database(path.join(DATA_DIR, "kkh.db"));
db.run("PRAGMA journal_mode=WAL");
db.run("PRAGMA foreign_keys=ON");

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
      expires_at  TEXT    NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS properties (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL,
      title      TEXT    NOT NULL,
      address    TEXT    NOT NULL DEFAULT '',
      note       TEXT    NOT NULL DEFAULT '',
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
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
      total                 REAL    NOT NULL DEFAULT 0,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS tariffs (
      user_id               INTEGER PRIMARY KEY,
      tariff_electric_day   REAL NOT NULL DEFAULT 5.47,
      tariff_electric_night REAL NOT NULL DEFAULT 2.10,
      tariff_water          REAL NOT NULL DEFAULT 42.50,
      tariff_heat           REAL NOT NULL DEFAULT 2100,
      tariff_gas            REAL NOT NULL DEFAULT 7.50,
      updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_history_user_id ON history(user_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_properties_user_id ON properties(user_id)`);
});

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  try {
    const [salt, hash] = String(stored || "").split(":");
    if (!salt || !hash) return false;
    const verify = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(verify, "hex"));
  } catch {
    return false;
  }
}

function generateToken() {
  return crypto.randomBytes(48).toString("hex");
}

async function createUser({ username, password, name, surname = "" }) {
  const normalizedUsername = String(username || "").trim().toLowerCase();
  const existing = await get(
    "SELECT id FROM users WHERE username = ? COLLATE NOCASE",
    [normalizedUsername]
  );
  if (existing) return { ok: false, error: "username_taken" };

  try {
    const { lastID } = await run(
      "INSERT INTO users (username, password_hash, name, surname) VALUES (?, ?, ?, ?)",
      [normalizedUsername, hashPassword(password), String(name || "").trim(), String(surname || "").trim()]
    );
    return { ok: true, userId: lastID };
  } catch {
    return { ok: false, error: "db_error" };
  }
}

async function getUserByUsername(username) {
  return get("SELECT * FROM users WHERE username = ? COLLATE NOCASE", [String(username || "").trim()]);
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

async function createSession(userId) {
  const token = generateToken();
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
  return get(
    `
      SELECT s.user_id, s.token, s.expires_at,
             u.id, u.username, u.name, u.surname, u.phone, u.email, u.password_hash
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token = ? AND s.expires_at > datetime('now')
    `,
    [token]
  );
}

async function deleteSession(token) {
  await run("DELETE FROM sessions WHERE token = ?", [token]);
}

setInterval(() => {
  db.run("DELETE FROM sessions WHERE expires_at <= datetime('now')");
}, 60 * 60 * 1000);

async function loginUser(username, password) {
  const user = await getUserByUsername(username);
  if (!user) return { ok: false };
  if (!verifyPassword(password, user.password_hash)) return { ok: false };
  const token = await createSession(user.id);
  return { ok: true, token, user };
}

async function getTariffs(userId) {
  return get("SELECT * FROM tariffs WHERE user_id = ?", [userId]);
}

async function saveTariffs(userId, t) {
  await run(
    `
      INSERT INTO tariffs (
        user_id,
        tariff_electric_day,
        tariff_electric_night,
        tariff_water,
        tariff_heat,
        tariff_gas,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET
        tariff_electric_day   = excluded.tariff_electric_day,
        tariff_electric_night = excluded.tariff_electric_night,
        tariff_water          = excluded.tariff_water,
        tariff_heat           = excluded.tariff_heat,
        tariff_gas            = excluded.tariff_gas,
        updated_at            = datetime('now')
    `,
    [userId, t.electric_day, t.electric_night, t.water, t.heat, t.gas]
  );
}

async function addHistory(userId, data) {
  await run(
    `
      INSERT INTO history (
        user_id,
        tariff_electric_day, tariff_electric_night, tariff_water, tariff_heat, tariff_gas,
        electric_used_day, electric_sum_day, electric_used_night, electric_sum_night, electric_sum,
        water_used, water_sum, heat_used, heat_sum, gas_used, gas_sum, total
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      userId,
      data.tariff_electric_day || 0,
      data.tariff_electric_night || 0,
      data.tariff_water || 0,
      data.tariff_heat || 0,
      data.tariff_gas || 0,
      data.electric_used_day || 0,
      data.electric_sum_day || 0,
      data.electric_used_night || 0,
      data.electric_sum_night || 0,
      data.electric_sum || 0,
      data.water_used || 0,
      data.water_sum || 0,
      data.heat_used || 0,
      data.heat_sum || 0,
      data.gas_used || 0,
      data.gas_sum || 0,
      data.total || 0,
    ]
  );
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

async function getProperties(userId) {
  return all(
    "SELECT * FROM properties WHERE user_id = ? ORDER BY datetime(updated_at) DESC, id DESC",
    [userId]
  );
}

async function getPropertyById(userId, propertyId) {
  return get("SELECT * FROM properties WHERE id = ? AND user_id = ?", [propertyId, userId]);
}

async function createProperty(userId, { title, address = "", note = "" }) {
  const { lastID } = await run(
    `
      INSERT INTO properties (user_id, title, address, note, created_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
    `,
    [userId, title, address, note]
  );
  return getPropertyById(userId, lastID);
}

async function updateProperty(userId, propertyId, { title, address = "", note = "" }) {
  const existing = await getPropertyById(userId, propertyId);
  if (!existing) return null;

  await run(
    `
      UPDATE properties
      SET title = ?, address = ?, note = ?, updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `,
    [title, address, note, propertyId, userId]
  );

  return getPropertyById(userId, propertyId);
}

async function deleteProperty(userId, propertyId) {
  const existing = await getPropertyById(userId, propertyId);
  if (!existing) return false;
  await run("DELETE FROM properties WHERE id = ? AND user_id = ?", [propertyId, userId]);
  return true;
}

module.exports = {
  createUser,
  getUserByUsername,
  getUserById,
  updateUserProfile,
  updateUserPassword,
  createSession,
  getSession,
  deleteSession,
  loginUser,
  verifyPassword,
  getTariffs,
  saveTariffs,
  addHistory,
  getHistory,
  clearHistory,
  getProperties,
  getPropertyById,
  createProperty,
  updateProperty,
  deleteProperty,
};
