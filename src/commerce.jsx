import React, { useEffect, useState } from 'react';
import { useApp } from './ctx.js';
import { UPSELL, STOP, SETTINGS, MODES, MODE_TEXT } from './data.js';
import {
  fmtPrice, fmtWeight, plural, cartTotals, itemIssues, validPhone, fmtPhone, zoneFor, isOpen, timeSlots, atTime, fmtTime,
  leadMinutes, flowOf, statusInfo, isClosed,
} from './calc.js';
import { inTelegram, requestPhone, getLocation } from './telegram.js';
import { MiniBurger, Empty, ScreenHead, Stepper, Icon, Sheet } from './ui.jsx';
import { MapPicker, reverseGeocode } from './map.jsx';
import { PartyBurgerArt } from './visuals.jsx';

export { cartTotals } from './calc.js';

function CartItem({ it }) {
  const { S, A } = useApp();
  const issues = itemIssues(it);
  const editing = S.editingCid === it.cid;
  return (
    <article className={`cart-item ${issues.length ? 'bad' : ''}`}>
      <div className="ci-art">
        {it.kind === 'burger' && <MiniBurger keys={it.keys} h={96} w={96} />}
        {it.kind === 'party' && <PartyBurgerArt len={40} height={60} />}
        {it.kind === 'extra' && <span className="ci-emoji"><Icon name={it.icon || it.emoji || 'restaurant'} /></span>}
      </div>
      <div className="ci-body">
        <h3>{it.name}</h3>
        <div className="ci-meta">
          {it.kind === 'burger' && <>Вес: {fmtWeight(it.weight)} · Ингредиенты: {it.count}</>}
          {it.kind === 'party' && <>~{fmtWeight(it.weight)} · на {it.people} {plural(it.people, 'человека', 'человек', 'человек')}</>}
          {it.kind === 'extra' && it.note}
        </div>
        {it.packaging > 0 && <div className="ci-note">Включая спецупаковку {fmtPrice(it.packaging)}</div>}
        {editing && <div className="ci-note"><Icon name="edit" /> Открыт в конструкторе — правки ещё не сохранены · <button className="link sm" onClick={A.cancelCartEdit}>Отменить</button></div>}
        {issues.length > 0 && <div className="ci-issue"><Icon name="warning" /> {issues.join(', ')}. {it.kind === 'burger' ? 'Измени бургер или убери его' : 'Убери позицию'}</div>}
        <div className="ci-foot">
          <b>{it.qty > 1 && <small className="ci-unit">{it.qty} × {fmtPrice(it.unit)} = </small>}{fmtPrice(it.unit * it.qty)}</b>
          <div className="ci-ctrl">
            {it.kind === 'burger' && <button className="link sm" onClick={() => A.editCartItem(it)}>Изменить</button>}
            <Stepper qty={it.qty} label={it.name} onMinus={() => A.cartQty(it.cid, -1)} onPlus={() => A.cartQty(it.cid, 1)} disabledPlus={it.qty >= 20} />
          </div>
        </div>
      </div>
    </article>
  );
}

function MinOrderNote({ t }) {
  if (t.minLeft <= 0) return null;
  return <div className="min-note">Минимальная сумма заказа — {fmtPrice(SETTINGS.minOrder)}. Добавь ещё на <b>{fmtPrice(t.minLeft)}</b></div>;
}

