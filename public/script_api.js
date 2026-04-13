// ─── State ────────────────────────────────────────────────────────────────────

let currentUser = null;
let calcHistory = [];

// ─── API helper ───────────────────────────────────────────────────────────────

async function api(method, url, body) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
    credentials: "include"
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  return res.json();
}

// ─── Auth UI helpers ──────────────────────────────────────────────────────────

function showAuthError(msg) {
  const el = document.getElementById("authError");
  el.textContent = msg;
  el.style.display = "block";
  document.getElementById("authSuccess").style.display = "none";
}

function showAuthSuccess(msg) {
  const el = document.getElementById("authSuccess");
  el.textContent = msg;
  el.style.display = "block";
  document.getElementById("authError").style.display = "none";
}

function clearAuthMessages() {
  document.getElementById("authError").style.display = "none";
  document.getElementById("authSuccess").style.display = "none";
}

function validatePasswordStrength(pw) {
  const errors = [];
  if (pw.length < 6)                          errors.push("минимум 6 символов");
  if (!/[A-Za-zА-Яа-яЁё]/.test(pw))          errors.push("хотя бы одна буква");
  if (!/\d/.test(pw))                         errors.push("хотя бы одна цифра");
  return errors;
}

// ─── Panel / Tab control ──────────────────────────────────────────────────────

function switchPanel(name) {
  if ((name === "profile" || name === "calc") && !currentUser) {
    showAuthError("Войдите в систему, чтобы получить доступ.");
    switchPanelRaw("auth");
    return;
  }
  switchPanelRaw(name);
  clearAuthMessages();
  if (name === "profile") populateProfileForm();
  if (name === "calc")    { updateUserInfo(); loadHistory(); }
}

function switchPanelRaw(name) {
  document.querySelectorAll(".tab").forEach(el => el.classList.remove("active"));
  document.querySelectorAll(".panel").forEach(el => el.classList.remove("active"));
  document.getElementById("tab_" + name).classList.add("active");
  document.getElementById(name).classList.add("active");
}

// ─── Auth mode (login / register) ────────────────────────────────────────────

function setAuthMode(mode) {
  const isReg = mode === "register";
  document.getElementById("registerFields").style.display         = isReg ? "block" : "none";
  document.getElementById("password_auth2_group").style.display   = isReg ? "block" : "none";
  document.getElementById("btnLogin").style.display               = isReg ? "none"  : "inline-block";
  document.getElementById("btnRegister").style.display            = isReg ? "inline-block" : "none";
  document.getElementById("switchToRegister").style.display       = isReg ? "none"  : "block";
  document.getElementById("switchToLogin").style.display          = isReg ? "block" : "none";
  document.getElementById("authTitle").textContent    = isReg ? "Создать аккаунт"     : "Добро пожаловать";
  document.getElementById("authSubtitle").textContent = isReg
    ? "Заполните данные для регистрации нового аккаунта."
    : "ЖКХ-калькулятор. Войдите, чтобы начать расчёт.";
  clearAuthMessages();
}

// ─── Register ─────────────────────────────────────────────────────────────────

async function register() {
  clearAuthMessages();
  const username  = document.getElementById("username_auth").value.trim().toLowerCase();
  const password  = document.getElementById("password_auth").value;
  const password2 = document.getElementById("password_auth2").value;
  const regName   = document.getElementById("reg_name").value.trim();

  if (!username) { showAuthError("Введите логин."); return; }
  if (!/^[a-zA-Z0-9_а-яА-ЯёЁ]{3,30}$/.test(username)) {
    showAuthError("Логин: 3–30 символов, буквы, цифры и _"); return;
  }
  if (!regName) { showAuthError("Введите ваше имя."); return; }

  const pwErrors = validatePasswordStrength(password);
  if (pwErrors.length) { showAuthError("Пароль должен содержать: " + pwErrors.join(", ") + "."); return; }
  if (password !== password2) { showAuthError("Пароли не совпадают."); return; }

  const nameParts = regName.split(" ");
  const data = await api("POST", "/api/register", {
    username, password,
    name:    nameParts[0] || regName,
    surname: nameParts.slice(1).join(" ") || ""
  });

  if (!data.ok) { showAuthError(data.error || "Ошибка регистрации."); return; }

  showAuthSuccess(`Аккаунт «${username}» создан! Теперь войдите.`);
  setAuthMode("login");
  document.getElementById("username_auth").value = username;
  document.getElementById("password_auth").value = "";
}

