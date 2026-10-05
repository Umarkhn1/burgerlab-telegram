import { ING, INGREDIENTS, PROD, SETTINGS, STOP, STATUSES, FLOWS, MODE_TEXT } from './data.js';
import { getLang, nm, t } from './i18n.js';

let uidSeq = 1;
export const uid = () => `L${Date.now().toString(36)}${(uidSeq++).toString(36)}`;

export const toLayers = (keys) => keys.map((key) => ({ uid: uid(), key, hidden: false }));

const BUN_PART = {
  top: { p: 0.5, w: 0.55, k: 0.55, h: 0.62 },
  bottom: { p: 0.5, w: 0.45, k: 0.45, h: 0.38 },
  mid: { p: 0.5, w: 0.4, k: 0.4, h: 0.32 },
};

export function parseKey(key) {
  const [a, b] = key.split(':');
  if (b) return { ing: ING[b], role: a };
  return { ing: ING[a], role: null };
}

export function layerMetrics(key) {
  const { ing, role } = parseKey(key);
  if (!ing) return { price: 0, w: 0, kcal: 0, h: 0 };
  if (role) {
    const f = BUN_PART[role];
    return { price: ing.price * f.p, w: ing.w * f.w, kcal: ing.kcal * f.k, h: ing.h * f.h };
  }
  return { price: ing.price, w: ing.w, kcal: ing.kcal, h: ing.h };
}

export const PACKAGING_FEE = 20000;
export const PACKAGING_CM = 25;
export const MODULE_CM = 35;

export function stats(layers) {
  let price = 0, w = 0, kcal = 0, h = 0, meat = 0, cheese = 0, hot = 0, count = 0, bacon = 0;
  for (const l of layers) {
    if (l.hidden) continue;
    const m = layerMetrics(l.key);
    const { ing } = parseKey(l.key);
    if (!ing) continue;
    price += m.price; w += m.w; kcal += m.kcal; h += m.h; count++;
    if (ing.cat === 'meat') meat++;
    if (ing.cat === 'cheese') cheese++;
    if (ing.id === 'bacon') bacon++;
    hot += ing.hot || 0;
  }
  const cm = h / 10;
  const packaging = cm > PACKAGING_CM ? PACKAGING_FEE : 0;
  return {
    price: Math.round(price / 500) * 500,
    weight: Math.round(w),
    kcal: Math.round(kcal),
    cm: Math.round(cm * 10) / 10,
    meat, cheese, hot, bacon, count, packaging,
    total: Math.round(price / 500) * 500 + packaging,
  };
}

export function burgerType(weight) {
  if (weight < 400) return { id: 'standard', label: 'Standard', tone: 'plain' };
  if (weight < 800) return { id: 'big', label: 'Big', tone: 'plain' };
  if (weight < 1500) return { id: 'xl', label: 'XL', tone: 'warm' };
  if (weight < 3000) return { id: 'giant', label: 'Giant', tone: 'hot' };
  return { id: 'monster', label: 'Monster', tone: 'fire' };
}

const NB = '\u00a0';
// Приблизительные значения (вес, калории, высота, время) клиенту показываем со знаком ≈
export const approx = (s) => `≈${NB}${s}`;
// Единицы на языке интерфейса (на сервере язык всегда русский)
const U = { ru: { sum: 'сум', kg: 'кг', g: 'г', kcal: 'ккал', cm: 'см' }, uz: { sum: "so'm", kg: 'kg', g: 'g', kcal: 'kkal', cm: 'sm' } };
const unit = (k) => (U[getLang()] || U.ru)[k];
export const fmtPrice = (n) => `${Math.round(n).toLocaleString('ru-RU').replace(/\u00a0|\u202f/g, NB)}${NB}${unit('sum')}`;
export const fmtWeight = (g) =>
  g >= 1000 ? `${(g / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}${NB}${unit('kg')}` : `${Math.round(g)}${NB}${unit('g')}`;