export function Cart() {
  const { S, A } = useApp();
  const t = cartTotals(S.cart);
  const bad = S.cart.some((i) => itemIssues(i).length);
  const have = new Set(S.cart.filter((i) => i.kind === 'extra').map((i) => i.id));
  const count = S.cart.reduce((s, i) => s + i.qty, 0);
  if (!S.cart.length) {
    return (
      <div className="page">
        <ScreenHead title="Корзина" />
        <Empty icon="shopping_bag" title="Корзина пока пустая" text="Собери бургер в конструкторе или выбери готовый в Community." action={<button className="btn primary" onClick={() => A.go('builder')}>Собрать бургер</button>} />
      </div>
    );
  }
  return (
    <div className="page cart-page">
      <ScreenHead title="Корзина" sub={`${count} ${plural(count, 'позиция', 'позиции', 'позиций')}`} />
      <div className="cart-layout">
        <div className="cart-main">
          {S.cart.map((it) => <CartItem key={it.cid} it={it} />)}
          <h2 className="sec-title">Добавить к заказу</h2>
          <div className="upsell">
            {UPSELL.filter((u) => !u.hidden).map((u) => {
              const out = !!STOP[u.id];
              return (
                <button key={u.id} className={`up-item ${have.has(u.id) ? 'in' : ''} ${out ? 'out' : ''}`} onClick={() => A.addExtra(u)} disabled={out}>
                  <span className="up-emoji" aria-hidden="true"><Icon name={u.icon || u.emoji || 'restaurant'} /></span>
                  <b>{u.name}</b>
                  <small>{u.note}</small>
                  <span className="up-price">{out ? 'Нет в наличии' : have.has(u.id) ? 'Добавлено · ещё +' : `+ ${fmtPrice(u.price)}`}</span>
                </button>
              );
            })}
          </div>
        </div>
        <aside className="cart-side">
          <div className="summary">
            <div className="sum-line"><span>Товары</span><b>{fmtPrice(t.sub)}</b></div>
            <div className="sum-line"><span>Доставка</span><b>{t.feeFrom ? `от ${fmtPrice(t.feeFrom)}` : 'бесплатно'}</b></div>
            {t.feeFrom > 0 && <div className="free-hint">Ещё {fmtPrice(SETTINGS.freeFrom - t.sub)} до бесплатной доставки</div>}
            <div className="sum-line total"><span>Итого</span><b>{fmtPrice(t.total)}</b></div>
            <MinOrderNote t={t} />
            {bad && <div className="min-note">Часть позиций закончилась — убери или измени их</div>}
            <button className="btn primary block lg" onClick={() => A.go('checkout')} disabled={t.minLeft > 0 || bad}>Перейти к оформлению</button>
          </div>
        </aside>
      </div>
    </div>
  );
}

const enabledModes = () => Object.keys(MODES).filter((m) => SETTINGS.modes[m]);

function Seg({ value, options, onChange, big = true }) {
  return (
    <div className={`seg ${big ? 'big' : ''}`} role="radiogroup">
      {options.map(([id, label, disabled]) => (
        <button key={id} type="button" role="radio" aria-checked={value === id} className={value === id ? 'on' : ''} disabled={disabled} onClick={() => onChange(id)}>{label}</button>
      ))}
    </div>
  );
}

// Когда получить: «как можно скорее» (в рабочие часы) или ко времени сегодня
function WhenField({ f, setF, lead }) {
  const open = isOpen();
  const slots = timeSlots(lead + 10);
  const asapOk = open;
  useEffect(() => {
    if (f.when === 'asap' && !asapOk && slots.length) setF((x) => ({ ...x, when: slots[0] }));
  }, [asapOk]);
  return (
    <div className="field">
      <span>{f.mode === 'delivery' ? 'Желаемое время доставки' : 'Когда заберёте'}</span>
      <Seg value={f.when === 'asap' ? 'asap' : 'time'} onChange={(v) => setF((x) => ({ ...x, when: v === 'asap' ? 'asap' : slots[0] || 'asap' }))}
        options={[['asap', `Как можно скорее · ≈ ${lead} мин`, !asapOk], ['time', 'Ко времени', !slots.length]]} />
      {f.when !== 'asap' && slots.length > 0 && (
        <select className="select" value={f.when} onChange={(e) => setF((x) => ({ ...x, when: e.target.value }))} aria-label="Время">
          {slots.map((s) => <option key={s} value={s}>Сегодня к {s}</option>)}
        </select>
      )}
      {!asapOk && <em className="note">Сейчас закрыто — работаем с {SETTINGS.hours.open} до {SETTINGS.hours.close}.{slots.length ? ' Выбери время на сегодня.' : ' Заказы на сегодня больше не принимаем.'}</em>}
    </div>
  );
}