// ─── Login ────────────────────────────────────────────────────────────────────

async function login() {
  clearAuthMessages();
  const username = document.getElementById("username_auth").value.trim();
  const password = document.getElementById("password_auth").value;

  if (!username || !password) { showAuthError("Введите логин и пароль."); return; }

  const data = await api("POST", "/api/login", { username, password });
  if (!data.ok) { showAuthError(data.error || "Неверный логин или пароль."); return; }

  currentUser = data.user;
  updateNav();
  switchPanel("profile");
}

// ─── Logout ───────────────────────────────────────────────────────────────────

async function logout() {
  await api("POST", "/api/logout");
  currentUser = null;
  calcHistory = [];
  updateNav();
  setAuthMode("login");
  document.getElementById("username_auth").value = "";
  document.getElementById("password_auth").value = "";
  switchPanelRaw("auth");
}

// ─── Nav ──────────────────────────────────────────────────────────────────────

function updateNav() {
  const loggedIn = !!currentUser;
  document.getElementById("logoutBtn").style.display    = loggedIn ? "inline-block" : "none";
  document.getElementById("loggedInAs").style.display   = loggedIn ? "block" : "none";
  if (loggedIn) {
    const name = currentUser.name + (currentUser.surname ? " " + currentUser.surname : "");
    document.getElementById("loggedInAs").textContent = "Вы вошли как: " + (name.trim() || currentUser.username);
  }
}

// ─── Profile ──────────────────────────────────────────────────────────────────

function populateProfileForm() {
  if (!currentUser) return;
  document.getElementById("profileName").value    = currentUser.name    || "";
  document.getElementById("profileSurname").value = currentUser.surname || "";
  document.getElementById("profilePhone").value   = currentUser.phone   || "";
  document.getElementById("profileEmail").value   = currentUser.email   || "";
}

async function saveProfile() {
  if (!currentUser) return;
  const name    = document.getElementById("profileName").value.trim();
  const surname = document.getElementById("profileSurname").value.trim();
  const phone   = document.getElementById("profilePhone").value.trim();
  const email   = document.getElementById("profileEmail").value.trim();

  if (!name) { alert("Имя не может быть пустым."); return; }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    alert("Введите корректный email."); return;
  }

  const data = await api("PUT", "/api/profile", { name, surname, phone, email });
  if (!data.ok) { alert(data.error || "Ошибка сохранения."); return; }

  currentUser = { ...currentUser, name, surname, phone, email };
  updateNav();
  const msg = document.getElementById("profileSaveMsg");
  msg.style.display = "block";
  setTimeout(() => { msg.style.display = "none"; }, 2000);
}

async function changePassword() {
  const oldPw  = document.getElementById("oldPassword").value;
  const newPw  = document.getElementById("newPassword").value;
  const newPw2 = document.getElementById("newPassword2").value;
  const msgEl  = document.getElementById("pwChangeMsg");
  msgEl.className = "msg";
  msgEl.style.display = "none";

  if (!oldPw || !newPw || !newPw2) {
    msgEl.textContent = "Заполните все поля."; msgEl.classList.add("error"); msgEl.style.display = "block"; return;
  }
  if (newPw !== newPw2) {
    msgEl.textContent = "Новые пароли не совпадают."; msgEl.classList.add("error"); msgEl.style.display = "block"; return;
  }
  const errors = validatePasswordStrength(newPw);
  if (errors.length) {
    msgEl.textContent = "Новый пароль: " + errors.join(", ") + "."; msgEl.classList.add("error"); msgEl.style.display = "block"; return;
  }

  const data = await api("PUT", "/api/change-password", { old_password: oldPw, new_password: newPw });
  if (!data.ok) {
    msgEl.textContent = data.error || "Ошибка."; msgEl.classList.add("error"); msgEl.style.display = "block"; return;
  }

  document.getElementById("oldPassword").value  = "";
  document.getElementById("newPassword").value  = "";
  document.getElementById("newPassword2").value = "";
  msgEl.textContent = "Пароль успешно изменён!"; msgEl.classList.add("success"); msgEl.style.display = "block";
  setTimeout(() => { msgEl.style.display = "none"; }, 3000);
}

