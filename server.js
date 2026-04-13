const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const cookieParser = require("cookie-parser");

const app = express();
const PORT = 3000;

// middleware
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

// база
const dbPath = path.join(__dirname, "kkh.db");
const db = new sqlite3.Database(dbPath);

// создаём таблицу
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT,
      name TEXT,
      surname TEXT
    )
  `);
});


// ======================
// 🔐 РЕГИСТРАЦИЯ
// ======================
app.post("/api/register", (req, res) => {
  const { username, password, name, surname } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Нет данных" });
  }

  db.run(
    `INSERT INTO users (username, password, name, surname) VALUES (?, ?, ?, ?)`,
    [username, password, name || "", surname || ""],
    function (err) {
      if (err) {
        return res.status(400).json({ error: "Пользователь уже существует" });
      }

      res.json({ success: true });
    }
  );
});


// ======================
// 🔑 ЛОГИН
// ======================
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;

  db.get(
    `SELECT * FROM users WHERE username = ? AND password = ?`,
    [username, password],
    (err, user) => {
      if (err || !user) {
        return res.status(401).json({ error: "Неверный логин или пароль" });
      }

      res.cookie("session_token", user.id, {
        httpOnly: true,
        secure: true,      // важно для https
        sameSite: "none",  // важно для телефонов
      });

      res.json({ success: true });
    }
  );
});


// ======================
// 👤 ТЕКУЩИЙ ПОЛЬЗОВАТЕЛЬ
// ======================
app.get("/api/me", (req, res) => {
  const userId = req.cookies.session_token;

  if (!userId) {
    return res.json({ user: null });
  }

  db.get(
    `SELECT id, username, name, surname FROM users WHERE id = ?`,
    [userId],
    (err, user) => {
      if (err || !user) {
        return res.json({ user: null });
      }

      res.json({ user });
    }
  );
});


// ======================
// 🚪 ВЫХОД
// ======================
app.post("/api/logout", (req, res) => {
  res.clearCookie("session_token");
  res.json({ success: true });
});


// ======================
// 🚀 ЗАПУСК
// ======================
app.listen(PORT, () => {
  console.log("Server started on port " + PORT);
});