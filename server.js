const express = require("express");
const cookieParser = require("cookie-parser");
const path = require("path");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

async function requireAuth(req, res, next) {
  try {
    const token = req.cookies.session_token;
    const session = await db.getSession(token);
    if (!session) return res.status(401).json({ error: "Не авторизован" });
    req.userId = session.user_id;
    req.user = session;
    next();
  } catch (error) {
    console.error("auth middleware:", error);
    res.status(500).json({ error: "Ошибка сервера" });
  }
}

function validateUsername(value) {
  return /^[a-zA-Z0-9_а-яА-ЯёЁ]{3,30}$/.test(String(value || ""));
}

function validatePassword(value) {
  const password = String(value || "");
  if (password.length < 6) return "Минимум 6 символов";
  if (!/[A-Za-zА-Яа-яЁё]/.test(password)) return "Нужна хотя бы одна буква";
  if (!/\d/.test(password)) return "Нужна хотя бы одна цифра";
  return null;
}

function normalizePropertyPayload(body = {}) {
  const title = String(body.title || "").trim();
  const address = String(body.address || "").trim();
  const note = String(body.note || "").trim();

  if (!title) {
    return { ok: false, error: "Название объекта обязательно" };
  }

  if (title.length > 80) {
    return { ok: false, error: "Название объекта слишком длинное" };
  }

  if (address.length > 180) {
    return { ok: false, error: "Адрес слишком длинный" };
  }

  if (note.length > 500) {
    return { ok: false, error: "Комментарий слишком длинный" };
  }

  return { ok: true, data: { title, address, note } };
}