// ─── Theme ────────────────────────────────────────────────────────────────────

function switchTheme(value) {
  document.body.classList.toggle("theme-dark", value === "dark");
  localStorage.setItem("theme", value);
}

function loadTheme() {
  const saved = localStorage.getItem("theme") || "light";
  const sel = document.getElementById("themeSelect");
  if (sel) sel.value = saved;
  switchTheme(saved);
}

// ─── Calculator ───────────────────────────────────────────────────────────────

function updateUserInfo() {
  if (!currentUser) return;
  const name = currentUser.name + (currentUser.surname ? " " + currentUser.surname : "");
  document.getElementById("userInfo").textContent = "Пользователь: " + (name.trim() || currentUser.username);
}

function getTariffs() {
  const v = id => parseFloat(document.getElementById(id).value) || 0;
  return {
    electric_day:   v("tariff_electric_day"),
    electric_night: v("tariff_electric_night"),
    water:          v("tariff_water"),
    heat:           v("tariff_heat"),
    gas:            v("tariff_gas")
  };
}

function getMeters() {
  const v = id => parseFloat(document.getElementById(id).value) || 0;
  return {
    prev: {
      electric_day:   v("meter_electric_day_prev"),
      electric_night: v("meter_electric_night_prev"),
      water:          v("meter_water_prev"),
      heat:           v("meter_heat_prev"),
      gas:            v("meter_gas_prev")
    },
    curr: {
      electric_day:   v("meter_electric_day_curr"),
      electric_night: v("meter_electric_night_curr"),
      water:          v("meter_water_curr"),
      heat:           v("meter_heat_curr"),
      gas:            v("meter_gas_curr")
    }
  };
}

function validateMeters(m) {
  const checks = [
    [m.curr.electric_day   < m.prev.electric_day,   "Электричество (день)"],
    [m.curr.electric_night < m.prev.electric_night, "Электричество (ночь)"],
    [m.curr.water          < m.prev.water,          "Вода"],
    [m.curr.heat           < m.prev.heat,           "Отопление"],
    [m.curr.gas            < m.prev.gas,            "Газ"]
  ];
  const errors = checks.filter(([c]) => c).map(([, n]) => n + ": текущие меньше предыдущих");
  if (errors.length) { alert("Ошибки ввода:\n" + errors.join("\n")); return false; }
  return true;
}

async function calculate() {
  const t = getTariffs();
  const m = getMeters();
  if (!validateMeters(m)) return;

  const diff = key => Math.max(0, m.curr[key] - m.prev[key]);

  const usedED = diff("electric_day"),   sumED = usedED * t.electric_day;
  const usedEN = diff("electric_night"), sumEN = usedEN * t.electric_night;
  const sumE   = sumED + sumEN;
  const usedW  = diff("water"), sumW = usedW * t.water;
  const usedH  = diff("heat"),  sumH = usedH * t.heat;
  const usedG  = diff("gas"),   sumG = usedG * t.gas;
  const total  = sumE + sumW + sumH + sumG;

  document.getElementById("electricResult").textContent = `${sumE.toFixed(2)} ₽ (${sumED.toFixed(2)} ₽ день + ${sumEN.toFixed(2)} ₽ ночь)`;
  document.getElementById("waterResult").textContent    = sumW.toFixed(2) + " ₽";
  document.getElementById("heatResult").textContent     = sumH.toFixed(2) + " ₽";
  document.getElementById("gasResult").textContent      = sumG.toFixed(2) + " ₽";
  document.getElementById("totalAmount").textContent    = total.toFixed(2) + " ₽";

  // Сохраняем в БД на сервере
  await api("POST", "/api/history", {
    tariff_electric_day:   t.electric_day,
    tariff_electric_night: t.electric_night,
    tariff_water:          t.water,
    tariff_heat:           t.heat,
    tariff_gas:            t.gas,
    electric_used_day:     usedED, electric_sum_day:   sumED,
    electric_used_night:   usedEN, electric_sum_night: sumEN, electric_sum: sumE,
    water_used:            usedW,  water_sum:           sumW,
    heat_used:             usedH,  heat_sum:            sumH,
    gas_used:              usedG,  gas_sum:             sumG,
    total
  });

  await loadHistory();
}

