// BurgerLab: веб-сервер Mini App + касса/админка + API заказов + Telegram-бот в одном процессе.
import 'dotenv/config';
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { validateInitData } from './auth.mjs';
import { loadStore, createOrder, getOrder, findByIdem, updateOrder, activeOrders, getConf, getConfRev, flush, getUser, saveUser, ordersOfUser, setOwners, tgRole, cutletsOf, referralStats, applyReferral } from './store.mjs';
import { buildOrder, publicOrder, onOrderEvent, onBonus, OrderError, checkPromo, afterCreate, markPaid } from './orders.mjs';
import { langFromCode } from '../src/i18n.js';
import { cartTotals, itemUnit } from '../src/calc.js';
import { createStaffApi, ensureAdmin } from './staff.mjs';
import { webhookCallback } from 'grammy';
import { createBot } from './bot.mjs';
import { STATUSES } from '../src/data.js';
import { deadlines, fmtTime, fmtPrice } from '../src/calc.js';

const {
  BOT_TOKEN,
  WEBAPP_URL = process.env.RENDER_EXTERNAL_URL, // на Render адрес сервиса подставляется сам
  KITCHEN_CHAT_ID = '',
  ADMIN_IDS = '',
  APP_NAME = '',
  PORT = 3000,
} = process.env;

if (!BOT_TOKEN) { console.error('✖ Укажите BOT_TOKEN в файле .env (получить у @BotFather)'); process.exit(1); }
if (!WEBAPP_URL || !WEBAPP_URL.startsWith('https://')) { console.error('✖ Укажите WEBAPP_URL в .env — публичный HTTPS-адрес этого сервера'); process.exit(1); }

// Администраторы в Telegram (владельцы): кнопки кухни, оповещения, /today и админ-панель в Mini App.
// Список зашит в код и действует всегда; ADMIN_IDS из окружения только добавляет к нему новых.
const OWNER_IDS = [5221460399, 283521608, 1481557725, 5534973702, 885532877];
const adminIds = [...new Set([...OWNER_IDS, ...ADMIN_IDS.split(',').map((s) => Number(s.trim())).filter(Boolean)])];
const webappUrl = WEBAPP_URL.replace(/\/+$/, '') + '/';
const staffSecret = process.env.STAFF_SECRET || crypto.createHash('sha256').update(`burgerlab-staff:${BOT_TOKEN}`).digest('hex');

loadStore();
setOwners(adminIds);
ensureAdmin();
const { bot, setup, sendToKitchen, refreshKitchenCard, notifyCustomer, notifyBonus, alertStaff, resolveTgUser, notifyStaffAdded } = createBot({ token: BOT_TOKEN, webappUrl, kitchenChatId: KITCHEN_CHAT_ID, apiRoot: process.env.TELEGRAM_API_ROOT });
const me = await setup();
console.log(`✔ Бот @${me.username} подключён`);
if (!KITCHEN_CHAT_ID && !adminIds.length) console.warn('⚠ Не заданы KITCHEN_CHAT_ID и ADMIN_IDS: заказы увидит только веб-касса, оповещения о задержках в Telegram не придут');

// Любое изменение заказа: обновить карточку в чате кухни и уведомить клиента
onOrderEvent(async (o, event) => {
  await refreshKitchenCard(o);
  await notifyCustomer(o, event);
});
// Начислены котлетки за приглашение — сообщение клиенту
onBonus((userId, amount, kind) => notifyBonus(userId, amount, kind));

// Язык клиента: выбранный в боте или приложении, иначе по языку Telegram
const langOf = (user) => getUser(user.id)?.lang || langFromCode(user.language_code);

