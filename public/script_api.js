let currentUser = null;
let authMode = "login";
let properties = [];
let selectedPropertyId = null;
let calcHistory = [];

async function api(method, url, body) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Ошибка запроса");
  }
  return data;
}

function $(id) {
  return document.getElementById(id);
}

function showMessage(type, text, scope = "auth") {
  if (scope === "auth") {
    const errorBox = $("authError");
    const successBox = $("authSuccess");
    errorBox.style.display = type === "error" ? "block" : "none";
    successBox.style.display = type === "success" ? "block" : "none";
    errorBox.textContent = type === "error" ? text : "";
    successBox.textContent = type === "success" ? text : "";
    return;
  }

  alert(text);
}

function clearAuthMessages() {
  $("authError").style.display = "none";
  $("authSuccess").style.display = "none";
  $("authError").textContent = "";
  $("authSuccess").textContent = "";
}

function switchPanel(panelId) {
  const isPrivatePanel = ["dashboard", "properties", "calc", "history", "profile"].includes(panelId);
  if (isPrivatePanel && !currentUser) {
    openAuth("login");
    return;
  }

  document.querySelectorAll(".panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === panelId);
  });

  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.classList.remove("active");
  });

  const navButton = $("nav_" + panelId);
  if (navButton) navButton.classList.add("active");

  if (panelId === "dashboard") renderDashboard();
  if (panelId === "history") renderHistory();
  if (panelId === "calc") renderCalcPropertyBadge();
  if (panelId === "profile") fillProfileForm();
}

function openAuth(mode = "login") {
  authMode = mode;
  renderAuthMode();
  switchPanel("auth");
}

function switchAuthMode() {
  authMode = authMode === "login" ? "register" : "login";
  renderAuthMode();
}

function renderAuthMode() {
  const registerOnly = document.querySelectorAll(".auth-register-only");
  const isRegister = authMode === "register";

  $("authTitle").textContent = isRegister ? "Создание аккаунта" : "Вход в кабинет";
  $("authSubtitle").textContent = isRegister
    ? "Зарегистрируйтесь, чтобы вести объекты, расчёты и историю расходов."
    : "Войдите, чтобы продолжить работу в своём кабинете.";
  $("authSubmitBtn").textContent = isRegister ? "Создать аккаунт" : "Войти";
  $("authModeSwitchBtn").textContent = isRegister ? "У меня уже есть аккаунт" : "Создать аккаунт";

  registerOnly.forEach((node) => {
    node.style.display = isRegister ? "block" : "none";
  });

  clearAuthMessages();
}

function updateAuthView() {
  const publicNodes = document.querySelectorAll(".public-only");
  const privateNodes = document.querySelectorAll(".private-only");

  publicNodes.forEach((node) => {
    node.classList.toggle("hidden", Boolean(currentUser));
  });
  privateNodes.forEach((node) => {
    node.classList.toggle("hidden", !currentUser);
  });

  const logged = $("loggedInAs");
  const logoutBtn = $("logoutBtn");

  if (currentUser) {
    logged.style.display = "block";
    logged.textContent = `@${currentUser.username}`;
    logoutBtn.style.display = "inline-flex";
  } else {
    logged.style.display = "none";
    logged.textContent = "";
    logoutBtn.style.display = "none";
  }
}

function getSelectedPropertyStorageKey() {
  return currentUser ? `myzhk:selectedProperty:${currentUser.id}` : "myzhk:selectedProperty:guest";
}

function persistSelectedProperty() {
  if (!currentUser) return;
  if (selectedPropertyId) {
    localStorage.setItem(getSelectedPropertyStorageKey(), String(selectedPropertyId));
  } else {
    localStorage.removeItem(getSelectedPropertyStorageKey());
  }
}

