// Пересчёт и проверка заказа на сервере, смена статусов, бонусы и тексты сообщений.
// Используются те же данные и формулы, что и в приложении (src/data.js, src/calc.js),
// поэтому цены, стоп-лист, промокоды, котлетки и лимиты нельзя обойти со стороны клиента.
import { ING, PROD, SETTINGS, STATUSES, MODES, PAYMENTS, MODE_TEXT } from '../src/data.js';
import {
  stats, toLayers, parseKey, layerName, fmtPrice, fmtWeight, fmtCm, cartTotals, itemIssues, checkBurger, productInfo,
  validPhone, fmtPhone, zoneFor, isOpen, atTime, fmtTime, flowOf, statusInfo, estimateEta, isClosed, promoDiscount, cutletsMax,
} from '../src/calc.js';
import { tr, nm, getLang, setLang } from '../src/i18n.js';
import { getOrder, updateOrder, getUser, saveUser, addCutlets, cutletsOf, findPromo, promoUses, doneOrdersOf } from './store.mjs';

const MAX_ITEMS = 30;
const MAX_QTY = 20;
const MAX_LAYERS = 120;
const STALE_MS = 30 * 60 * 1000; // неотправленный заказ старше 30 минут не создаём

export class OrderError extends Error {
  constructor(message, extra = {}) { super(message); Object.assign(this, extra); }
}

const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

// Проверка промокода: активен, не истёк, сумма заказа и лимиты использований. Возвращает { promo, discount }.
export function checkPromo(code, sub, userId, lang = 'ru', now = Date.now()) {
  const T = (s, v) => tr(lang, s, v);
  const p = findPromo(code);
  if (!p || !p.active) throw new OrderError(T('Промокод не найден'), { code: 'promo' });
  if (p.expiresAt && now > p.expiresAt) throw new OrderError(T('Срок действия промокода закончился'), { code: 'promo' });
  if (p.minOrder && sub < p.minOrder) throw new OrderError(T('Промокод действует от {sum}', { sum: fmtPrice(p.minOrder) }), { code: 'promo' });
  if (p.maxUses && promoUses(p.code) >= p.maxUses) throw new OrderError(T('Промокод уже использован максимальное число раз'), { code: 'promo' });
  if (p.perUser && userId && promoUses(p.code, userId) >= p.perUser) throw new OrderError(T('Ты уже использовал этот промокод'), { code: 'promo' });
  if (p.firstOrder && userId && getUser(userId)?.ordered) throw new OrderError(T('Промокод только на первый заказ'), { code: 'promo' });
  return { promo: p, discount: promoDiscount(p, sub) };
}

// ctx: { userId, lang } — для промокода, котлеток и текста ошибок.
// Общие проверки (лимиты, стоп-лист) пишут текст на текущем языке — на время проверки ставим язык клиента.
export function buildOrder(body, now = Date.now(), ctx = {}) {
  const prev = getLang();
  setLang(ctx.lang || 'ru');
  try { return build(body, now, ctx); } finally { setLang(prev); }
}