// Страницы: dist/index.html (приложение) и dist/staff.html (касса и админка) + конфиг для клиента
const DIST = path.resolve('dist');
for (const f of ['index.html', 'staff.html']) {
  if (!fs.existsSync(path.join(DIST, f))) { console.error(`✖ Нет dist/${f} — выполните npm run build`); process.exit(1); }
}
const config = { botUsername: me.username, appName: APP_NAME, apiBase: '' };
const pageHtml = (f) => fs.readFileSync(path.join(DIST, f), 'utf8').replace('<!--BL_CONFIG-->', `<script>window.BL_CONFIG=${JSON.stringify(config)}</script>`);
const cachedPages = { 'index.html': pageHtml('index.html'), 'staff.html': pageHtml('staff.html') };
const page = (f) => (process.env.NODE_ENV !== 'production' ? pageHtml(f) : cachedPages[f]); // в разработке подхватываем свежую сборку

// Мини-ограничитель частоты запросов
const hits = new Map();
const tooMany = (key, limit = 20, windowMs = 60_000) => {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  arr.push(now); hits.set(key, arr);
  return arr.length > limit;
};
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (!v.some((t) => now - t < 10 * 60_000)) hits.delete(k); }, 10 * 60_000).unref();

const send = (res, code, data) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
};

const readBody = (req, max = 400_000) => new Promise((resolve, reject) => {
  let size = 0; const chunks = [];
  req.on('data', (c) => { size += c.length; if (size > max) { reject(new Error('Слишком большой запрос')); req.destroy(); } else chunks.push(c); });
  req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(new Error('Неверный JSON')); } });
  req.on('error', reject);
});

const UPLOADS = path.join(process.env.DATA_DIR || path.resolve('data'), 'uploads');
const staffApi = createStaffApi({ uploadsDir: UPLOADS, secret: staffSecret, send, readBody, tooMany, botToken: BOT_TOKEN, resolveTgUser, notifyStaffAdded });

// Публичная часть настроек: меню, стоп-лист и параметры, нужные приложению
const publicConfig = () => {
  const { menu, settings, stop } = getConf();
  return { rev: getConfRev(), menu, settings, stop, now: Date.now() };
};

// Создание заказа. Один ключ idem = один заказ: повторная отправка (обрыв сети, двойное нажатие)
// возвращает уже созданный заказ, а не новый.
const creating = new Set();
async function postOrder(req, res, user) {
  const body = await readBody(req);
  const idem = typeof body.idem === 'string' && /^[\w-]{8,64}$/.test(body.idem) ? body.idem : null;
  if (!idem) return send(res, 400, { error: 'Обновите приложение и попробуйте ещё раз' });
  const existing = findByIdem(user.id, idem);
  if (existing) return send(res, 200, { order: publicOrder(existing), repeated: true });
  const lock = `${user.id}:${idem}`;
  if (creating.has(lock)) return send(res, 409, { error: 'Заказ уже отправляется', retry: true });
  creating.add(lock);
  try {
    let data;
    try { data = buildOrder(body, Date.now(), { userId: user.id, lang: langOf(user) }); } catch (e) {
      if (e instanceof OrderError) return send(res, 400, { error: e.message, code: e.code, cids: e.cids });
      throw e;
    }
    const { order, saved } = createOrder({ ...data, idem, userId: user.id, username: user.username || '', tgName: [user.first_name, user.last_name].filter(Boolean).join(' ') });
    await saved; // ответ клиенту — только после записи на диск
    afterCreate(order);
    console.log(`🍔 Новый заказ #${order.id} (${order.mode}) от ${order.tgName} на ${order.total} сум`);
    send(res, 201, { order: publicOrder(order) });
    const cards = await sendToKitchen(order);
    if (cards?.length) updateOrder(order.id, { cards });
    await notifyCustomer(order, { type: 'status' });
  } finally {
    creating.delete(lock);
  }
}

