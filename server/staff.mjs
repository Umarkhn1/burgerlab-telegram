// API кассы и админ-панели: вход сотрудников, роли, заказы, стоп-лист, меню, настройки, отчёты.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { hashPassword, checkPassword, signToken, verifyToken, validateInitData } from './auth.mjs';
import {
  getRev, getConfRev, getConf, activeOrders, listOrders, getOrder, setStop, setMenu, setSettings,
  staffList, getStaff, findStaffByLogin, saveStaff,
  tgRole, getOwners, isOwner, tgStaffList, getTgStaff, saveTgStaff, removeTgStaff, touchTgStaff, getUser,
  promoList, findPromo, savePromo, removePromo, cookSecret, cookVer, resetCookSessions,
} from './store.mjs';
import { changeStatus, changeEta } from './orders.mjs';
import { STATUSES, MODES, DEFAULT_SETTINGS, INGREDIENTS, PRODUCTS, PAYMENTS } from '../src/data.js';
import { withZoneNames } from '../src/calc.js';

export const ROLES = {
  admin: { t: 'Администратор', perms: ['orders', 'kitchen', 'history', 'stop', 'eta', 'menu', 'promos', 'settings', 'staff', 'reports', 'audit'] },
  cashier: { t: 'Кассир', perms: ['orders', 'history', 'stop'] },
  cook: { t: 'Повар', perms: ['kitchen'] },
};
const COOK_HOURS = 16; // вход повара действует одну смену

// Код входа повара: 6 цифр, меняется каждую минуту (HMAC от секрета и номера минуты).
// Принимаем текущий и предыдущий код — чтобы успеть ввести на границе минуты.
export function cookCode(t = Date.now()) {
  const h = crypto.createHmac('sha256', cookSecret()).update(String(Math.floor(t / 60000))).digest();
  return String(h.readUInt32BE(0) % 1_000_000).padStart(6, '0');
}
const cookCodeOk = (code) => {
  const c = String(code || '').replace(/\D/g, '');
  return c.length === 6 && [cookCode(), cookCode(Date.now() - 60000)].some((x) => crypto.timingSafeEqual(Buffer.from(x), Buffer.from(c)));
};
const TOKEN_DAYS = 14;
const VIS = ['bun', 'patty', 'crispy', 'smash', 'wagyu', 'cheese', 'tomato', 'onion', 'pickles', 'rings', 'lettuce', 'avocado', 'mushroom', 'caramel', 'pepper', 'sauce', 'bacon', 'egg', 'orings', 'fries', 'hash', 'pineapple', 'pastrami', 'crumbs', 'nachos', 'poppers', 'mac'];

const publicUser = (u) => ({ id: u.id, login: u.login, name: u.name, role: u.role, active: u.active !== false, perms: ROLES[u.role]?.perms || [] });
const staffOrder = ({ cards, idem, ...o }) => o;

class HttpError extends Error { constructor(code, message) { super(message); this.code = code; } }
const fail = (code, message) => { throw new HttpError(code, message); };

// Первый администратор: из .env или со сгенерированным паролем (выводится в консоль один раз)
export function ensureAdmin() {
  if (staffList().some((u) => u.role === 'admin' && u.active !== false)) return;
  const login = process.env.STAFF_ADMIN_LOGIN || 'admin';
  const password = process.env.STAFF_ADMIN_PASSWORD || crypto.randomBytes(6).toString('base64url');
  const existing = findStaffByLogin(login);
  const user = { ...(existing || { id: crypto.randomUUID(), createdAt: Date.now() }), login, name: existing?.name || 'Администратор', role: 'admin', active: true, pass: hashPassword(password), ver: (existing?.ver || 0) + 1 };
  saveStaff(user, 'Система', 'Создан администратор');
  console.log(`✔ Администратор кассы: логин «${login}»${process.env.STAFF_ADMIN_PASSWORD ? ' (пароль из .env)' : `, пароль «${password}» — смените его в админ-панели`}`);
}

// Сотрудник из Telegram (владелец из ADMIN_IDS или добавленный в панели): входит в панель внутри Mini App
// по подписи initData, без пароля. Роль — из списка сотрудников.
const tgStaffUser = (t, role) => ({
  id: `tg:${t.id}`, tgId: t.id, login: t.username ? `@${t.username}` : `tg${t.id}`, name: [t.first_name, t.last_name].filter(Boolean).join(' ') || 'Сотрудник',
  role, active: true, tg: true,
});
const ROLE_T = { admin: 'администратор', cashier: 'кассир', cook: 'повар' };