export const fmtKcal = (k) => `${Math.round(k).toLocaleString('ru-RU').replace(/\u00a0|\u202f/g, NB)}${NB}${unit('kcal')}`;
export const fmtCm = (c) => `${c.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}${NB}${unit('cm')}`;

export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

export function layerName(key) {
  const { ing, role } = parseKey(key);
  if (!ing) return key;
  if (role === 'top') return `${ing.name} — верх`;
  if (role === 'bottom') return `${ing.name} — низ`;
  if (role === 'mid') return `${ing.name} — середина`;
  return ing.name;
}
// Название слоя на языке интерфейса (для клиента)
export function layerLabel(key) {
  const { ing, role } = parseKey(key);
  if (!ing) return key;
  return role ? `${nm(ing)} — ${t(role === 'top' ? 'верх' : role === 'bottom' ? 'низ' : 'середина')}` : nm(ing);
}
export function layerNameEn(key) {
  const { ing, role } = parseKey(key);
  if (!ing) return key;
  if (role) return `${ing.en} ${role}`;
  return ing.en;
}

// Где появится новый слой: соусы под верхней булочкой, сыр — на самой верхней котлете,
// мясо — над нижней булочкой, всё остальное — под верхней булочкой.
export function insertIndexFor(layers, ing) {
  const topIdx = layers.findIndex((l) => l.key.startsWith('top:'));
  const bottomIdx = layers.map((l) => l.key).lastIndexOf(layers.find((l) => l.key.startsWith('bottom:'))?.key);
  const underTop = topIdx >= 0 ? topIdx + 1 : 0;
  const aboveBottom = bottomIdx >= 0 ? bottomIdx : layers.length;
  if (ing.cat === 'meat') {
    // над самой верхней котлетой, если есть; иначе над нижней булочкой
    const first = layers.findIndex((l) => parseKey(l.key).ing?.cat === 'meat');
    return first >= 0 ? first : aboveBottom;
  }
  if (ing.cat === 'cheese') {
    const first = layers.findIndex((l) => parseKey(l.key).ing?.cat === 'meat');
    return first >= 0 ? first : aboveBottom;
  }
  if (ing.cat === 'extra' && ['bacon', 'egg', 'pastrami'].includes(ing.id)) {
    const first = layers.findIndex((l) => parseKey(l.key).ing?.cat === 'meat');
    return first >= 0 ? first : underTop;
  }
  return underTop;
}

export function encodeRecipe(r) {
  try {
    const s = JSON.stringify({ n: r.name, a: r.author, k: r.layers.filter((l) => !l.hidden).map((l) => l.key) });
    return btoa(unescape(encodeURIComponent(s)));
  } catch { return ''; }
}
export function decodeRecipe(code) {
  try {
    const o = JSON.parse(decodeURIComponent(escape(atob(code))));
    if (!Array.isArray(o.k)) return null;
    const keys = o.k.filter((k) => parseKey(k).ing && !parseKey(k).ing.deleted);
    return { name: o.n || 'Бургер из ссылки', author: o.a || 'Друг', layers: toLayers(keys) };
  } catch { return null; }
}

export function randomBurger() {
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const by = (cat) => Object.values(ING).filter((i) => i.cat === cat && !isStopped(i.id)).map((i) => i.id);
  const bun = pick(by('bun'));
  const meatId = Math.random() < 0.7 ? 'beef' : pick(by('meat'));
  const cheeseId = pick(by('cheese'));
  const nMeat = rnd(1, 5);
  const mid = [];
  const sauces = [pick(by('sauce'))];
  if (Math.random() < 0.6) sauces.push(pick(by('sauce')));
  mid.push(...sauces);
  const veg = [];
  for (let i = 0; i < rnd(1, 4); i++) veg.push(pick(by('veg')));
  mid.push(...veg.slice(0, 2));
  for (let i = 0; i < nMeat; i++) {
    const c = rnd(0, 2);
    for (let j = 0; j < c; j++) mid.push(Math.random() < 0.7 ? cheeseId : pick(by('cheese')));
    if (Math.random() < 0.4) mid.push(pick(by('extra')));
    mid.push(meatId);
  }
  mid.push(...veg.slice(2));
  if (Math.random() < 0.5) mid.push(pick(['labsauce', 'bbq', 'cheesesauce']));
  const ok = (k) => k && ING[k] && !isStopped(k);
  return [`top:${bun}`, ...mid.filter(ok), `bottom:${bun}`];
}

