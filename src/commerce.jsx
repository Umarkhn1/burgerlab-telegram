import React, { useEffect, useState } from 'react';
import { useApp } from './ctx.js';
import { STOP, SETTINGS, MODES, MODE_TEXT, PROD, PRODUCTS, PRODUCT_CATS, UPSELL_CATS, PAYMENTS } from './data.js';
import {
  fmtPrice, fmtWeight, cartTotals, itemIssues, validPhone, fmtPhone, zoneFor, isOpen, timeSlots, atTime, fmtTime,
  leadMinutes, flowOf, statusInfo, isClosed, approx, promoDiscount, cutletsMax, cutletsSum,
} from './calc.js';
import { inTelegram, requestPhone, getLocation, apiPromo } from './telegram.js';
import { t, tn, nm } from './i18n.js';
import { MiniBurger, Empty, ScreenHead, Stepper, Icon, Sheet } from './ui.jsx';
import { ProductArt } from './visuals.jsx';
import { MapPicker, reverseGeocode } from './map.jsx';

export { cartTotals } from './calc.js';

// Можно ли выбрать остроту: свой бургер — всегда, товар меню — если включено в меню
const spicyOption = (it) => it.kind === 'burger' || !!PROD[it.id]?.spicy;

function CartItem({ it }) {
  const { S, A } = useApp();
  const issues = itemIssues(it);
  const editing = S.editingCid === it.cid;
  const p = PROD[it.id];
  return (
    <article className={`cart-item ${issues.length ? 'bad' : ''}`}>
      <div className="ci-art">
        {it.kind === 'burger' ? <MiniBurger keys={it.keys} h={96} w={96} /> : <ProductArt p={p || it} size={84} />}
      </div>
      <div className="ci-body">
        <h3>{nm(p) || nm(it)}</h3>
        <div className="ci-meta">
          {it.kind === 'burger' ? <>{approx(fmtWeight(it.weight))} · {it.count} {tn(it.count, 'слой', 'слоя', 'слоёв', 'qatlam')}</> : nm(p, 'note') || it.note}
        </div>
        {it.packaging > 0 && <div className="ci-note">{t('Включая спецупаковку {sum}', { sum: fmtPrice(it.packaging) })}</div>}
        {spicyOption(it) && (
          <div className="ci-spicy" role="radiogroup" aria-label={t('Острота')}>
            <button role="radio" aria-checked={!it.spicy} className={!it.spicy ? 'on' : ''} onClick={() => A.setSpicy(it.cid, false)}>{t('Не острый')}</button>
            <button role="radio" aria-checked={!!it.spicy} className={it.spicy ? 'on hot' : ''} onClick={() => A.setSpicy(it.cid, true)}>🌶 {t('Острый')}</button>
          </div>
        )}
        {editing && <div className="ci-note"><Icon name="edit" /> {t('Открыт в конструкторе — правки ещё не сохранены')} · <button className="link sm" onClick={A.cancelCartEdit}>{t('Отменить')}</button></div>}
        {issues.length > 0 && <div className="ci-issue"><Icon name="warning" /> {issues.join(', ')}. {t(it.kind === 'burger' ? 'Измени бургер или убери его' : 'Убери позицию')}</div>}
        <div className="ci-foot">
          <b>{it.qty > 1 && <small className="ci-unit">{it.qty} × {fmtPrice(it.unit)} = </small>}{fmtPrice(it.unit * it.qty)}</b>
          <div className="ci-ctrl">
            {it.kind === 'burger' && <button className="link sm" onClick={() => A.editCartItem(it)}>{t('Изменить')}</button>}
            <Stepper qty={it.qty} label={nm(it)} onMinus={() => A.cartQty(it.cid, -1)} onPlus={() => A.cartQty(it.cid, 1)} disabledPlus={it.qty >= 20} />
          </div>
        </div>
      </div>
    </article>
  );
}

function MinOrderNote({ t: tot }) {
  if (tot.minLeft <= 0) return null;
  return <div className="min-note">{t('Минимальная сумма заказа — {min}. Добавь ещё на', { min: fmtPrice(SETTINGS.minOrder) })} <b>{fmtPrice(tot.minLeft)}</b></div>;
}

