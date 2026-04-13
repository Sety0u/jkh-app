const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const cookieParser = require("cookie-parser");

const app = express();
const PORT = 3000;

// --- MIDDLEWARE ---
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

// --- DATABASE ---
const dbPath = path.join(__dirname, "kkh.db");
const db = new sqlite3.Database(dbPath);

// --- CREATE TABLE ---
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

// --- REGISTER ---
app.post("/api/register", (req, res) => {
  const { username, password, name, surname } = req.body;

  if (!username || !password) {
    return res.json({ error: "Заполни логин и пароль" });
  }

  db.get(
    "SELECT * FROM users WHERE username = ?",
    [username],
    (err, row) => {
      if (row) {
        return res.json({ error: "Пользователь уже существует" });
      }

      db.run(
        "INSERT INTO users (username, password, name, surname) VALUES (?, ?, ?, ?)",
        [username, password, name || "", surname || ""],
        function (err) {
          if (err) {
            return res.json({ error: "Ошибка базы" });
          }

          res.json({ success: true });
        }
      );
    }
  );
});

// --- LOGIN ---
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;

  db.get(
    "SELECT * FROM users WHERE username = ? AND password = ?",
    [username, password],
    (err, user) => {
      if (!user) {
        return res.json({ error: "Неверный логин или пароль" });
      }

      res.cookie("session_token", user.id, {
        httpOnly: true,
      });

      res.json({ success: true });
    }
  );
});

// --- ME (проверка авторизации) ---
app.get("/api/me", (req, res) => {
  const userId = req.cookies.session_token;

  if (!userId) {
    return res.json({ user: null });
  }

  db.get("SELECT * FROM users WHERE id = ?", [userId], (err, user) => {
    if (!user) {
      return res.json({ user: null });
    }

    res.json({
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        surname: user.surname,
      },
    });
  });
});

// --- LOGOUT ---
app.post("/api/logout", (req, res) => {
  res.clearCookie("session_token");
  res.json({ success: true });
});

// --- START SERVER ---
app.listen(PORT, () => {
  console.log("Server started on port " + PORT);
});