function build(body, now, { userId = null, lang = 'ru' } = {}) {
  const T = (s, v) => tr(lang, s, v);
  if (!body || !Array.isArray(body.items) || !body.items.length) throw new OrderError(T('Корзина пуста'));
  if (body.items.length > MAX_ITEMS) throw new OrderError(T('Слишком много позиций в заказе'));
  if (body.clientAt && now - Number(body.clientAt) > STALE_MS) throw new OrderError(T('Заказ не был отправлен вовремя. Проверь корзину и оформи его заново'), { code: 'stale' });

  const mode = ['delivery', 'pickup', 'hall'].includes(body.mode) ? body.mode : 'delivery';
  if (!SETTINGS.modes[mode]) throw new OrderError(T('{mode} сейчас недоступна', { mode: T(MODES[mode].t) }));

  const items = body.items.map((it) => {
    const qty = Math.min(MAX_QTY, Math.max(1, Math.floor(Number(it.qty) || 1)));
    if (it.kind === 'burger') {
      const keys = (Array.isArray(it.keys) ? it.keys : []).slice(0, MAX_LAYERS).filter((k) => typeof k === 'string' && parseKey(k).ing);
      if (!keys.length) throw new OrderError(T('Пустой бургер в заказе'));
      const errs = checkBurger(keys);
      if (errs.length) throw new OrderError(`«${clean(it.name, 40) || T('Бургер')}»: ${errs[0]}`, { code: 'limits' });
      const st = stats(toLayers(keys));
      return { kind: 'burger', name: clean(it.name, 40) || 'Бургер', keys, qty, unit: st.total, packaging: st.packaging, weight: st.weight, cm: st.cm, count: st.count, spicy: !!it.spicy, cid: clean(it.cid, 40) };
    }
    if (it.kind === 'product' || it.kind === 'extra') {
      const p = PROD[it.id];
      if (!p) throw new OrderError(T('Позиция больше не продаётся'), { code: 'stop', ids: [it.id] });
      const info = productInfo(p);
      return {
        kind: 'product', id: p.id, cat: p.cat, name: p.name, nameUz: p.nameUz, note: p.note, icon: p.icon, keys: p.keys,
        weight: info.w, kcal: info.kcal, qty, unit: p.price, spicy: p.spicy ? !!it.spicy : undefined, cid: clean(it.cid, 40),
      };
    }
    throw new OrderError(T('Позиция больше не продаётся'), { code: 'stop' });
  });

  // Стоп-лист: сообщаем клиенту, что именно закончилось
  const issues = items.flatMap((it) => itemIssues(it).map((t) => ({ cid: it.cid, t })));
  if (issues.length) throw new OrderError(T('Часть позиций закончилась ({list}). Обнови корзину', { list: [...new Set(issues.map((x) => x.t.replace(/^[^:]+: /, '')))].join(', ') }), { code: 'stop', cids: issues.map((x) => x.cid) });

  const c = body.customer || {};
  const customer = { name: clean(c.name, 40), phone: '', address: '', details: '' };
  let table = null, zone = null, location = null, desiredAt = null;

  if (mode === 'hall') {
    table = Math.floor(Number(body.table));
    if (!(table >= 1 && table <= SETTINGS.hallTables)) throw new OrderError(T('Укажи номер стола'));
    if (c.phone && validPhone(c.phone)) customer.phone = fmtPhone(c.phone);
  } else {
    if (!customer.name) throw new OrderError(T('Укажи имя'));
    if (!validPhone(c.phone)) throw new OrderError(T('Проверь номер телефона: нужен формат +998 90 123 45 67'));
    customer.phone = fmtPhone(c.phone);
  }

  if (mode === 'delivery') {
    customer.address = clean(c.address, 160);
    customer.details = clean(c.details, 80);
    if (customer.address.length < 5) throw new OrderError(T('Укажи адрес доставки'));
    // Стоимость доставки — только по расстоянию от ресторана до точки клиента
    const loc = body.location;
    if (!loc || !Number.isFinite(+loc.lat) || !Number.isFinite(+loc.lng) || Math.abs(+loc.lat) > 90 || Math.abs(+loc.lng) > 180) {
      throw new OrderError(T('Укажи точку доставки: геолокация или место на карте'), { code: 'zone' });
    }
    location = { lat: +(+loc.lat).toFixed(6), lng: +(+loc.lng).toFixed(6) };
    const z = zoneFor(location);
    if (!z.zone) throw new OrderError(T('Адрес вне зоны доставки ({km} км от ресторана). Выбери самовывоз', { km: String(z.km).replace('.', ',') }), { code: 'zone' });
    zone = { ...z.zone, km: z.km };
  }

  // Время: «как можно скорее» только в рабочие часы, «ко времени» — сегодня до закрытия
  if (body.desiredTime && mode !== 'hall') {
    if (!/^\d{2}:\d{2}$/.test(body.desiredTime)) throw new OrderError(T('Неверное время'));
    desiredAt = atTime(body.desiredTime, now);
    if (desiredAt < now + 15 * 60000 || !isOpen(desiredAt - 60000)) throw new OrderError(T('Выбранное время недоступно, выбери другое'), { code: 'time' });
  } else if (!isOpen(now)) {
    throw new OrderError(T('Сейчас мы закрыты. Работаем с {open} до {close}', SETTINGS.hours), { code: 'closed' });
  }

  // Промокод (скидка на товары) и котлетки (не больше баланса и maxPercent % суммы к оплате)
  const base = cartTotals(items, mode, zone);
  if (base.minLeft > 0) throw new OrderError(T('Минимальная сумма заказа — {min}. Добавь ещё на {left}', { min: fmtPrice(SETTINGS.minOrder), left: fmtPrice(base.minLeft) }), { code: 'min' });
  let promo = null, discount = 0;
  if (clean(body.promo, 32)) {
    const r = checkPromo(body.promo, base.sub, userId, lang, now);
    promo = { code: r.promo.code, discount: r.discount };
    discount = r.discount;
  }
  const wantCutlets = Math.max(0, Math.floor(Number(body.cutlets) || 0));
  const cutletsUsed = userId ? Math.min(wantCutlets, cutletsMax(cutletsOf(userId), base.sub - discount + base.fee)) : 0;
  const t = cartTotals(items, mode, zone, { discount, cutlets: cutletsUsed });

  const payment = PAYMENTS[body.payment] ? body.payment : 'cash';
  const order = {
    mode, items, payment, paid: false, customer, table, zone, location, desiredAt, comment: clean(body.comment, 300),
    sub: t.sub, fee: t.fee, discount: t.discount, promo, cutletsUsed, cutletsSum: t.cutlets, total: t.total, lang,
  };
  order.etaAt = estimateEta({ ...order, createdAt: now }, now);
  return order;
}

