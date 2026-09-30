// Пересчёт и проверка заказа на сервере, смена статусов и тексты сообщений.
// Используются те же данные и формулы, что и в приложении (src/data.js, src/calc.js),
// поэтому цены, стоп-лист и лимиты нельзя обойти со стороны клиента.
import { ING, PARTY, UPSELL, SETTINGS, STATUSES, MODES } from '../src/data.js';
import {
  stats, toLayers, parseKey, layerName, fmtPrice, fmtWeight, fmtCm, cartTotals, partyOption, itemIssues, checkBurger,
  validPhone, fmtPhone, zoneFor, isOpen, atTime, fmtTime, flowOf, statusInfo, estimateEta, isClosed,
} from '../src/calc.js';
import { getOrder, updateOrder } from './store.mjs';

const MAX_ITEMS = 30;
const MAX_QTY = 20;
const MAX_LAYERS = 120;
const STALE_MS = 30 * 60 * 1000; // неотправленный заказ старше 30 минут не создаём

export class OrderError extends Error {
  constructor(message, extra = {}) { super(message); Object.assign(this, extra); }
}

const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

export function buildOrder(body, now = Date.now()) {
  if (!body || !Array.isArray(body.items) || !body.items.length) throw new OrderError('Корзина пуста');
  if (body.items.length > MAX_ITEMS) throw new OrderError('Слишком много позиций в заказе');
  if (body.clientAt && now - Number(body.clientAt) > STALE_MS) throw new OrderError('Заказ не был отправлен вовремя. Проверь корзину и оформи его заново', { code: 'stale' });

  const mode = ['delivery', 'pickup', 'hall'].includes(body.mode) ? body.mode : 'delivery';
  if (!SETTINGS.modes[mode]) throw new OrderError(`${MODES[mode].t} сейчас недоступна`);

  const items = body.items.map((it) => {
    const qty = Math.min(MAX_QTY, Math.max(1, Math.floor(Number(it.qty) || 1)));
    if (it.kind === 'burger') {
      const keys = (Array.isArray(it.keys) ? it.keys : []).slice(0, MAX_LAYERS).filter((k) => typeof k === 'string' && parseKey(k).ing);
      if (!keys.length) throw new OrderError('Пустой бургер в заказе');
      const errs = checkBurger(keys);
      if (errs.length) throw new OrderError(`«${clean(it.name, 40) || 'Бургер'}»: ${errs[0]}`, { code: 'limits' });
      const st = stats(toLayers(keys));
      return { kind: 'burger', name: clean(it.name, 40) || 'Бургер', keys, qty, unit: st.total, packaging: st.packaging, weight: st.weight, cm: st.cm, count: st.count, cid: clean(it.cid, 40) };
    }
    if (it.kind === 'party') {
      const people = Math.floor(Number(it.people));
      const p = PARTY.find((x) => x.people === people) || (SETTINGS.partyCustom && people >= 2 && people <= 30 ? partyOption(people) : null);
      if (!p) throw new OrderError('Неизвестный Party Burger');
      return { kind: 'party', name: `Party Burger на ${p.people}`, people: p.people, weight: p.weight, qty, unit: p.price, cid: clean(it.cid, 40) };
    }
    if (it.kind === 'extra') {
      const u = UPSELL.find((x) => x.id === it.id);
      if (!u) throw new OrderError('Позиция больше не продаётся', { code: 'stop', ids: [it.id] });
      return { kind: 'extra', id: u.id, name: u.name, note: u.note, icon: u.icon, qty, unit: u.price, cid: clean(it.cid, 40) };
    }
    throw new OrderError('Неизвестный тип позиции');
  });

  // Стоп-лист: сообщаем клиенту, что именно закончилось
  const issues = items.flatMap((it) => itemIssues(it).map((t) => ({ cid: it.cid, t })));
  if (issues.length) throw new OrderError(`Часть позиций закончилась (${[...new Set(issues.map((x) => x.t.replace('нет в наличии: ', '')))].join(', ')}). Обнови корзину`, { code: 'stop', cids: issues.map((x) => x.cid) });

  const c = body.customer || {};
  const customer = { name: clean(c.name, 40), phone: '', address: '', details: '' };
  let table = null, zone = null, location = null, desiredAt = null;

  if (mode === 'hall') {
    table = Math.floor(Number(body.table));
    if (!(table >= 1 && table <= SETTINGS.hallTables)) throw new OrderError('Укажи номер стола');
    if (c.phone && validPhone(c.phone)) customer.phone = fmtPhone(c.phone);
  } else {
    if (!customer.name) throw new OrderError('Укажи имя');
    if (!validPhone(c.phone)) throw new OrderError('Проверь номер телефона: нужен формат +998 90 123 45 67');
    customer.phone = fmtPhone(c.phone);
  }

  if (mode === 'delivery') {
    customer.address = clean(c.address, 160);
    customer.details = clean(c.details, 80);
    if (customer.address.length < 5) throw new OrderError('Укажи адрес доставки');
    // Стоимость доставки — только по расстоянию от ресторана до точки клиента
    const loc = body.location;
    if (!loc || !Number.isFinite(+loc.lat) || !Number.isFinite(+loc.lng) || Math.abs(+loc.lat) > 90 || Math.abs(+loc.lng) > 180) {
      throw new OrderError('Укажи точку доставки: геолокация или место на карте', { code: 'zone' });
    }
    location = { lat: +(+loc.lat).toFixed(6), lng: +(+loc.lng).toFixed(6) };
    const z = zoneFor(location);
    if (!z.zone) throw new OrderError(`Адрес вне зоны доставки (${String(z.km).replace('.', ',')} км от ресторана). Выбери самовывоз`, { code: 'zone' });
    zone = { ...z.zone, km: z.km };
  }

  // Время: «как можно скорее» только в рабочие часы, «ко времени» — сегодня до закрытия
  if (body.desiredTime && mode !== 'hall') {
    if (!/^\d{2}:\d{2}$/.test(body.desiredTime)) throw new OrderError('Неверное время');
    desiredAt = atTime(body.desiredTime, now);
    if (desiredAt < now + 15 * 60000 || !isOpen(desiredAt - 60000)) throw new OrderError('Выбранное время недоступно, выбери другое', { code: 'time' });
  } else if (!isOpen(now)) {
    throw new OrderError(`Сейчас мы закрыты. Работаем с ${SETTINGS.hours.open} до ${SETTINGS.hours.close}`, { code: 'closed' });
  }

  const t = cartTotals(items, mode, zone);
  if (t.minLeft > 0) throw new OrderError(`Минимальная сумма заказа — ${fmtPrice(SETTINGS.minOrder)}. Добавь ещё на ${fmtPrice(t.minLeft)}`, { code: 'min' });

  const payment = body.payment === 'cash' ? 'cash' : 'card';
  const order = { mode, items, payment, customer, table, zone, location, desiredAt, comment: clean(body.comment, 300), sub: t.sub, fee: t.fee, total: t.total };
  order.etaAt = estimateEta({ ...order, createdAt: now }, now);
  return order;
}