// ── Корзина: общая логика для приложения и сервера бота ──────────────
// Доставка платная до порога SETTINGS.freeFrom; стоимость зависит от зоны.
// Без зоны (ещё не выбрана) fee = 0 и feeFrom — минимальная цена доставки.
// discount — скидка по промокоду, cutlets — сколько котлеток списать (сумма считается по курсу)
export function cartTotals(cart, mode = 'delivery', zone = null, { discount = 0, cutlets = 0 } = {}) {
  const sub = cart.reduce((s, i) => s + i.unit * i.qty, 0);
  const paid = mode === 'delivery' && sub > 0 && sub < SETTINGS.freeFrom;
  const zones = SETTINGS.delivery.zones;
  const fee = paid && zone ? zone.fee : 0;
  const feeFrom = paid && !zone && zones.length ? Math.min(...zones.map((z) => z.fee)) : 0;
  const disc = Math.max(0, Math.min(discount, sub));
  const cut = Math.min(cutletsSum(cutlets), sub - disc + fee);
  return { sub, fee, feeFrom, discount: disc, cutlets: cut, total: sub - disc + fee - cut, minLeft: Math.max(0, SETTINGS.minOrder - sub) };
}

// Стоп-лист: позиция недоступна, если она в стоп-листе, скрыта или удалена из меню
export const isStopped = (id) => !!STOP[id] || !!ING[id]?.hidden || !!ING[id]?.deleted;

// Позиция меню: старые позиции корзины «extra» — это тоже товары меню
const prodOf = (it) => (it.kind === 'product' || it.kind === 'extra' ? PROD[it.id] : null);

// Вес и калории товара: у бургеров из меню считаются по слоям, у остальных заданы в меню
export function productInfo(p) {
  if (p?.keys?.length) { const st = stats(toLayers(p.keys)); return { w: st.weight, kcal: st.kcal }; }
  return { w: p?.w || 0, kcal: p?.kcal || 0 };
}

// Почему позиция корзины сейчас недоступна (пустой массив — всё в порядке)
export function itemIssues(it) {
  if (it.kind === 'burger') {
    const names = new Set();
    for (const k of it.keys) {
      const { ing } = parseKey(k);
      if (!ing || ing.deleted) names.add(ing ? nm(ing) : k);
      else if (isStopped(ing.id)) names.add(nm(ing));
    }
    return [...names].map((n) => `${t('нет в наличии')}: ${n}`);
  }
  if (it.kind === 'product' || it.kind === 'extra') {
    const p = prodOf(it);
    return !p || p.hidden || STOP[it.id] ? [`${t('нет в наличии')}: ${nm(p) || it.name}`] : [];
  }
  return [t('позиция больше не продаётся')];
}

// Актуальная цена позиции по текущему меню
export function itemUnit(it) {
  if (it.kind === 'burger') return stats(toLayers(it.keys)).total;
  if (it.kind === 'product' || it.kind === 'extra') return prodOf(it)?.price ?? it.unit;
  return it.unit;
}

// ── Скидки: промокод и котлетки ──
// promo: { type: 'percent' | 'fixed', value, maxDiscount } — скидка только на товары, без доставки
export function promoDiscount(promo, sub) {
  if (!promo || sub <= 0) return 0;
  let d = promo.type === 'percent' ? Math.round((sub * promo.value) / 100 / 100) * 100 : promo.value;
  if (promo.maxDiscount > 0) d = Math.min(d, promo.maxDiscount);
  return Math.max(0, Math.min(d, sub));
}
// Сколько котлеток можно списать: не больше баланса и не больше maxPercent % суммы к оплате
export function cutletsMax(balance, payable) {
  const R = SETTINGS.referral || {};
  if (!R.enabled || !(R.rate > 0) || balance <= 0 || payable <= 0) return 0;
  return Math.max(0, Math.min(Math.floor(balance), Math.floor((payable * (R.maxPercent ?? 50)) / 100 / R.rate)));
}
export const cutletsSum = (n) => Math.round(n * (SETTINGS.referral?.rate || 0));