// Заказ создан: списываем котлетки, запоминаем, что клиент уже заказывал (для «промокод на первый заказ»)
export function afterCreate(o) {
  if (o.cutletsUsed > 0) addCutlets(o.userId, -o.cutletsUsed, `Оплата заказа #${o.id}`, o.id);
  if (o.userId && !getUser(o.userId)?.ordered) saveUser(o.userId, { ordered: true });
}

// ── Смена статусов ──
let listener = () => {};
export const onOrderEvent = (fn) => { listener = fn; };
let bonusListener = () => {};
// Начислены котлетки: (userId, amount, text) — бот сообщит клиенту
export const onBonus = (fn) => { bonusListener = fn; };

// Можно ли перевести заказ в статус. Возвращает текст ошибки или null.
export function canTransition(o, to) {
  if (isClosed(o)) return 'Заказ уже закрыт';
  if (to === 'cancelled') return null;
  const flow = flowOf(o);
  const i = flow.indexOf(o.status), j = flow.indexOf(to);
  if (j < 0) return 'Такого этапа нет для этого заказа';
  if (j <= i) return 'Этот этап уже пройден';
  const acc = flow.indexOf('accepted');
  if (i < acc && j > acc) return 'Сначала примите заказ';
  return null;
}

// Первый выполненный заказ приглашённого друга — бонус обоим
function rewardReferral(o) {
  const R = SETTINGS.referral || {};
  const u = getUser(o.userId);
  if (!R.enabled || !u?.referredBy || u.refRewarded || doneOrdersOf(o.userId) !== 1) return;
  saveUser(o.userId, { refRewarded: true });
  if (R.inviteeBonus > 0) {
    addCutlets(o.userId, R.inviteeBonus, 'Бонус за первый заказ по приглашению', o.id);
    bonusListener(o.userId, R.inviteeBonus, 'invitee');
  }
  if (R.inviterBonus > 0) {
    addCutlets(u.referredBy, R.inviterBonus, 'Друг сделал первый заказ', o.id);
    bonusListener(u.referredBy, R.inviterBonus, 'inviter');
  }
}

// actor: { name, by } — кто изменил (для журнала)
export function changeStatus(id, to, actor, { reason } = {}) {
  const o = getOrder(id);
  if (!o) return { error: 'Заказ не найден', code: 404 };
  if (o.status === to) return { order: o, same: true };
  const err = canTransition(o, to);
  if (err) return { error: err, code: 409, order: o };
  if (to === 'cancelled' && !clean(reason, 200)) return { error: 'Укажите причину отмены', code: 400, order: o };
  const now = Date.now();
  const from = o.status;
  const patch = { status: to, statusAt: { ...o.statusAt, [to]: now } };
  if (to === 'cancelled') { patch.cancelReason = clean(reason, 200); patch.cancelledBy = actor.name; }
  // При приёме пересчитываем время готовности, если его не задавали вручную
  if (to === 'accepted' && !o.etaManual) patch.etaAt = estimateEta({ ...o, statusAt: patch.statusAt }, now);
  // Отмена: котлетки возвращаются клиенту
  if (to === 'cancelled' && o.cutletsUsed > 0 && !o.cutletsRefunded) { patch.cutletsRefunded = true; addCutlets(o.userId, o.cutletsUsed, `Возврат: заказ #${o.id} отменён`, o.id); }
  updateOrder(o.id, patch, { by: actor.by, action: `${STATUSES[from].t} → ${STATUSES[to].t}`, note: patch.cancelReason });
  listener(o, { type: 'status', from, to });
  if (to === 'done') rewardReferral(o);
  return { order: o };
}

