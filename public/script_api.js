// ─── Auth helpers ─────────────────────────────────────────────────────────────

function hashPassword(str) {
  // Simple deterministic hash (not cryptographic, but enough for localStorage demo)
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return (h >>> 0).toString(36);
}

function getUsers() {
  try { return JSON.parse(localStorage.getItem("kkh_users") || "{}"); } catch { return {}; }
}

function saveUsers(users) {
  localStorage.setItem("kkh_users", JSON.stringify(users));
}

function getSession() {
  try { return JSON.parse(localStorage.getItem("kkh_session") || "null"); } catch { return null; }
}

function saveSession(username) {
  localStorage.setItem("kkh_session", JSON.stringify({ username, ts: Date.now() }));
}

function clearSession() {
  localStorage.removeItem("kkh_session");
}

// ─── Current user state ───────────────────────────────────────────────────────

let currentUser = null; // { username, name, surname, phone, email }

function loadCurrentUser() {
  const session = getSession();
  if (!session) return false;
  const users = getUsers();
  const data = users[session.username];
  if (!data) { clearSession(); return false; }
  currentUser = { username: session.username, ...data };
  return true;
}

// ─── Tab / panel control ──────────────────────────────────────────────────────

function switchPanel(name) {
  // Guard: profile and calc require login
  if ((name === "profile" || name === "calc") && !currentUser) {
    showAuthError("Войдите в систему, чтобы получить доступ.");
    return;
  }

  document.querySelectorAll(".tab").forEach(el => el.classList.remove("active"));
  document.querySelectorAll(".panel").forEach(el => el.classList.remove("active"));
  document.getElementById("tab_" + name).classList.add("active");
  document.getElementById(name).classList.add("active");
  clearAuthMessages();

  if (name === "profile") populateProfileForm();
  if (name === "calc") {
    updateUserInfo();
    updateHistoryList();
  }
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
  if (pw.length < 6) errors.push("минимум 6 символов");
  if (!/[A-Za-zА-Яа-яЁё]/.test(pw)) errors.push("хотя бы одна буква");
  if (!/\d/.test(pw)) errors.push("хотя бы одна цифра");
  return errors;
}

// ─── Registration ─────────────────────────────────────────────────────────────

function register() {
  clearAuthMessages();
  const username  = document.getElementById("username_auth").value.trim().toLowerCase();
  const password  = document.getElementById("password_auth").value;
  const password2 = document.getElementById("password_auth2").value;
  const regName   = document.getElementById("reg_name").value.trim();

  if (!username) { showAuthError("Введите имя пользователя (логин)."); return; }
  if (!/^[a-zA-Z0-9_а-яА-ЯёЁ]{3,30}$/.test(username)) {
    showAuthError("Логин: 3–30 символов, только буквы, цифры и _"); return;
  }
  if (!regName) { showAuthError("Введите ваше имя."); return; }

  const pwErrors = validatePasswordStrength(password);
  if (pwErrors.length) { showAuthError("Пароль должен содержать: " + pwErrors.join(", ") + "."); return; }
  if (password !== password2) { showAuthError("Пароли не совпадают."); return; }

  const users = getUsers();
  if (users[username]) { showAuthError("Пользователь с таким логином уже существует."); return; }

  users[username] = {
    passwordHash: hashPassword(password),
    name: regName.split(" ")[0] || regName,
    surname: regName.split(" ")[1] || "",
    phone: "",
    email: "",
    createdAt: new Date().toISOString()
  };
  saveUsers(users);

  showAuthSuccess(`Аккаунт «${username}» успешно создан! Теперь войдите.`);
  setAuthMode("login");
  document.getElementById("username_auth").value = username;
  document.getElementById("password_auth").value = "";
}

// ─── Login ────────────────────────────────────────────────────────────────────

function login() {
  clearAuthMessages();
  const username = document.getElementById("username_auth").value.trim().toLowerCase();
  const password = document.getElementById("password_auth").value;

  if (!username || !password) { showAuthError("Введите логин и пароль."); return; }

  const users = getUsers();
  const user = users[username];

  if (!user || user.passwordHash !== hashPassword(password)) {
    showAuthError("Неверный логин или пароль."); return;
  }

  saveSession(username);
  currentUser = { username, ...user };
  updateNavAfterLogin();
  switchPanel("profile");
  showAuthSuccess(""); // clear on next panel, no-op
}