// Доставка по расстоянию: сколько км от ресторана, цена и время в пути
function ZoneCard({ zone, km, t }) {
  const dist = km != null ? `${String(km).replace('.', ',')} км от ресторана` : '';
  if (!zone) return <div className="zone-card bad"><b><Icon name="cancel" /> Сюда не доставляем{dist ? ` · ${dist}` : ''}</b><span>Выбери другую точку или самовывоз</span></div>;
  return (
    <div className="zone-card">
      <b><Icon name="check_circle" /> Доставка {t.fee ? fmtPrice(t.fee) : 'бесплатно'}</b>
      <span>{dist}{dist ? " · " : ""}в пути ≈ {zone.etaMin} мин</span>
    </div>
  );
}

const withZone = (location) => (location ? { location, km: zoneFor(location).km } : { location: null, km: null });
const zoneOf = (location) => (location ? zoneFor(location).zone : null);
// Цены доставки для подсказки: «до 3 км — 10 000 сум · 3–7 км — 15 000 сум»
const priceList = () => SETTINGS.delivery.zones.map((z) => `${z.name} — ${fmtPrice(z.fee)}`).join(' · ');

function DeliverySection({ f, setF, err, t, zone }) {
  const { S } = useApp();
  const [locating, setLocating] = useState(false);
  const [locErr, setLocErr] = useState('');
  const [mapOpen, setMapOpen] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  // Новая точка: пересчитываем км и подставляем адрес (улицу можно поправить вручную)
  const setPoint = async (p) => {
    setF((x) => ({ ...x, ...withZone(p) }));
    const a = await reverseGeocode(p);
    if (a) setF((x) => (x.location === p ? { ...x, address: a } : x));
  };
  const detect = async () => {
    setLocating(true); setLocErr('');
    try { await setPoint(await getLocation()); } catch (e) { setLocErr(e.message); }
    setLocating(false);
  };
  const saved = S.addresses.filter((a) => a.location);
  return (
    <section className="co-section">
      <h2 className="sec-title"><Icon name="delivery_dining" /> Доставка</h2>
      {saved.length > 0 && (
        <div className="chips wrap saved-addr">
          {saved.map((a) => (
            <button key={a.address} type="button" className={`chip ${f.address === a.address ? 'active' : ''}`}
              onClick={() => setF((x) => ({ ...x, address: a.address, details: a.details, ...withZone(a.location) }))}>
              <Icon name="location_on" /> {a.address}
            </button>
          ))}
        </div>
      )}
      <div className={`field ${err.zone ? 'bad' : ''}`}>
        <span>Куда доставить{f.location && f.location === S.profile.botLocation && <small className="from-bot"><Icon name="check_circle" /> из Telegram</small>}</span>
        {f.location ? <ZoneCard zone={zone} km={f.km} t={t} /> : <div className="zone-card idle"><b><Icon name="pin_drop" /> Укажи точку — посчитаем доставку по расстоянию</b><span>{priceList()}</span></div>}
        <div className="row2">
          <button type="button" className="btn outline" onClick={detect} disabled={locating}><Icon name="my_location" /> {locating ? 'Ищем…' : 'Я здесь'}</button>
          <button type="button" className="btn outline" onClick={() => setMapOpen(true)}><Icon name="map" /> На карте</button>
        </div>
        {locErr && <em>{locErr}. Укажи точку на карте</em>}
        {err.zone && <em>{err.zone}</em>}
      </div>
      <label className={`field ${err.address ? 'bad' : ''}`}>
        <span>Улица и дом</span>
        <input value={f.address} onChange={set('address')} autoComplete="street-address" placeholder="Ташкент, ул. Амира Темура, 15" />
        {err.address && <em>{err.address}</em>}
      </label>
      <label className="field">
        <span>Подъезд, этаж, квартира</span>
        <input value={f.details} onChange={set('details')} placeholder="Подъезд 2, этаж 5, кв. 18" />
      </label>
      <WhenField f={f} setF={setF} lead={leadMinutes('delivery', zone || SETTINGS.delivery.zones[0])} />
      <Sheet open={mapOpen} onClose={() => setMapOpen(false)} title="Куда доставить?">
        <div className="map-sheet">
          <MapPicker value={f.location} onChange={setPoint} origin={SETTINGS.delivery.origin} zones={SETTINGS.delivery.zones} height={Math.min(380, Math.round(window.innerHeight * 0.45))} />
          <p className="hint">Нажми на карту или перетащи метку. Цветные круги — зоны доставки.</p>
          {f.location ? <ZoneCard zone={zone} km={f.km} t={t} /> : <div className="zone-card idle"><b>Точка не выбрана</b><span>{priceList()}</span></div>}
          <button type="button" className="btn primary block lg" onClick={() => setMapOpen(false)} disabled={!f.location}>Готово</button>
        </div>
      </Sheet>
    </section>
  );
}