export function changeEta(id, etaAt, actor) {
  const o = getOrder(id);
  if (!o) return { error: 'Заказ не найден', code: 404 };
  if (isClosed(o)) return { error: 'Заказ уже закрыт', code: 409 };
  const t = Number(etaAt);
  if (!Number.isFinite(t) || t < Date.now() - 60000) return { error: 'Время должно быть в будущем', code: 400 };
  const prev = o.etaAt;
  updateOrder(o.id, { etaAt: t, etaManual: true, alerts: { ...o.alerts, ready: false, done: false } }, { by: actor.by, action: 'Изменено время получения', note: `${fmtTime(prev)} → ${fmtTime(t)}` });
  listener(o, { type: 'eta' });
  return { order: o };
}

// Онлайн-оплата Click / Payme. Пока тестовый режим: деньги не списываются, заказ отмечается оплаченным.
export function markPaid(o) {
  if (!PAYMENTS[o.payment]?.online) return { error: 'Этот заказ оплачивается при получении', code: 400 };
  if (o.status === 'cancelled') return { error: 'Заказ отменён', code: 409 };
  if (o.paid) return { order: o };
  updateOrder(o.id, { paid: true, paidAt: Date.now() }, { by: 'Клиент', action: `Оплачено через ${PAYMENTS[o.payment].t}`, note: 'тестовый режим' });
  listener(o, { type: 'paid' });
  return { order: o };
}

// Для клиента — только нужные поля заказа
export const publicOrder = (o) => ({
  id: o.id, status: o.status, statusAt: o.statusAt, mode: o.mode, items: o.items, sub: o.sub, fee: o.fee, discount: o.discount || 0, promo: o.promo || null,
  cutletsUsed: o.cutletsUsed || 0, cutletsSum: o.cutletsSum || 0, total: o.total, payment: o.payment, paid: !!o.paid,
  comment: o.comment, customer: o.customer, table: o.table, zone: o.zone, desiredAt: o.desiredAt, etaAt: o.etaAt, cancelReason: o.cancelReason, createdAt: o.createdAt,
});

// ── Сообщения ──
export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const payLabel = (o) => {
  const p = PAYMENTS[o.payment] || PAYMENTS.cash;
  if (p.online) return `📲 ${p.t}: ${o.paid ? '✅ оплачено (тест)' : '⏳ ждёт оплаты'}`;
  return o.payment === 'cash' ? '💵 Наличные' : `💳 ${o.mode === 'hall' ? p.tHall : p.t}`;
};

export function whereLine(o) {
  if (o.mode === 'hall') return `🍽 В зале · стол ${o.table}`;
  if (o.mode === 'pickup') return '🏃 Самовывоз';
  return `🛵 Доставка: ${esc(o.customer.address)}${o.customer.details ? `, ${esc(o.customer.details)}` : ''}${o.zone ? ` · ${esc(o.zone.name)}${o.zone.km != null ? `, ${o.zone.km} км` : ''}` : ''}`;
}

