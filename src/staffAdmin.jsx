// Разделы админ-панели: стоп-лист, заказы, отчёты, меню, настройки, доставка, сотрудники, журнал.
import React, { useEffect, useState } from 'react';
import { CATEGORIES, INGREDIENTS, PRODUCTS, PRODUCT_CATS, STOP, SETTINGS, STATUSES, MODES, PAYMENTS, SIZE_PRESETS } from './data.js';
import { fmtPrice, fmtDateTime, statusInfo, productInfo, layerName } from './calc.js';
import { Icon } from './ui.jsx';
import { ProductArt } from './visuals.jsx';
import { MENU_ICONS } from './icons.js';
import { MapPicker, reverseGeocode, zoneColor } from './map.jsx';
import { getLocation } from './telegram.js';

const clone = (v) => JSON.parse(JSON.stringify(v));
const CONFIG = (typeof window !== 'undefined' && window.BL_CONFIG) || {};

// ── Общие элементы ──
export function PageHead({ title, sub, children }) {
  return (
    <header className="st-head">
      <div><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
      {children && <div className="st-head-act">{children}</div>}
    </header>
  );
}

export function Switch({ on, onChange, label, disabled }) {
  return <button type="button" className={`switch ${on ? 'on' : ''}`} role="switch" aria-checked={!!on} aria-label={label} onClick={() => onChange(!on)} disabled={disabled}><i /></button>;
}

function Card({ icon, title, sub, children, className = '' }) {
  return (
    <section className={`card ${className}`}>
      {title && <h3 className="card-t"><Icon name={icon} />{title}</h3>}
      {sub && <p className="card-sub">{sub}</p>}
      {children}
    </section>
  );
}

function Field({ label, children, hint, wide }) {
  return <label className={`fld ${wide ? 'wide' : ''}`}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function Num({ value, onChange, min = 0, step = 1, className = '', ...rest }) {
  return <input className={`in ${className}`} type="number" inputMode="decimal" value={value ?? ''} min={min} step={step} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} {...rest} />;
}

function Check({ on, onChange, children }) {
  return <label className="chk"><Switch on={on} onChange={onChange} label={String(children)} />{children}</label>;
}

function Search({ value, onChange, placeholder }) {
  return <div className="in-wrap grow"><Icon name="search" /><input className="in sm" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} /></div>;
}

function Seg({ value, onChange, options }) {
  return <div className="seg sm">{options.map(([id, t]) => <button key={id} className={value === id ? 'on' : ''} onClick={() => onChange(id)}>{t}</button>)}</div>;
}

// Сохранить / отменить для разделов с черновиком
function SaveActions({ dirty, saving, onSave, onReset }) {
  return (
    <>
      {dirty && <button className="btn ghost sm" onClick={onReset}>Отменить</button>}
      <button className="btn primary sm" onClick={onSave} disabled={!dirty || saving}><Icon name="check" />{saving ? 'Сохраняем…' : 'Сохранить'}</button>
    </>
  );
}

// ── Стоп-лист ──
export function StopList({ api, toast, reloadConfig }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');
  const needle = q.trim().toLowerCase();
  const groups = [
    ...PRODUCT_CATS.map((c) => ({ icon: c.icon, title: `Меню: ${c.name}`, items: PRODUCTS.filter((x) => x.cat === c.id && !x.hidden).map((x) => ({ id: x.id, name: x.name })) })),
    ...CATEGORIES.map((c) => ({ icon: c.icon, title: `Конструктор: ${c.name}`, items: INGREDIENTS.filter((i) => i.cat === c.id && !i.hidden && !i.deleted).map((i) => ({ id: i.id, name: i.name })) })),
  ].map((g) => ({ ...g, items: g.items.filter((i) => !needle || i.name.toLowerCase().includes(needle)) })).filter((g) => g.items.length);

  const toggle = async (item) => {
    const stopped = !STOP[item.id];
    setBusy(item.id);
    try {
      await api('/staff/stop', { method: 'POST', body: { id: item.id, stopped } });
      toast(stopped ? `${item.name} — убрано из продажи` : `${item.name} — снова в продаже`, stopped ? 'err' : 'ok');
      await reloadConfig();
    } catch (e) { toast(e.message, 'err'); }
    setBusy('');
  };
  const count = Object.keys(STOP).length;
  return (
    <>
      <PageHead title="Стоп-лист" sub="Выключенная позиция сразу пропадает из продажи в приложении, а заказ с ней сервер не примет">
        <span className={`pill ${count ? 'pill-bad' : ''}`}>{count ? `В стопе: ${count}` : 'Всё в продаже'}</span>
      </PageHead>
      <div className="st-toolbar"><Search value={q} onChange={setQ} placeholder="Поиск позиции" /></div>
      <div className="stop-grid">
        {groups.map((g) => (
          <Card key={g.title} icon={g.icon} title={g.title}>
            {g.items.map((i) => (
              <div key={i.id} className={`stop-row ${STOP[i.id] ? 'off' : ''}`}>
                <span>{i.name}</span>
                {STOP[i.id] && <em>стоп</em>}
                <Switch on={!STOP[i.id]} onChange={() => toggle(i)} label={`${i.name} в продаже`} disabled={busy === i.id} />
              </div>
            ))}
          </Card>
        ))}
      </div>
    </>
  );
}

// ── Периоды для истории и отчётов ──
const DAY = 86400_000;
const startOfDay = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
const PERIODS = [
  ['today', 'Сегодня', () => [startOfDay(Date.now()), Date.now() + DAY]],
  ['yesterday', 'Вчера', () => [startOfDay(Date.now()) - DAY, startOfDay(Date.now())]],
  ['7d', '7 дней', () => [startOfDay(Date.now()) - 6 * DAY, Date.now() + DAY]],
  ['30d', '30 дней', () => [startOfDay(Date.now()) - 29 * DAY, Date.now() + DAY]],
];
const periodRange = (id) => PERIODS.find((p) => p[0] === id)[2]();
const PeriodSeg = ({ value, onChange }) => <Seg value={value} onChange={onChange} options={PERIODS.map(([id, t]) => [id, t])} />;