// Webhook (USE_WEBHOOK=1, на Render включён по умолчанию): бесплатный инстанс засыпает без входящих
// запросов, и long polling остановился бы. Входящий апдейт от Telegram будит сервис.
const useWebhook = process.env.USE_WEBHOOK ? process.env.USE_WEBHOOK === '1' : !!process.env.RENDER;
const hookSecret = crypto.createHash('sha256').update(`burgerlab-hook:${BOT_TOKEN}`).digest('hex').slice(0, 32);
const hookPath = `/tg/${hookSecret}`;
const handleUpdate = useWebhook ? webhookCallback(bot, 'http', { secretToken: hookSecret }) : null;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (handleUpdate && req.method === 'POST' && url.pathname === hookPath) return await handleUpdate(req, res);

    if (url.pathname.startsWith('/api/staff/')) {
      if (await staffApi(req, res, url)) return;
      return send(res, 404, { error: 'Не найдено' });
    }

    if (url.pathname === '/api/config' && req.method === 'GET') {
      const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
      if (tooMany(`cfg:${ip}`, 120)) return send(res, 429, { error: 'Слишком много запросов' });
      return send(res, 200, publicConfig());
    }

    if (url.pathname.startsWith('/api/')) {
      const auth = validateInitData(req.headers['x-telegram-init-data'], BOT_TOKEN);
      if (!auth) return send(res, 401, { error: 'Откройте приложение через Telegram-бота' });
      const { user } = auth;
      if (tooMany(user.id, 40)) return send(res, 429, { error: 'Слишком много запросов, подождите минуту' });

      if (req.method === 'POST' && url.pathname === '/api/orders') return await postOrder(req, res, user);

      // Данные клиента из бота: номер телефона и геолокация, которыми он поделился
      if (req.method === 'GET' && url.pathname === '/api/me') {
        let u = getUser(user.id);
        // Запоминаем никнейм: по нему сотрудника можно добавить в админ-панели
        const tgName = [user.first_name, user.last_name].filter(Boolean).join(' ');
        if (!u || u.username !== (user.username || '') || u.tgName !== tgName) u = saveUser(user.id, { username: user.username || '', tgName });
        const role = tgRole(user.id);
        return send(res, 200, {
          phone: u?.phone || '', name: u?.name || '', location: u?.location || null, address: u?.address || '', admin: !!role, role,
          lang: u?.lang || '', cutlets: cutletsOf(user.id), cutletLog: (u?.cutletLog || []).slice(0, 20), referral: referralStats(user.id),
          referredBy: !!u?.referredBy, refRewarded: !!u?.refRewarded,
        });
      }

      // Клиент сменил язык в приложении — бот тоже будет писать на нём
      if (req.method === 'POST' && url.pathname === '/api/me') {
        const b = await readBody(req);
        if (['ru', 'uz'].includes(b.lang)) saveUser(user.id, { lang: b.lang });
        return send(res, 200, { ok: true });
      }

      // Пришёл по ссылке друга (startapp=ref<id>)
      if (req.method === 'POST' && url.pathname === '/api/ref') {
        const b = await readBody(req);
        const m = String(b.code || '').match(/^ref(\d{3,15})$/);
        return send(res, 200, { ok: !!m && applyReferral(user.id, m[1]) });
      }

      // Проверка промокода при оформлении: сумма считается по актуальным ценам
      if (req.method === 'POST' && url.pathname === '/api/promo') {
        const b = await readBody(req);
        const items = (Array.isArray(b.items) ? b.items : []).slice(0, 30).map((it) => ({ ...it, qty: Math.min(20, Math.max(1, Math.floor(Number(it.qty) || 1))) })).map((it) => ({ ...it, unit: itemUnit(it) }));
        try {
          const r = checkPromo(b.code, cartTotals(items).sub, user.id, langOf(user));
          return send(res, 200, { code: r.promo.code, discount: r.discount, type: r.promo.type, value: r.promo.value });
        } catch (e) {
          if (e instanceof OrderError) return send(res, 400, { error: e.message, code: e.code });
          throw e;
        }
      }

      // Оплата Click / Payme (тестовый режим)
      const pay = url.pathname.match(/^\/api\/orders\/(\d+)\/pay$/);
      if (req.method === 'POST' && pay) {
        const o = getOrder(pay[1]);
        if (!o || o.userId !== user.id) return send(res, 404, { error: 'Заказ не найден' });
        const r = markPaid(o);
        if (r.error) return send(res, r.code, { error: r.error });
        return send(res, 200, { order: publicOrder(r.order) });
      }

      // Последние заказы клиента — чтобы история была на любом устройстве, а не только там, где оформляли
      if (req.method === 'GET' && url.pathname === '/api/orders') {
        return send(res, 200, { orders: ordersOfUser(user.id, 20).map(publicOrder) });
      }

      const m = url.pathname.match(/^\/api\/orders\/(\d+)$/);
      if (req.method === 'GET' && m) {
        const o = getOrder(m[1]);
        if (!o || o.userId !== user.id) return send(res, 404, { error: 'Заказ не найден' });
        return send(res, 200, { order: publicOrder(o) });
      }
      return send(res, 404, { error: 'Не найдено' });
    }

    if (url.pathname === '/health') return send(res, 200, { ok: true });

    // Фото меню: стандартные (public/img) и загруженные в админке (DATA_DIR/uploads)
    const img = url.pathname.match(/^\/(img|uploads)\/([\w.-]+\.(?:jpe?g|png|webp))$/i);
    if (req.method === 'GET' && img) {
      const file = path.join(img[1] === 'img' ? path.resolve('public/img') : UPLOADS, img[2]);
      if (!fs.existsSync(file)) return send(res, 404, { error: 'Нет файла' });
      const type = /\.png$/i.test(file) ? 'image/png' : /\.webp$/i.test(file) ? 'image/webp' : 'image/jpeg';
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'public, max-age=604800' });
      return fs.createReadStream(file).pipe(res);
    }

    if (req.method === 'GET') {
      const staff = url.pathname === '/staff' || url.pathname.startsWith('/staff/');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', ...(staff ? { 'X-Frame-Options': 'DENY', 'X-Robots-Tag': 'noindex' } : {}) });
      return res.end(page(staff ? 'staff.html' : 'index.html'));
    }
    send(res, 405, { error: 'Метод не поддерживается' });
  } catch (e) {
    if (/JSON|Слишком большой/.test(e.message)) return send(res, 400, { error: e.message });
    console.error(e);
    if (!res.headersSent) send(res, 500, { error: 'Внутренняя ошибка сервера' });
  }
});