// Карточка заказа для кухни и кассы (всегда по-русски)
export function kitchenText(o) {
  const lines = [];
  lines.push(`🍔 <b>Заказ #${o.id}</b>${o.status === 'cancelled' ? ' — ❌ ОТМЕНЁН' : ''}`);
  lines.push(`🕒 ${fmtTime(o.createdAt)}${o.desiredAt ? ` · ⏰ ко времени <b>${fmtTime(o.desiredAt)}</b>` : ''}`);
  const who = [esc(o.customer.name || o.tgName), esc(o.customer.phone), o.username ? `@${esc(o.username)}` : ''].filter(Boolean).join(' · ');
  if (who) lines.push(`👤 ${who}`);
  lines.push(whereLine(o));
  if (o.location) lines.push(`📍 https://maps.google.com/?q=${o.location.lat},${o.location.lng}`);
  lines.push(payLabel(o));
  lines.push('');
  o.items.forEach((it, n) => {
    lines.push(`<b>${n + 1}. ${esc(it.name)}</b>${it.qty > 1 ? ` × ${it.qty}` : ''} — ${fmtPrice(it.unit * it.qty)}${it.spicy ? ' · 🌶 <b>ОСТРЫЙ</b>' : it.spicy === false ? ' · не острый' : ''}`);
    if (it.kind === 'burger') {
      lines.push(`   ${fmtWeight(it.weight)} · ${fmtCm(it.cm)} · ${it.count} слоёв${it.packaging ? ' · 📦 СПЕЦУПАКОВКА' : ''}`);
      lines.push('   <i>Слои сверху вниз:</i>');
      it.keys.forEach((k, i) => lines.push(`   ${String(i + 1).padStart(2, ' ')}. ${esc(layerName(k))}`));
    } else if (it.keys?.length) {
      lines.push(`   <i>${it.keys.map((k) => esc(layerName(k))).join(' · ')}</i>`);
    }
    lines.push('');
  });
  if (o.comment) lines.push(`💬 <b>Комментарий:</b> ${esc(o.comment)}\n`);
  if (o.discount) lines.push(`Промокод ${esc(o.promo?.code)}: −${fmtPrice(o.discount)}`);
  if (o.cutletsSum) lines.push(`Котлетки (${o.cutletsUsed}): −${fmtPrice(o.cutletsSum)}`);
  if (o.fee) lines.push(`Доставка: ${fmtPrice(o.fee)}`);
  lines.push(`<b>Итого к оплате: ${fmtPrice(o.total)}</b>`);
  lines.push('');
  lines.push(`Статус: <b>${STATUSES[o.status].t}</b>${o.status === 'cancelled' ? `\nПричина: ${esc(o.cancelReason)}` : ''}`);
  if (!isClosed(o)) lines.push(`Готовность к: <b>${fmtTime(o.etaAt)}</b>`);
  return lines.join('\n');
}

// Сообщение клиенту о текущем статусе (или об изменении времени, оплате) — на языке клиента
export function customerText(o, event = {}, lang = o.lang || 'ru') {
  const T = (s, v) => tr(lang, s, v);
  const s = statusInfo(o);
  const d = MODE_TEXT[o.status]?.[o.mode] || STATUSES[o.status]?.d || '';
  if (o.status === 'cancelled') return `❌ <b>${T('Заказ #{id} отменён', { id: o.id })}</b>\n${T('Причина: {reason}', { reason: esc(T(o.cancelReason || '')) })}${o.cutletsUsed ? `\n${T('Котлетки ({n}) вернулись на счёт', { n: o.cutletsUsed })}` : ''}\n\n${T('Если это ошибка — напишите нам, разберёмся.')}`;
  const flow = flowOf(o);
  const bar = flow.map((_, i) => (i <= flow.indexOf(o.status) ? '🟧' : '⬜')).join('');
  const head = event.type === 'eta' ? `⏱ <b>${T('Заказ #{id}: время изменено', { id: o.id })}</b>`
    : event.type === 'paid' ? `✅ <b>${T('Заказ #{id} оплачен', { id: o.id })}</b>`
      : `${s.icon} <b>${T('Заказ #{id}: {status}', { id: o.id, status: T(s.t) })}</b>\n${esc(T(d))}`;
  const lines = [head, '', bar, ''];
  if (o.status === 'created') {
    o.items.forEach((it) => lines.push(`• ${esc(nm(it, 'name', lang))}${it.qty > 1 ? ` × ${it.qty}` : ''}${it.spicy ? ' 🌶' : ''} — ${fmtPrice(it.unit * it.qty)}`));
    if (o.discount) lines.push(`• ${T('Промокод {code}', { code: esc(o.promo?.code) })} — −${fmtPrice(o.discount)}`);
    if (o.cutletsSum) lines.push(`• ${T('Котлетки')} — −${fmtPrice(o.cutletsSum)}`);
    if (o.fee) lines.push(`• ${T('Доставка')} — ${fmtPrice(o.fee)}`);
    lines.push('');
  }
  if (!isClosed(o)) lines.push(T(o.mode === 'delivery' ? 'Доставим ориентировочно к {time}' : 'Будет готов ориентировочно к {time}', { time: `<b>${fmtTime(o.etaAt)}</b>` }));
  lines.push(`${T('Сумма')}: ${fmtPrice(o.total)}`);
  if (PAYMENTS[o.payment]?.online && !o.paid && !isClosed(o)) lines.push(T('Оплата: {method} — ждёт оплаты в приложении', { method: PAYMENTS[o.payment].t }));
  return lines.join('\n');
}

export function orderShortLine(o, lang = 'ru') {
  return `#${o.id} · ${new Date(o.createdAt).toLocaleDateString('ru-RU')} · ${fmtPrice(o.total)} · ${tr(lang, STATUSES[o.status].t).toLowerCase()}`;
}

export { ING };