// ─── Logout ───────────────────────────────────────────────────────────────────

function logout() {
  clearSession();
  currentUser = null;
  updateNavAfterLogin();
  setAuthMode("login");
  document.getElementById("username_auth").value = "";
  document.getElementById("password_auth").value = "";
  switchPanelRaw("auth");
}

function switchPanelRaw(name) {
  document.querySelectorAll(".tab").forEach(el => el.classList.remove("active"));
  document.querySelectorAll(".panel").forEach(el => el.classList.remove("active"));
  document.getElementById("tab_" + name).classList.add("active");
  document.getElementById(name).classList.add("active");
}

// ─── Auth mode toggling (login ↔ register) ────────────────────────────────────

function setAuthMode(mode) {
  const isReg = mode === "register";
  document.getElementById("registerFields").style.display = isReg ? "block" : "none";
  document.getElementById("password_auth2_group").style.display = isReg ? "block" : "none";
  document.getElementById("btnLogin").style.display = isReg ? "none" : "inline-block";
  document.getElementById("btnRegister").style.display = isReg ? "inline-block" : "none";
  document.getElementById("switchToRegister").style.display = isReg ? "none" : "block";
  document.getElementById("switchToLogin").style.display = isReg ? "block" : "none";
  document.getElementById("authTitle").textContent = isReg ? "Создать аккаунт" : "Добро пожаловать";
  document.getElementById("authSubtitle").textContent = isReg
    ? "Заполните данные для регистрации нового аккаунта."
    : "ЖКХ-калькулятор. Войдите, чтобы начать расчёт.";
  clearAuthMessages();
}

// ─── Nav state ────────────────────────────────────────────────────────────────

function updateNavAfterLogin() {
  const loggedIn = !!currentUser;
  document.getElementById("tab_profile").style.opacity = loggedIn ? "1" : "0.45";
  document.getElementById("tab_calc").style.opacity    = loggedIn ? "1" : "0.45";
  document.getElementById("tab_profile").style.pointerEvents = loggedIn ? "auto" : "auto"; // keep clickable to show error
  document.getElementById("logoutBtn").style.display = loggedIn ? "inline-block" : "none";
  document.getElementById("loggedInAs").style.display = loggedIn ? "block" : "none";
  if (loggedIn) document.getElementById("loggedInAs").textContent = `Вы вошли как: ${currentUser.username}`;
}

// ─── Profile ──────────────────────────────────────────────────────────────────

function populateProfileForm() {
  if (!currentUser) return;
  document.getElementById("profileName").value    = currentUser.name    || "";
  document.getElementById("profileSurname").value = currentUser.surname || "";
  document.getElementById("profilePhone").value   = currentUser.phone   || "";
  document.getElementById("profileEmail").value   = currentUser.email   || "";
}

function saveProfile() {
  if (!currentUser) return;
  const name    = document.getElementById("profileName").value.trim()    || "Пользователь";
  const surname = document.getElementById("profileSurname").value.trim();
  const phone   = document.getElementById("profilePhone").value.trim();
  const email   = document.getElementById("profileEmail").value.trim();

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    alert("Введите корректный адрес эл. почты."); return;
  }

  const users = getUsers();
  users[currentUser.username] = {
    ...users[currentUser.username],
    name, surname, phone, email
  };
  saveUsers(users);
  currentUser = { ...currentUser, name, surname, phone, email };

  document.getElementById("profileSaveMsg").style.display = "block";
  setTimeout(() => { document.getElementById("profileSaveMsg").style.display = "none"; }, 2000);
}