const savedAddr = (a) => ({ address: a?.location ? a.address : '', details: a?.location ? a.details || '' : '', ...withZone(a?.location) });
const botAddr = (p) => ({ address: p.botAddress || '', details: '', ...withZone(p.botLocation) });

export function Checkout() {
  const { S, A } = useApp();
  const modes = enabledModes();
  const recentTable = S.table && Date.now() - S.table.at < 4 * 3600_000 ? S.table.n : null;
  // Адрес по умолчанию — геолокация из бота, иначе последний сохранённый
  const [f, setF] = useState(() => ({
    mode: recentTable && modes.includes('hall') ? 'hall' : modes[0] || 'delivery',
    name: S.profile.name === 'Гость' ? '' : S.profile.name, phone: S.profile.phone || '+998 ',
    ...(S.profile.botLocation ? botAddr(S.profile) : savedAddr(S.addresses[0])),
    when: 'asap', table: recentTable ? String(recentTable) : '', payment: 'card', comment: '',
  }));
  const [err, setErr] = useState({});
  const [sending, setSending] = useState(false);
  const zone = f.mode === 'delivery' ? zoneOf(f.location) : null;
  const t = cartTotals(S.cart, f.mode, zone);
  const bad = S.cart.some((i) => itemIssues(i).length);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const lead = leadMinutes(f.mode, zone || SETTINGS.delivery.zones[0]);
  const etaAt = f.mode === 'hall' || f.when === 'asap' ? Date.now() + (lead + SETTINGS.timing.acceptAlertMin) * 60000 : atTime(f.when);

  const fromTelegram = async () => {
    const p = await requestPhone();
    if (p) setF((x) => ({ ...x, phone: fmtPhone(p) }));
  };
  // Номер из бота пришёл позже, чем открылась форма, — подставим, если поле ещё пустое
  useEffect(() => {
    if (S.profile.phone) setF((x) => (x.phone.replace(/\D/g, '').length <= 3 ? { ...x, phone: S.profile.phone } : x));
  }, [S.profile.phone]);
  // Геолокация из бота пришла позже — подставим, если адрес ещё не заполнен
  useEffect(() => {
    if (S.profile.botLocation) setF((x) => (!x.location && !x.address.trim() ? { ...x, ...botAddr(S.profile) } : x));
  }, [S.profile.botLocation]);
  const phoneFromBot = S.profile.phoneFromBot && f.phone === S.profile.phone;

  const submit = async () => {
    if (sending) return;
    const e = {};
    if (f.mode !== 'hall' && !f.name.trim()) e.name = 'Укажи имя, чтобы мы знали, кого искать';
    if (f.mode !== 'hall' && !validPhone(f.phone)) e.phone = 'Нужен номер в формате +998 90 123 45 67';
    if (f.mode === 'hall' && f.phone.replace(/\D/g, '').length > 3 && !validPhone(f.phone)) e.phone = 'Проверь номер или оставь поле пустым';
    if (f.mode === 'delivery' && f.address.trim().length < 5) e.address = 'Укажи улицу и дом';
    if (f.mode === 'delivery' && !zone) e.zone = f.location ? 'Сюда не доставляем — выбери другую точку или самовывоз' : 'Укажи точку доставки: «Я здесь» или «На карте»';
    if (f.mode === 'hall' && !(Number(f.table) >= 1 && Number(f.table) <= SETTINGS.hallTables)) e.table = 'Выбери номер стола';
    setErr(e);
    if (Object.keys(e).length) return;
    setSending(true);
    const payload = {
      mode: f.mode,
      customer: { name: f.name.trim(), phone: validPhone(f.phone) ? fmtPhone(f.phone) : '', address: f.mode === 'delivery' ? f.address.trim() : '', details: f.mode === 'delivery' ? f.details.trim() : '' },
      table: f.mode === 'hall' ? Number(f.table) : null,
      zoneId: zone?.id || null, zone, location: f.mode === 'delivery' ? f.location : null,
      desiredTime: f.mode !== 'hall' && f.when !== 'asap' ? f.when : null, desiredAt: f.mode !== 'hall' && f.when !== 'asap' ? atTime(f.when) : null,
      payment: f.payment, comment: f.comment.trim(),
    };
    const ok = await A.placeOrder(payload, t);
    if (ok === false) setSending(false);
  };

  if (!S.cart.length) {
    return <div className="page"><ScreenHead title="Оформление" onBack={() => A.back()} /><Empty icon="receipt_long" title="Нечего оформлять" text="Сначала добавь бургер в корзину." action={<button className="btn primary" onClick={() => A.go('builder')}>Собрать бургер</button>} /></div>;
  }

  const hall = f.mode === 'hall';
  return (
    <div className="page">
      <ScreenHead title="Оформление заказа" onBack={() => A.back()} />
      <div className="cart-layout">
        <div className="form">
          <div className="field">
            <span>Способ получения</span>
            <Seg value={f.mode} onChange={(m) => setF((x) => ({ ...x, mode: m }))} options={modes.map((m) => [m, <><Icon name={MODES[m].icon} /> {MODES[m].t}</>])} />
          </div>

          <label className={`field ${err.name ? 'bad' : ''}`}>
            <span>{hall ? 'Имя (необязательно — назовём при подаче)' : 'Имя'}</span>
            <input value={f.name} onChange={set('name')} autoComplete="name" placeholder="Бобур" />
            {err.name && <em>{err.name}</em>}
          </label>
          <label className={`field ${err.phone ? 'bad' : ''}`}>
            <span>{hall ? 'Телефон (необязательно)' : 'Номер телефона'}{phoneFromBot && <small className="from-bot"><Icon name="check_circle" /> из Telegram</small>}</span>
            <div className="input-row">
              <input value={f.phone} onChange={set('phone')} onBlur={() => validPhone(f.phone) && setF((x) => ({ ...x, phone: fmtPhone(x.phone) }))} inputMode="tel" autoComplete="tel" placeholder="+998 90 123 45 67" />
              {inTelegram && !phoneFromBot && <button type="button" className="btn ghost sm" onClick={fromTelegram}><Icon name="smartphone" /> Из Telegram</button>}
            </div>
            {err.phone && <em>{err.phone}</em>}
          </label>

          {f.mode === 'delivery' && <DeliverySection f={f} setF={setF} err={err} t={t} zone={zone} />}

          {f.mode === 'pickup' && (
            <section className="co-section">
              <h2 className="sec-title"><Icon name="directions_run" /> Самовывоз</h2>
              <div className="pickup">{SETTINGS.pickupAddress}. Приготовим за ≈ {lead} мин.</div>
              <WhenField f={f} setF={setF} lead={lead} />
            </section>
          )}

          {hall && (
            <section className="co-section">
              <h2 className="sec-title"><Icon name="table_restaurant" /> В зале</h2>
              <label className={`field ${err.table ? 'bad' : ''}`}>
                <span>Номер стола</span>
                <select className="select" value={f.table} onChange={set('table')}>
                  <option value="">Выбери стол</option>
                  {Array.from({ length: SETTINGS.hallTables }, (_, i) => <option key={i + 1} value={i + 1}>Стол {i + 1}</option>)}
                </select>
                {err.table && <em>{err.table}</em>}
              </label>
              <div className="pickup">Заказ сразу уйдёт на кассу, а когда он будет готов, мы принесём его к столу. Номер заказа покажем после оформления.</div>
            </section>
          )}

          <div className="field">
            <span>{hall ? 'Оплата на кассе' : 'Способ оплаты'}</span>
            <Seg value={f.payment} onChange={(p) => setF((x) => ({ ...x, payment: p }))} options={[['card', <><Icon name="credit_card" /> Карта</>], ['cash', <><Icon name="payments" /> Наличные</>]]} />
          </div>
          <label className="field">
            <span>Комментарий к заказу</span>
            <textarea rows="3" value={f.comment} onChange={set('comment')} maxLength={300} placeholder={hall ? 'Например: соус отдельно, принести приборы' : 'Например: котлеты medium, позвонить за 5 минут'} />
          </label>
        </div>
        <aside className="cart-side">
          <div className="summary">
            {S.cart.map((i) => (
              <div key={i.cid} className="sum-line"><span>{i.name}{i.qty > 1 ? ` × ${i.qty}` : ''}</span><b>{fmtPrice(i.unit * i.qty)}</b></div>
            ))}
            <div className="sum-line"><span>Товары</span><b>{fmtPrice(t.sub)}</b></div>
            {f.mode === 'delivery' && <div className="sum-line"><span>Доставка{zone && f.km != null ? ` · ${String(f.km).replace('.', ',')} км` : ''}</span><b>{zone ? (t.fee ? fmtPrice(t.fee) : 'бесплатно') : t.feeFrom ? `≈ от ${fmtPrice(t.feeFrom)}` : 'бесплатно'}</b></div>}
            <div className="sum-line total"><span>Итого</span><b>{f.mode === 'delivery' && !zone && t.feeFrom ? `≈ ${fmtPrice(t.total + t.feeFrom)}` : fmtPrice(t.total)}</b></div>
            <div className="sum-line"><span>{f.mode === 'delivery' ? 'Доставим' : 'Будет готов'}</span><b>≈ к {fmtTime(etaAt)}</b></div>
            <MinOrderNote t={t} />
            {bad && <div className="min-note">Часть позиций закончилась — вернись в корзину</div>}
            <button className="btn primary block lg" onClick={submit} disabled={sending || t.minLeft > 0 || bad}>{sending ? (S.pending ? 'Ждём связь, заказ сохранён…' : 'Отправляем на кассу…') : `Оформить заказ · ${fmtPrice(t.total)}`}</button>
            <p className="fine">{inTelegram ? (hall ? 'Оплата на кассе картой или наличными.' : 'Оплата при получении — картой или наличными.') : 'Это демо: оплата не списывается.'}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function useNow(ms = 30000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

export function Tracking({ orderId }) {
  const { S, A } = useApp();
  const now = useNow();
  const o = S.orders.find((x) => x.id === orderId) || S.orders[S.orders.length - 1];
  if (!o) return <div className="page"><ScreenHead title="Статус заказа" /><Empty icon="receipt_long" title="Активных заказов нет" action={<button className="btn primary" onClick={() => A.go('builder')}>Собрать бургер</button>} /></div>;
  const flow = flowOf(o);
  const idx = flow.indexOf(o.status);
  const cancelled = o.status === 'cancelled';
  const done = o.status === 'done';
  const pct = cancelled ? 100 : (Math.max(0, idx) / (flow.length - 1)) * 100;
  const info = statusInfo(o);
  const left = Math.max(0, Math.round((o.etaAt - now) / 60000));
  const burger = o.items.find((i) => i.kind === 'burger');
  const where = o.mode === 'hall' ? `стол ${o.table}` : o.mode === 'pickup' ? 'самовывоз' : 'доставка';
  return (
    <div className="page tracking">
      <ScreenHead title={cancelled ? 'Заказ отменён' : done ? MODE_TEXT.done[o.mode] : info.t} sub={`Заказ #${o.id} · ${where}`} />
      <div className={`track-hero ${cancelled ? 'cancelled' : ''}`}>
        <div className="th-art">{burger ? <MiniBurger keys={burger.keys} h={170} w={170} /> : <PartyBurgerArt len={50} height={100} />}</div>
        <div className="th-info">
          <div className="eta">{cancelled ? 'Отменён' : done ? 'Готово!' : o.etaAt ? `к ${fmtTime(o.etaAt)}` : '…'}</div>
          <div className="muted-t">{cancelled ? info.d : done ? MODE_TEXT.done[o.mode] : `${info.d}${o.etaAt ? ` · осталось ≈ ${left} мин` : ''}`}</div>
          <div className={`bar big ${cancelled ? 'bad' : ''}`}><i style={{ width: `${pct}%` }} /></div>
        </div>
      </div>
      {!cancelled && (
        <ol className="timeline">
          {flow.map((st, i) => (
            <li key={st} className={i < idx || done ? 'past' : i === idx ? 'now' : ''}>
              <span className="dot">{i < idx || done ? <Icon name="check" /> : i + 1}</span>
              <span className="tl-t">{statusInfo(o, st).t}</span>
              {o.statusAt?.[st] && <span className="tl-time">{fmtTime(o.statusAt[st])}</span>}
            </li>
          ))}
        </ol>
      )}
      <div className="summary">
        {o.mode === 'delivery' && o.customer?.address && <div className="sum-line"><span>Адрес</span><b className="wrap">{o.customer.address}{o.customer.details ? `, ${o.customer.details}` : ''}</b></div>}
        {o.mode === 'pickup' && <div className="sum-line"><span>Где забрать</span><b className="wrap">{SETTINGS.pickupAddress}</b></div>}
        {o.mode === 'hall' && <div className="sum-line"><span>Стол</span><b>{o.table}</b></div>}
        {o.desiredAt && <div className="sum-line"><span>Ко времени</span><b>{fmtTime(o.desiredAt)}</b></div>}
        {o.items.map((i) => <div key={i.cid} className="sum-line"><span>{i.name}{i.qty > 1 ? ` · ${i.qty} × ${fmtPrice(i.unit)}` : ''}</span><b>{fmtPrice(i.unit * i.qty)}</b></div>)}
        {o.fee > 0 && <div className="sum-line"><span>Доставка</span><b>{fmtPrice(o.fee)}</b></div>}
        <div className="sum-line total"><span>Итого</span><b>{fmtPrice(o.total)}</b></div>
      </div>
      <div className="dl-row">
        {isClosed(o) && <button className="btn outline" onClick={() => A.repeatOrder(o)}>Повторить заказ</button>}
        {!o.remote && !isClosed(o) && <button className="btn outline" onClick={() => A.go('kitchen')}>Посмотреть на кухне</button>}
        <button className="btn primary" onClick={() => A.go('builder')}>Собрать новый</button>
      </div>
      <p className="fine">{o.remote ? 'Статус обновляется в реальном времени, а бот присылает уведомление в Telegram на каждом этапе.' : 'Демо-режим: статусы меняются автоматически каждые несколько секунд, а кнопки на экране кухни двигают заказ вперёд.'}</p>
    </div>
  );
}
