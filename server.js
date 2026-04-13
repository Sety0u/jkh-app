const express = require("express");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const path = require("path");

const db = require("./db");

const app = express();
const PORT = 3000;

app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

// ───────── РЕГИСТРАЦИЯ ─────────
app.post("/api/register", async (req, res) => {
  const { username, password, name, surname } = req.body;

  if (!username || !password) {
    return res.json({ error: "Заполни все поля" });
  }

  const result = await db.createUser({
    username,
    password,
    name,
    surname,
  });

  if (!result.ok) {
    return res.json({ error: "Пользователь уже существует" });
  }

  res.json({ success: true });
});

// ───────── ЛОГИН ─────────
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  const result = await db.loginUser(username, password);

  if (!result.ok) {
    return res.json({ error: "Неверный логин или пароль" });
  }

  res.cookie("session_token", result.token, {
    httpOnly: true,
  });

  res.json({ success: true });
});

// ───────── ПРОВЕРКА ─────────
app.get("/api/me", async (req, res) => {
  const token = req.cookies.session_token;

  if (!token) return res.json({ user: null });

  const user = await db.getSession(token);

  if (!user) return res.json({ user: null });

  res.json({
    user: {
      username: user.username,
      name: user.name,
      surname: user.surname,
    },
  });
});

// ───────── ВЫХОД ─────────
app.post("/api/logout", (req, res) => {
  res.clearCookie("session_token");
  res.json({ success: true });
});

// ───────── ЗАПУСК ─────────
app.listen(PORT, () => {
  console.log("Server started on port " + PORT);
});