// ── Лимиты конструктора ──
const catOf = (key) => {
  const { ing, role } = parseKey(key);
  if (!ing) return null;
  return role && role !== 'mid' ? 'bunEnd' : ing.cat;
};
const CAT_NAMES = { bun: 'средних булочек', meat: 'котлет', cheese: 'слоёв сыра', veg: 'овощей', sauce: 'соусов', extra: 'добавок' };
const catName = (c) => t(CAT_NAMES[c] || 'слоёв этой категории');
const shortName = (ing) => nm(ing, 'short') || nm(ing);

// Можно ли добавить ингредиент к текущему набору слоёв. Возвращает текст причины или null.
export function canAddIng(keys, id) {
  const L = SETTINGS.limits;
  const ing = ING[id];
  if (!ing) return t('Ингредиент не найден');
  if (isStopped(id)) return t('{name}: нет в наличии', { name: nm(ing) });
  if (keys.length >= L.maxLayers) return t('Максимум {n} слоёв в одном бургере', { n: L.maxLayers });
  const key = ing.cat === 'bun' ? `mid:${id}` : id;
  const same = keys.filter((k) => k === key).length;
  if (ing.cat !== 'bun' && same >= L.maxSame) return t('Не больше {n} × {name}', { n: L.maxSame, name: shortName(ing) });
  const max = L.maxCat?.[ing.cat];
  if (max != null && keys.filter((k) => catOf(k) === ing.cat).length >= max) return t('Не больше {n} {what}', { n: max, what: catName(ing.cat) });
  for (const [a, b] of L.forbidden || []) {
    const other = id === a ? b : id === b ? a : null;
    if (other && keys.some((k) => parseKey(k).ing?.id === other)) return t('{a} не сочетается с «{b}»', { a: nm(ing), b: nm(ING[other]) || other });
  }
  return null;
}

// Полная проверка бургера перед заказом. Возвращает список ошибок.
export function checkBurger(keys) {
  const L = SETTINGS.limits;
  const errs = [];
  const fillings = keys.filter((k) => { const c = catOf(k); return c && c !== 'bunEnd' && c !== 'bun'; });
  const hasEnd = (role) => keys.some((k) => { const p = parseKey(k); return p.role === role && p.ing; });
  if (L.requireBun && !(hasEnd('top') && hasEnd('bottom'))) errs.push(t('Нужна булочка: верх и низ'));
  if (fillings.length < L.minFillings) errs.push(t('Добавь хотя бы {n} ингр. между булочками', { n: L.minFillings }));
  if (L.requireMeat && !keys.some((k) => catOf(k) === 'meat')) errs.push(t('Нужна хотя бы одна котлета'));
  if (keys.length > L.maxLayers) errs.push(t('Максимум {n} слоёв, сейчас {cur}', { n: L.maxLayers, cur: keys.length }));
  const cnt = {};
  const byCat = {};
  for (const k of keys) {
    const c = catOf(k);
    if (!c || c === 'bunEnd') continue;
    cnt[k] = (cnt[k] || 0) + 1;
    byCat[c] = (byCat[c] || 0) + 1;
  }
  for (const [k, n] of Object.entries(cnt)) {
    const { ing } = parseKey(k);
    if (ing.cat !== 'bun' && n > L.maxSame) errs.push(t('Не больше {n} × {name}', { n: L.maxSame, name: shortName(ing) }));
  }
  for (const [c, n] of Object.entries(byCat)) {
    const max = L.maxCat?.[c];
    if (max != null && n > max) errs.push(t('Не больше {n} {what}', { n: max, what: catName(c) }));
  }
  const ids = new Set(keys.map((k) => parseKey(k).ing?.id));
  for (const [a, b] of L.forbidden || []) {
    if (ids.has(a) && ids.has(b)) errs.push(t('{a} не сочетается с «{b}»', { a: nm(ING[a]) || a, b: nm(ING[b]) || b }));
  }
  return errs;
}