function restoreSelectedProperty() {
  if (!currentUser) return null;
  const raw = localStorage.getItem(getSelectedPropertyStorageKey());
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function authSubmit() {
  clearAuthMessages();

  try {
    if (authMode === "register") {
      const payload = {
        username: $("username_auth").value.trim(),
        password: $("password_auth").value,
        name: $("reg_name").value.trim(),
        surname: $("reg_surname").value.trim(),
      };
      await api("POST", "/api/register", payload);
      showMessage("success", "Аккаунт создан. Теперь войдите в кабинет.");
      authMode = "login";
      renderAuthMode();
      return;
    }

    const payload = {
      username: $("username_auth").value.trim(),
      password: $("password_auth").value,
    };

    const result = await api("POST", "/api/login", payload);
    currentUser = result.user;
    updateAuthView();
    await loadAppData();
    switchPanel("dashboard");
  } catch (error) {
    showMessage("error", error.message || "Не удалось выполнить действие");
  }
}

async function logout() {
  try {
    await api("POST", "/api/logout");
  } catch (_) {
    // ignore
  }

  currentUser = null;
  properties = [];
  selectedPropertyId = null;
  calcHistory = [];

  updateAuthView();
  renderProperties();
  renderHistory();
  renderDashboard();
  switchPanel("landing");
}

async function bootstrap() {
  loadTheme();
  renderAuthMode();
  updateAuthView();

  try {
    const result = await api("GET", "/api/me");
    currentUser = result.user;
  } catch (_) {
    currentUser = null;
  }

  updateAuthView();

  if (currentUser) {
    await loadAppData();
    switchPanel("dashboard");
  } else {
    switchPanel("landing");
  }
}

async function loadAppData() {
  await Promise.all([loadProperties(), loadTariffs(), loadHistory()]);
  fillProfileForm();
  renderCalcPropertyBadge();
  renderDashboard();
}

async function loadProperties() {
  if (!currentUser) {
    properties = [];
    selectedPropertyId = null;
    return;
  }

  const result = await api("GET", "/api/properties");
  properties = Array.isArray(result.properties) ? result.properties : [];

  const restoredId = restoreSelectedProperty();
  const hasRestored = properties.some((item) => item.id === restoredId);

  if (hasRestored) {
    selectedPropertyId = restoredId;
  } else if (selectedPropertyId && properties.some((item) => item.id === selectedPropertyId)) {
    // keep current selectedPropertyId
  } else {
    selectedPropertyId = properties[0]?.id || null;
  }

  persistSelectedProperty();
  renderProperties();
  renderCalcPropertyBadge();
  renderDashboard();
}

function getSelectedProperty() {
  return properties.find((item) => item.id === selectedPropertyId) || null;
}

function renderProperties() {
  const list = $("propertiesList");
  if (!list) return;

  if (!currentUser) {
    list.innerHTML = `<div class="empty-state">Войдите в кабинет, чтобы управлять объектами.</div>`;
    return;
  }

  if (!properties.length) {
    list.innerHTML = `
      <div class="empty-state">
        Пока нет ни одного объекта. Начните с квартиры или другого места, для которого хотите вести коммунальные расходы.
      </div>
    `;
    return;
  }

  list.innerHTML = properties.map((item) => {
    const activeClass = item.id === selectedPropertyId ? "active" : "";
    const address = item.address ? `<div class="property-address">${escapeHtml(item.address)}</div>` : "";
    const note = item.note ? `<div class="property-note">${escapeHtml(item.note)}</div>` : "";
    const updatedAt = formatDate(item.updated_at || item.created_at);

    return `
      <div class="property-item ${activeClass}">
        <div class="property-top">
          <div>
            <div class="property-title">${escapeHtml(item.title)}</div>
            ${address}
            ${note}
            <div class="property-meta">Обновлён: ${updatedAt}</div>
          </div>
          <div class="property-actions">
            <button class="btn btn-outline" onclick="selectProperty(${item.id})">${item.id === selectedPropertyId ? "Выбран" : "Выбрать"}</button>
            <button class="btn btn-outline" onclick="startEditProperty(${item.id})">Редактировать</button>
            <button class="btn btn-outline" onclick="removeProperty(${item.id})">Удалить</button>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

function resetPropertyForm() {
  $("property_id").value = "";
  $("property_title").value = "";
  $("property_address").value = "";
  $("property_note").value = "";
  $("propertySubmitBtn").textContent = "Сохранить объект";
}

async function saveProperty(event) {
  event.preventDefault();

  try {
    const id = Number($("property_id").value);
    const payload = {
      title: $("property_title").value.trim(),
      address: $("property_address").value.trim(),
      note: $("property_note").value.trim(),
    };

    if (id) {
      await api("PUT", `/api/properties/${id}`, payload);
      alert("Объект обновлён");
    } else {
      const result = await api("POST", "/api/properties", payload);
      if (!selectedPropertyId && result.property?.id) {
        selectedPropertyId = result.property.id;
      }
      alert("Объект создан");
    }

    resetPropertyForm();
    await loadProperties();
    switchPanel("properties");
  } catch (error) {
    alert(error.message || "Не удалось сохранить объект");
  }
}

function startEditProperty(id) {
  const item = properties.find((row) => row.id === id);
  if (!item) return;

  $("property_id").value = item.id;
  $("property_title").value = item.title || "";
  $("property_address").value = item.address || "";
  $("property_note").value = item.note || "";
  $("propertySubmitBtn").textContent = "Обновить объект";
  switchPanel("properties");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function selectProperty(id) {
  selectedPropertyId = id;
  persistSelectedProperty();
  renderProperties();
  renderDashboard();
  renderCalcPropertyBadge();
}

async function removeProperty(id) {
  const item = properties.find((row) => row.id === id);
  if (!item) return;

  const ok = confirm(`Удалить объект «${item.title}»?`);
  if (!ok) return;

  try {
    await api("DELETE", `/api/properties/${id}`);
    if (selectedPropertyId === id) {
      selectedPropertyId = null;
    }
    await loadProperties();
    resetPropertyForm();
  } catch (error) {
    alert(error.message || "Не удалось удалить объект");
  }
}

function renderDashboard() {
  const welcome = $("dashboardWelcome");
  const propertyState = $("dashboardPropertyState");
  const lastCalc = $("dashboardLastCalc");

  if (!welcome || !propertyState || !lastCalc) return;

  if (!currentUser) {
    welcome.textContent = "";
    propertyState.innerHTML = `<div class="empty-state">Авторизуйтесь, чтобы открыть кабинет.</div>`;
    lastCalc.innerHTML = "";
    drawHistoryChart($("dashboardChartCanvas"), []);
    return;
  }

  const displayName = [currentUser.name, currentUser.surname].filter(Boolean).join(" ") || currentUser.username;
  welcome.textContent = `Здравствуйте, ${displayName}`;

  const selectedProperty = getSelectedProperty();

  if (!properties.length) {
    propertyState.innerHTML = `
      <div class="empty-state">
        У вас пока нет объектов. Создайте первый объект, чтобы превратить сервис в реальный кабинет учёта, а не в разовую форму расчёта.
        <div class="btn-row" style="margin-top:12px;">
          <button class="btn btn-primary" onclick="switchPanel('properties')">Добавить объект</button>
        </div>
      </div>
    `;
  } else if (!selectedProperty) {
    propertyState.innerHTML = `
      <div class="empty-state">
        Выберите объект в разделе «Объекты», чтобы продолжить работу.
      </div>
    `;
  } else {
    propertyState.innerHTML = `
      <div class="property-pill">Текущий объект: ${escapeHtml(selectedProperty.title)}</div>
      <p style="margin-top:12px;">${selectedProperty.address ? escapeHtml(selectedProperty.address) : "Адрес пока не указан."}</p>
      <div class="btn-row" style="margin-top:14px;">
        <button class="btn btn-primary" onclick="switchPanel('calc')">Ввести показания</button>
        <button class="btn btn-outline" onclick="switchPanel('history')">Посмотреть историю</button>
      </div>
    `;
  }

  if (!calcHistory.length) {
    lastCalc.innerHTML = `
      <div class="empty-state compact">
        Пока нет расчётов. Сохраните первый расчёт, и здесь появится последняя сумма с разбивкой.
      </div>
    `;
  } else {
    const latest = calcHistory[0];
    lastCalc.innerHTML = `
      <div class="summary-line"><span>Дата</span><span>${formatDate(latest.calc_date)}</span></div>
      <div class="summary-line"><span>Электричество</span><span>${formatMoney(latest.electric_sum)}</span></div>
      <div class="summary-line"><span>Вода</span><span>${formatMoney(latest.water_sum)}</span></div>
      <div class="summary-line"><span>Отопление</span><span>${formatMoney(latest.heat_sum)}</span></div>
      <div class="summary-line"><span>Газ</span><span>${formatMoney(latest.gas_sum)}</span></div>
      <div class="summary-total"><span>Итого</span><span>${formatMoney(latest.total)}</span></div>
    `;
  }

  drawHistoryChart($("dashboardChartCanvas"), calcHistory);
}

function renderCalcPropertyBadge() {
  const node = $("calcPropertyBadge");
  if (!node) return;

  const selectedProperty = getSelectedProperty();
  node.textContent = selectedProperty
    ? `Объект: ${selectedProperty.title}`
    : "Объект пока не выбран";
}

async function loadTariffs() {
  if (!currentUser) return;

  try {
    const result = await api("GET", "/api/tariffs");
    const tariffs = result.tariffs || {};
    $("tariff_electric_day").value = safeNumber(tariffs.tariff_electric_day, 5.47);
    $("tariff_electric_night").value = safeNumber(tariffs.tariff_electric_night, 2.1);
    $("tariff_water").value = safeNumber(tariffs.tariff_water, 42.5);
    $("tariff_heat").value = safeNumber(tariffs.tariff_heat, 2100);
    $("tariff_gas").value = safeNumber(tariffs.tariff_gas, 7.5);
  } catch (_) {
    $("tariff_electric_day").value = 5.47;
    $("tariff_electric_night").value = 2.1;
    $("tariff_water").value = 42.5;
    $("tariff_heat").value = 2100;
    $("tariff_gas").value = 7.5;
  }
}

async function saveTariffs() {
  try {
    await api("PUT", "/api/tariffs", getTariffsPayload());
    alert("Тарифы сохранены");
  } catch (error) {
    alert(error.message || "Не удалось сохранить тарифы");
  }
}

function getTariffsPayload() {
  return {
    electric_day: numberFromInput("tariff_electric_day"),
    electric_night: numberFromInput("tariff_electric_night"),
    water: numberFromInput("tariff_water"),
    heat: numberFromInput("tariff_heat"),
    gas: numberFromInput("tariff_gas"),
  };
}

function getMetersPayload() {
  return {
    prev: {
      ed: numberFromInput("meter_e_day_prev"),
      en: numberFromInput("meter_e_night_prev"),
      w: numberFromInput("meter_water_prev"),
      h: numberFromInput("meter_heat_prev"),
      g: numberFromInput("meter_gas_prev"),
    },
    curr: {
      ed: numberFromInput("meter_e_day_curr"),
      en: numberFromInput("meter_e_night_curr"),
      w: numberFromInput("meter_water_curr"),
      h: numberFromInput("meter_heat_curr"),
      g: numberFromInput("meter_gas_curr"),
    },
  };
}

function validateMeters(meters) {
  const checks = [
    [meters.curr.ed < meters.prev.ed, "Электричество (день)"],
    [meters.curr.en < meters.prev.en, "Электричество (ночь)"],
    [meters.curr.w < meters.prev.w, "Вода"],
    [meters.curr.h < meters.prev.h, "Отопление"],
    [meters.curr.g < meters.prev.g, "Газ"],
  ];

  const errors = checks.filter(([condition]) => condition).map(([, label]) => `${label}: текущие меньше предыдущих`);
  if (errors.length) {
    alert("Ошибки ввода:\n" + errors.join("\n"));
    return false;
  }

  return true;
}

async function calculate() {
  try {
    const tariffs = getTariffsPayload();
    const meters = getMetersPayload();

    if (!validateMeters(meters)) return;

    const diff = (current, previous) => Math.max(0, current - previous);

    const electricUsedDay = diff(meters.curr.ed, meters.prev.ed);
    const electricSumDay = electricUsedDay * tariffs.electric_day;
    const electricUsedNight = diff(meters.curr.en, meters.prev.en);
    const electricSumNight = electricUsedNight * tariffs.electric_night;
    const electricSum = electricSumDay + electricSumNight;

    const waterUsed = diff(meters.curr.w, meters.prev.w);
    const waterSum = waterUsed * tariffs.water;

    const heatUsed = diff(meters.curr.h, meters.prev.h);
    const heatSum = heatUsed * tariffs.heat;

    const gasUsed = diff(meters.curr.g, meters.prev.g);
    const gasSum = gasUsed * tariffs.gas;

    const total = electricSum + waterSum + heatSum + gasSum;

    $("electricResult").textContent = formatMoney(electricSum);
    $("waterResult").textContent = formatMoney(waterSum);
    $("heatResult").textContent = formatMoney(heatSum);
    $("gasResult").textContent = formatMoney(gasSum);
    $("totalAmount").textContent = formatMoney(total);

    await api("PUT", "/api/tariffs", tariffs);
    await api("POST", "/api/history", {
      tariff_electric_day: tariffs.electric_day,
      tariff_electric_night: tariffs.electric_night,
      tariff_water: tariffs.water,
      tariff_heat: tariffs.heat,
      tariff_gas: tariffs.gas,
      electric_used_day: electricUsedDay,
      electric_sum_day: electricSumDay,
      electric_used_night: electricUsedNight,
      electric_sum_night: electricSumNight,
      electric_sum: electricSum,
      water_used: waterUsed,
      water_sum: waterSum,
      heat_used: heatUsed,
      heat_sum: heatSum,
      gas_used: gasUsed,
      gas_sum: gasSum,
      total,
    });

    await loadHistory();
    renderDashboard();
    alert("Расчёт сохранён в историю");
  } catch (error) {
    alert(error.message || "Не удалось сохранить расчёт");
  }
}

async function loadHistory() {
  if (!currentUser) {
    calcHistory = [];
    renderHistory();
    return;
  }

  try {
    const result = await api("GET", "/api/history");
    calcHistory = Array.isArray(result.history) ? result.history : [];
  } catch (_) {
    calcHistory = [];
  }

  renderHistory();
}

function renderHistory() {
  const list = $("historyList");
  if (!list) return;

  if (!currentUser) {
    list.innerHTML = `<div class="empty-state">Войдите, чтобы увидеть историю расчётов.</div>`;
    drawHistoryChart($("chartCanvas"), []);
    return;
  }

  if (!calcHistory.length) {
    list.innerHTML = `<div class="empty-state">Расчётов пока нет.</div>`;
    drawHistoryChart($("chartCanvas"), []);
    return;
  }

  list.innerHTML = calcHistory.map((item) => `
    <div class="history-item">
      <div class="history-head">
        <div class="history-date">${formatDate(item.calc_date)}</div>
        <div class="history-total">${formatMoney(item.total)}</div>
      </div>
      <div class="history-rows">
        <div class="history-row"><span>Электричество</span><strong>${formatMoney(item.electric_sum)}</strong></div>
        <div class="history-row"><span>Вода</span><strong>${formatMoney(item.water_sum)}</strong></div>
        <div class="history-row"><span>Отопление</span><strong>${formatMoney(item.heat_sum)}</strong></div>
        <div class="history-row"><span>Газ</span><strong>${formatMoney(item.gas_sum)}</strong></div>
      </div>
    </div>
  `).join("");

  drawHistoryChart($("chartCanvas"), calcHistory);
}

async function clearHistory() {
  if (!currentUser) return;
  const ok = confirm("Очистить всю историю расчётов?");
  if (!ok) return;

  try {
    await api("DELETE", "/api/history");
    calcHistory = [];
    renderHistory();
    renderDashboard();
  } catch (error) {
    alert(error.message || "Не удалось очистить историю");
  }
}

function fillProfileForm() {
  if (!currentUser) return;
  $("profile_name").value = currentUser.name || "";
  $("profile_surname").value = currentUser.surname || "";
  $("profile_phone").value = currentUser.phone || "";
  $("profile_email").value = currentUser.email || "";
  $("profileHeadline").innerHTML = `
    <strong>${escapeHtml([currentUser.name, currentUser.surname].filter(Boolean).join(" ") || currentUser.username)}</strong><br>
    <span style="color:var(--text-soft);">Логин: @${escapeHtml(currentUser.username)}</span>
  `;
}

async function saveProfile(event) {
  event.preventDefault();
  try {
    await api("PUT", "/api/profile", {
      name: $("profile_name").value.trim(),
      surname: $("profile_surname").value.trim(),
      phone: $("profile_phone").value.trim(),
      email: $("profile_email").value.trim(),
    });

    const me = await api("GET", "/api/me");
    currentUser = me.user;
    updateAuthView();
    fillProfileForm();
    renderDashboard();
    alert("Профиль сохранён");
  } catch (error) {
    alert(error.message || "Не удалось сохранить профиль");
  }
}

async function changePassword(event) {
  event.preventDefault();

  try {
    await api("PUT", "/api/change-password", {
      old_password: $("old_password").value,
      new_password: $("new_password").value,
    });

    $("old_password").value = "";
    $("new_password").value = "";
    alert("Пароль изменён");
  } catch (error) {
    alert(error.message || "Не удалось сменить пароль");
  }
}

function togglePw(inputId, button) {
  const input = $(inputId);
  const isPassword = input.type === "password";
  input.type = isPassword ? "text" : "password";
  button.textContent = isPassword ? "🙈" : "👁";
}

function toggleTheme() {
  document.body.classList.toggle("theme-dark");
  localStorage.setItem("myzhk:theme", document.body.classList.contains("theme-dark") ? "dark" : "light");
  drawHistoryChart($("chartCanvas"), calcHistory);
  drawHistoryChart($("dashboardChartCanvas"), calcHistory);
}

function loadTheme() {
  const theme = localStorage.getItem("myzhk:theme");
  document.body.classList.toggle("theme-dark", theme === "dark");
}

function goHome() {
  if (currentUser) {
    switchPanel("dashboard");
  } else {
    switchPanel("landing");
  }
}

function numberFromInput(id) {
  const value = parseFloat($(id).value);
  return Number.isFinite(value) ? value : 0;
}

function safeNumber(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function formatMoney(value) {
  return `${Number(value || 0).toFixed(2)} ₽`;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function drawHistoryChart(canvas, rows) {
  if (!canvas || typeof canvas.getContext !== "function") return;
  const ctx = canvas.getContext("2d");
  const width = canvas.width = canvas.clientWidth || 600;
  const height = canvas.height = canvas.height || 220;

  ctx.clearRect(0, 0, width, height);

  const styles = getComputedStyle(document.body);
  const border = styles.getPropertyValue("--border").trim() || "#dbe3f0";
  const primary = styles.getPropertyValue("--primary").trim() || "#2563eb";
  const textSoft = styles.getPropertyValue("--text-soft").trim() || "#5d6b82";
  const textFaint = styles.getPropertyValue("--text-faint").trim() || "#8d98aa";

  const chartRows = [...rows].slice(0, 8).reverse();

  if (!chartRows.length) {
    ctx.fillStyle = textFaint;
    ctx.font = "14px Onest";
    ctx.fillText("Пока нет данных для графика", 20, 32);
    return;
  }

  const padding = { top: 24, right: 20, bottom: 42, left: 52 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const max = Math.max(...chartRows.map((item) => Number(item.total) || 0), 1);
  const stepX = chartRows.length > 1 ? chartW / (chartRows.length - 1) : 0;

  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= 4; i += 1) {
    const y = padding.top + (chartH / 4) * i;
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
  }
  ctx.stroke();

  ctx.fillStyle = textFaint;
  ctx.font = "12px JetBrains Mono";
  for (let i = 0; i <= 4; i += 1) {
    const value = max - (max / 4) * i;
    const y = padding.top + (chartH / 4) * i + 4;
    ctx.fillText(`${value.toFixed(0)} ₽`, 8, y);
  }

  const points = chartRows.map((item, index) => {
    const x = padding.left + stepX * index;
    const ratio = (Number(item.total) || 0) / max;
    const y = padding.top + chartH - ratio * chartH;
    return { x, y, item };
  });

  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.strokeStyle = primary;
  ctx.lineWidth = 3;
  ctx.stroke();

  points.forEach((point) => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = primary;
    ctx.fill();
  });

  ctx.fillStyle = textSoft;
  ctx.font = "11px Onest";
  points.forEach((point, index) => {
    const date = new Date(point.item.calc_date);
    const label = Number.isNaN(date.getTime())
      ? `${index + 1}`
      : `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}`;
    ctx.fillText(label, point.x - 14, height - 14);
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

document.addEventListener("DOMContentLoaded", bootstrap);
window.addEventListener("resize", () => {
  drawHistoryChart($("chartCanvas"), calcHistory);
  drawHistoryChart($("dashboardChartCanvas"), calcHistory);
});