// «Добавить к заказу»: соусы, напитки, закуски и десерты, которых ещё нет в корзине
export function Upsell({ title }) {
  const { S, A } = useApp();
  const have = new Set(S.cart.filter((i) => i.kind !== 'burger').map((i) => i.id));
  const list = PRODUCTS.filter((p) => UPSELL_CATS.includes(p.cat) && !p.hidden && !STOP[p.id] && PRODUCT_CATS.find((c) => c.id === p.cat && !c.hidden))
    .sort((a, b) => Number(have.has(a.id)) - Number(have.has(b.id)) || UPSELL_CATS.indexOf(a.cat) - UPSELL_CATS.indexOf(b.cat));
  if (!list.length) return null;
  return (
    <section className="upsell-wrap">
      <h2 className="sec-title"><Icon name="add_circle" /> {title || t('Добавить к заказу')}</h2>
      <div className="h-scroll upsell-row">
        {list.map((p) => (
          <button key={p.id} className={`up-item ${have.has(p.id) ? 'in' : ''}`} onClick={() => A.addProduct(p)}>
            <span className="up-art"><ProductArt p={p} size={56} /></span>
            <b>{nm(p)}</b>
            <small>{nm(p, 'note')}</small>
            <span className="up-price">{have.has(p.id) ? t('Ещё +1') : `+ ${fmtPrice(p.price)}`}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function Cart() {
  const { S, A } = useApp();
  const tot = cartTotals(S.cart);
  const bad = S.cart.some((i) => itemIssues(i).length);
  const count = S.cart.reduce((s, i) => s + i.qty, 0);
  if (!S.cart.length) {
    return (
      <div className="page">
        <ScreenHead title={t('Корзина')} />
        <Empty icon="shopping_bag" title={t('Корзина пока пустая')} text={t('Собери бургер в конструкторе или выбери готовое в меню.')} action={<div className="row2"><button className="btn primary" onClick={() => A.go('builder')}>{t('Собрать бургер')}</button><button className="btn outline" onClick={() => A.go('menu')}>{t('Меню')}</button></div>} />
      </div>
    );
  }
  return (
    <div className="page cart-page">
      <ScreenHead title={t('Корзина')} sub={`${count} ${tn(count, 'позиция', 'позиции', 'позиций', 'ta')}`} />
      <div className="cart-layout">
        <div className="cart-main">
          {S.cart.map((it) => <CartItem key={it.cid} it={it} />)}
          <Upsell />
        </div>
        <aside className="cart-side">
          <div className="summary">
            <div className="sum-line"><span>{t('Товары')}</span><b>{fmtPrice(tot.sub)}</b></div>
            <div className="sum-line"><span>{t('Доставка')}</span><b>{tot.feeFrom ? `${t('от')} ${fmtPrice(tot.feeFrom)}` : t('бесплатно')}</b></div>
            {tot.feeFrom > 0 && <div className="free-hint">{t('Ещё {sum} до бесплатной доставки', { sum: fmtPrice(SETTINGS.freeFrom - tot.sub) })}</div>}
            <div className="sum-line total"><span>{t('Итого')}</span><b>{fmtPrice(tot.total)}</b></div>
            <MinOrderNote t={tot} />
            {bad && <div className="min-note">{t('Часть позиций закончилась — убери или измени их')}</div>}
            <button className="btn primary block lg" onClick={() => A.go('checkout')} disabled={tot.minLeft > 0 || bad}>{t('Перейти к оформлению')}</button>
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
      <span>{t(f.mode === 'delivery' ? 'Желаемое время доставки' : 'Когда заберёте')}</span>
      <Seg value={f.when === 'asap' ? 'asap' : 'time'} onChange={(v) => setF((x) => ({ ...x, when: v === 'asap' ? 'asap' : slots[0] || 'asap' }))}
        options={[['asap', `${t('Как можно скорее')} · ≈ ${lead} ${t('мин')}`, !asapOk], ['time', t('Ко времени'), !slots.length]]} />
      {f.when !== 'asap' && slots.length > 0 && (
        <select className="select" value={f.when} onChange={(e) => setF((x) => ({ ...x, when: e.target.value }))} aria-label={t('Время')}>
          {slots.map((s) => <option key={s} value={s}>{t('Сегодня к {time}', { time: s })}</option>)}
        </select>
      )}
      {!asapOk && <em className="note">{t('Сейчас закрыто — работаем с {open} до {close}.', SETTINGS.hours)} {t(slots.length ? 'Выбери время на сегодня.' : 'Заказы на сегодня больше не принимаем.')}</em>}
    </div>
  );
}

// Доставка по расстоянию: сколько км от ресторана, цена и время в пути
function ZoneCard({ zone, km, tot }) {
  const dist = km != null ? t('{km} км от ресторана', { km: String(km).replace('.', ',') }) : '';
  if (!zone) return <div className="zone-card bad"><b><Icon name="cancel" /> {t('Сюда не доставляем')}{dist ? ` · ${dist}` : ''}</b><span>{t('Выбери другую точку или самовывоз')}</span></div>;
  return (
    <div className="zone-card">
      <b><Icon name="check_circle" /> {t('Доставка')} {tot.fee ? fmtPrice(tot.fee) : t('бесплатно')}</b>
      <span>{dist}{dist ? ' · ' : ''}{t('в пути')} ≈ {zone.etaMin} {t('мин')}</span>
    </div>
  );
}

const withZone = (location) => (location ? { location, km: zoneFor(location).km } : { location: null, km: null });
const zoneOf = (location) => (location ? zoneFor(location).zone : null);
// Цены доставки для подсказки: «до 3 км — 10 000 сум · 3–7 км — 15 000 сум»
const priceList = () => SETTINGS.delivery.zones.map((z) => `${z.name.replace('до', t('до')).replace('км', t('км'))} — ${fmtPrice(z.fee)}`).join(' · ');

function DeliverySection({ f, setF, err, tot, zone }) {
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
    try { await setPoint(await getLocation()); } catch (e) { setLocErr(t(e.message)); }
    setLocating(false);
  };
  const saved = S.addresses.filter((a) => a.location);
  return (
    <section className="co-section">
      <h2 className="sec-title"><Icon name="delivery_dining" /> {t('Доставка')}</h2>
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
        <span>{t('Куда доставить')}{f.location && f.location === S.profile.botLocation && <small className="from-bot"><Icon name="check_circle" /> {t('из Telegram')}</small>}</span>
        {f.location ? <ZoneCard zone={zone} km={f.km} tot={tot} /> : <div className="zone-card idle"><b><Icon name="pin_drop" /> {t('Укажи точку — посчитаем доставку по расстоянию')}</b><span>{priceList()}</span></div>}
        <div className="row2">
          <button type="button" className="btn outline" onClick={detect} disabled={locating}><Icon name="my_location" /> {locating ? t('Ищем…') : t('Я здесь')}</button>
          <button type="button" className="btn outline" onClick={() => setMapOpen(true)}><Icon name="map" /> {t('На карте')}</button>
        </div>
        {locErr && <em>{locErr}. {t('Укажи точку на карте')}</em>}
        {err.zone && <em>{err.zone}</em>}
      </div>
      <label className={`field ${err.address ? 'bad' : ''}`}>
        <span>{t('Улица и дом')}</span>
        <input value={f.address} onChange={set('address')} autoComplete="street-address" placeholder={t('Ташкент, ул. Амира Темура, 15')} />
        {err.address && <em>{err.address}</em>}
      </label>
      <label className="field">
        <span>{t('Подъезд, этаж, квартира')}</span>
        <input value={f.details} onChange={set('details')} placeholder={t('Подъезд 2, этаж 5, кв. 18')} />
      </label>
      <WhenField f={f} setF={setF} lead={leadMinutes('delivery', zone || SETTINGS.delivery.zones[0])} />
      <Sheet open={mapOpen} onClose={() => setMapOpen(false)} title={t('Куда доставить?')}>
        <div className="map-sheet">
          <MapPicker value={f.location} onChange={setPoint} origin={SETTINGS.delivery.origin} zones={SETTINGS.delivery.zones} height={Math.min(380, Math.round(window.innerHeight * 0.45))} />
          <p className="hint">{t('Нажми на карту или перетащи метку. Цветные круги — зоны доставки.')}</p>
          {f.location ? <ZoneCard zone={zone} km={f.km} tot={tot} /> : <div className="zone-card idle"><b>{t('Точка не выбрана')}</b><span>{priceList()}</span></div>}
          <button type="button" className="btn primary block lg" onClick={() => setMapOpen(false)} disabled={!f.location}>{t('Готово')}</button>
        </div>
      </Sheet>
    </section>
  );
}

// Логотипы платёжных систем — нарисованы шрифтом, без картинок
export function PayLogo({ id }) {
  if (id === 'click') return <span className="pay-logo click"><i />click</span>;
  if (id === 'payme') return <span className="pay-logo payme">pay<b>me</b></span>;
  return <Icon name={PAYMENTS[id]?.icon || 'payments'} />;
}

function PaymentField({ value, onChange, hall }) {
  return (
    <div className="field">
      <span>{t('Способ оплаты')}</span>
      <div className="pay-grid" role="radiogroup" aria-label={t('Способ оплаты')}>
        {Object.entries(PAYMENTS).map(([id, p]) => (
          <button key={id} type="button" role="radio" aria-checked={value === id} className={`pay-opt ${value === id ? 'on' : ''} ${p.online ? 'online' : ''}`} onClick={() => onChange(id)}>
            <PayLogo id={id} />
            <small>{p.online ? t('онлайн в приложении') : id === 'cash' ? t('Наличные') : t(hall ? 'Картой на кассе' : 'Картой курьеру')}</small>
          </button>
        ))}
      </div>
      {PAYMENTS[value]?.online && <em className="note">{t('Оплатишь сразу после оформления. Пока работает тестовый режим — деньги не списываются.')}</em>}
    </div>
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
    when: 'asap', table: recentTable ? String(recentTable) : '', payment: 'cash', comment: '', useCutlets: false,
  }));
  const [err, setErr] = useState({});
  const [sending, setSending] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [promo, setPromo] = useState(null); // { code, type, value }
  const [promoErr, setPromoErr] = useState('');
  const [promoBusy, setPromoBusy] = useState(false);
  const zone = f.mode === 'delivery' ? zoneOf(f.location) : null;
  const base = cartTotals(S.cart, f.mode, zone);
  const discount = promo ? promoDiscount(promo, base.sub) : 0;
  const maxCut = inTelegram ? cutletsMax(S.profile.cutlets || 0, base.sub - discount + base.fee) : 0;
  const useCut = f.useCutlets && maxCut > 0 ? maxCut : 0;
  const tot = cartTotals(S.cart, f.mode, zone, { discount, cutlets: useCut });
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

  const applyPromo = async () => {
    const code = promoCode.trim().toUpperCase();
    if (!code) return;
    setPromoBusy(true); setPromoErr('');
    try {
      if (!inTelegram) throw new Error(t('Промокоды работают в приложении в Telegram'));
      const r = await apiPromo(code, S.cart.map(({ kind, id, keys, qty }) => ({ kind, id, keys, qty })));
      setPromo({ code: r.code, type: r.type, value: r.value });
      A.toast(t('Промокод {code}: скидка {sum}', { code: r.code, sum: fmtPrice(r.discount) }), 'ok');
    } catch (e) { setPromo(null); setPromoErr(e.message); }
    setPromoBusy(false);
  };

  const submit = async () => {
    if (sending) return;
    const e = {};
    if (f.mode !== 'hall' && !f.name.trim()) e.name = t('Укажи имя, чтобы мы знали, кого искать');
    if (f.mode !== 'hall' && !validPhone(f.phone)) e.phone = t('Нужен номер в формате +998 90 123 45 67');
    if (f.mode === 'hall' && f.phone.replace(/\D/g, '').length > 3 && !validPhone(f.phone)) e.phone = t('Проверь номер или оставь поле пустым');
    if (f.mode === 'delivery' && f.address.trim().length < 5) e.address = t('Укажи улицу и дом');
    if (f.mode === 'delivery' && !zone) e.zone = t(f.location ? 'Сюда не доставляем — выбери другую точку или самовывоз' : 'Укажи точку доставки: «Я здесь» или «На карте»');
    if (f.mode === 'hall' && !(Number(f.table) >= 1 && Number(f.table) <= SETTINGS.hallTables)) e.table = t('Выбери номер стола');
    setErr(e);
    if (Object.keys(e).length) return;
    setSending(true);
    const payload = {
      mode: f.mode,
      customer: { name: f.name.trim(), phone: validPhone(f.phone) ? fmtPhone(f.phone) : '', address: f.mode === 'delivery' ? f.address.trim() : '', details: f.mode === 'delivery' ? f.details.trim() : '' },
      table: f.mode === 'hall' ? Number(f.table) : null,
      zoneId: zone?.id || null, zone, location: f.mode === 'delivery' ? f.location : null,
      desiredTime: f.mode !== 'hall' && f.when !== 'asap' ? f.when : null, desiredAt: f.mode !== 'hall' && f.when !== 'asap' ? atTime(f.when) : null,
      payment: f.payment, comment: f.comment.trim(), promo: promo?.code || '', cutlets: useCut,
    };
    const ok = await A.placeOrder(payload, tot);
    if (ok === false) setSending(false);
  };

  if (!S.cart.length) {
    return <div className="page"><ScreenHead title={t('Оформление')} onBack={() => A.back()} /><Empty icon="receipt_long" title={t('Нечего оформлять')} text={t('Сначала добавь что-нибудь в корзину.')} action={<button className="btn primary" onClick={() => A.go('menu')}>{t('Меню')}</button>} /></div>;
  }

  const hall = f.mode === 'hall';
  return (
    <div className="page">
      <ScreenHead title={t('Оформление заказа')} onBack={() => A.back()} />
      <div className="cart-layout">
        <div className="form">
          <div className="field">
            <span>{t('Способ получения')}</span>
            <Seg value={f.mode} onChange={(m) => setF((x) => ({ ...x, mode: m }))} options={modes.map((m) => [m, <><Icon name={MODES[m].icon} /> {t(MODES[m].t)}</>])} />
          </div>

          <label className={`field ${err.name ? 'bad' : ''}`}>
            <span>{t(hall ? 'Имя (необязательно — назовём при подаче)' : 'Имя')}</span>
            <input value={f.name} onChange={set('name')} autoComplete="name" placeholder={t('Бобур')} />
            {err.name && <em>{err.name}</em>}
          </label>
          <label className={`field ${err.phone ? 'bad' : ''}`}>
            <span>{t(hall ? 'Телефон (необязательно)' : 'Номер телефона')}{phoneFromBot && <small className="from-bot"><Icon name="check_circle" /> {t('из Telegram')}</small>}</span>
            <div className="input-row">
              <input value={f.phone} onChange={set('phone')} onBlur={() => validPhone(f.phone) && setF((x) => ({ ...x, phone: fmtPhone(x.phone) }))} inputMode="tel" autoComplete="tel" placeholder="+998 90 123 45 67" />
              {inTelegram && !phoneFromBot && <button type="button" className="btn ghost sm" onClick={fromTelegram}><Icon name="smartphone" /> {t('Из Telegram')}</button>}
            </div>
            {err.phone && <em>{err.phone}</em>}
          </label>

          {f.mode === 'delivery' && <DeliverySection f={f} setF={setF} err={err} tot={tot} zone={zone} />}

          {f.mode === 'pickup' && (
            <section className="co-section">
              <h2 className="sec-title"><Icon name="directions_run" /> {t('Самовывоз')}</h2>
              <div className="pickup">{SETTINGS.pickupAddress}. {t('Приготовим за ≈ {min} мин.', { min: lead })}</div>
              <WhenField f={f} setF={setF} lead={lead} />
            </section>
          )}

          {hall && (
            <section className="co-section">
              <h2 className="sec-title"><Icon name="table_restaurant" /> {t('В зале')}</h2>
              <label className={`field ${err.table ? 'bad' : ''}`}>
                <span>{t('Номер стола')}</span>
                <select className="select" value={f.table} onChange={set('table')}>
                  <option value="">{t('Выбери стол')}</option>
                  {Array.from({ length: SETTINGS.hallTables }, (_, i) => <option key={i + 1} value={i + 1}>{t('Стол {n}', { n: i + 1 })}</option>)}
                </select>
                {err.table && <em>{err.table}</em>}
              </label>
              <div className="pickup">{t('Заказ сразу уйдёт на кассу, а когда он будет готов, мы принесём его к столу.')}</div>
            </section>
          )}

          <Upsell title={t('Может, ещё что-нибудь?')} />

          <PaymentField value={f.payment} onChange={(p) => setF((x) => ({ ...x, payment: p }))} hall={hall} />

          <div className="field">
            <span>{t('Промокод')}</span>
            <div className="input-row">
              <input value={promoCode} onChange={(e) => { setPromoCode(e.target.value.toUpperCase()); setPromoErr(''); }} placeholder="BURGER10" autoCapitalize="characters" autoComplete="off" onKeyDown={(e) => e.key === 'Enter' && applyPromo()} />
              {promo ? <button type="button" className="btn ghost sm" onClick={() => { setPromo(null); setPromoCode(''); }}><Icon name="close" /> {t('Убрать')}</button>
                : <button type="button" className="btn dark sm" onClick={applyPromo} disabled={promoBusy || !promoCode.trim()}>{promoBusy ? '…' : t('Применить')}</button>}
            </div>
            {promo && <em className="ok-note"><Icon name="check_circle" /> {t('Промокод {code}: скидка {sum}', { code: promo.code, sum: fmtPrice(discount) })}</em>}
            {promoErr && <em>{promoErr}</em>}
          </div>

          {inTelegram && (S.profile.cutlets || 0) > 0 && (
            <label className={`cut-toggle ${maxCut ? '' : 'disabled'}`}>
              <span className="ct-ico" aria-hidden="true">🍔</span>
              <span className="cut-t">
                <b>{t('Списать котлетки')}</b>
                <small>{maxCut ? t('{n} из {all} котлеток · −{sum}', { n: maxCut, all: S.profile.cutlets, sum: fmtPrice(cutletsSum(maxCut)) }) : t('Сейчас нечего списать')}</small>
              </span>
              <input type="checkbox" checked={!!useCut} disabled={!maxCut} onChange={(e) => setF((x) => ({ ...x, useCutlets: e.target.checked }))} />
              <i className={`switch ${useCut ? 'on' : ''}`}><i /></i>
            </label>
          )}

          <label className="field">
            <span>{t('Комментарий к заказу')}</span>
            <textarea rows="3" value={f.comment} onChange={set('comment')} maxLength={300} placeholder={t(hall ? 'Например: соус отдельно, принести приборы' : 'Например: котлеты medium, позвонить за 5 минут')} />
          </label>
        </div>
        <aside className="cart-side">
          <div className="summary">
            {S.cart.map((i) => (
              <div key={i.cid} className="sum-line"><span>{nm(PROD[i.id]) || nm(i)}{i.spicy ? ' 🌶' : ''}{i.qty > 1 ? ` × ${i.qty}` : ''}</span><b>{fmtPrice(i.unit * i.qty)}</b></div>
            ))}
            <div className="sum-line"><span>{t('Товары')}</span><b>{fmtPrice(tot.sub)}</b></div>
            {tot.discount > 0 && <div className="sum-line minus"><span>{t('Промокод {code}', { code: promo.code })}</span><b>−{fmtPrice(tot.discount)}</b></div>}
            {f.mode === 'delivery' && <div className="sum-line"><span>{t('Доставка')}{zone && f.km != null ? ` · ${String(f.km).replace('.', ',')} ${t('км')}` : ''}</span><b>{zone ? (tot.fee ? fmtPrice(tot.fee) : t('бесплатно')) : tot.feeFrom ? `≈ ${t('от')} ${fmtPrice(tot.feeFrom)}` : t('бесплатно')}</b></div>}
            {tot.cutlets > 0 && <div className="sum-line minus"><span>{t('Котлетки')}</span><b>−{fmtPrice(tot.cutlets)}</b></div>}
            <div className="sum-line total"><span>{t('К оплате')}</span><b>{f.mode === 'delivery' && !zone && tot.feeFrom ? `≈ ${fmtPrice(tot.total + tot.feeFrom)}` : fmtPrice(tot.total)}</b></div>
            <div className="sum-line"><span>{t(f.mode === 'delivery' ? 'Доставим' : 'Будет готов')}</span><b>≈ {t('к')} {fmtTime(etaAt)}</b></div>
            <MinOrderNote t={tot} />
            {bad && <div className="min-note">{t('Часть позиций закончилась — вернись в корзину')}</div>}
            <button className="btn primary block lg" onClick={submit} disabled={sending || tot.minLeft > 0 || bad}>{sending ? t(S.pending ? 'Ждём связь, заказ сохранён…' : 'Отправляем на кассу…') : `${t(PAYMENTS[f.payment]?.online ? 'Оформить и оплатить' : 'Оформить заказ')} · ${fmtPrice(tot.total)}`}</button>
            <p className="fine">{inTelegram ? t(PAYMENTS[f.payment]?.online ? 'Онлайн-оплата сейчас в тестовом режиме.' : hall ? 'Оплата на кассе картой или наличными.' : 'Оплата при получении — картой или наличными.') : t('Это демо: оплата не списывается.')}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function useNow(ms = 30000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const tm = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(tm); }, [ms]);
  return now;
}

// Оплата Click / Payme. Тестовый режим: деньги не списываются, заказ отмечается оплаченным.
export function PaySheet({ o, onClose }) {
  const { A } = useApp();
  const [step, setStep] = useState('ready');
  useEffect(() => setStep(o?.paid ? 'done' : 'ready'), [o?.id]);
  if (!o) return null;
  const p = PAYMENTS[o.payment];
  const pay = async () => {
    setStep('busy');
    await new Promise((r) => setTimeout(r, 1300));
    const ok = await A.payOrder(o);
    setStep(ok ? 'done' : 'ready');
  };
  return (
    <Sheet open onClose={onClose} title={t('Оплата заказа')}>
      <div className={`pay-sheet ${o.payment}`}>
        <div className="pay-head"><PayLogo id={o.payment} /><span className="pay-test">{t('тестовый режим')}</span></div>
        <div className="pay-amount"><small>{t('К оплате')}</small><b>{fmtPrice(o.total)}</b><span>BurgerLab · {t('Заказ')} #{o.id}</span></div>
        {step === 'done' ? (
          <div className="pay-done"><span className="pay-check"><Icon name="check" /></span><b>{t('Оплачено')}</b><small>{t('Касса уже видит оплату')}</small></div>
        ) : (
          <button className={`btn block lg pay-btn ${o.payment}`} onClick={pay} disabled={step === 'busy'}>{step === 'busy' ? t('Проводим оплату…') : t('Оплатить через {p}', { p: p?.t })}</button>
        )}
        <p className="fine center">{t('Подключение настоящей оплаты Click и Payme — следующий шаг. Сейчас деньги не списываются.')}</p>
        {step === 'done' && <button className="btn outline block" onClick={onClose}>{t('Готово')}</button>}
      </div>
    </Sheet>
  );
}

export function Tracking({ orderId }) {
  const { S, A } = useApp();
  const now = useNow();
  const [payOpen, setPayOpen] = useState(false);
  const o = S.orders.find((x) => x.id === orderId) || S.orders[S.orders.length - 1];
  const needPay = o && PAYMENTS[o.payment]?.online && !o.paid && o.status !== 'cancelled';
  // Сразу после оформления с онлайн-оплатой — открываем оплату
  useEffect(() => { if (needPay && o && Date.now() - o.createdAt < 60000) setPayOpen(true); }, [o?.id]);
  if (!o) return <div className="page"><ScreenHead title={t('Статус заказа')} /><Empty icon="receipt_long" title={t('Активных заказов нет')} action={<button className="btn primary" onClick={() => A.go('menu')}>{t('Меню')}</button>} /></div>;
  const flow = flowOf(o);
  const idx = flow.indexOf(o.status);
  const cancelled = o.status === 'cancelled';
  const done = o.status === 'done';
  const pct = cancelled ? 100 : (Math.max(0, idx) / (flow.length - 1)) * 100;
  const info = statusInfo(o);
  const left = Math.max(0, Math.round((o.etaAt - now) / 60000));
  const burger = o.items.find((i) => i.keys?.length);
  const art = o.items.find((i) => i.kind !== 'burger');
  const where = o.mode === 'hall' ? t('стол {n}', { n: o.table }) : t(o.mode === 'pickup' ? 'самовывоз' : 'доставка');
  const doneText = t(MODE_TEXT.done[o.mode]);
  return (
    <div className="page tracking">
      <ScreenHead title={cancelled ? t('Заказ отменён') : done ? doneText : t(info.t)} sub={`${t('Заказ')} #${o.id} · ${where}`} />
      {needPay && (
        <button className={`pay-banner ${o.payment}`} onClick={() => setPayOpen(true)}>
          <PayLogo id={o.payment} />
          <span><b>{t('Оплатить {sum}', { sum: fmtPrice(o.total) })}</b><small>{t('Заказ ждёт оплаты')}</small></span>
          <Icon name="chevron_right" />
        </button>
      )}
      <div className={`track-hero ${cancelled ? 'cancelled' : ''}`}>
        <div className="th-art">{burger ? <MiniBurger keys={burger.keys} h={170} w={170} /> : <ProductArt p={PROD[art?.id] || art} size={130} />}</div>
        <div className="th-info">
          <div className="eta">{cancelled ? t('Отменён') : done ? t('Готово!') : o.etaAt ? `${t('к')} ${fmtTime(o.etaAt)}` : '…'}</div>
          <div className="muted-t">{cancelled ? (o.cancelReason ? t('Причина: {reason}', { reason: t(o.cancelReason) }) : t(info.d)) : done ? doneText : `${t(MODE_TEXT[o.status]?.[o.mode] || info.d)}${o.etaAt ? ` · ${t('осталось ≈ {n} мин', { n: left })}` : ''}`}</div>
          <div className={`bar big ${cancelled ? 'bad' : ''}`}><i style={{ width: `${pct}%` }} /></div>
        </div>
      </div>
      {!cancelled && (
        <ol className="timeline">
          {flow.map((st, i) => (
            <li key={st} className={i < idx || done ? 'past' : i === idx ? 'now' : ''}>
              <span className="dot">{i < idx || done ? <Icon name="check" /> : i + 1}</span>
              <span className="tl-t">{t(statusInfo(o, st).t)}</span>
              {o.statusAt?.[st] && <span className="tl-time">{fmtTime(o.statusAt[st])}</span>}
            </li>
          ))}
        </ol>
      )}
      <div className="summary">
        {o.mode === 'delivery' && o.customer?.address && <div className="sum-line"><span>{t('Адрес')}</span><b className="wrap">{o.customer.address}{o.customer.details ? `, ${o.customer.details}` : ''}</b></div>}
        {o.mode === 'pickup' && <div className="sum-line"><span>{t('Где забрать')}</span><b className="wrap">{SETTINGS.pickupAddress}</b></div>}
        {o.mode === 'hall' && <div className="sum-line"><span>{t('Стол')}</span><b>{o.table}</b></div>}
        {o.desiredAt && <div className="sum-line"><span>{t('Ко времени')}</span><b>{fmtTime(o.desiredAt)}</b></div>}
        {o.items.map((i) => <div key={i.cid} className="sum-line"><span>{nm(i)}{i.spicy ? ' 🌶' : ''}{i.qty > 1 ? ` · ${i.qty} × ${fmtPrice(i.unit)}` : ''}</span><b>{fmtPrice(i.unit * i.qty)}</b></div>)}
        {o.discount > 0 && <div className="sum-line minus"><span>{t('Промокод {code}', { code: o.promo?.code || '' })}</span><b>−{fmtPrice(o.discount)}</b></div>}
        {o.fee > 0 && <div className="sum-line"><span>{t('Доставка')}</span><b>{fmtPrice(o.fee)}</b></div>}
        {o.cutletsSum > 0 && <div className="sum-line minus"><span>{t('Котлетки')}</span><b>−{fmtPrice(o.cutletsSum)}</b></div>}
        <div className="sum-line total"><span>{t('Итого')}</span><b>{fmtPrice(o.total)}</b></div>
        <div className="sum-line"><span>{t('Оплата')}</span><b>{PAYMENTS[o.payment]?.online ? `${PAYMENTS[o.payment].t} · ${t(o.paid ? 'оплачено' : 'ждёт оплаты')}` : t(o.payment === 'cash' ? 'Наличные' : o.mode === 'hall' ? 'Картой на кассе' : 'Картой курьеру')}</b></div>
      </div>
      <div className="dl-row">
        {isClosed(o) && <button className="btn outline" onClick={() => A.repeatOrder(o)}>{t('Повторить заказ')}</button>}
        <button className="btn primary" onClick={() => A.go('menu')}>{t('Заказать ещё')}</button>
      </div>
      <p className="fine">{t(o.remote ? 'Статус обновляется в реальном времени, а бот присылает уведомление в Telegram на каждом этапе.' : 'Демо-режим: статусы меняются автоматически каждые несколько секунд.')}</p>
      {payOpen && needPay !== undefined && <PaySheet o={o} onClose={() => setPayOpen(false)} />}
    </div>
  );
}