// ── Смена статусов ──
let listener = () => {};
export const onOrderEvent = (fn) => { listener = fn; };

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
  updateOrder(o.id, patch, { by: actor.by, action: `${STATUSES[from].t} → ${STATUSES[to].t}`, note: patch.cancelReason });
  listener(o, { type: 'status', from, to });
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

// Для клиента — только нужные поля заказа
export const publicOrder = (o) => ({
  id: o.id, status: o.status, statusAt: o.statusAt, mode: o.mode, items: o.items, sub: o.sub, fee: o.fee, total: o.total,
  payment: o.payment, comment: o.comment, customer: o.customer, table: o.table, zone: o.zone, desiredAt: o.desiredAt,
  etaAt: o.etaAt, cancelReason: o.cancelReason, createdAt: o.createdAt,
});

// ── Сообщения ──
export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function whereLine(o) {
  if (o.mode === 'hall') return `🍽 В зале · стол ${o.table}`;
  if (o.mode === 'pickup') return '🏃 Самовывоз';
  return `🛵 Доставка: ${esc(o.customer.address)}${o.customer.details ? `, ${esc(o.customer.details)}` : ''}${o.zone ? ` · ${esc(o.zone.name)}${o.zone.km != null ? `, ${o.zone.km} км` : ''}` : ''}`;
}

