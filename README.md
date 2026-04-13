# ЖКХ-калькулятор — Инструкция по запуску

## Структура проекта

```
kkh-calculator/
├── server.js          ← Express сервер (точка входа)
├── db.js              ← Модуль базы данных (SQLite)
├── package.json       ← Зависимости npm
├── data/
│   └── kkh.db         ← Файл базы данных (создаётся автоматически)
└── public/
    ├── index.html     ← Фронтенд
    ├── script.js      ← JS (работает с API)
    └── styles.css     ← Стили
```

---

## Шаг 1 — Установите Node.js

Скачайте с официального сайта: https://nodejs.org (версия 18 LTS или новее)

Проверьте установку:
```bash
node --version   # должно показать v18.x.x или выше
npm --version
```

---

## Шаг 2 — Скопируйте файлы

Поместите все файлы в одну папку, например `kkh-calculator/`.

Папка `public/` должна содержать `index.html`, `script.js`, `styles.css`.

---

## Шаг 3 — Установите зависимости

```bash
cd kkh-calculator
npm install
```

Это установит:
- **express** — веб-сервер
- **better-sqlite3** — работа с базой данных SQLite
- **cookie-parser** — работа с куками сессий

---

## Шаг 4 — Создайте папку для базы данных

```bash
mkdir data
```

---

## Шаг 5 — Запустите сервер

```bash
node server.js
```

Вы увидите:
```
✅ Сервер запущен: http://localhost:3000
```

Откройте в браузере: **http://localhost:3000**

---

## Для разработки (автоперезапуск при изменениях)

```bash
npm run dev
```

---

## REST API

| Метод | URL | Описание |
|-------|-----|----------|
| POST | `/api/register` | Регистрация |
| POST | `/api/login` | Вход |
| POST | `/api/logout` | Выход |
| GET | `/api/me` | Текущий пользователь |
| PUT | `/api/profile` | Обновить профиль |
| PUT | `/api/change-password` | Сменить пароль |
| GET | `/api/history` | История расчётов |
| POST | `/api/history` | Добавить расчёт |
| DELETE | `/api/history` | Очистить историю |

---

## Деплой на сервер (VPS / хостинг)

### 1. Установите Node.js на сервере
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 2. Скопируйте файлы на сервер (через FTP/SCP/Git)

### 3. Установите зависимости
```bash
npm install --production
```

### 4. Запустите через PM2 (менеджер процессов)
```bash
npm install -g pm2
pm2 start server.js --name kkh
pm2 save
pm2 startup
```

### 5. Настройте HTTPS (через Nginx + Let's Encrypt)
```bash
sudo apt install nginx certbot python3-certbot-nginx
```

В конфиге Nginx:
```nginx
server {
    server_name ваш-домен.ru;
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }
}
```

### 6. Установите переменную окружения для продакшна
```bash
NODE_ENV=production pm2 start server.js --name kkh
```

---

## Переход с SQLite на PostgreSQL

Когда понадобится настоящая облачная БД — замените `db.js` на PostgreSQL-версию.

1. Установите драйвер:
```bash
npm install pg
```

2. В `db.js` замените `better-sqlite3` на `pg`. Все функции (createUser, loginUser и т.д.) остаются с теми же именами — `server.js` менять **не нужно**.

Пример подключения к PostgreSQL:
```js
const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
```

---

## Безопасность

- Пароли хранятся в виде PBKDF2-хеша (100 000 итераций, SHA-512) — это стандартный подход
- Куки сессий имеют флаг `httpOnly` — JS не может их прочитать (защита от XSS)
- В продакшне (NODE_ENV=production) куки имеют флаг `secure` — только HTTPS
- Сессии истекают через 30 дней и автоматически чистятся
