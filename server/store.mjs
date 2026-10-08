// Простое файловое хранилище: заказы (data/orders.json) и настройки заведения (data/settings.json).
// Для продакшена замените на PostgreSQL / MongoDB — интерфейс функций останется тем же.
import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import { defaultMenu, withDefaults, applyMenu, applySettings, applyStop } from '../src/data.js';
import { withZoneNames } from '../src/calc.js';

const DIR = process.env.DATA_DIR || path.resolve('data');
const FILE = path.join(DIR, 'orders.json');
const CONF_FILE = path.join(DIR, 'settings.json');
const FIRST_ID = 1001;
const AUDIT_MAX = 2000;

// users — клиенты Telegram: телефон и геолокация из бота, язык, котлетки (бонусы) и кто пригласил
let db = { seq: FIRST_ID - 1, orders: [], users: {} };
// menu — меню (категории, ингредиенты, допы, party), settings — параметры заведения,
// stop — стоп-лист { id: true }, staff — сотрудники с паролем (касса в браузере),
// tgStaff — сотрудники из Telegram (вход в панель внутри Mini App), promos — промокоды,
// cookSecret / cookVer — код входа повара (меняется каждую минуту) и номер «смены» (сброс всех входов поваров),
// audit — журнал изменений настроек
let conf = { menu: null, settings: null, stop: {}, staff: [], tgStaff: [], promos: [], cookSecret: '', cookVer: 1, audit: [] };
// Номер ревизии: растёт при любом изменении, по нему касса понимает, что пора обновиться
let rev = 1;
let confRev = 1;
export const getRev = () => rev;
export const getConfRev = () => confRev;

const readJson = (file) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null);

export function loadStore() {
  fs.mkdirSync(DIR, { recursive: true });
  try { db = readJson(FILE) || db; } catch (e) { console.error('Не удалось прочитать', FILE, e.message); process.exit(1); }
  try { conf = { ...conf, ...(readJson(CONF_FILE) || {}) }; } catch (e) { console.error('Не удалось прочитать', CONF_FILE, e.message); process.exit(1); }
  db.users ||= {};
  conf.tgStaff ||= [];
  conf.promos ||= [];
  conf.cookSecret ||= crypto.randomBytes(20).toString('hex');
  conf.cookVer ||= 1;
  if (!conf.menu) conf.menu = defaultMenu();
  migrateMenu(conf.menu);
  // Статуса «Передан курьеру» больше нет — такие заказы считаем «Доставляется»
  for (const o of db.orders) if (o.status === 'courier') { o.status = 'delivering'; o.statusAt = { ...o.statusAt, delivering: o.statusAt?.delivering || o.statusAt?.courier }; }
  conf.settings = withDefaults(conf.settings);
  // Старые названия («Зона 1 — до 3 км») → по диапазону («до 3 км»)
  conf.settings.delivery.zones = withZoneNames([...conf.settings.delivery.zones].sort((a, b) => a.maxKm - b.maxKm));
  applyMenu(conf.menu);
  applySettings(conf.settings);
  applyStop(conf.stop);
  saveConf();
}