function changePassword() {
  const oldPw  = document.getElementById("oldPassword").value;
  const newPw  = document.getElementById("newPassword").value;
  const newPw2 = document.getElementById("newPassword2").value;

  const msgEl = document.getElementById("pwChangeMsg");
  msgEl.className = "msg";

  if (!oldPw || !newPw || !newPw2) {
    msgEl.textContent = "Заполните все поля пароля."; msgEl.classList.add("error"); msgEl.style.display = "block"; return;
  }

  const users = getUsers();
  if (users[currentUser.username].passwordHash !== hashPassword(oldPw)) {
    msgEl.textContent = "Текущий пароль неверен."; msgEl.classList.add("error"); msgEl.style.display = "block"; return;
  }

  const errors = validatePasswordStrength(newPw);
  if (errors.length) {
    msgEl.textContent = "Новый пароль: " + errors.join(", ") + "."; msgEl.classList.add("error"); msgEl.style.display = "block"; return;
  }

  if (newPw !== newPw2) {
    msgEl.textContent = "Новые пароли не совпадают."; msgEl.classList.add("error"); msgEl.style.display = "block"; return;
  }

  users[currentUser.username].passwordHash = hashPassword(newPw);
  saveUsers(users);

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

let history = [];

function updateUserInfo() {
  if (!currentUser) return;
  const name = currentUser.name + (currentUser.surname ? " " + currentUser.surname : "");
  document.getElementById("userInfo").textContent = "Пользователь: " + name;
}

function getTariffs() {
  return {
    electric_day:   parseFloat(document.getElementById("tariff_electric_day").value)   || 0,
    electric_night: parseFloat(document.getElementById("tariff_electric_night").value) || 0,
    water:          parseFloat(document.getElementById("tariff_water").value)           || 0,
    heat:           parseFloat(document.getElementById("tariff_heat").value)            || 0,
    gas:            parseFloat(document.getElementById("tariff_gas").value)             || 0
  };
}

function getMeters() {
  const id = s => parseFloat(document.getElementById(s).value) || 0;
  return {
    prev: { electric_day: id("meter_electric_day_prev"), electric_night: id("meter_electric_night_prev"), water: id("meter_water_prev"), heat: id("meter_heat_prev"), gas: id("meter_gas_prev") },
    curr: { electric_day: id("meter_electric_day_curr"), electric_night: id("meter_electric_night_curr"), water: id("meter_water_curr"), heat: id("meter_heat_curr"), gas: id("meter_gas_curr") }
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
  const errors = checks.filter(([cond]) => cond).map(([, name]) => `${name}: текущие показания меньше предыдущих`);
  if (errors.length) { alert("Ошибки ввода:\n" + errors.join("\n")); return false; }
  return true;
}

function calculate() {
  const t = getTariffs();
  const m = getMeters();
  if (!validateMeters(m)) return;

  const diff = key => Math.max(0, m.curr[key] - m.prev[key]);

  const usedED = diff("electric_day"),   sumED = usedED * t.electric_day;
  const usedEN = diff("electric_night"), sumEN = usedEN * t.electric_night;
  const sumE   = sumED + sumEN;
  const usedW  = diff("water"),  sumW = usedW * t.water;
  const usedH  = diff("heat"),   sumH = usedH * t.heat;
  const usedG  = diff("gas"),    sumG = usedG * t.gas;
  const total  = sumE + sumW + sumH + sumG;

  document.getElementById("electricResult").textContent = `${sumE.toFixed(2)} ₽ (${sumED.toFixed(2)} ₽ день + ${sumEN.toFixed(2)} ₽ ночь)`;
  document.getElementById("waterResult").textContent    = sumW.toFixed(2) + " ₽";
  document.getElementById("heatResult").textContent     = sumH.toFixed(2) + " ₽";
  document.getElementById("gasResult").textContent      = sumG.toFixed(2) + " ₽";
  document.getElementById("totalAmount").textContent    = total.toFixed(2) + " ₽";

  const now = new Date();
  history.push({
    date: now.toLocaleDateString("ru-RU"), time: now.toLocaleTimeString("ru-RU"),
    user: currentUser ? (currentUser.name + (currentUser.surname ? " " + currentUser.surname : "")) : "—",
    electric_used_day: usedED, electric_sum_day: sumED,
    electric_used_night: usedEN, electric_sum_night: sumEN, electric_sum: sumE,
    water_used: usedW, water_sum: sumW,
    heat_used: usedH, heat_sum: sumH,
    gas_used: usedG, gas_sum: sumG,
    total
  });
  localStorage.setItem("kkh_history", JSON.stringify(history));
  updateHistoryList();
}

function loadHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem("kkh_history") || "[]");
    history = saved.map(item => ({
      gas_used: 0, gas_sum: 0, electric_sum_day: 0, electric_sum_night: 0,
      electric_used_day: 0, electric_used_night: 0, electric_sum: 0,
      ...item
    }));
  } catch { history = []; }
}

