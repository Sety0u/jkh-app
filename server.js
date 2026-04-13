const express      = require("express");
const cookieParser = require("cookie-parser");
const path         = require("path");
const db           = require("./db");

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

// ─── Auth middleware ──────────────────────────────────────────────────────────

async function requireAuth(req, res, next) {
  const token   = req.cookies.session_token;
  const session = await db.getSession(token);
  if (!session) return res.status(401).json({ error: "Не авторизован" });
  req.userId = session.user_id;
  req.user   = session;
  next();
}

// ─── Валидация ────────────────────────────────────────────────────────────────

function validateUsername(u) {
  return /^[a-zA-Z0-9_а-яА-ЯёЁ]{3,30}$/.test(u);
}

function validatePassword(p) {
  if (!p || p.length < 6)           return "Минимум 6 символов";
  if (!/[A-Za-zА-Яа-яЁё]/.test(p)) return "Нужна хотя бы одна буква";
  if (!/\d/.test(p))                return "Нужна хотя бы одна цифра";
  return null;
}

// ─── Регистрация ──────────────────────────────────────────────────────────────

app.post("/api/register", async (req, res) => {
  try {
    const { username, password, name, surname = "" } = req.body;

    if (!username || !validateUsername(username))
      return res.status(400).json({ error: "Некорректный логин (3–30 символов: буквы, цифры, _)" });
    if (!name || !name.trim())
      return res.status(400).json({ error: "Введите имя" });
    const pwError = validatePassword(password);
    if (pwError) return res.status(400).json({ error: pwError });

    const result = await db.createUser({ username, password, name, surname });
    if (!result.ok) {
      if (result.error === "username_taken")
        return res.status(409).json({ error: "Пользователь с таким логином уже существует" });
      return res.status(500).json({ error: "Ошибка сервера" });
    }
    res.status(201).json({ ok: true });
  } catch (e) {
    console.error("register:", e);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// ─── Вход ─────────────────────────────────────────────────────────────────────

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: "Введите логин и пароль" });

    const result = await db.loginUser(username, password);
    if (!result.ok)
      return res.status(401).json({ error: "Неверный логин или пароль" });

    // secure только если HTTPS; на локалке/HTTP — без него
    const isHttps = req.secure ||
      req.headers["x-forwarded-proto"] === "https" ||
      process.env.NODE_ENV === "production";

    res.cookie("session_token", result.token, {
      httpOnly: true,
      sameSite: isHttps ? "none" : "lax",
      secure:   isHttps,
      maxAge: 30 * 24 * 60 * 60 * 1000   // 30 дней
    });

    const { password_hash, ...safeUser } = result.user;
    res.json({ ok: true, user: safeUser });
  } catch (e) {
    console.error("login:", e);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// ─── Выход ────────────────────────────────────────────────────────────────────

app.post("/api/logout", async (req, res) => {
  const token = req.cookies.session_token;
  if (token) await db.deleteSession(token);
  res.clearCookie("session_token");
  res.json({ ok: true });
});

// ─── Текущий пользователь ─────────────────────────────────────────────────────

app.get("/api/me", async (req, res) => {
  const token = req.cookies.session_token;
  if (!token) return res.json({ user: null });
  const session = await db.getSession(token);
  if (!session) return res.json({ user: null });
  const { password_hash, ...safeUser } = session;
  res.json({ ok: true, user: safeUser });
});

// ─── Профиль ──────────────────────────────────────────────────────────────────

app.put("/api/profile", requireAuth, async (req, res) => {
  try {
    let { name, surname = "", phone = "", email = "" } = req.body;
    name = (name || "").trim();
    if (!name) return res.status(400).json({ error: "Имя не может быть пустым" });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ error: "Некорректный email" });
    await db.updateUserProfile(req.userId, {
      name, surname: surname.trim(), phone: phone.trim(), email: email.trim()
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// ─── Смена пароля ─────────────────────────────────────────────────────────────

app.put("/api/change-password", requireAuth, async (req, res) => {
  try {
    const { old_password, new_password } = req.body;
    const user = await db.getUserById(req.userId);
    const valid = await db.verifyPassword(old_password || "", user.password_hash);
    if (!valid) return res.status(400).json({ error: "Текущий пароль неверен" });
    const pwError = validatePassword(new_password);
    if (pwError) return res.status(400).json({ error: pwError });
    await db.updateUserPassword(req.userId, new_password);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// ─── История расчётов ─────────────────────────────────────────────────────────

app.get("/api/history", requireAuth, async (req, res) => {
  try {
    const rows = await db.getHistory(req.userId, 50);
    res.json({ ok: true, history: rows });
  } catch (e) {
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

app.post("/api/history", requireAuth, async (req, res) => {
  try {
    const data = req.body;
    if (typeof data.total !== "number")
      return res.status(400).json({ error: "Некорректные данные" });
    await db.addHistory(req.userId, data);
    res.status(201).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

app.delete("/api/history", requireAuth, async (req, res) => {
  try {
    await db.clearHistory(req.userId);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// ─── Запуск ───────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`✅ Сервер запущен: http://localhost:${PORT}`);
});