// Старые форматы меню: эмодзи вместо иконок, «допы» и Party Burger вместо меню товаров
function migrateMenu(menu) {
  const def = defaultMenu();
  const isIcon = (v) => /^[a-z0-9_]+$/.test(v || '');
  for (const c of menu.categories) {
    if (!isIcon(c.icon)) c.icon = def.categories.find((d) => d.id === c.id)?.icon || 'restaurant';
    c.nameUz ||= def.categories.find((d) => d.id === c.id)?.nameUz;
  }
  for (const i of menu.ingredients) {
    const d = def.ingredients.find((x) => x.id === i.id);
    if (d) { i.nameUz ||= d.nameUz; i.shortUz ||= d.shortUz; }
  }
  if (!menu.products) {
    // Допы, которые администратор уже настроил, переносим в меню с их ценами
    const CAT = { up_fries: 'snacks', up_drink: 'drinks', up_dip: 'sauces', up_dessert: 'desserts' };
    menu.products = def.products.map((p) => {
      const old = (menu.extras || []).find((u) => u.id === p.id);
      return old ? { ...p, name: old.name, note: old.note, price: old.price, hidden: !!old.hidden } : p;
    });
    for (const u of menu.extras || []) {
      if (!menu.products.find((p) => p.id === u.id)) menu.products.push({ id: u.id, cat: CAT[u.id] || 'snacks', name: u.name, note: u.note || '', price: u.price, icon: isIcon(u.icon) ? u.icon : 'restaurant', w: u.w || 0, kcal: u.kcal || 0, hidden: !!u.hidden });
    }
  }
  // Фото по умолчанию для позиций, у которых своего ещё нет
  for (const p of menu.products) { const d = def.products.find((x) => x.id === p.id); if (d?.image && p.image === undefined) p.image = d.image; }
  menu.productCats ||= def.productCats;
  delete menu.extras;
  delete menu.party;
}

function writer(file) {
  let queue = Promise.resolve();
  const write = (data) => {
    const snapshot = JSON.stringify(data, null, 1);
    queue = queue.then(async () => {
      const tmp = `${file}.tmp`;
      await fs.promises.writeFile(tmp, snapshot);
      await fs.promises.rename(tmp, file);
    }).catch((e) => console.error(`Ошибка записи ${path.basename(file)}:`, e.message));
    return queue;
  };
  write.flush = () => queue;
  return write;
}
const writeOrders = writer(FILE);
const writeConf = writer(CONF_FILE);
const save = () => { rev++; return writeOrders(db); };
const saveConf = () => { rev++; confRev++; return writeConf(conf); };
// Дождаться записи всех изменений (перед остановкой сервера)
export const flush = () => Promise.all([writeOrders.flush(), writeConf.flush()]);

// ── Заказы ──
// Возвращает промис записи на диск: новый заказ подтверждаем клиенту только после сохранения
export function createOrder(data) {
  const now = Date.now();
  const order = { id: ++db.seq, status: 'created', createdAt: now, statusAt: { created: now }, log: [], ...data };
  order.log.push({ at: now, by: 'Клиент', action: 'Заказ оформлен' });
  db.orders.push(order);
  return { order, saved: save() };
}

export const getOrder = (id) => db.orders.find((o) => o.id === Number(id)) || null;

// Повторная отправка того же заказа (тот же ключ идемпотентности) возвращает уже созданный заказ
export const findByIdem = (userId, idem) => (idem ? db.orders.find((o) => o.idem === idem && o.userId === userId) || null : null);

export function updateOrder(id, patch, log) {
  const o = getOrder(id);
  if (!o) return null;
  Object.assign(o, patch, { updatedAt: Date.now() });
  if (log) (o.log ||= []).push({ at: Date.now(), ...log });
  save();
  return o;
}

// ── Клиенты ──
export const getUser = (id) => db.users[id] || null;
export function saveUser(id, patch) {
  db.users[id] = { ...db.users[id], ...patch, updatedAt: Date.now() };
  save();
  return db.users[id];
}

export const ordersOfUser = (userId, limit = 5) =>
  db.orders.filter((o) => o.userId === userId).slice(-limit).reverse();

const CLOSED = ['done', 'cancelled'];
export const activeOrders = () => db.orders.filter((o) => !CLOSED.includes(o.status));

// Заказы за период (from/to — метки времени) с фильтрами для истории и отчётов
export function listOrders({ from = 0, to = Infinity, status, mode, q } = {}) {
  const needle = String(q || '').trim().toLowerCase();
  const digits = needle.replace(/\D/g, '');
  return db.orders.filter((o) => {
    if (o.createdAt < from || o.createdAt >= to) return false;
    if (status === 'active' ? CLOSED.includes(o.status) : status && o.status !== status) return false;
    if (mode && o.mode !== mode) return false;
    if (needle) {
      const hay = `${o.id} ${o.customer?.name || ''} ${o.tgName || ''} ${o.customer?.address || ''} ${o.table || ''}`.toLowerCase();
      if (!hay.includes(needle) && !(digits.length >= 3 && (o.customer?.phone || '').replace(/\D/g, '').includes(digits))) return false;
    }
    return true;
  });
}