function updateHistoryList() {
  const list = document.getElementById("history");
  if (!list) return;
  if (history.length === 0) {
    list.innerHTML = "<div class='subtitle'>Расчётов пока нет</div>";
    renderChart(); return;
  }
  list.innerHTML = history.slice().reverse().map((item, i) => `
    <div style="margin-bottom:10px;padding:10px 12px;border-radius:8px;background:${i%2===0?"#f0f2f5":"#e8eae9"};font-size:13px;border:1px solid #ced4da;">
      <div style="font-weight:500;margin-bottom:2px;">${item.date} ${item.time}</div>
      <div style="margin-bottom:4px;">Пользователь: ${item.user}</div>
      <div>Эл. днём: ${item.electric_used_day.toFixed(2)} кВт·ч (${item.electric_sum_day.toFixed(2)} ₽)</div>
      <div>Эл. ночью: ${item.electric_used_night.toFixed(2)} кВт·ч (${item.electric_sum_night.toFixed(2)} ₽)</div>
      <div>Вода: ${item.water_used.toFixed(2)} м³ (${item.water_sum.toFixed(2)} ₽)</div>
      <div>Отопление: ${item.heat_used.toFixed(3)} Гкал (${item.heat_sum.toFixed(2)} ₽)</div>
      <div>Газ: ${item.gas_used.toFixed(2)} м³ (${item.gas_sum.toFixed(2)} ₽)</div>
      <div style="font-weight:600;margin-top:4px;">Итого: ${item.total.toFixed(2)} ₽</div>
    </div>`).join("");
  renderChart();
}

function renderChart() {
  const canvas = document.getElementById("chartCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  canvas.width = rect.width; canvas.height = rect.height;
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  if (!history.length) {
    ctx.fillStyle = "#666"; ctx.font = "14px Arial"; ctx.textAlign = "center";
    ctx.fillText("Расчётов пока нет", W/2, H/2); return;
  }
  const top=40, bot=40, left=60, right=40;
  const pH=H-top-bot, pW=W-left-right;
  const maxT = Math.max(...history.map(i=>i.total));
  const scale = maxT>0 ? (pH*0.9)/maxT : 0;
  ctx.strokeStyle="#ccc"; ctx.lineWidth=1; ctx.font="10px Arial"; ctx.fillStyle="#666";
  for (let i=0; i<=4; i++) {
    const val = maxT*i/4, y = top+pH - val*scale;
    ctx.beginPath(); ctx.moveTo(left,y); ctx.lineTo(left+pW,y); ctx.stroke();
    ctx.fillText(val.toFixed(0)+" ₽", 4, y+3);
  }
  const stepX = history.length>1 ? pW/(history.length-1) : 0;
  const colors=["#0d6efd","#28a745","#fd7e14","#dc3545","#6f42c1"];
  ctx.beginPath(); ctx.strokeStyle="#0d6efd"; ctx.lineWidth=2;
  history.forEach((item,i) => {
    const x=left+i*stepX, y=top+pH-item.total*scale;
    i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
  });
  ctx.stroke();
  history.forEach((item,i) => {
    const x=left+i*stepX, y=top+pH-item.total*scale;
    ctx.fillStyle=colors[i%colors.length];
    ctx.beginPath(); ctx.arc(x,y,4,0,2*Math.PI); ctx.fill();
  });
}

function clearHistory() {
  if (confirm("Вы уверены, что хотите очистить всю историю расчётов?")) {
    history = []; localStorage.removeItem("kkh_history");
    const list = document.getElementById("history");
    if (list) list.innerHTML = "<div class='subtitle'>Расчётов пока нет</div>";
    renderChart();
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  loadTheme();
  loadHistory();
  setAuthMode("login");

  if (loadCurrentUser()) {
    updateNavAfterLogin();
    switchPanelRaw("profile");
    populateProfileForm();
  } else {
    updateNavAfterLogin();
    setAuthMode("login");
  }
});