// ── История заказов ──
export function History({ api, toast, openOrder, rev }) {
  const [period, setPeriod] = useState('today');
  const [status, setStatus] = useState('');
  const [mode, setMode] = useState('');
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const load = async () => {
    const [from, to] = periodRange(period);
    const p = new URLSearchParams({ from, to, status, mode, q, limit: 500 });
    try { setData(await api(`/staff/orders?${p}`)); } catch (e) { toast(e.message, 'err'); }
  };
  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [period, status, mode, q, rev]);

  const csv = () => {
    const rows = [['Номер', 'Создан', 'Способ', 'Стол/адрес', 'Клиент', 'Телефон', 'Позиции', 'Сумма', 'Оплата', 'Статус', 'Причина отмены', 'Промокод', 'Котлетки']];
    for (const o of data.orders) {
      rows.push([o.id, fmtDateTime(o.createdAt), MODES[o.mode]?.t, o.mode === 'hall' ? `Стол ${o.table}` : o.customer?.address || '', o.customer?.name || o.tgName || '', o.customer?.phone || '',
        o.items.map((i) => `${i.name}${i.spicy ? ' (острый)' : ''} × ${i.qty}`).join('; '), o.total, `${PAYMENTS[o.payment]?.t || o.payment}${PAYMENTS[o.payment]?.online ? (o.paid ? ' · оплачено' : ' · не оплачено') : ''}`, STATUSES[o.status]?.t || o.status, o.cancelReason || '', o.promo?.code || '', o.cutletsUsed || '']);
    }
    const text = '﻿' + rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    a.download = `burgerlab-orders-${period}.csv`;
    a.click();
  };

  return (
    <>
      <PageHead title="Заказы" sub={data ? `Найдено: ${data.total}${data.total > data.orders.length ? `, показаны последние ${data.orders.length}` : ''}` : 'История и статусы заказов'}>
        <button className="btn ghost sm" onClick={csv} disabled={!data?.orders.length}><Icon name="download" />CSV</button>
      </PageHead>
      <div className="st-toolbar">
        <PeriodSeg value={period} onChange={setPeriod} />
        <select className="in sm" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Все статусы</option>
          <option value="active">Только активные</option>
          {Object.entries(STATUSES).map(([k, s]) => <option key={k} value={k}>{s.t}</option>)}
        </select>
        <select className="in sm" value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="">Все способы</option>
          {Object.entries(MODES).map(([k, m]) => <option key={k} value={k}>{m.t}</option>)}
        </select>
        <Search value={q} onChange={setQ} placeholder="Номер, имя, телефон, адрес" />
      </div>
      <div className="card tbl-card">
        <table className="tbl">
          <thead><tr><th>№</th><th>Создан</th><th>Способ</th><th>Клиент</th><th>Позиции</th><th className="r">Сумма</th><th>Статус</th></tr></thead>
          <tbody>
            {data?.orders.map((o) => (
              <tr key={o.id} className="click" onClick={() => openOrder(o.id)}>
                <td><b>#{o.id}</b></td>
                <td className="muted">{fmtDateTime(o.createdAt)}</td>
                <td><span className="cell-i"><Icon name={MODES[o.mode]?.icon} />{o.mode === 'hall' ? `Стол ${o.table}` : MODES[o.mode]?.t}</span></td>
                <td>{o.customer?.name || o.tgName}<small>{o.customer?.phone}</small></td>
                <td className="ellipsis">{o.items.map((i) => `${i.name}${i.qty > 1 ? ` ×${i.qty}` : ''}`).join(', ')}</td>
                <td className="r"><b>{fmtPrice(o.total)}</b></td>
                <td><span className={`st-chip st-${o.status}`}><Icon name={statusInfo(o).ms} />{statusInfo(o).t}</span></td>
              </tr>
            ))}
            {data && !data.orders.length && <tr><td colSpan="7" className="empty-cell">Заказов нет</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Отчёты ──
export function Reports({ api, toast, rev }) {
  const [period, setPeriod] = useState('today');
  const [r, setR] = useState(null);
  useEffect(() => {
    const [from, to] = periodRange(period);
    api(`/staff/report?from=${from}&to=${to}`).then((d) => setR(d.report)).catch((e) => toast(e.message, 'err'));
  }, [period, rev]);
  const min = (v) => (v == null ? '—' : `${v} мин`);
  const Kpi = ({ icon, k, v, tone }) => <div className={`kpi-c ${tone || ''}`}><Icon name={icon} /><span>{k}</span><b>{v}</b></div>;
  return (
    <>
      <PageHead title="Отчёты" sub="Заказы, выручка, отмены и скорость работы">
        <PeriodSeg value={period} onChange={setPeriod} />
      </PageHead>
      {r && (
        <>
          <div className="kpi-grid">
            <Kpi icon="receipt_long" k="Заказов" v={r.count} />
            <Kpi icon="done_all" k="Выполнено" v={r.done} tone="ok" />
            <Kpi icon="cooking" k="В работе" v={r.active} />
            <Kpi icon="cancel" k="Отменено" v={`${r.cancelled}${r.count ? ` · ${Math.round((r.cancelled / r.count) * 100)}%` : ''}`} tone={r.cancelled ? 'bad' : ''} />
            <Kpi icon="payments" k="Выручка" v={fmtPrice(r.revenue)} tone="accent" />
            <Kpi icon="savings" k="Средний чек" v={fmtPrice(r.avgCheck)} />
            <Kpi icon="sell" k="С промокодом" v={`${r.promoOrders} · −${fmtPrice(r.promoDiscount)}`} />
            <Kpi icon="redeem" k="Оплачено котлетками" v={`${r.cutletOrders} · −${fmtPrice(r.cutletSum)}`} />
          </div>
          <div className="card-grid">
            <Card icon="sell" title="Промокоды">
              {r.promos.length ? r.promos.map(([code, x]) => <div key={code} className="kv"><span><b>{code}</b></span><b>{x.count} зак. · −{fmtPrice(x.discount)}</b></div>) : <p className="muted-t">Промокоды не использовали</p>}
            </Card>
            <Card icon="payments" title="Способы оплаты">
              {Object.entries(r.byPayment).map(([k, x]) => <div key={k} className="kv"><span>{PAYMENTS[k]?.t}</span><b>{x.count} · {fmtPrice(x.revenue)}</b></div>)}
            </Card>
          </div>
          <div className="kpi-grid">
            <Kpi icon="point_of_sale" k="Принятие" v={min(r.avgAcceptMin)} />
            <Kpi icon="cooking" k="Приготовление" v={min(r.avgCookMin)} />
            <Kpi icon="two_wheeler" k="Доставка" v={min(r.avgDeliveryMin)} />
            <Kpi icon="timer" k="Полный цикл" v={min(r.avgTotalMin)} />
            <Kpi icon="warning" k="С опозданием" v={r.late} tone={r.late ? 'bad' : ''} />
          </div>
          <div className="card-grid">
            <Card icon="storefront" title="По способам получения">
              {Object.entries(r.byMode).map(([m, v]) => <div key={m} className="kv"><span><Icon name={MODES[m].icon} />{MODES[m].t} · {v.count}</span><b>{fmtPrice(v.revenue)}</b></div>)}
            </Card>
            <Card icon="cancel" title="Причины отмен">
              {r.reasons.length ? r.reasons.map(([t, n]) => <div key={t} className="kv"><span>{t}</span><b>{n}</b></div>) : <p className="muted-t">Отмен нет</p>}
            </Card>
            <Card icon="whatshot" title="Популярные позиции">
              {r.topItems.length ? r.topItems.map(([t, n]) => <div key={t} className="kv"><span>{t}</span><b>{n} шт.</b></div>) : <p className="muted-t">Нет данных</p>}
            </Card>
          </div>
        </>
      )}
    </>
  );
}

// ── Меню ──
const VIS_OPTIONS = { bun: 'Булочка', patty: 'Котлета', crispy: 'Панировка', smash: 'Смэш', wagyu: 'Мраморная', cheese: 'Сыр', sauce: 'Соус', tomato: 'Томат', onion: 'Лук', pickles: 'Огурцы', rings: 'Кольца перца', lettuce: 'Салат', avocado: 'Авокадо', mushroom: 'Грибы', caramel: 'Карамел. лук', pepper: 'Перец', bacon: 'Бекон', egg: 'Яйцо', orings: 'Луковые кольца', fries: 'Фри', hash: 'Хашбраун', pineapple: 'Ананас', pastrami: 'Пастрами', crumbs: 'Крошка', nachos: 'Начос', poppers: 'Попперсы', mac: 'Мак-н-чиз' };
const newId = (prefix, list) => { let n = list.length + 1; while (list.some((x) => x.id === `${prefix}${n}`)) n++; return `${prefix}${n}`; };

function IconPick({ value, onChange }) {
  return (
    <div className="icon-pick">
      <Icon name={value} />
      <select className="in sm" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Иконка">
        {[...new Set([value, ...MENU_ICONS])].map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </div>
  );
}

// Фото уменьшаем в браузере (до 720 px, JPEG) — на сервер уходит ~60–120 КБ
function shrinkImage(file, max = 720) {
  return new Promise((resolve, reject) => {
    if (!/^image\//.test(file.type)) return reject(new Error('Выберите файл с картинкой'));
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => reject(new Error('Не удалось открыть картинку'));
    img.src = URL.createObjectURL(file);
  });
}

function PhotoField({ p, api, toast, onChange }) {
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try { const { url } = await api('/staff/upload', { method: 'POST', body: { dataUrl: await shrinkImage(file) } }); onChange(url); toast('Фото загружено — не забудьте сохранить меню', 'ok'); }
    catch (er) { toast(er.message, 'err'); }
    setBusy(false);
  };
  return (
    <div className="photo-fld">
      <span className="photo-prev">{p.image ? <img src={p.image} alt="" /> : <Icon name="photo_camera" />}</span>
      <div className="photo-act">
        <label className={`btn ghost sm ${busy ? 'disabled' : ''}`}><Icon name="upload" />{busy ? 'Загружаем…' : p.image ? 'Заменить фото' : 'Загрузить фото'}<input type="file" accept="image/*" onChange={pick} hidden disabled={busy} /></label>
        {p.image && <button className="btn ghost sm" onClick={() => onChange('')}><Icon name="close" />Убрать</button>}
        <small className="muted-t">Фото показывается в меню, корзине и в «Добавить к заказу». Лучше горизонтальное, 4:3.</small>
      </div>
    </div>
  );
}

const PRODUCT_ICONS = ['fastfood', 'lunch_dining', 'kebab_dining', 'eco', 'tapas', 'water_drop', 'local_drink', 'water_bottle', 'local_cafe', 'sports_bar', 'cake', 'icecream', 'cookie', 'local_pizza', 'ramen_dining', 'rice_bowl', 'egg', 'bakery_dining', 'restaurant'];

export function MenuEditor({ api, toast, reloadConfig, cfgRev }) {
  const snapshot = () => clone({ categories: CATEGORIES, ingredients: INGREDIENTS, productCats: PRODUCT_CATS, products: PRODUCTS });
  const [m, setM] = useState(snapshot);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState('products');
  const [cat, setCat] = useState(CATEGORIES[0]?.id);
  const [pcat, setPcat] = useState(PRODUCT_CATS[0]?.id);
  const [open, setOpen] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (!dirty) setM(snapshot()); }, [cfgRev]);

  const edit = (key, id, patch) => { setDirty(true); setM((x) => ({ ...x, [key]: x[key].map((it) => (it.id === id ? { ...it, ...patch } : it)) })); };
  const add = (key, item) => { setDirty(true); setM((x) => ({ ...x, [key]: [...x[key], item] })); };
  const remove = (key, id) => { setDirty(true); setM((x) => ({ ...x, [key]: x[key].filter((it) => it.id !== id) })); };
  const move = (key, i, d) => { setDirty(true); setM((x) => { const c = [...x[key]]; const [it] = c.splice(i, 1); c.splice(i + d, 0, it); return { ...x, [key]: c }; }); };
  const save = async () => {
    setSaving(true);
    try { await api('/staff/menu', { method: 'PUT', body: { menu: m } }); setDirty(false); await reloadConfig(); toast('Меню сохранено — приложение обновится автоматически', 'ok'); }
    catch (e) { toast(e.message, 'err'); }
    setSaving(false);
  };
  const oldIds = new Set(INGREDIENTS.map((i) => i.id));
  const catName = m.categories.find((c) => c.id === cat)?.name;
  const pcatName = m.productCats.find((c) => c.id === pcat)?.name;
  // Ингредиент удаляется насовсем: из конструктора, меню и рецептов. В списке он остаётся «пустым местом» —
  // по порядку ингредиентов кодируются ссылки на рецепты.
  const delIng = (i) => {
    if (!window.confirm(`Удалить «${i.name}» насовсем? Он пропадёт из конструктора и бургеров меню.`)) return;
    if (oldIds.has(i.id)) {
      edit('ingredients', i.id, { deleted: true, hidden: true });
      setM((x) => ({ ...x, products: x.products.map((p) => (p.keys ? { ...p, keys: p.keys.filter((k) => k.split(':').pop() !== i.id) } : p)) }));
    } else remove('ingredients', i.id);
  };
  const delProduct = (p) => { if (window.confirm(`Удалить «${p.name}» из меню насовсем?`)) { remove('products', p.id); setOpen(null); } };
  const delPcat = (c) => {
    if (m.products.some((p) => p.cat === c.id)) return toast('В разделе есть позиции — перенесите или удалите их', 'err');
    if (window.confirm(`Удалить раздел «${c.name}»?`)) remove('productCats', c.id);
  };
  const productsIn = m.products.filter((p) => p.cat === pcat);

  return (
    <>
      <PageHead title="Меню и цены" sub="Изменения сразу появятся у клиентов и в расчёте заказов">
        <SaveActions dirty={dirty} saving={saving} onSave={save} onReset={() => { setM(snapshot()); setDirty(false); }} />
      </PageHead>
      <div className="st-toolbar">
        <Seg value={tab} onChange={setTab} options={[['products', 'Меню'], ['pcats', 'Разделы меню'], ['ingredients', 'Конструктор'], ['categories', 'Категории конструктора']]} />
      </div>

      {tab === 'products' && (
        <>
          <div className="chips cat-row">{m.productCats.map((c) => <button key={c.id} className={`chip sm ${pcat === c.id ? 'active' : ''}`} onClick={() => setPcat(c.id)}><Icon name={c.icon} />{c.name}<em className="cnt-mini">{m.products.filter((p) => p.cat === c.id).length}</em></button>)}</div>
          <div className="pe-list">
            {productsIn.map((p) => (
              <div key={p.id} className={`pe-row ${p.hidden ? 'off' : ''} ${open === p.id ? 'open' : ''}`}>
                <div className="pe-head" onClick={() => setOpen(open === p.id ? null : p.id)}>
                  <span className="pe-art"><ProductArt p={p} size={52} /></span>
                  <span className="pe-t"><b>{p.name}{p.hit && <em className="pill hit">хит</em>}{p.spicy && <em className="pill">🌶</em>}{p.hidden && <em className="pill">скрыто</em>}</b><small>{fmtPrice(p.price)}{p.note ? ` · ${p.note}` : ''}</small></span>
                  <Icon name="expand_more" className={open === p.id ? 'rot' : ''} />
                </div>
                {open === p.id && (
                  <div className="pe-body">
                    <div className="fld-grid">
                      <Field label="Название"><input className="in" value={p.name} onChange={(e) => edit('products', p.id, { name: e.target.value })} /></Field>
                      <Field label="Название (узб.)"><input className="in" value={p.nameUz || ''} onChange={(e) => edit('products', p.id, { nameUz: e.target.value })} /></Field>
                      <Field label="Описание" wide><input className="in" value={p.note || ''} onChange={(e) => edit('products', p.id, { note: e.target.value })} /></Field>
                      <Field label="Описание (узб.)" wide><input className="in" value={p.noteUz || ''} onChange={(e) => edit('products', p.id, { noteUz: e.target.value })} /></Field>
                      <Field label="Цена, сум"><Num value={p.price} step={500} onChange={(v) => edit('products', p.id, { price: v })} /></Field>
                      {!p.keys?.length && <Field label="Вес, г"><Num value={p.w || 0} onChange={(v) => edit('products', p.id, { w: v })} /></Field>}
                      {!p.keys?.length && <Field label="Ккал"><Num value={p.kcal || 0} onChange={(v) => edit('products', p.id, { kcal: v })} /></Field>}
                      <Field label="Раздел"><select className="in" value={p.cat} onChange={(e) => edit('products', p.id, { cat: e.target.value })}>{m.productCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
                      {!p.keys?.length && p.cat !== 'hotdogs' && <Field label="Иконка"><div className="icon-pick"><Icon name={p.icon || 'restaurant'} /><select className="in sm" value={p.icon || 'restaurant'} onChange={(e) => edit('products', p.id, { icon: e.target.value })}>{PRODUCT_ICONS.map((x) => <option key={x} value={x}>{x}</option>)}</select></div></Field>}
                    </div>
                    <h4 className="st-h4">Фото</h4>
                    <PhotoField p={p} api={api} toast={toast} onChange={(image) => edit('products', p.id, { image })} />
                    {p.keys?.length > 0 && <p className="muted-t pe-keys"><Icon name="lunch_dining" /> Состав (сверху вниз): {p.keys.map(layerName).join(' · ')}. Вес и калории считаются по слоям.</p>}
                    <div className="chk-row">
                      <Check on={!!p.hit} onChange={(v) => edit('products', p.id, { hit: v })}>Хит продаж</Check>
                      <Check on={!!p.spicy} onChange={(v) => edit('products', p.id, { spicy: v })}>Выбор «острый / не острый»</Check>
                      <Check on={!p.hidden} onChange={(v) => edit('products', p.id, { hidden: !v })}>Показывать в меню</Check>
                    </div>
                    <div className="st-row"><button className="btn ghost sm danger-t" onClick={() => delProduct(p)}><Icon name="delete" />Удалить из меню</button></div>
                  </div>
                )}
              </div>
            ))}
            {!productsIn.length && <p className="muted-t">В разделе пока нет позиций</p>}
          </div>
          <div className="st-under">
            <button className="btn ghost sm" onClick={() => { const id = newId('pr', m.products); add('products', { id, cat: pcat, name: 'Новая позиция', note: '', price: 20000, w: 200, kcal: 300, icon: pcat === 'drinks' ? 'local_drink' : pcat === 'sauces' ? 'water_drop' : 'restaurant' }); setOpen(id); }}><Icon name="add" />Позиция в «{pcatName}»</button>
            {pcat === 'burgers' && <button className="btn ghost sm" onClick={() => { const id = newId('pr', m.products); add('products', { id, cat: 'burgers', name: 'Новый бургер', note: '', price: 40000, keys: SIZE_PRESETS.find((x) => x.id === 'standard').layers, spicy: true }); setOpen(id); }}><Icon name="lunch_dining" />Бургер со стандартным составом</button>}
          </div>
        </>
      )}

      {tab === 'pcats' && (
        <>
          <div className="card tbl-card">
            <table className="tbl">
              <thead><tr><th>Порядок</th><th>Иконка</th><th>Название</th><th>Название (узб.)</th><th>Показывать</th><th /></tr></thead>
              <tbody>
                {m.productCats.map((c, i) => (
                  <tr key={c.id}>
                    <td className="nowrap">
                      <button className="icon-btn xs" disabled={i === 0} onClick={() => move('productCats', i, -1)} aria-label="Выше"><Icon name="arrow_upward" /></button>
                      <button className="icon-btn xs" disabled={i === m.productCats.length - 1} onClick={() => move('productCats', i, 1)} aria-label="Ниже"><Icon name="arrow_downward" /></button>
                    </td>
                    <td><IconPick value={c.icon} onChange={(v) => edit('productCats', c.id, { icon: v })} /></td>
                    <td><input className="in sm" value={c.name} onChange={(e) => edit('productCats', c.id, { name: e.target.value })} /></td>
                    <td><input className="in sm" value={c.nameUz || ''} onChange={(e) => edit('productCats', c.id, { nameUz: e.target.value })} /></td>
                    <td><Switch on={!c.hidden} onChange={(v) => edit('productCats', c.id, { hidden: !v })} label="Показывать" /></td>
                    <td><button className="icon-btn xs" onClick={() => delPcat(c)} aria-label="Удалить"><Icon name="delete" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="st-under"><button className="btn ghost sm" onClick={() => add('productCats', { id: newId('cat', m.productCats), name: 'Новый раздел', icon: 'restaurant' })}><Icon name="add" />Раздел</button><p className="muted-t">«Хит продаж» — не раздел: отметьте позиции галочкой «Хит продаж», и они появятся на главной и отдельной вкладкой меню.</p></div>
        </>
      )}

      {tab === 'categories' && (
        <div className="card tbl-card">
          <table className="tbl">
            <thead><tr><th>Порядок</th><th>Иконка</th><th>Название</th><th>Название (узб.)</th><th>Показывать</th></tr></thead>
            <tbody>
              {m.categories.map((c, i) => (
                <tr key={c.id}>
                  <td className="nowrap">
                    <button className="icon-btn xs" disabled={i === 0} onClick={() => move('categories', i, -1)} aria-label="Выше"><Icon name="arrow_upward" /></button>
                    <button className="icon-btn xs" disabled={i === m.categories.length - 1} onClick={() => move('categories', i, 1)} aria-label="Ниже"><Icon name="arrow_downward" /></button>
                  </td>
                  <td><IconPick value={c.icon} onChange={(v) => edit('categories', c.id, { icon: v })} /></td>
                  <td><input className="in sm" value={c.name} onChange={(e) => edit('categories', c.id, { name: e.target.value })} /></td>
                  <td><input className="in sm" value={c.nameUz || ''} onChange={(e) => edit('categories', c.id, { nameUz: e.target.value })} /></td>
                  <td><Switch on={!c.hidden} onChange={(v) => edit('categories', c.id, { hidden: !v })} label="Показывать" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'ingredients' && (
        <>
          <div className="chips cat-row">{m.categories.map((c) => <button key={c.id} className={`chip sm ${cat === c.id ? 'active' : ''}`} onClick={() => setCat(c.id)}><Icon name={c.icon} />{c.name}</button>)}</div>
          <div className="card tbl-card">
            <table className="tbl">
              <thead><tr><th>Название</th><th>Узб.</th><th>Цена, сум</th><th>Вес, г</th><th>Ккал</th><th>Высота, мм</th><th>Острота</th><th>Вид слоя</th><th>Цвет</th><th>В меню</th><th /></tr></thead>
              <tbody>
                {m.ingredients.filter((i) => i.cat === cat && !i.deleted).map((i) => (
                  <tr key={i.id} className={i.hidden ? 'muted-row' : ''}>
                    <td><input className="in sm" value={i.name} onChange={(e) => edit('ingredients', i.id, { name: e.target.value })} /></td>
                    <td><input className="in sm" value={i.nameUz || ''} onChange={(e) => edit('ingredients', i.id, { nameUz: e.target.value })} /></td>
                    <td><Num className="sm w-m" value={i.price} step={500} onChange={(v) => edit('ingredients', i.id, { price: v })} /></td>
                    <td><Num className="sm w-s" value={i.w} onChange={(v) => edit('ingredients', i.id, { w: v })} /></td>
                    <td><Num className="sm w-s" value={i.kcal} onChange={(v) => edit('ingredients', i.id, { kcal: v })} /></td>
                    <td><Num className="sm w-s" value={i.h} min={1} onChange={(v) => edit('ingredients', i.id, { h: v })} /></td>
                    <td><Num className="sm w-xs" value={i.hot || 0} onChange={(v) => edit('ingredients', i.id, { hot: v })} /></td>
                    <td>{oldIds.has(i.id) ? <span className="muted">{VIS_OPTIONS[i.vis] || i.vis}</span> : <select className="in sm" value={i.vis} onChange={(e) => edit('ingredients', i.id, { vis: e.target.value })}>{Object.entries(VIS_OPTIONS).map(([k, tt]) => <option key={k} value={k}>{tt}</option>)}</select>}</td>
                    <td><input className="color" type="color" value={i.c} onChange={(e) => edit('ingredients', i.id, { c: e.target.value })} aria-label="Цвет слоя" /></td>
                    <td><Switch on={!i.hidden} onChange={(v) => edit('ingredients', i.id, { hidden: !v })} label="В меню" /></td>
                    <td><button className="icon-btn xs" onClick={() => delIng(i)} aria-label="Удалить" title="Удалить насовсем"><Icon name="delete" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="st-under">
            <button className="btn ghost sm" onClick={() => add('ingredients', { id: newId('ing', m.ingredients), cat, name: 'Новый ингредиент', price: 3000, w: 20, kcal: 50, h: 4, vis: cat === 'bun' ? 'bun' : cat === 'meat' ? 'patty' : cat === 'cheese' ? 'cheese' : cat === 'sauce' ? 'sauce' : 'lettuce', c: '#C98A3E', c2: '#E8B55C' })}><Icon name="add" />Ингредиент в «{catName}»</button>
            <p className="muted-t">Закончился на время — выключите в стоп-листе или переключателем «В меню». Корзина удаляет ингредиент насовсем.</p>
          </div>
        </>
      )}
    </>
  );
}

// ── Промокоды ──
const emptyPromo = () => ({ code: '', type: 'percent', value: 10, minOrder: 0, maxDiscount: 0, maxUses: 0, perUser: 1, firstOrder: false, expiresAt: null, active: true, note: '' });
const dateIn = (ts) => (ts ? new Date(ts - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10) : '');

export function Promos({ api, toast }) {
  const [list, setList] = useState([]);
  const [f, setF] = useState(null);
  const load = () => api('/staff/promos').then((d) => setList(d.promos)).catch((e) => toast(e.message, 'err'));
  useEffect(() => { load(); }, []);
  const save = async () => {
    try { await api('/staff/promos', { method: 'POST', body: f }); toast(`Промокод ${f.code.toUpperCase()} сохранён`, 'ok'); setF(null); load(); }
    catch (e) { toast(e.message, 'err'); }
  };
  const toggle = async (p) => {
    try { await api('/staff/promos', { method: 'POST', body: { ...p, original: p.code, active: !p.active } }); load(); }
    catch (e) { toast(e.message, 'err'); }
  };
  const del = async (p) => {
    if (!window.confirm(`Удалить промокод ${p.code}? Статистика по нему останется в отчётах.`)) return;
    try { await api(`/staff/promos/${encodeURIComponent(p.code)}`, { method: 'DELETE' }); toast('Промокод удалён', 'ok'); load(); }
    catch (e) { toast(e.message, 'err'); }
  };
  const describe = (p) => [
    p.type === 'percent' ? `−${p.value}%${p.maxDiscount ? ` (не больше ${fmtPrice(p.maxDiscount)})` : ''}` : `−${fmtPrice(p.value)}`,
    p.minOrder ? `от ${fmtPrice(p.minOrder)}` : '', p.firstOrder ? 'только первый заказ' : '',
    p.perUser ? `${p.perUser} раз на клиента` : '', p.maxUses ? `всего ${p.maxUses}` : '',
    p.expiresAt ? `до ${new Date(p.expiresAt).toLocaleDateString('ru-RU')}` : '',
  ].filter(Boolean).join(' · ');
  return (
    <>
      <PageHead title="Промокоды" sub="Скидка действует на товары, без доставки. Использование видно здесь и в «Отчётах»">
        <button className="btn primary sm" onClick={() => setF(emptyPromo())}><Icon name="add" />Промокод</button>
      </PageHead>
      {f && (
        <Card icon="sell" title={f.original ? `Промокод ${f.original}` : 'Новый промокод'} className="promo-form">
          <div className="fld-grid">
            <Field label="Код" hint="Латиница и цифры, например BURGER10"><input className="in code-up" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '') })} maxLength={20} /></Field>
            <Field label="Тип скидки"><Seg value={f.type} onChange={(v) => setF({ ...f, type: v })} options={[['percent', '%'], ['fixed', 'сум']]} /></Field>
            <Field label={f.type === 'percent' ? 'Скидка, %' : 'Скидка, сум'}><Num value={f.value} step={f.type === 'percent' ? 1 : 1000} onChange={(v) => setF({ ...f, value: v })} /></Field>
            {f.type === 'percent' && <Field label="Скидка не больше, сум" hint="0 — без ограничения"><Num value={f.maxDiscount} step={1000} onChange={(v) => setF({ ...f, maxDiscount: v })} /></Field>}
            <Field label="Заказ от, сум"><Num value={f.minOrder} step={1000} onChange={(v) => setF({ ...f, minOrder: v })} /></Field>
            <Field label="Раз на одного клиента" hint="0 — сколько угодно"><Num value={f.perUser} onChange={(v) => setF({ ...f, perUser: v })} /></Field>
            <Field label="Всего использований" hint="0 — без ограничения"><Num value={f.maxUses} onChange={(v) => setF({ ...f, maxUses: v })} /></Field>
            <Field label="Действует до" hint="Пусто — бессрочно"><input className="in" type="date" value={dateIn(f.expiresAt)} onChange={(e) => setF({ ...f, expiresAt: e.target.value ? new Date(`${e.target.value}T23:59:59`).getTime() : null })} /></Field>
            <Field label="Заметка" wide><input className="in" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Например: для блогера, листовки у метро" /></Field>
          </div>
          <div className="chk-row">
            <Check on={f.firstOrder} onChange={(v) => setF({ ...f, firstOrder: v })}>Только на первый заказ</Check>
            <Check on={f.active} onChange={(v) => setF({ ...f, active: v })}>Активен</Check>
          </div>
          <div className="st-row"><button className="btn primary sm" onClick={save} disabled={f.code.length < 3 || !f.value}><Icon name="check" />Сохранить</button><button className="btn ghost sm" onClick={() => setF(null)}>Отмена</button></div>
        </Card>
      )}
      <div className="promo-list">
        {list.map((p) => (
          <div key={p.code} className={`promo-row ${p.active ? '' : 'off'}`}>
            <span className="promo-code">{p.code}</span>
            <span className="promo-t"><b>{describe(p)}</b><small>{p.note ? `${p.note} · ` : ''}использован {p.uses} раз · скидок на {fmtPrice(p.discountSum)}</small></span>
            <span className="promo-act">
              <Switch on={p.active} onChange={() => toggle(p)} label="Активен" />
              <button className="icon-btn sm" onClick={() => setF({ ...emptyPromo(), ...p, original: p.code })} aria-label="Изменить"><Icon name="edit" /></button>
              <button className="icon-btn sm" onClick={() => del(p)} aria-label="Удалить"><Icon name="delete" /></button>
            </span>
          </div>
        ))}
        {!list.length && !f && <div className="desk-empty">Промокодов пока нет. Нажмите «Промокод», чтобы создать первый</div>}
      </div>
    </>
  );
}

// ── Код для повара: 6 цифр, обновляется каждую минуту ──
export function CookCode({ api, toast, embedded }) {
  const [c, setC] = useState(null);
  const [left, setLeft] = useState(0);
  const load = () => api('/staff/cook-code').then((d) => { setC(d.code); setLeft(Math.ceil(d.expiresIn / 1000)); }).catch((e) => toast(e.message, 'err'));
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const tm = setInterval(() => setLeft((s) => { if (s <= 1) { load(); return 60; } return s - 1; }), 1000);
    return () => clearInterval(tm);
  }, []);
  const reset = async () => {
    if (!window.confirm('Завершить смены всех поваров? Им придётся войти заново по новому коду.')) return;
    try { await api('/staff/cook-reset', { method: 'POST', body: {} }); toast('Все повара вышли — для входа нужен новый код', 'ok'); }
    catch (e) { toast(e.message, 'err'); }
  };
  const url = `${location.origin}/staff?cook`;
  return (
    <>
      {!embedded && <PageHead title="Код для повара" sub="Повар открывает кассу на сайте, выбирает «Повар» и вводит этот код. Код меняется каждую минуту" />}
      {embedded && <p className="muted-t cc-lead">Повар открывает кассу на сайте, выбирает «Повар» и вводит этот код. Код меняется каждую минуту.</p>}
      <div className="cook-code card">
        <div className="cc-digits" aria-live="polite">{(c || '······').split('').map((d, i) => <span key={i}>{d}</span>)}</div>
        <div className="cc-ring" style={{ '--p': `${(left / 60) * 100}%` }}><b>{left}</b><small>сек</small></div>
        <p className="muted-t">Адрес для повара: <code>{url}</code></p>
        <div className="st-row">
          <button className="btn ghost sm" onClick={() => { navigator.clipboard?.writeText(url); toast('Адрес скопирован', 'ok'); }}><Icon name="link" />Скопировать адрес</button>
          <button className="btn ghost sm danger-t" onClick={reset}><Icon name="logout" />Завершить смены всех поваров</button>
        </div>
        <p className="muted-t">Повар видит только экран «Кухня»: заказы после приёма кассой, слои сверху вниз, острота, комментарии. Вход действует одну смену (16 часов).</p>
      </div>
    </>
  );
}

// ── Настройки: черновик и сохранение ──
function useSettingsDraft(cfgRev, api, toast, reloadConfig) {
  const [d, setD] = useState(() => clone(SETTINGS));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (!dirty) setD(clone(SETTINGS)); }, [cfgRev]);
  const set = (path, v) => {
    setDirty(true);
    setD((x) => {
      const n = clone(x);
      const keys = path.split('.');
      let o = n;
      keys.slice(0, -1).forEach((k) => { o = o[k]; });
      o[keys[keys.length - 1]] = v;
      return n;
    });
  };
  const save = async () => {
    setSaving(true);
    try { await api('/staff/settings', { method: 'PUT', body: { settings: d } }); setDirty(false); await reloadConfig(); toast('Настройки сохранены', 'ok'); }
    catch (e) { toast(e.message, 'err'); }
    setSaving(false);
  };
  const actions = <SaveActions dirty={dirty} saving={saving} onSave={save} onReset={() => { setD(clone(SETTINGS)); setDirty(false); }} />;
  return { d, set, actions };
}

const CAT_LIMIT_NAMES = { bun: 'Средних булочек', meat: 'Котлет', cheese: 'Слоёв сыра', veg: 'Овощей', sauce: 'Соусов', extra: 'Добавок' };

export function Settings({ api, toast, reloadConfig, cfgRev }) {
  const { d, set, actions } = useSettingsDraft(cfgRev, api, toast, reloadConfig);
  const [pair, setPair] = useState(['', '']);
  const ingName = (id) => INGREDIENTS.find((i) => i.id === id)?.name || id;
  const tableLink = (n) => (CONFIG.botUsername ? `https://t.me/${CONFIG.botUsername}${CONFIG.appName ? `/${CONFIG.appName}` : ''}?startapp=t${n}` : `${location.origin}/?table=${n}`);
  return (
    <>
      <PageHead title="Настройки" sub="Правила приёма заказов и конструктора">{actions}</PageHead>
      <div className="st-stack">
        <Card icon="receipt_long" title="Заказы">
          <div className="fld-grid">
            <Field label="Минимальная сумма, сум" hint="Без учёта доставки"><Num value={d.minOrder} step={1000} onChange={(v) => set('minOrder', v)} /></Field>
            <Field label="Бесплатная доставка от, сум"><Num value={d.freeFrom} step={1000} onChange={(v) => set('freeFrom', v)} /></Field>
            <Field label="Открытие"><input className="in" type="time" value={d.hours.open} onChange={(e) => set('hours.open', e.target.value)} /></Field>
            <Field label="Закрытие"><input className="in" type="time" value={d.hours.close} onChange={(e) => set('hours.close', e.target.value)} /></Field>
            <Field label="Часовой пояс"><input className="in" value={d.tz} onChange={(e) => set('tz', e.target.value)} /></Field>
          </div>
          <div className="chk-row">
            <Check on={d.modes.delivery} onChange={(v) => set('modes.delivery', v)}>Доставка</Check>
            <Check on={d.modes.pickup} onChange={(v) => set('modes.pickup', v)}>Самовывоз</Check>
            <Check on={d.modes.hall} onChange={(v) => set('modes.hall', v)}>В зале</Check>
          </div>
        </Card>

        <Card icon="redeem" title="Реферальная программа и котлетки" sub="Бонусы начисляются обоим после первого выполненного заказа приглашённого друга">
          <div className="chk-row"><Check on={d.referral.enabled} onChange={(v) => set('referral.enabled', v)}>Программа включена</Check></div>
          <div className="fld-grid mt">
            <Field label="Пригласившему, котлеток"><Num value={d.referral.inviterBonus} onChange={(v) => set('referral.inviterBonus', v)} /></Field>
            <Field label="Приглашённому, котлеток"><Num value={d.referral.inviteeBonus} onChange={(v) => set('referral.inviteeBonus', v)} /></Field>
            <Field label="1 котлетка = сум"><Num value={d.referral.rate} step={100} min={1} onChange={(v) => set('referral.rate', v)} /></Field>
            <Field label="Оплата котлетками, до % заказа"><Num value={d.referral.maxPercent} onChange={(v) => set('referral.maxPercent', v)} /></Field>
          </div>
          <p className="muted-t mt">Сейчас пригласивший получает {d.referral.inviterBonus} котлеток = {fmtPrice((d.referral.inviterBonus || 0) * (d.referral.rate || 0))}. При отмене заказа списанные котлетки возвращаются клиенту.</p>
        </Card>

        <Card icon="timer" title="Время, минуты">
          <div className="fld-grid">
            <Field label="Приготовление" hint="От приёма до готовности"><Num value={d.timing.cookMin} min={1} onChange={(v) => set('timing.cookMin', v)} /></Field>
            <Field label="Сигнал «не принят»" hint="Оповестим администратора"><Num value={d.timing.acceptAlertMin} min={1} onChange={(v) => set('timing.acceptAlertMin', v)} /></Field>
            <Field label="Допуск опоздания доставки"><Num value={d.timing.graceMin} onChange={(v) => set('timing.graceMin', v)} /></Field>
          </div>
        </Card>

        <Card icon="lunch_dining" title="Лимиты конструктора">
          <div className="fld-grid">
            <Field label="Минимум начинок" hint="Слоёв между булочками"><Num value={d.limits.minFillings} onChange={(v) => set('limits.minFillings', v)} /></Field>
            <Field label="Максимум слоёв"><Num value={d.limits.maxLayers} min={3} onChange={(v) => set('limits.maxLayers', v)} /></Field>
            <Field label="Одинаковых подряд"><Num value={d.limits.maxSame} min={1} onChange={(v) => set('limits.maxSame', v)} /></Field>
            {Object.entries(CAT_LIMIT_NAMES).map(([c, t]) => <Field key={c} label={`${t}, макс.`}><Num value={d.limits.maxCat[c]} onChange={(v) => set(`limits.maxCat.${c}`, v)} /></Field>)}
          </div>
          <div className="chk-row">
            <Check on={d.limits.requireBun} onChange={(v) => set('limits.requireBun', v)}>Обязательна булочка</Check>
            <Check on={d.limits.requireMeat} onChange={(v) => set('limits.requireMeat', v)}>Обязательна котлета</Check>
          </div>
          <h4 className="st-h4">Запрещённые сочетания</h4>
          {d.limits.forbidden.length === 0 && <p className="muted-t">Нет — можно сочетать всё со всем</p>}
          {d.limits.forbidden.map(([a, b], i) => (
            <div key={`${a}-${b}`} className="kv"><span><Icon name="block" />{ingName(a)} + {ingName(b)}</span><button className="icon-btn xs" onClick={() => set('limits.forbidden', d.limits.forbidden.filter((_, j) => j !== i))} aria-label="Убрать"><Icon name="close" /></button></div>
          ))}
          <div className="st-row">
            {[0, 1].map((n) => (
              <select key={n} className="in sm" value={pair[n]} onChange={(e) => setPair((p) => (n ? [p[0], e.target.value] : [e.target.value, p[1]]))}>
                <option value="">Ингредиент</option>
                {CATEGORIES.map((c) => <optgroup key={c.id} label={c.name}>{INGREDIENTS.filter((i) => i.cat === c.id).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</optgroup>)}
              </select>
            ))}
            <button className="btn ghost sm" disabled={!pair[0] || !pair[1] || pair[0] === pair[1]} onClick={() => { set('limits.forbidden', [...d.limits.forbidden, pair]); setPair(['', '']); }}><Icon name="add" />Запретить</button>
          </div>
        </Card>

        <Card icon="table_restaurant" title="Самовывоз и зал">
          <div className="fld-grid">
            <Field label="Адрес самовывоза" wide><input className="in" value={d.pickupAddress} onChange={(e) => set('pickupAddress', e.target.value)} /></Field>
            <Field label="Столов в зале"><Num value={d.hallTables} min={1} onChange={(v) => set('hallTables', v)} /></Field>
          </div>
          <details className="links">
            <summary><Icon name="qr_code_2" />Ссылки для QR-кодов на столах</summary>
            <p className="muted-t">Гость сканирует QR-код, и приложение откроется с номером стола.</p>
            {Array.from({ length: Math.min(d.hallTables || 0, 100) }, (_, i) => <div key={i} className="kv"><span>Стол {i + 1}</span><code>{tableLink(i + 1)}</code></div>)}
          </details>
        </Card>
      </div>
    </>
  );
}

export function Delivery({ api, toast, reloadConfig, cfgRev }) {
  const { d, set, actions } = useSettingsDraft(cfgRev, api, toast, reloadConfig);
  const zones = d.delivery.zones;
  const origin = d.delivery.origin;
  const [locating, setLocating] = useState(false);
  const [addr, setAddr] = useState('');
  useEffect(() => { let off = false; setAddr(''); reverseGeocode(origin).then((a) => !off && setAddr(a)); return () => { off = true; }; }, [origin.lat, origin.lng]);
  const setOrigin = (p) => set('delivery.origin', p);
  // Зоны идут по возрастанию: «от» — это «до» предыдущей зоны
  const setZone = (i, patch) => set('delivery.zones', zones.map((z, j) => (j === i ? { ...z, ...patch } : z)));
  const sortZones = () => set('delivery.zones', [...zones].sort((a, b) => (Number(a.maxKm) || 0) - (Number(b.maxKm) || 0)));
  const addZone = () => {
    const last = zones[zones.length - 1];
    set('delivery.zones', [...zones, { id: newId('z', zones), name: '', maxKm: (Number(last?.maxKm) || 0) + 5, fee: (Number(last?.fee) || 10000) + 5000, etaMin: (Number(last?.etaMin) || 30) + 10 }]);
  };
  const here = async () => {
    setLocating(true);
    try { const p = await getLocation(); setOrigin({ lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6) }); toast('Точка ресторана обновлена — не забудьте сохранить'); }
    catch (e) { toast(e.message, 'err'); }
    setLocating(false);
  };
  const bad = zones.some((z, i) => !(Number(z.maxKm) > (i ? Number(zones[i - 1].maxKm) : 0)));
  return (
    <>
      <PageHead title="Доставка" sub="Цена доставки считается по расстоянию от ресторана до точки клиента">{actions}</PageHead>
      <div className="st-stack">
        <Card icon="storefront" title="Где ресторан" sub="Нажмите на карту или перетащите метку. От этой точки считаются километры до клиента.">
          <MapPicker value={origin} onChange={setOrigin} origin={origin} zones={zones} pinClass="shop" height={300} />
          <div className="st-under">
            <span className="muted-t"><Icon name="location_on" /> {addr || `${origin.lat}, ${origin.lng}`}</span>
            <button className="btn ghost sm" onClick={here} disabled={locating}><Icon name="my_location" />{locating ? 'Определяем…' : 'Я сейчас в ресторане'}</button>
          </div>
        </Card>
        <Card icon="delivery_dining" title="Цены за доставку" sub={`Дальше ${zones.length ? `${zones[zones.length - 1].maxKm} км` : 'последней зоны'} доставка недоступна. Заказ от ${fmtPrice(d.freeFrom)} доставляем бесплатно (меняется в «Настройках»).`}>
          <div className="zone-rows">
            {zones.length > 0 && <div className="zone-head"><span>От – до, км</span><span /><span>Цена, сум</span><span>В пути, мин</span><span /></div>}
            {zones.map((z, i) => (
              <div key={z.id} className="zone-row">
                <span className="zone-from"><i className="zone-dot" style={{ background: zoneColor(i) }} />{i ? `${zones[i - 1].maxKm}` : '0'} –</span>
                <Num className="sm" value={z.maxKm} step={0.5} min={0.5} onChange={(v) => setZone(i, { maxKm: v })} onBlur={sortZones} aria-label="До, км" />
                <Num className="sm" value={z.fee} step={1000} onChange={(v) => setZone(i, { fee: v })} aria-label="Цена, сум" />
                <Num className="sm" value={z.etaMin} step={5} min={5} onChange={(v) => setZone(i, { etaMin: v })} aria-label="В пути, мин" />
                <button className="icon-btn xs" onClick={() => set('delivery.zones', zones.filter((_, j) => j !== i))} aria-label="Удалить зону" title="Удалить"><Icon name="delete" /></button>
              </div>
            ))}
            {!zones.length && <p className="muted-t">Зон нет — доставка будет недоступна.</p>}
          </div>
          {bad && <p className="st-err"><Icon name="error" /> Каждая следующая зона должна быть дальше предыдущей</p>}
          <div className="st-under"><span className="muted-t">«мин» — время в пути, клиент видит «приготовление + в пути».</span><button className="btn ghost sm" onClick={addZone}><Icon name="add" />Добавить зону</button></div>
        </Card>
      </div>
    </>
  );
}

// ── Сотрудники из Telegram: добавление по ID или @username, имя и никнейм подтягиваются сами ──
// Сотрудник — касса и кухня (переключатель «Касса / Кухня» в разделе «Заказы»)
const ROLE_OPTS = [['admin', 'Администратор'], ['cashier', 'Сотрудник']];
const roleOf = (r) => (r === 'admin' ? 'admin' : 'cashier');

function TgStaff({ api, toast, user }) {
  const [list, setList] = useState([]);
  const [q, setQ] = useState('');
  const [role, setRole] = useState('admin');
  const [busy, setBusy] = useState(false);
  const load = () => api('/staff/tg').then((d) => setList(d.list)).catch((e) => toast(e.message, 'err'));
  useEffect(() => { load(); }, []);
  const add = async () => {
    setBusy(true);
    try {
      const { entry, notified } = await api('/staff/tg', { method: 'POST', body: { query: q, role } });
      toast(`${entry.name}${entry.username ? ` (@${entry.username})` : ''} добавлен${notified ? ' — ему пришло сообщение от бота' : ''}`, 'ok');
      setQ(''); load();
    } catch (e) { toast(e.message, 'err'); }
    setBusy(false);
  };
  const upd = async (x, body, msg) => {
    try { await api(`/staff/tg/${x.tgId}`, { method: 'PUT', body }); toast(msg, 'ok'); load(); }
    catch (e) { toast(e.message, 'err'); }
  };
  const del = async (x) => {
    if (!window.confirm(`Убрать ${x.name} из сотрудников?`)) return;
    try { await api(`/staff/tg/${x.tgId}`, { method: 'DELETE' }); toast('Сотрудник удалён', 'ok'); load(); }
    catch (e) { toast(e.message, 'err'); }
  };
  return (
    <>
      <Card icon="send" title="Сотрудники из Telegram" sub="Входят в панель прямо в приложении, без пароля. Им же приходят новые заказы и оповещения о задержках.">
        <div className="tg-add">
          <div className="in-wrap grow"><Icon name="alternate_email" /><input className="in" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Telegram ID или @username" autoComplete="off" autoCapitalize="off" onKeyDown={(e) => e.key === 'Enter' && q.trim() && add()} /></div>
          <Seg value={role} onChange={setRole} options={ROLE_OPTS} />
          <button className="btn primary sm" onClick={add} disabled={busy || !q.trim()}><Icon name="person_add" />{busy ? 'Ищем…' : 'Добавить'}</button>
        </div>
        <p className="muted-t tg-hint">Имя и никнейм подтянутся сами. Человек должен хоть раз нажать /start в боте. Свой ID можно узнать командой /chatid.</p>
      </Card>
      <div className="card tg-list mt">
        {list.map((x) => {
          const me = user.tgId === x.tgId;
          const locked = x.owner || me;
          return (
            <div key={x.tgId} className={`tg-row ${x.active ? '' : 'off'}`}>
              <span className="st-ava sm">{(x.name || '?')[0].toUpperCase()}</span>
              <span className="tg-who">
                <b>{x.name}{x.owner && <em className="pill">владелец</em>}{me && <em className="pill">вы</em>}</b>
                <small>{x.username ? `@${x.username} · ` : ''}ID {x.tgId}</small>
              </span>
              <span className="tg-ctl">
                {locked ? <span className="muted-t">{ROLE_OPTS.find(([k]) => k === roleOf(x.role))?.[1]}</span>
                  : <select className="in sm" value={roleOf(x.role)} onChange={(e) => upd(x, { role: e.target.value }, 'Роль изменена')}>{ROLE_OPTS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>}
                {!locked && <Switch on={x.active} onChange={(v) => upd(x, { active: v }, v ? 'Доступ включён' : 'Доступ отключён')} label="Доступ" />}
                {!locked && <button className="icon-btn sm" onClick={() => del(x)} aria-label="Удалить" title="Удалить"><Icon name="delete" /></button>}
              </span>
            </div>
          );
        })}
        {!list.length && <p className="muted-t">Пока никого</p>}
      </div>
    </>
  );
}

// ── Сотрудники: из Telegram (администратор, кассир, повар) и код входа повара — на одной странице ──
export function Staff({ api, toast, user }) {
  const [tab, setTab] = useState('team');
  return (
    <>
      <PageHead title="Сотрудники" sub="Администратор — всё. Сотрудник — касса и кухня, история заказов, стоп-лист. Повар по коду — только кухня">
        <Seg value={tab} onChange={setTab} options={[['team', 'Сотрудники'], ['cook', 'Код для повара']]} />
      </PageHead>
      {tab === 'team' ? <TgStaff api={api} toast={toast} user={user} /> : <CookCode api={api} toast={toast} embedded />}
    </>
  );
}

export function Audit({ api, toast, rev }) {
  const [list, setList] = useState([]);
  useEffect(() => { api('/staff/audit').then((d) => setList(d.audit)).catch((e) => toast(e.message, 'err')); }, [rev]);
  return (
    <>
      <PageHead title="Журнал" sub="Кто и когда менял меню, цены, стоп-лист, настройки и сотрудников" />
      <div className="card tbl-card">
        <table className="tbl">
          <thead><tr><th>Когда</th><th>Кто</th><th>Что</th><th>Подробности</th></tr></thead>
          <tbody>
            {list.map((a, i) => <tr key={i}><td className="muted nowrap">{fmtDateTime(a.at)}</td><td>{a.by}</td><td><b>{a.action}</b></td><td className="wrap-cell">{a.details}</td></tr>)}
            {!list.length && <tr><td colSpan="4" className="empty-cell">Записей нет</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