export function todayStats() {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const today = db.orders.filter((o) => o.createdAt >= start.getTime() && o.status !== 'cancelled');
  const revenue = today.reduce((s, o) => s + o.total, 0);
  return { count: today.length, revenue, avg: today.length ? Math.round(revenue / today.length) : 0, active: activeOrders().length };
}

// ── Настройки, меню, стоп-лист ──
export const getConf = () => conf;

function audit(by, action, details) {
  conf.audit.push({ at: Date.now(), by, action, details });
  if (conf.audit.length > AUDIT_MAX) conf.audit.splice(0, conf.audit.length - AUDIT_MAX);
}

export function setMenu(menu, by, changes) {
  conf.menu = menu;
  applyMenu(menu);
  audit(by, 'Меню изменено', changes);
  return saveConf();
}

export function setSettings(settings, by, changes) {
  conf.settings = withDefaults(settings);
  applySettings(conf.settings);
  audit(by, 'Настройки изменены', changes);
  return saveConf();
}

export function setStop(id, stopped, by, name) {
  if (stopped) conf.stop[id] = true;
  else delete conf.stop[id];
  applyStop(conf.stop);
  audit(by, stopped ? 'Стоп-лист: убрано из продажи' : 'Стоп-лист: возвращено в продажу', name || id);
  return saveConf();
}

// ── Сотрудники ──
export const staffList = () => conf.staff;
export const getStaff = (id) => conf.staff.find((u) => u.id === id) || null;
export const findStaffByLogin = (login) => conf.staff.find((u) => u.login.toLowerCase() === String(login || '').trim().toLowerCase()) || null;

export function saveStaff(user, by, action) {
  const i = conf.staff.findIndex((u) => u.id === user.id);
  if (i >= 0) conf.staff[i] = user;
  else conf.staff.push(user);
  audit(by, action, `${user.login} (${user.role})`);
  return saveConf();
}

// ── Сотрудники из Telegram ──
// Владельцы (ADMIN_IDS) — всегда администраторы, их нельзя удалить из панели.
// Остальных администраторов и кассиров добавляют в админ-панели по Telegram ID или @username.
let owners = [];
export const setOwners = (ids) => { owners = ids.map(Number); };
export const getOwners = () => owners;
export const isOwner = (id) => owners.includes(Number(id));
export const tgStaffList = () => conf.tgStaff;
export const getTgStaff = (id) => conf.tgStaff.find((x) => x.tgId === Number(id)) || null;

// Роль пользователя Telegram: 'admin', 'cashier' или null
export function tgRole(id) {
  if (!id) return null;
  if (isOwner(id)) return 'admin';
  const s = getTgStaff(id);
  // Раньше у сотрудников из Telegram была отдельная роль «Повар» — теперь это сотрудник (касса + кухня)
  return s && s.active !== false ? (s.role === 'cook' ? 'cashier' : s.role) : null;
}
// Кому слать карточки заказов и оповещения, если нет группы кухни
export const tgStaffIds = () => [...new Set([...owners, ...conf.tgStaff.filter((x) => x.active !== false).map((x) => x.tgId)])];

export function saveTgStaff(entry, by, action) {
  const i = conf.tgStaff.findIndex((x) => x.tgId === entry.tgId);
  if (i >= 0) conf.tgStaff[i] = entry;
  else conf.tgStaff.push(entry);
  audit(by, action, `${entry.name}${entry.username ? ` (@${entry.username})` : ''} · ${entry.tgId} · ${entry.role === 'admin' ? 'администратор' : 'кассир'}`);
  return saveConf();
}