// ── Телефон (Узбекистан: +998 XX XXX XX XX) ──
const UZ_CODES = ['20', '33', '50', '55', '61', '62', '65', '66', '67', '69', '70', '71', '72', '73', '74', '75', '76', '77', '78', '79', '88', '90', '91', '93', '94', '95', '97', '98', '99'];
export function normPhone(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.length === 9) d = `998${d}`;
  return d;
}
export const validPhone = (v) => { const d = normPhone(v); return d.length === 12 && d.startsWith('998') && UZ_CODES.includes(d.slice(3, 5)); };
export function fmtPhone(v) {
  const d = normPhone(v).slice(3);
  const parts = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean);
  return `+998 ${parts.join(' ')}`.trim();
}

// ── Зоны доставки ──
export function distanceKm(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
// Название зоны по её диапазону: «до 3 км», «3–7 км». zones — все зоны, нужны для нижней границы.
const kmStr = (v) => String(Math.round(Number(v) * 10) / 10).replace('.', ',');
export function zoneName(zones, z) {
  const from = Math.max(0, ...zones.map((x) => Number(x.maxKm)).filter((km) => km < Number(z.maxKm)));
  return from > 0 ? `${kmStr(from)}–${kmStr(z.maxKm)} км` : `до ${kmStr(z.maxKm)} км`;
}
export const withZoneNames = (zones) => zones.map((z) => ({ ...z, name: zoneName(zones, z) }));

// Зона по координатам: ближайшее кольцо, в которое попадает точка. null — вне зоны доставки.
export function zoneFor(point) {
  const km = distanceKm(SETTINGS.delivery.origin, point);
  const zone = [...SETTINGS.delivery.zones].sort((a, b) => a.maxKm - b.maxKm).find((z) => km <= z.maxKm) || null;
  return { zone, km: Math.round(km * 10) / 10 };
}

// ── Время в часовом поясе заведения ──
const tzParts = (ts, tz = SETTINGS.tz) => {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ts));
  return { h: Number(p.find((x) => x.type === 'hour').value), m: Number(p.find((x) => x.type === 'minute').value) };
};
export const tzMinutes = (ts) => { const { h, m } = tzParts(ts); return h * 60 + m; };
const hm = (s) => { const [h, m] = String(s).split(':').map(Number); return h * 60 + (m || 0); };
export const fmtTime = (ts) => new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: SETTINGS.tz });
export const fmtDateTime = (ts) => new Date(ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: SETTINGS.tz });
// Метка времени «сегодня в HH:MM» по часовому поясу заведения
export function atTime(hhmm, now = Date.now()) {
  const target = hm(hhmm);
  return Math.floor(now / 60000) * 60000 + (target - tzMinutes(now)) * 60000;
}
export function isOpen(ts = Date.now()) {
  const m = tzMinutes(ts), o = hm(SETTINGS.hours.open), c = hm(SETTINGS.hours.close);
  return o <= c ? m >= o && m < c : m >= o || m < c;
}
// Слоты «ко времени» на сегодня: каждые 15 минут, не раньше чем через leadMin и до закрытия
export function timeSlots(leadMin, now = Date.now()) {
  const o = hm(SETTINGS.hours.open), c = hm(SETTINGS.hours.close);
  const from = Math.max(o, tzMinutes(now) + leadMin);
  const out = [];
  for (let m = Math.ceil(from / 15) * 15; m <= (c > o ? c : 24 * 60 - 15); m += 15) {
    out.push(`${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }
  return out;
}

// ── Статусы и сроки заказа ──
export const flowOf = (o) => FLOWS[o.mode] || FLOWS.delivery;
export const isClosed = (o) => o.status === 'done' || o.status === 'cancelled';
export function statusInfo(o, status = o.status) {
  const s = STATUSES[status] || STATUSES.created;
  const d = MODE_TEXT[status]?.[o.mode] || s.d;
  return { ...s, d: status === 'cancelled' && o.cancelReason ? `Причина: ${o.cancelReason}` : d };
}
export const nextStatus = (o) => { const f = flowOf(o); const i = f.indexOf(o.status); return i >= 0 && i < f.length - 1 ? f[i + 1] : null; };

// Сколько минут занимает путь заказа после приёма: приготовление (+ дорога для доставки)
export const leadMinutes = (mode, zone) => SETTINGS.timing.cookMin + (mode === 'delivery' ? zone?.etaMin || 0 : 0);

// Ориентировочное время получения. Желаемое время клиента имеет приоритет, если оно позже.
export function estimateEta(o, now = Date.now()) {
  const accepted = !!o.statusAt?.accepted;
  const base = now + (accepted ? 0 : SETTINGS.timing.acceptAlertMin) * 60000 + leadMinutes(o.mode, o.zone) * 60000;
  return o.desiredAt && o.desiredAt > base ? o.desiredAt : base;
}

// Контрольные сроки: принять, приготовить, доставить (для таймеров и оповещений)
export function deadlines(o) {
  const T = SETTINGS.timing;
  const road = o.mode === 'delivery' ? (o.zone?.etaMin || 0) * 60000 : 0;
  return {
    acceptBy: o.createdAt + T.acceptAlertMin * 60000,
    readyBy: (o.etaAt || o.createdAt) - road,
    doneBy: (o.etaAt || o.createdAt) + (o.mode === 'delivery' ? T.graceMin * 60000 : 0),
  };
}

// ── Короткий код рецепта для ссылок Telegram (startapp: A-Z a-z 0-9 _ -, до 512 символов) ──
// Каждый слой = 2 символа base36: индекс ингредиента × 4 + роль (0 — обычный, 1 — верх, 2 — середина, 3 — низ).
// Новые ингредиенты добавляются в конец меню, а удалённые только скрываются — индексы не сдвигаются.
const ROLES = [null, 'top', 'mid', 'bottom'];
const idxOf = (id) => INGREDIENTS.findIndex((x) => x.id === id);

function b64url(str) {
  const b = typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(str))) : Buffer.from(str, 'utf8').toString('base64');
  return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(s) {
  const b = s.replace(/-/g, '+').replace(/_/g, '/');
  return typeof atob === 'function' ? decodeURIComponent(escape(atob(b))) : Buffer.from(b, 'base64').toString('utf8');
}

export function encodeShort(r) {
  const body = r.layers
    .filter((l) => !l.hidden)
    .map((l) => {
      const { ing, role } = parseKey(l.key);
      if (!ing) return '';
      return (idxOf(ing.id) * 4 + ROLES.indexOf(role)).toString(36).padStart(2, '0');
    })
    .join('');
  const meta = b64url(`${(r.name || '').slice(0, 28)}|${(r.author || '').slice(0, 20)}`);
  const code = `r${body}-${meta}`;
  return code.length <= 500 ? code : `r${body}`.slice(0, 500);
}

export function decodeShort(code) {
  try {
    if (!code || code[0] !== 'r') return null;
    const dash = code.indexOf('-');
    const body = dash < 0 ? code.slice(1) : code.slice(1, dash);
    const keys = [];
    for (let i = 0; i + 1 < body.length; i += 2) {
      const n = parseInt(body.slice(i, i + 2), 36);
      const ing = INGREDIENTS[Math.floor(n / 4)];
      const role = ROLES[n % 4];
      if (ing && !ing.deleted) keys.push(role ? `${role}:${ing.id}` : ing.id);
    }
    if (!keys.length) return null;
    let name = '', author = '';
    if (dash >= 0) [name, author] = unb64url(code.slice(dash + 1)).split('|');
    return { name: name || 'Бургер из ссылки', author: author || 'Друг', layers: toLayers(keys) };
  } catch { return null; }
}