app.post("/api/register", async (req, res) => {
  try {
    const { username, password, name, surname = "" } = req.body;

    if (!validateUsername(username)) {
      return res.status(400).json({ error: "Некорректный логин (3–30 символов: буквы, цифры, _)" });
    }

    if (!String(name || "").trim()) {
      return res.status(400).json({ error: "Введите имя" });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const result = await db.createUser({ username, password, name, surname });

    if (!result.ok) {
      if (result.error === "username_taken") {
        return res.status(409).json({ error: "Пользователь с таким логином уже существует" });
      }
      return res.status(500).json({ error: "Ошибка сервера" });
    }

    res.status(201).json({ ok: true });
  } catch (error) {
    console.error("register:", error);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Введите логин и пароль" });
    }

    const result = await db.loginUser(username, password);
    if (!result.ok) {
      return res.status(401).json({ error: "Неверный логин или пароль" });
    }

    const isHttps = req.secure
      || req.headers["x-forwarded-proto"] === "https"
      || process.env.NODE_ENV === "production";

    res.cookie("session_token", result.token, {
      httpOnly: true,
      sameSite: isHttps ? "none" : "lax",
      secure: isHttps,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    const { password_hash, ...safeUser } = result.user;
    res.json({ ok: true, user: safeUser });
  } catch (error) {
    console.error("login:", error);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

app.post("/api/logout", async (req, res) => {
  try {
    const token = req.cookies.session_token;
    if (token) await db.deleteSession(token);
    res.clearCookie("session_token");
    res.json({ ok: true });
  } catch (error) {
    console.error("logout:", error);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

app.get("/api/me", async (req, res) => {
  try {
    const token = req.cookies.session_token;
    if (!token) return res.json({ user: null });

    const session = await db.getSession(token);
    if (!session) return res.json({ user: null });

    const { password_hash, ...safeUser } = session;
    res.json({ ok: true, user: safeUser });
  } catch (error) {
    console.error("me:", error);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

app.put("/api/profile", requireAuth, async (req, res) => {
  try {
    let { name, surname = "", phone = "", email = "" } = req.body;

    name = String(name || "").trim();
    surname = String(surname || "").trim();
    phone = String(phone || "").trim();
    email = String(email || "").trim();

    if (!name) {
      return res.status(400).json({ error: "Имя не может быть пустым" });
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Некорректный email" });
    }

    await db.updateUserProfile(req.userId, { name, surname, phone, email });
    res.json({ ok: true });
  } catch (error) {
    console.error("profile:", error);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

app.put("/api/change-password", requireAuth, async (req, res) => {
  try {
    const { old_password, new_password } = req.body;
    const user = await db.getUserById(req.userId);

    if (!user) {
      return res.status(404).json({ error: "Пользователь не найден" });
    }

    const valid = db.verifyPassword(String(old_password || ""), user.password_hash);
    if (!valid) {
      return res.status(400).json({ error: "Текущий пароль неверен" });
    }

    const passwordError = validatePassword(new_password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    await db.updateUserPassword(req.userId, new_password);
    res.json({ ok: true });
  } catch (error) {
    console.error("change-password:", error);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

app.get("/api/properties", requireAuth, async (req, res) => {
  try {
    const properties = await db.getProperties(req.userId);
    res.json({ ok: true, properties });
  } catch (error) {
    console.error("get properties:", error);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

app.post("/api/properties", requireAuth, async (req, res) => {
  try {
    const normalized = normalizePropertyPayload(req.body);
    if (!normalized.ok) {
      return res.status(400).json({ error: normalized.error });
    }

    const property = await db.createProperty(req.userId, normalized.data);
    res.status(201).json({ ok: true, property });
  } catch (error) {
    console.error("create property:", error);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

app.put("/api/properties/:id", requireAuth, async (req, res) => {
  try {
    const propertyId = Number(req.params.id);
    if (!Number.isInteger(propertyId) || propertyId <= 0) {
      return res.status(400).json({ error: "Некорректный ID объекта" });
    }

    const normalized = normalizePropertyPayload(req.body);
    if (!normalized.ok) {
      return res.status(400).json({ error: normalized.error });
    }

    const property = await db.updateProperty(req.userId, propertyId, normalized.data);
    if (!property) {
      return res.status(404).json({ error: "Объект не найден" });
    }

    res.json({ ok: true, property });
  } catch (error) {
    console.error("update property:", error);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

app.delete("/api/properties/:id", requireAuth, async (req, res) => {
  try {
    const propertyId = Number(req.params.id);
    if (!Number.isInteger(propertyId) || propertyId <= 0) {
      return res.status(400).json({ error: "Некорректный ID объекта" });
    }

    const deleted = await db.deleteProperty(req.userId, propertyId);
    if (!deleted) {
      return res.status(404).json({ error: "Объект не найден" });
    }

    res.json({ ok: true });
  } catch (error) {
    console.error("delete property:", error);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

app.get("/api/tariffs", requireAuth, async (req, res) => {
  try {
    const tariffs = await db.getTariffs(req.userId);
    res.json({ ok: true, tariffs: tariffs || null });
  } catch (error) {
    console.error("get tariffs:", error);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

app.put("/api/tariffs", requireAuth, async (req, res) => {
  try {
    const { electric_day, electric_night, water, heat, gas } = req.body;

    await db.saveTariffs(req.userId, {
      electric_day: Number(electric_day) || 0,
      electric_night: Number(electric_night) || 0,
      water: Number(water) || 0,
      heat: Number(heat) || 0,
      gas: Number(gas) || 0,
    });

    res.json({ ok: true });
  } catch (error) {
    console.error("save tariffs:", error);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

app.get("/api/history", requireAuth, async (req, res) => {
  try {
    const rows = await db.getHistory(req.userId, 50);
    res.json({ ok: true, history: rows });
  } catch (error) {
    console.error("get history:", error);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

app.post("/api/history", requireAuth, async (req, res) => {
  try {
    const data = req.body;
    if (typeof data.total !== "number") {
      return res.status(400).json({ error: "Некорректные данные" });
    }

    await db.addHistory(req.userId, data);
    res.status(201).json({ ok: true });
  } catch (error) {
    console.error("add history:", error);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

app.delete("/api/history", requireAuth, async (req, res) => {
  try {
    await db.clearHistory(req.userId);
    res.json({ ok: true });
  } catch (error) {
    console.error("clear history:", error);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Сервер запущен: http://localhost:${PORT}`);
});