export function removeTgStaff(tgId, by) {
  const e = getTgStaff(tgId);
  if (!e) return null;
  conf.tgStaff = conf.tgStaff.filter((x) => x.tgId !== e.tgId);
  audit(by, 'Сотрудник из Telegram удалён', `${e.name}${e.username ? ` (@${e.username})` : ''} · ${e.tgId}`);
  saveConf();
  return e;
}

// Имя и никнейм меняются в Telegram — обновляем тихо, без записи в журнал
export function touchTgStaff(tgId, patch) {
  const e = getTgStaff(tgId);
  if (!e || Object.entries(patch).every(([k, v]) => e[k] === v)) return;
  Object.assign(e, patch);
  saveConf();
}

// Клиент по @username (никнейм сохраняется, когда человек пишет боту или открывает приложение)
export function findUserByUsername(username) {
  const u = String(username || '').replace(/^@/, '').toLowerCase();
  if (!u) return null;
  for (const [id, x] of Object.entries(db.users)) if ((x.username || '').toLowerCase() === u) return { id: Number(id), ...x };
  return null;
}

// ── Котлетки: бонусы клиента (1 котлетка = settings.referral.rate сум) ──
export const cutletsOf = (userId) => Math.max(0, Math.floor(db.users[userId]?.cutlets || 0));
// delta > 0 — начисление, < 0 — списание. История — последние 50 операций.
export function addCutlets(userId, delta, reason, orderId) {
  if (!userId || !delta) return cutletsOf(userId);
  const u = (db.users[userId] ||= {});
  u.cutlets = Math.max(0, Math.floor((u.cutlets || 0) + delta));
  u.cutletLog = [{ at: Date.now(), delta, reason, orderId: orderId || null }, ...(u.cutletLog || [])].slice(0, 50);
  save();
  return u.cutlets;
}
// Сколько друзей пригласил клиент и сколько из них уже сделали первый заказ
export function referralStats(userId) {
  let invited = 0, rewarded = 0;
  for (const u of Object.values(db.users)) if (u.referredBy === userId) { invited++; if (u.refRewarded) rewarded++; }
  return { invited, rewarded };
}
export const hasOrders = (userId) => db.orders.some((o) => o.userId === userId);
export const doneOrdersOf = (userId) => db.orders.filter((o) => o.userId === userId && o.status === 'done').length;

// ── Промокоды ──
export const promoList = () => conf.promos;
export const findPromo = (code) => conf.promos.find((x) => x.code === String(code || '').trim().toUpperCase()) || null;
// Сколько раз промокод применён (отменённые заказы не считаются); userId — только этим клиентом
export const promoUses = (code, userId) => db.orders.filter((o) => o.promo?.code === code && o.status !== 'cancelled' && (!userId || o.userId === userId)).length;
export function savePromo(promo, by, action) {
  const i = conf.promos.findIndex((x) => x.code === promo.code);
  if (i >= 0) conf.promos[i] = promo;
  else conf.promos.push(promo);
  audit(by, action, promo.code);
  return saveConf();
}
export function removePromo(code, by) {
  const p = findPromo(code);
  if (!p) return null;
  conf.promos = conf.promos.filter((x) => x.code !== p.code);
  audit(by, 'Промокод удалён', p.code);
  saveConf();
  return p;
}

// ── Повара: код входа меняется каждую минуту, «смена» сбрасывает все входы поваров ──
export const cookSecret = () => conf.cookSecret;
export const cookVer = () => conf.cookVer;
export function resetCookSessions(by) {
  conf.cookVer = (conf.cookVer || 1) + 1;
  audit(by, 'Все входы поваров завершены', `смена ${conf.cookVer}`);
  return saveConf();
}

// Приглашение: засчитываем, только если клиент новый (ещё не заказывал и никем не приглашён),
// а пригласивший — реальный пользователь бота и не он сам
export function applyReferral(userId, refId) {
  refId = Number(refId);
  if (!refId || refId === Number(userId) || !db.users[refId]) return false;
  const u = db.users[userId];
  if (u?.referredBy || hasOrders(userId)) return false;
  saveUser(userId, { referredBy: refId, referredAt: Date.now() });
  return true;
}