async function loadHistory() {
  const data = await api("GET", "/api/history");
  if (!data.ok) return;
  calcHistory = data.history || [];
  renderHistoryList();
}

function renderHistoryList() {
  const list = document.getElementById("history");
  if (!list) return;
  if (!calcHistory.length) {
    list.innerHTML = "<div class='subtitle'>Расчётов пока нет</div>";
    renderChart(); return;
  }
  list.innerHTML = calcHistory.map((item, i) => {
    const d = new Date(item.calc_date);
    const dateStr = isNaN(d) ? item.calc_date : d.toLocaleString("ru-RU");
    return `
    <div style="margin-bottom:10px;padding:10px 12px;border-radius:8px;
      background:${i % 2 === 0 ? "#f0f2f5" : "#e8eae9"};font-size:13px;border:1px solid #ced4da;">
      <div style="font-weight:500;margin-bottom:4px;">${dateStr}</div>
      <div>Электричество: ${(item.electric_used_day||0).toFixed(2)} + ${(item.electric_used_night||0).toFixed(2)} кВт·ч
        = <b>${(item.electric_sum||0).toFixed(2)} ₽</b></div>
      <div>Вода: ${(item.water_used||0).toFixed(2)} м³ = <b>${(item.water_sum||0).toFixed(2)} ₽</b></div>
      <div>Отопление: ${(item.heat_used||0).toFixed(3)} Гкал = <b>${(item.heat_sum||0).toFixed(2)} ₽</b></div>
      <div>Газ: ${(item.gas_used||0).toFixed(2)} м³ = <b>${(item.gas_sum||0).toFixed(2)} ₽</b></div>
      <div style="font-weight:600;margin-top:6px;color:#0b58ca;">Итого: ${(item.total||0).toFixed(2)} ₽</div>
    </div>`;
  }).join("");
  renderChart();
}

function renderChart() {
  const canvas = document.getElementById("chartCanvas");
  if (!canvas) return;
  const ctx  = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  canvas.width = rect.width; canvas.height = rect.height;
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  if (!calcHistory.length) {
    ctx.fillStyle = "#666"; ctx.font = "14px Arial"; ctx.textAlign = "center";
    ctx.fillText("Расчётов пока нет", W / 2, H / 2); return;
  }
  const items = calcHistory.slice().reverse();
  const top = 40, bot = 40, left = 64, right = 20;
  const pH = H - top - bot, pW = W - left - right;
  const maxT = Math.max(...items.map(i => i.total), 1);
  const scale = (pH * 0.9) / maxT;
  ctx.strokeStyle = "#ccc"; ctx.lineWidth = 1; ctx.font = "10px Arial"; ctx.fillStyle = "#666"; ctx.textAlign = "right";
  for (let i = 0; i <= 4; i++) {
    const val = maxT * i / 4, y = top + pH - val * scale;
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(left + pW, y); ctx.stroke();
    ctx.fillText(val.toFixed(0) + " ₽", left - 4, y + 3);
  }
  const stepX = items.length > 1 ? pW / (items.length - 1) : pW / 2;
  ctx.beginPath(); ctx.strokeStyle = "#0d6efd"; ctx.lineWidth = 2;
  items.forEach((item, i) => {
    const x = left + i * stepX, y = top + pH - item.total * scale;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.fillStyle = "#0d6efd";
  items.forEach((item, i) => {
    const x = left + i * stepX, y = top + pH - item.total * scale;
    ctx.beginPath(); ctx.arc(x, y, 4, 0, 2 * Math.PI); ctx.fill();
  });
}

async function clearHistory() {
  if (!confirm("Вы уверены, что хотите очистить всю историю расчётов?")) return;
  const data = await api("DELETE", "/api/history");
  if (!data.ok) { alert(data.error || "Ошибка."); return; }
  calcHistory = [];
  renderHistoryList();
}

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  loadTheme();
  setAuthMode("login");

  // Проверяем, залогинен ли уже (по кукам на сервере)
  try {
    const data = await api("GET", "/api/me");
    if (data.user) {
      currentUser = data.user;
      updateNav();
      switchPanelRaw("profile");
      populateProfileForm();
    } else {
      updateNav();
      switchPanelRaw("auth");
    }
  } catch {
    updateNav();
    switchPanelRaw("auth");
  }
});