export function kitchenText(o) {
  const lines = [];
  lines.push(`🍔 <b>Заказ #${o.id}</b>${o.status === 'cancelled' ? ' — ❌ ОТМЕНЁН' : ''}`);
  lines.push(`🕒 ${fmtTime(o.createdAt)}${o.desiredAt ? ` · ⏰ ко времени <b>${fmtTime(o.desiredAt)}</b>` : ''}`);
  const who = [esc(o.customer.name || o.tgName), esc(o.customer.phone), o.username ? `@${esc(o.username)}` : ''].filter(Boolean).join(' · ');
  if (who) lines.push(`👤 ${who}`);
  lines.push(whereLine(o));
  if (o.location) lines.push(`📍 https://maps.google.com/?q=${o.location.lat},${o.location.lng}`);
  lines.push(o.payment === 'cash' ? '💵 Наличные' : '💳 Карта при получении');
  lines.push('');
  o.items.forEach((it, n) => {
    lines.push(`<b>${n + 1}. ${esc(it.name)}</b>${it.qty > 1 ? ` × ${it.qty}` : ''} — ${fmtPrice(it.unit * it.qty)}`);
    if (it.kind === 'burger') {
      lines.push(`   ${fmtWeight(it.weight)} · ${fmtCm(it.cm)} · ${it.count} слоёв${it.packaging ? ' · 📦 СПЕЦУПАКОВКА' : ''}`);
      lines.push('   <i>Слои сверху вниз:</i>');
      it.keys.forEach((k, i) => lines.push(`   ${String(i + 1).padStart(2, ' ')}. ${esc(layerName(k))}`));
    } else if (it.kind === 'party') {
      lines.push(`   ~${fmtWeight(it.weight)} · на ${it.people} человек`);
    }
    lines.push('');
  });
  if (o.comment) lines.push(`💬 <b>Комментарий:</b> ${esc(o.comment)}\n`);
  if (o.fee) lines.push(`Доставка: ${fmtPrice(o.fee)}`);
  lines.push(`<b>Итого: ${fmtPrice(o.total)}</b>`);
  lines.push('');
  lines.push(`Статус: <b>${STATUSES[o.status].t}</b>${o.status === 'cancelled' ? `\nПричина: ${esc(o.cancelReason)}` : ''}`);
  if (!isClosed(o)) lines.push(`Готовность к: <b>${fmtTime(o.etaAt)}</b>`);
  return lines.join('\n');
}

// Сообщение клиенту о текущем статусе (или об изменении времени)
export function customerText(o, event = {}) {
  const s = statusInfo(o);
  if (o.status === 'cancelled') return `❌ <b>Заказ #${o.id} отменён</b>\nПричина: ${esc(o.cancelReason)}\n\nЕсли это ошибка — напишите нам, разберёмся.`;
  const flow = flowOf(o);
  const bar = flow.map((_, i) => (i <= flow.indexOf(o.status) ? '🟧' : '⬜')).join('');
  const head = event.type === 'eta' ? `⏱ <b>Заказ #${o.id}: время изменено</b>` : `${s.icon} <b>Заказ #${o.id}: ${s.t}</b>\n${esc(s.d)}`;
  const lines = [head, '', bar, ''];
  if (o.status === 'created') {
    o.items.forEach((it) => lines.push(`• ${esc(it.name)}${it.qty > 1 ? ` × ${it.qty}` : ''} — ${fmtPrice(it.unit * it.qty)}`));
    if (o.fee) lines.push(`• Доставка — ${fmtPrice(o.fee)}`);
    lines.push('');
  }
  if (!isClosed(o)) lines.push(`${o.mode === 'delivery' ? 'Доставим' : 'Будет готов'} ориентировочно к <b>${fmtTime(o.etaAt)}</b>`);
  lines.push(`Сумма: ${fmtPrice(o.total)}`);
  return lines.join('\n');
}

export function orderShortLine(o) {
  return `#${o.id} · ${new Date(o.createdAt).toLocaleDateString('ru-RU')} · ${fmtPrice(o.total)} · ${STATUSES[o.status].t.toLowerCase()}`;
}

export { ING };