// Контроль сроков: заказ долго не принимают, опаздывает приготовление или доставка
const watchdog = setInterval(() => {
  const now = Date.now();
  for (const o of activeOrders()) {
    const d = deadlines(o);
    const alerts = o.alerts || {};
    const mark = (k) => updateOrder(o.id, { alerts: { ...alerts, [k]: true } }, { by: 'Система', action: 'Оповещение персонала', note: k });
    const head = `#${o.id} · ${fmtPrice(o.total)} · ${STATUSES[o.status].t}`;
    if (!alerts.accept && ['created', 'received'].includes(o.status) && now > d.acceptBy) {
      mark('accept');
      alertStaff(`⏰ <b>Заказ не принят уже ${Math.round((now - o.createdAt) / 60000)} мин</b>\n${head}`);
    } else if (!alerts.ready && ['accepted', 'cooking'].includes(o.status) && now > d.readyBy) {
      mark('ready');
      alertStaff(`🔥 <b>Просрочено приготовление</b>\n${head}\nДолжен был быть готов к ${fmtTime(d.readyBy)}`);
    } else if (!alerts.done && o.mode === 'delivery' && ['ready', 'delivering'].includes(o.status) && now > d.doneBy) {
      mark('done');
      alertStaff(`🛵 <b>Просрочена доставка</b>\n${head}\nОбещали к ${fmtTime(o.etaAt)}`);
    }
  }
}, 30_000);

server.listen(Number(PORT), () => {
  console.log(`✔ Mini App: ${webappUrl} (локально http://localhost:${PORT})`);
  console.log(`✔ Касса и админ-панель: ${webappUrl}staff`);
});

if (useWebhook) {
  await bot.api.setWebhook(`${webappUrl}${hookPath.slice(1)}`, { secret_token: hookSecret, allowed_updates: ['message', 'callback_query'] });
  console.log('✔ Бот получает сообщения через webhook');
} else {
  bot.start({ drop_pending_updates: true, onStart: () => console.log('✔ Бот слушает сообщения (long polling)') });
}

const stop = async () => { clearInterval(watchdog); if (!useWebhook) bot.stop(); server.close(); await flush(); process.exit(0); };
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