export function createStaffApi({ secret, send, readBody, tooMany, botToken, resolveTgUser, notifyStaffAdded, uploadsDir }) {
  const who = (u) => `${u.name} (${u.login})`;

  function auth(req, perm) {
    const initData = req.headers['x-telegram-init-data'];
    if (initData) {
      const a = validateInitData(initData, botToken);
      if (!a) fail(401, 'Откройте приложение заново');
      const role = tgRole(a.user.id);
      if (!role) fail(403, 'Раздел доступен только сотрудникам');
      touchTgStaff(a.user.id, { username: a.user.username || '', name: [a.user.first_name, a.user.last_name].filter(Boolean).join(' ') || getTgStaff(a.user.id)?.name });
      const u = tgStaffUser(a.user, role);
      if (!allowed(u, perm)) fail(403, 'Недостаточно прав');
      return u;
    }
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const p = verifyToken(token, secret);
    if (p?.cook) {
      if (p.ver !== cookVer()) fail(401, 'Смена завершена — войдите по новому коду');
      const u = { id: `cook:${p.sid}`, login: 'повар', name: p.name, role: 'cook', active: true };
      if (!allowed(u, perm)) fail(403, 'Недостаточно прав');
      return u;
    }
    const u = p && getStaff(p.uid);
    if (!u || u.active === false || u.ver !== p.ver) fail(401, 'Войдите заново');
    if (!allowed(u, perm)) fail(403, 'Недостаточно прав');
    return u;
  }
  // perm — право или список прав (достаточно любого)
  const allowed = (u, perm) => !perm || [].concat(perm).some((x) => ROLES[u.role]?.perms.includes(x));

  const range = (url) => {
    const from = Number(url.searchParams.get('from')) || 0;
    const to = Number(url.searchParams.get('to')) || Infinity;
    return { from, to };
  };

  const routes = [
    ['POST', /^\/api\/staff\/login$/, async (req) => {
      const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
      if (tooMany(`login:${ip}`, 10, 5 * 60_000)) fail(429, 'Слишком много попыток входа. Подождите 5 минут');
      const { login, password } = await readBody(req);
      const u = findStaffByLogin(login);
      if (!u || u.active === false || !checkPassword(password, u.pass)) fail(401, 'Неверный логин или пароль');
      const token = signToken({ uid: u.id, ver: u.ver, exp: Date.now() + TOKEN_DAYS * 86400_000 }, secret);
      return { token, user: publicUser(u) };
    }],

    // Повар входит по коду, который администратор видит в панели (меняется каждую минуту)
    ['POST', /^\/api\/staff\/cook-login$/, async (req) => {
      const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
      if (tooMany(`cook:${ip}`, 8, 5 * 60_000)) fail(429, 'Слишком много попыток. Подождите 5 минут');
      const { code, name } = await readBody(req);
      if (!cookCodeOk(code)) fail(401, 'Неверный или устаревший код. Попросите у администратора новый');
      const n = String(name || '').trim().slice(0, 30) || 'Повар';
      const sid = crypto.randomBytes(4).toString('hex');
      const token = signToken({ cook: 1, sid, name: n, ver: cookVer(), exp: Date.now() + COOK_HOURS * 3600_000 }, secret);
      return { token, user: publicUser({ id: `cook:${sid}`, login: 'повар', name: n, role: 'cook' }) };
    }],

    ['GET', /^\/api\/staff\/cook-code$/, async (req) => {
      auth(req, 'staff');
      return { code: cookCode(), expiresIn: 60000 - (Date.now() % 60000) };
    }],

    ['POST', /^\/api\/staff\/cook-reset$/, async (req) => {
      const u = auth(req, 'staff');
      await resetCookSessions(who(u));
      return { ok: true };
    }],

    ['GET', /^\/api\/staff\/me$/, async (req) => ({ user: publicUser(auth(req)), roles: ROLES })],

    // Касса опрашивает этот адрес каждые несколько секунд. desk=1 — это экран кассы:
    // новые заказы, которые он получил, становятся «Заказ на кассе».
    ['GET', /^\/api\/staff\/sync$/, async (req, url) => {
      const u = auth(req, ['orders', 'kitchen']);
      if (url.searchParams.get('desk') === '1' && ROLES[u.role].perms.includes('orders')) {
        for (const o of activeOrders().filter((x) => x.status === 'created')) changeStatus(o.id, 'received', { name: u.name, by: `Касса: ${who(u)}` });
      }
      const rev = getRev();
      if (Number(url.searchParams.get('rev')) === rev) return { rev, confRev: getConfRev(), now: Date.now(), same: true };
      const dayAgo = Date.now() - 24 * 3600_000;
      const orders = [...activeOrders(), ...listOrders({ from: dayAgo }).filter((o) => o.status === 'done' || o.status === 'cancelled')];
      return { rev, confRev: getConfRev(), now: Date.now(), orders: orders.map(staffOrder) };
    }],

    ['POST', /^\/api\/staff\/orders\/(\d+)\/status$/, async (req, url, m) => {
      const u = auth(req, ['orders', 'kitchen']);
      const { to, reason } = await readBody(req);
      if (!STATUSES[to]) fail(400, 'Неизвестный статус');
      // Повар только готовит: «Готовится» после приёма и «Готов»
      if (u.role === 'cook') {
        const o = getOrder(m[1]);
        const okStep = o && ((o.status === 'accepted' && to === 'cooking') || (o.status === 'cooking' && to === 'ready') || (o.status === 'accepted' && to === 'ready'));
        if (!okStep) fail(403, 'Повар может только начать готовить и отметить готовность');
      }
      const r = changeStatus(m[1], to, { name: u.name, by: `${u.role === 'cook' ? 'Кухня' : 'Касса'}: ${who(u)}` }, { reason });
      if (r.error) fail(r.code, r.error);
      return { order: staffOrder(r.order) };
    }],

    ['POST', /^\/api\/staff\/orders\/(\d+)\/eta$/, async (req, url, m) => {
      const u = auth(req, 'eta');
      const { etaAt } = await readBody(req);
      const r = changeEta(m[1], etaAt, { name: u.name, by: `Админ: ${who(u)}` });
      if (r.error) fail(r.code, r.error);
      return { order: staffOrder(r.order) };
    }],

    ['GET', /^\/api\/staff\/orders$/, async (req, url) => {
      auth(req, 'history');
      const q = url.searchParams;
      const list = listOrders({ ...range(url), status: q.get('status') || '', mode: q.get('mode') || '', q: q.get('q') || '' });
      const limit = Math.min(500, Number(q.get('limit')) || 200);
      return { total: list.length, orders: list.slice(-limit).reverse().map(staffOrder) };
    }],

    ['GET', /^\/api\/staff\/orders\/(\d+)$/, async (req, url, m) => {
      auth(req, 'history');
      const o = getOrder(m[1]);
      if (!o) fail(404, 'Заказ не найден');
      return { order: staffOrder(o) };
    }],

    ['POST', /^\/api\/staff\/stop$/, async (req) => {
      const u = auth(req, 'stop');
      const { id, stopped } = await readBody(req);
      const name = INGREDIENTS.find((x) => x.id === id && !x.deleted)?.name || PRODUCTS.find((x) => x.id === id)?.name;
      if (!name) fail(400, 'Позиция не найдена');
      await setStop(id, !!stopped, who(u), name);
      return { stop: getConf().stop };
    }],

    ['PUT', /^\/api\/staff\/menu$/, async (req) => {
      const u = auth(req, 'menu');
      const { menu } = await readBody(req);
      const prev = getConf().menu;
      const next = validateMenu(menu, prev);
      await setMenu(next, who(u), diffMenu(prev, next));
      return { menu: next };
    }],

    ['PUT', /^\/api\/staff\/settings$/, async (req) => {
      const u = auth(req, 'settings');
      const { settings } = await readBody(req);
      const prev = getConf().settings;
      const next = validateSettings(settings);
      await setSettings(next, who(u), diffObj(prev, next).slice(0, 30).join('; ') || 'без изменений');
      return { settings: getConf().settings };
    }],

    ['GET', /^\/api\/staff\/report$/, async (req, url) => {
      auth(req, 'reports');
      return { report: report(listOrders(range(url))) };
    }],

    ['GET', /^\/api\/staff\/users$/, async (req) => {
      auth(req, 'staff');
      return { users: staffList().map(publicUser), roles: ROLES };
    }],

    ['POST', /^\/api\/staff\/users$/, async (req) => {
      const u = auth(req, 'staff');
      const b = await readBody(req);
      const login = String(b.login || '').trim();
      if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(login)) fail(400, 'Логин: 3–32 символа, латиница, цифры, _ . -');
      if (findStaffByLogin(login)) fail(409, 'Такой логин уже есть');
      if (!ROLES[b.role]) fail(400, 'Неизвестная роль');
      if (String(b.password || '').length < 6) fail(400, 'Пароль — минимум 6 символов');
      const user = { id: crypto.randomUUID(), login, name: String(b.name || login).trim().slice(0, 40), role: b.role, active: true, pass: hashPassword(b.password), ver: 1, createdAt: Date.now() };
      await saveStaff(user, who(u), 'Добавлен сотрудник');
      return { user: publicUser(user) };
    }],

    ['PUT', /^\/api\/staff\/users\/([\w-]+)$/, async (req, url, m) => {
      const u = auth(req, 'staff');
      const target = getStaff(m[1]);
      if (!target) fail(404, 'Сотрудник не найден');
      const b = await readBody(req);
      const next = { ...target };
      if (b.name != null) next.name = String(b.name).trim().slice(0, 40) || target.name;
      if (b.role != null) { if (!ROLES[b.role]) fail(400, 'Неизвестная роль'); next.role = b.role; }
      if (b.active != null) next.active = !!b.active;
      if (b.password) { if (String(b.password).length < 6) fail(400, 'Пароль — минимум 6 символов'); next.pass = hashPassword(b.password); }
      // Не даём остаться без администратора
      const admins = staffList().filter((x) => x.role === 'admin' && x.active !== false && x.id !== target.id);
      if (!admins.length && (next.role !== 'admin' || next.active === false)) fail(400, 'Должен остаться хотя бы один активный администратор');
      if (b.password || next.role !== target.role || next.active !== target.active) next.ver = (target.ver || 0) + 1;
      const what = [b.password && 'пароль', next.role !== target.role && `роль → ${ROLES[next.role].t}`, next.active !== target.active && (next.active ? 'включён' : 'отключён'), next.name !== target.name && `имя → ${next.name}`].filter(Boolean).join(', ');
      await saveStaff(next, who(u), `Сотрудник изменён: ${what || 'без изменений'}`);
      return { user: publicUser(next) };
    }],

    // ── Сотрудники из Telegram: добавление по ID или @username, имя и никнейм подтягиваются сами ──
    ['GET', /^\/api\/staff\/tg$/, async (req) => {
      auth(req, 'staff');
      // Имя владельца ещё неизвестно (не открывал приложение после деплоя) — спрашиваем у Telegram
      for (const id of getOwners()) if (!getUser(id)?.tgName) await resolveTgUser(String(id)).catch(() => {});
      const owners = getOwners().map((id) => {
        const u = getUser(id);
        return { tgId: id, name: u?.tgName || u?.name || `ID ${id}`, username: u?.username || '', role: 'admin', active: true, owner: true };
      });
      return { list: [...owners, ...tgStaffList().filter((x) => !isOwner(x.tgId))] };
    }],

    ['POST', /^\/api\/staff\/tg$/, async (req) => {
      const u = auth(req, 'staff');
      const { query, role } = await readBody(req);
      if (!ROLES[role]) fail(400, 'Выберите роль');
      if (isOwner(String(query || '').trim())) fail(409, 'Это владелец, он уже администратор');
      const r = await resolveTgUser(query);
      if (r.error) fail(404, r.error);
      const t = r.user;
      if (isOwner(t.id)) fail(409, `${t.name} — владелец, он уже администратор`);
      const prev = getTgStaff(t.id);
      if (prev && prev.active !== false && prev.role === role) fail(409, `${t.name} уже в списке: ${ROLE_T[role]}`);
      const entry = { tgId: t.id, username: t.username, name: t.name, role, active: true, addedBy: who(u), addedAt: prev?.addedAt || Date.now() };
      await saveTgStaff(entry, who(u), prev ? 'Сотрудник из Telegram изменён' : 'Добавлен сотрудник из Telegram');
      const notified = await notifyStaffAdded(entry, u.name);
      return { entry, notified };
    }],

    ['PUT', /^\/api\/staff\/tg\/(\d+)$/, async (req, url, m) => {
      const u = auth(req, 'staff');
      const e = getTgStaff(m[1]);
      if (isOwner(m[1])) fail(400, 'Владельца меняют только в настройках сервера (ADMIN_IDS)');
      if (!e) fail(404, 'Сотрудник не найден');
      if (u.tgId === e.tgId) fail(400, 'Свою роль и доступ изменить нельзя');
      const b = await readBody(req);
      const next = { ...e };
      if (b.role != null) { if (!ROLES[b.role]) fail(400, 'Неизвестная роль'); next.role = b.role; }
      if (b.active != null) next.active = !!b.active;
      const what = [next.role !== e.role && `роль → ${ROLE_T[next.role]}`, next.active !== e.active && (next.active ? 'включён' : 'отключён')].filter(Boolean).join(', ');
      await saveTgStaff(next, who(u), `Сотрудник из Telegram изменён: ${what || 'без изменений'}`);
      return { entry: next };
    }],

    ['DELETE', /^\/api\/staff\/tg\/(\d+)$/, async (req, url, m) => {
      const u = auth(req, 'staff');
      if (isOwner(m[1])) fail(400, 'Владельца меняют только в настройках сервера (ADMIN_IDS)');
      if (u.tgId === Number(m[1])) fail(400, 'Себя удалить нельзя');
      if (!removeTgStaff(m[1], who(u))) fail(404, 'Сотрудник не найден');
      return { ok: true };
    }],

    // Фото позиции меню: картинка уже уменьшена в браузере, сохраняем файл и отдаём адрес
    ['POST', /^\/api\/staff\/upload$/, async (req) => {
      auth(req, 'menu');
      const { dataUrl } = await readBody(req, 3_000_000);
      const m = String(dataUrl || '').match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
      if (!m) fail(400, 'Нужна картинка JPG, PNG или WebP');
      const buf = Buffer.from(m[2], 'base64');
      if (buf.length > 1_500_000) fail(400, 'Фото больше 1,5 МБ — выберите поменьше');
      const name = `${crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16)}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
      fs.mkdirSync(uploadsDir, { recursive: true });
      fs.writeFileSync(path.join(uploadsDir, name), buf);
      return { url: `/uploads/${name}` };
    }],

    // ── Промокоды ──
    ['GET', /^\/api\/staff\/promos$/, async (req) => {
      auth(req, 'promos');
      const stats = {};
      for (const o of listOrders({})) if (o.promo?.code && o.status !== 'cancelled') { const x = (stats[o.promo.code] ||= { uses: 0, discount: 0 }); x.uses++; x.discount += o.discount || 0; }
      return { promos: promoList().map((p) => ({ ...p, uses: stats[p.code]?.uses || 0, discountSum: stats[p.code]?.discount || 0 })) };
    }],

    ['POST', /^\/api\/staff\/promos$/, async (req) => {
      const u = auth(req, 'promos');
      const b = await readBody(req);
      const prev = b.original ? findPromo(b.original) : null;
      const p = validatePromo(b, prev);
      if (findPromo(p.code) && p.code !== prev?.code) fail(409, `Промокод ${p.code} уже есть`);
      if (prev && prev.code !== p.code) removePromo(prev.code, who(u));
      await savePromo(p, who(u), prev ? 'Промокод изменён' : 'Добавлен промокод');
      return { promo: p };
    }],

    ['DELETE', /^\/api\/staff\/promos\/([\w-]+)$/, async (req, url, m) => {
      const u = auth(req, 'promos');
      if (!removePromo(decodeURIComponent(m[1]), who(u))) fail(404, 'Промокод не найден');
      return { ok: true };
    }],

    ['GET', /^\/api\/staff\/audit$/, async (req) => {
      auth(req, 'audit');
      return { audit: getConf().audit.slice(-500).reverse() };
    }],
  ];

  return async function handle(req, res, url) {
    for (const [method, re, fn] of routes) {
      const m = url.pathname.match(re);
      if (!m || req.method !== method) continue;
      try {
        send(res, 200, await fn(req, url, m));
      } catch (e) {
        if (e instanceof HttpError) send(res, e.code, { error: e.message });
        else if (/JSON|Слишком большой/.test(e.message)) send(res, 400, { error: e.message });
        else { console.error(e); send(res, 500, { error: 'Внутренняя ошибка сервера' }); }
      }
      return true;
    }
    return false;
  };
}

// ── Проверка меню ──
const num = (v, min, max, name) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) fail(400, `${name}: число от ${min} до ${max}`);
  return Math.round(n);
};
const str = (v, max, name, required = true) => {
  const s = String(v ?? '').trim().slice(0, max);
  if (required && !s) fail(400, `Заполните: ${name}`);
  return s;
};
const idOk = (id) => /^[a-z0-9_]{2,32}$/.test(String(id));
const iconOk = (v) => /^[a-z0-9_]{2,40}$/.test(String(v || ''));

function validateMenu(m, prev) {
  if (!m || !Array.isArray(m.categories) || !Array.isArray(m.ingredients) || !Array.isArray(m.products) || !Array.isArray(m.productCats)) fail(400, 'Неверный формат меню');
  const categories = m.categories.map((c) => ({ id: c.id, name: str(c.name, 30, 'название категории'), nameUz: str(c.nameUz, 30, 'nameUz', false) || undefined, icon: iconOk(c.icon) ? c.icon : 'restaurant', hidden: !!c.hidden }));
  // Категории конструктора — фиксированный набор: от него зависят слои, лимиты и визуализация
  if (categories.length !== prev.categories.length || categories.some((c) => !prev.categories.find((p) => p.id === c.id))) fail(400, 'Категории конструктора можно переименовать, скрыть или переставить, но не удалить');
  const catIds = categories.map((c) => c.id);
  const ingredients = m.ingredients.map((i) => {
    if (!idOk(i.id)) fail(400, `Неверный код ингредиента: ${i.id}`);
    // Удалённый ингредиент остаётся «пустым местом» в списке: по порядку ингредиентов кодируются ссылки на рецепты
    if (i.deleted) return { id: i.id, cat: catIds.includes(i.cat) ? i.cat : catIds[0], name: str(i.name, 40, 'название', false) || i.id, vis: VIS.includes(i.vis) ? i.vis : 'patty', price: 0, w: 0, kcal: 0, h: 1, c: '#999999', hidden: true, deleted: true };
    if (!catIds.includes(i.cat)) fail(400, `Неизвестная категория у «${i.name}»`);
    if (!VIS.includes(i.vis)) fail(400, `Неизвестный вид слоя у «${i.name}»`);
    const out = {
      id: i.id, cat: i.cat, name: str(i.name, 40, 'название'), nameUz: str(i.nameUz, 40, 'nameUz', false) || undefined,
      short: str(i.short, 20, 'короткое название', false) || undefined, shortUz: str(i.shortUz, 20, 'shortUz', false) || undefined, en: str(i.en, 40, 'en', false) || str(i.name, 40, 'название'),
      price: num(i.price, 0, 10_000_000, `Цена «${i.name}»`), w: num(i.w, 0, 5000, `Вес «${i.name}»`), kcal: num(i.kcal, 0, 10000, `Калории «${i.name}»`),
      h: num(i.h, 1, 200, `Высота «${i.name}»`), hot: i.hot ? num(i.hot, 0, 5, `Острота «${i.name}»`) : undefined, vis: i.vis,
      c: /^#[0-9a-fA-F]{6}$/.test(i.c) ? i.c : '#C98A3E', c2: /^#[0-9a-fA-F]{6}$/.test(i.c2) ? i.c2 : undefined, hidden: !!i.hidden,
    };
    for (const k of ['seeds', 'spots']) if (i[k]) out[k] = String(i[k]).slice(0, 10);
    return out;
  });
  prev.ingredients.forEach((p, n) => { if (ingredients[n]?.id !== p.id) fail(400, `Ингредиент «${p.name}» нельзя переместить — удалите его кнопкой удаления`); });
  const live = new Set(ingredients.filter((i) => !i.deleted).map((i) => i.id));
  const productCats = m.productCats.map((c) => {
    if (!idOk(c.id)) fail(400, `Неверный код раздела: ${c.id}`);
    return { id: c.id, name: str(c.name, 30, 'название раздела'), nameUz: str(c.nameUz, 30, 'nameUz', false) || undefined, icon: iconOk(c.icon) ? c.icon : 'restaurant', hidden: !!c.hidden };
  });
  const pcIds = productCats.map((c) => c.id);
  const products = m.products.map((p) => {
    if (!idOk(p.id)) fail(400, `Неверный код позиции: ${p.id}`);
    if (!pcIds.includes(p.cat)) fail(400, `«${p.name}»: раздел меню не найден`);
    const keys = Array.isArray(p.keys) ? p.keys.filter((k) => typeof k === 'string' && live.has(k.split(':').pop())).slice(0, 60) : [];
    return {
      id: p.id, cat: p.cat, name: str(p.name, 50, 'название'), nameUz: str(p.nameUz, 50, 'nameUz', false) || undefined,
      note: str(p.note, 100, 'описание', false), noteUz: str(p.noteUz, 100, 'noteUz', false) || undefined,
      price: num(p.price, 0, 10_000_000, `Цена «${p.name}»`), w: num(p.w || 0, 0, 10000, 'Вес'), kcal: num(p.kcal || 0, 0, 20000, 'Калории'),
      icon: iconOk(p.icon) ? p.icon : undefined, keys: keys.length ? keys : undefined, hit: !!p.hit, spicy: !!p.spicy, hidden: !!p.hidden,
      image: /^\/(img|uploads)\/[\w.-]+\.(jpe?g|png|webp)$/i.test(p.image || '') || /^https:\/\/[^\s"'<>]{8,400}$/.test(p.image || '') ? p.image : '',
    };
  });
  const all = [...ingredients, ...products].map((x) => x.id);
  if (new Set(all).size !== all.length) fail(400, 'Коды позиций должны быть уникальными');
  return { categories, ingredients, productCats, products };
}

function diffMenu(a, b) {
  const out = [];
  for (const key of ['categories', 'ingredients', 'productCats', 'products']) {
    for (const x of b[key] || []) {
      const y = (a[key] || []).find((z) => z.id === x.id);
      if (!y) { out.push(`добавлено: ${x.name}`); continue; }
      if (x.deleted && !y.deleted) { out.push(`удалено: ${y.name}`); continue; }
      for (const f of ['name', 'price', 'w', 'kcal', 'hidden', 'hit', 'spicy']) {
        if (y[f] !== x[f] && !(y[f] == null && !x[f])) out.push(`${x.name}: ${f === 'hidden' ? (x.hidden ? 'скрыто' : 'показано') : f === 'hit' ? (x.hit ? 'хит продаж' : 'не хит') : f === 'spicy' ? (x.spicy ? 'есть выбор остроты' : 'без выбора остроты') : `${f} ${y[f] ?? '—'} → ${x[f]}`}`);
      }
    }
    for (const y of a[key] || []) if (!(b[key] || []).find((z) => z.id === y.id)) out.push(`удалено: ${y.name}`);
  }
  return out.slice(0, 40).join('; ') || 'без изменений';
}

// ── Проверка промокода ──
function validatePromo(b, prev) {
  const code = String(b.code || '').trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,20}$/.test(code)) fail(400, 'Код: 3–20 символов, латинские буквы, цифры, _ и -');
  const type = b.type === 'fixed' ? 'fixed' : 'percent';
  const value = type === 'percent' ? num(b.value, 1, 100, 'Скидка, %') : num(b.value, 100, 10_000_000, 'Скидка, сум');
  const expiresAt = b.expiresAt ? Number(b.expiresAt) : null;
  if (expiresAt != null && !Number.isFinite(expiresAt)) fail(400, 'Неверная дата окончания');
  return {
    code, type, value, minOrder: num(b.minOrder || 0, 0, 100_000_000, 'Заказ от'), maxDiscount: type === 'percent' ? num(b.maxDiscount || 0, 0, 100_000_000, 'Скидка не больше') : 0,
    maxUses: num(b.maxUses || 0, 0, 1_000_000, 'Всего использований'), perUser: num(b.perUser ?? 1, 0, 1000, 'На одного клиента'), firstOrder: !!b.firstOrder,
    expiresAt, active: b.active !== false, note: str(b.note, 80, 'описание', false), createdAt: prev?.createdAt || Date.now(),
  };
}

// ── Проверка настроек ──
const hhmm = (v, name) => { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v))) fail(400, `${name}: формат ЧЧ:ММ`); return v; };

function validateSettings(s) {
  if (!s || typeof s !== 'object') fail(400, 'Неверный формат настроек');
  const L = s.limits || {};
  const cats = Object.keys(DEFAULT_SETTINGS.limits.maxCat);
  const maxCat = Object.fromEntries(cats.map((c) => [c, num(L.maxCat?.[c] ?? DEFAULT_SETTINGS.limits.maxCat[c], 0, 200, `Лимит категории ${c}`)]));
  const forbidden = (Array.isArray(L.forbidden) ? L.forbidden : [])
    .filter((p) => Array.isArray(p) && p.length === 2 && p[0] !== p[1])
    .map(([a, b]) => { if (!INGREDIENTS.find((i) => i.id === a) || !INGREDIENTS.find((i) => i.id === b)) fail(400, 'Неизвестный ингредиент в запрещённых сочетаниях'); return [a, b]; });
  // Название зоны строится из диапазона («до 3 км», «3–7 км») — его видят клиент, касса и кухня
  const zones = withZoneNames((s.delivery?.zones || []).map((z, n) => ({
    id: idOk(z.id) ? z.id : `z${n + 1}`, name: '', maxKm: Math.round(Number(z.maxKm) * 10) / 10 || fail(400, 'Расстояние «до» у зоны должно быть больше 0'),
    fee: num(z.fee, 0, 1_000_000, 'Стоимость доставки'), etaMin: num(z.etaMin, 5, 300, 'Время в пути'),
  })).sort((a, b) => a.maxKm - b.maxKm));
  if (zones.some((z, i) => i && z.maxKm === zones[i - 1].maxKm)) fail(400, 'У двух зон одинаковое расстояние «до» — измените одну из них');
  if (zones.length && zones[zones.length - 1].maxKm > 200) fail(400, 'Зона дальше 200 км — проверьте расстояние');
  if (new Set(zones.map((z) => z.id)).size !== zones.length) zones.forEach((z, i) => { z.id = `z${i + 1}`; });
  const o = s.delivery?.origin || {};
  const lat = Number(o.lat), lng = Number(o.lng);
  if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) fail(400, 'Координаты ресторана указаны неверно');
  const modes = { delivery: !!s.modes?.delivery, pickup: !!s.modes?.pickup, hall: !!s.modes?.hall };
  if (!Object.values(modes).some(Boolean)) fail(400, 'Включите хотя бы один способ получения');
  if (modes.delivery && !zones.length) fail(400, 'Для доставки нужна хотя бы одна зона');
  try { new Intl.DateTimeFormat('ru-RU', { timeZone: s.tz || DEFAULT_SETTINGS.tz }); } catch { fail(400, 'Неизвестный часовой пояс'); }
  return {
    minOrder: num(s.minOrder, 0, 100_000_000, 'Минимальная сумма'),
    freeFrom: num(s.freeFrom, 0, 1_000_000_000, 'Бесплатная доставка от'),
    tz: s.tz || DEFAULT_SETTINGS.tz,
    hours: { open: hhmm(s.hours?.open, 'Открытие'), close: hhmm(s.hours?.close, 'Закрытие') },
    modes,
    pickupAddress: str(s.pickupAddress, 160, 'адрес самовывоза'),
    hallTables: num(s.hallTables, 1, 500, 'Количество столов'),
    referral: {
      enabled: !!s.referral?.enabled,
      inviterBonus: num(s.referral?.inviterBonus ?? 0, 0, 100000, 'Бонус пригласившему'),
      inviteeBonus: num(s.referral?.inviteeBonus ?? 0, 0, 100000, 'Бонус приглашённому'),
      rate: num(s.referral?.rate ?? 1000, 1, 1_000_000, 'Курс котлетки'),
      maxPercent: num(s.referral?.maxPercent ?? 50, 0, 100, 'Оплата котлетками, %'),
    },
    limits: {
      minFillings: num(L.minFillings, 0, 50, 'Минимум начинок'),
      maxLayers: num(L.maxLayers, 3, 300, 'Максимум слоёв'),
      maxSame: num(L.maxSame, 1, 200, 'Максимум одинаковых'),
      maxCat, requireBun: !!L.requireBun, requireMeat: !!L.requireMeat, forbidden,
    },
    timing: {
      cookMin: num(s.timing?.cookMin, 1, 300, 'Время приготовления'),
      acceptAlertMin: num(s.timing?.acceptAlertMin, 1, 60, 'Сигнал «не принят»'),
      graceMin: num(s.timing?.graceMin, 0, 120, 'Допуск опоздания'),
    },
    delivery: { origin: { lat, lng }, zones },
  };
}

function diffObj(a, b, prefix = '') {
  const out = [];
  for (const k of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
    const x = a?.[k], y = b?.[k];
    if (x && y && typeof x === 'object' && typeof y === 'object' && !Array.isArray(x)) out.push(...diffObj(x, y, `${prefix}${k}.`));
    else if (JSON.stringify(x) !== JSON.stringify(y)) out.push(`${prefix}${k}: ${Array.isArray(y) || typeof y === 'object' ? 'изменено' : `${x ?? '—'} → ${y}`}`);
  }
  return out;
}

// ── Отчёт ──
function report(list) {
  const avg = (arr) => (arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length / 60000) : null);
  const ok = list.filter((o) => o.status !== 'cancelled');
  const cancelled = list.filter((o) => o.status === 'cancelled');
  const revenue = ok.reduce((s, o) => s + o.total, 0);
  const span = (o, a, b) => (o.statusAt?.[a] && o.statusAt?.[b] ? o.statusAt[b] - o.statusAt[a] : null);
  const vals = (fn) => list.map(fn).filter((v) => v != null && v >= 0);
  const reasons = {};
  cancelled.forEach((o) => { reasons[o.cancelReason || 'без причины'] = (reasons[o.cancelReason || 'без причины'] || 0) + 1; });
  const byMode = Object.fromEntries(Object.keys(MODES).map((m) => {
    const l = ok.filter((o) => o.mode === m);
    return [m, { count: l.length, revenue: l.reduce((s, o) => s + o.total, 0) }];
  }));
  const items = {};
  ok.forEach((o) => o.items.forEach((i) => { items[i.name] = (items[i.name] || 0) + i.qty; }));
  const done = list.filter((o) => o.status === 'done');
  const late = done.filter((o) => o.etaAt && o.statusAt.done > o.etaAt + (o.mode === 'delivery' ? getConf().settings.timing.graceMin * 60000 : 5 * 60000)).length;
  return {
    count: list.length, done: done.length, active: list.filter((o) => o.status !== 'done' && o.status !== 'cancelled').length,
    cancelled: cancelled.length, revenue, avgCheck: ok.length ? Math.round(revenue / ok.length) : 0,
    reasons: Object.entries(reasons).sort((a, b) => b[1] - a[1]),
    byMode,
    avgAcceptMin: avg(vals((o) => span(o, 'created', 'accepted'))),
    avgCookMin: avg(vals((o) => span(o, 'accepted', 'ready'))),
    avgDeliveryMin: avg(vals((o) => (o.mode === 'delivery' ? span(o, 'ready', 'done') : null))),
    avgTotalMin: avg(vals((o) => span(o, 'created', 'done'))),
    late,
    topItems: Object.entries(items).sort((a, b) => b[1] - a[1]).slice(0, 10),
    promoOrders: ok.filter((o) => o.promo?.code).length,
    promoDiscount: ok.reduce((s, o) => s + (o.discount || 0), 0),
    promos: Object.entries(ok.reduce((acc, o) => { if (o.promo?.code) { const x = (acc[o.promo.code] ||= { count: 0, discount: 0 }); x.count++; x.discount += o.discount || 0; } return acc; }, {})).sort((a, b) => b[1].count - a[1].count),
    cutletOrders: ok.filter((o) => o.cutletsUsed > 0).length,
    cutletSum: ok.reduce((s, o) => s + (o.cutletsSum || 0), 0),
    byPayment: Object.fromEntries(Object.keys(PAYMENTS).map((k) => { const l = ok.filter((o) => (o.payment || 'cash') === k); return [k, { count: l.length, revenue: l.reduce((s, o) => s + o.total, 0) }]; })),
  };
}

