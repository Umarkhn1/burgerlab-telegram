// Разделы админ-панели: стоп-лист, заказы, отчёты, меню, настройки, доставка, сотрудники, журнал.
import React, { useEffect, useState } from 'react';
import { CATEGORIES, INGREDIENTS, UPSELL, PARTY, STOP, SETTINGS, STATUSES, MODES } from './data.js';
import { fmtPrice, fmtDateTime, statusInfo } from './calc.js';
import { Icon } from './ui.jsx';
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
    ...CATEGORIES.map((c) => ({ icon: c.icon, title: c.name, items: INGREDIENTS.filter((i) => i.cat === c.id && !i.hidden).map((i) => ({ id: i.id, name: i.name })) })),
    { icon: 'fastfood', title: 'Допы к заказу', items: UPSELL.filter((u) => !u.hidden).map((u) => ({ id: u.id, name: u.name })) },
    { icon: 'celebration', title: 'Party Burger', items: [{ id: 'party', name: 'Все размеры' }, ...PARTY.filter((p) => !p.hidden).map((p) => ({ id: p.id, name: `На ${p.people} человек` }))] },
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
    const rows = [['Номер', 'Создан', 'Способ', 'Стол/адрес', 'Клиент', 'Телефон', 'Позиции', 'Сумма', 'Оплата', 'Статус', 'Причина отмены']];
    for (const o of data.orders) {
      rows.push([o.id, fmtDateTime(o.createdAt), MODES[o.mode]?.t, o.mode === 'hall' ? `Стол ${o.table}` : o.customer?.address || '', o.customer?.name || o.tgName || '', o.customer?.phone || '',
        o.items.map((i) => `${i.name} × ${i.qty}`).join('; '), o.total, o.payment === 'cash' ? 'Наличные' : 'Карта', STATUSES[o.status].t, o.cancelReason || '']);
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

export function MenuEditor({ api, toast, reloadConfig, cfgRev }) {
  const snapshot = () => clone({ categories: CATEGORIES, ingredients: INGREDIENTS, extras: UPSELL, party: PARTY });
  const [m, setM] = useState(snapshot);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState('ingredients');
  const [cat, setCat] = useState(CATEGORIES[0]?.id);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (!dirty) setM(snapshot()); }, [cfgRev]);

  const edit = (key, id, patch) => { setDirty(true); setM((x) => ({ ...x, [key]: x[key].map((it) => (it.id === id ? { ...it, ...patch } : it)) })); };
  const add = (key, item) => { setDirty(true); setM((x) => ({ ...x, [key]: [...x[key], item] })); };
  const remove = (key, id) => { setDirty(true); setM((x) => ({ ...x, [key]: x[key].filter((it) => it.id !== id) })); };
  const moveCat = (i, d) => { setDirty(true); setM((x) => { const c = [...x.categories]; const [it] = c.splice(i, 1); c.splice(i + d, 0, it); return { ...x, categories: c }; }); };
  const save = async () => {
    setSaving(true);
    try { await api('/staff/menu', { method: 'PUT', body: { menu: m } }); setDirty(false); await reloadConfig(); toast('Меню сохранено — приложение обновится автоматически', 'ok'); }
    catch (e) { toast(e.message, 'err'); }
    setSaving(false);
  };
  const oldIds = new Set(INGREDIENTS.map((i) => i.id));
  const catName = m.categories.find((c) => c.id === cat)?.name;

  return (
    <>
      <PageHead title="Меню и цены" sub="Изменения сразу появятся у клиентов и в расчёте заказов">
        <SaveActions dirty={dirty} saving={saving} onSave={save} onReset={() => { setM(snapshot()); setDirty(false); }} />
      </PageHead>
      <div className="st-toolbar">
        <Seg value={tab} onChange={setTab} options={[['ingredients', 'Ингредиенты'], ['categories', 'Категории'], ['extras', 'Допы'], ['party', 'Party Burger']]} />
      </div>

      {tab === 'categories' && (
        <div className="card tbl-card">
          <table className="tbl">
            <thead><tr><th>Порядок</th><th>Иконка</th><th>Название</th><th>Показывать</th></tr></thead>
            <tbody>
              {m.categories.map((c, i) => (
                <tr key={c.id}>
                  <td className="nowrap">
                    <button className="icon-btn xs" disabled={i === 0} onClick={() => moveCat(i, -1)} aria-label="Выше"><Icon name="arrow_upward" /></button>
                    <button className="icon-btn xs" disabled={i === m.categories.length - 1} onClick={() => moveCat(i, 1)} aria-label="Ниже"><Icon name="arrow_downward" /></button>
                  </td>
                  <td><IconPick value={c.icon} onChange={(v) => edit('categories', c.id, { icon: v })} /></td>
                  <td><input className="in sm" value={c.name} onChange={(e) => edit('categories', c.id, { name: e.target.value })} /></td>
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
              <thead><tr><th>Название</th><th>Цена, сум</th><th>Вес, г</th><th>Ккал</th><th>Высота, мм</th><th>Острота</th><th>Вид слоя</th><th>Цвет</th><th>В меню</th></tr></thead>
              <tbody>
                {m.ingredients.filter((i) => i.cat === cat).map((i) => (
                  <tr key={i.id} className={i.hidden ? 'muted-row' : ''}>
                    <td><input className="in sm" value={i.name} onChange={(e) => edit('ingredients', i.id, { name: e.target.value })} /></td>
                    <td><Num className="sm w-m" value={i.price} step={500} onChange={(v) => edit('ingredients', i.id, { price: v })} /></td>
                    <td><Num className="sm w-s" value={i.w} onChange={(v) => edit('ingredients', i.id, { w: v })} /></td>
                    <td><Num className="sm w-s" value={i.kcal} onChange={(v) => edit('ingredients', i.id, { kcal: v })} /></td>
                    <td><Num className="sm w-s" value={i.h} min={1} onChange={(v) => edit('ingredients', i.id, { h: v })} /></td>
                    <td><Num className="sm w-xs" value={i.hot || 0} onChange={(v) => edit('ingredients', i.id, { hot: v })} /></td>
                    <td>{oldIds.has(i.id) ? <span className="muted">{VIS_OPTIONS[i.vis] || i.vis}</span> : <select className="in sm" value={i.vis} onChange={(e) => edit('ingredients', i.id, { vis: e.target.value })}>{Object.entries(VIS_OPTIONS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>}</td>
                    <td><input className="color" type="color" value={i.c} onChange={(e) => edit('ingredients', i.id, { c: e.target.value })} aria-label="Цвет слоя" /></td>
                    <td>{oldIds.has(i.id) ? <Switch on={!i.hidden} onChange={(v) => edit('ingredients', i.id, { hidden: !v })} label="В меню" /> : <button className="icon-btn xs" onClick={() => remove('ingredients', i.id)} aria-label="Удалить"><Icon name="delete" /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="st-under">
            <button className="btn ghost sm" onClick={() => add('ingredients', { id: newId('ing', m.ingredients), cat, name: 'Новый ингредиент', price: 3000, w: 20, kcal: 50, h: 4, vis: cat === 'bun' ? 'bun' : cat === 'meat' ? 'patty' : cat === 'cheese' ? 'cheese' : cat === 'sauce' ? 'sauce' : 'lettuce', c: '#C98A3E', c2: '#E8B55C' })}><Icon name="add" />Ингредиент в «{catName}»</button>
            <p className="muted-t">Сохранённые ингредиенты не удаляются, а скрываются: на них ссылаются рецепты. Закончился на время — используйте стоп-лист.</p>
          </div>
        </>
      )}

      {tab === 'extras' && (
        <>
          <div className="card tbl-card">
            <table className="tbl">
              <thead><tr><th>Иконка</th><th>Название</th><th>Описание</th><th>Цена, сум</th><th>В меню</th><th /></tr></thead>
              <tbody>
                {m.extras.map((u) => (
                  <tr key={u.id} className={u.hidden ? 'muted-row' : ''}>
                    <td><IconPick value={u.icon || 'restaurant'} onChange={(v) => edit('extras', u.id, { icon: v })} /></td>
                    <td><input className="in sm" value={u.name} onChange={(e) => edit('extras', u.id, { name: e.target.value })} /></td>
                    <td><input className="in sm" value={u.note} onChange={(e) => edit('extras', u.id, { note: e.target.value })} /></td>
                    <td><Num className="sm w-m" value={u.price} step={500} onChange={(v) => edit('extras', u.id, { price: v })} /></td>
                    <td><Switch on={!u.hidden} onChange={(v) => edit('extras', u.id, { hidden: !v })} label="В меню" /></td>
                    <td><button className="icon-btn xs" onClick={() => remove('extras', u.id)} aria-label="Удалить"><Icon name="delete" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="st-under"><button className="btn ghost sm" onClick={() => add('extras', { id: newId('up_', m.extras), name: 'Новая позиция', note: '', price: 10000, icon: 'restaurant', w: 0, kcal: 0 })}><Icon name="add" />Позиция</button></div>
        </>
      )}

      {tab === 'party' && (
        <>
          <div className="card tbl-card">
            <table className="tbl">
              <thead><tr><th>Гостей</th><th>Вес, г</th><th>Длина, см</th><th>Цена, сум</th><th>В меню</th><th /></tr></thead>
              <tbody>
                {m.party.map((p) => (
                  <tr key={p.id} className={p.hidden ? 'muted-row' : ''}>
                    <td><Num className="sm w-s" value={p.people} min={2} onChange={(v) => edit('party', p.id, { people: v })} /></td>
                    <td><Num className="sm w-m" value={p.weight} onChange={(v) => edit('party', p.id, { weight: v })} /></td>
                    <td><Num className="sm w-s" value={p.len} onChange={(v) => edit('party', p.id, { len: v })} /></td>
                    <td><Num className="sm w-m" value={p.price} step={1000} onChange={(v) => edit('party', p.id, { price: v })} /></td>
                    <td><Switch on={!p.hidden} onChange={(v) => edit('party', p.id, { hidden: !v })} label="В меню" /></td>
                    <td><button className="icon-btn xs" onClick={() => remove('party', p.id)} aria-label="Удалить"><Icon name="delete" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="st-under"><button className="btn ghost sm" onClick={() => add('party', { id: newId('p', m.party), people: 8, weight: 3600, price: 420000, len: 80 })}><Icon name="add" />Размер</button></div>
        </>
      )}
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
            <Check on={d.partyCustom} onChange={(v) => set('partyCustom', v)}>Party Burger любого размера</Check>
          </div>
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
const ROLE_OPTS = [['admin', 'Администратор'], ['cashier', 'Кассир']];

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
                {locked ? <span className="muted-t">{x.role === 'admin' ? 'Администратор' : 'Кассир'}</span>
                  : <select className="in sm" value={x.role} onChange={(e) => upd(x, { role: e.target.value }, 'Роль изменена')}>{ROLE_OPTS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>}
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

// ── Сотрудники ──
export function Staff({ api, toast, user }) {
  const [list, setList] = useState([]);
  const [roles, setRoles] = useState({});
  const [f, setF] = useState({ login: '', name: '', role: 'cashier', password: '' });
  const [show, setShow] = useState(false);
  const load = () => api('/staff/users').then((d) => { setList(d.users); setRoles(d.roles); }).catch((e) => toast(e.message, 'err'));
  useEffect(() => { load(); }, []);
  const addUser = async () => {
    try { await api('/staff/users', { method: 'POST', body: f }); toast(`Сотрудник ${f.login} добавлен`, 'ok'); setF({ login: '', name: '', role: 'cashier', password: '' }); load(); }
    catch (e) { toast(e.message, 'err'); }
  };
  const upd = async (u, body, msg) => {
    try { await api(`/staff/users/${u.id}`, { method: 'PUT', body }); toast(msg, 'ok'); load(); }
    catch (e) { toast(e.message, 'err'); }
  };
  const resetPass = (u) => {
    const p = window.prompt(`Новый пароль для ${u.login} (минимум 6 символов):`);
    if (p) upd(u, { password: p }, 'Пароль изменён — сотруднику нужно войти заново');
  };
  return (
    <>
      <PageHead title="Сотрудники" sub="Кассир: заказы, статусы, история, стоп-лист. Администратор: всё, включая меню, настройки и отчёты" />
      <TgStaff api={api} toast={toast} user={user} />
      <h4 className="st-h4 mt">Вход по логину и паролю (касса в браузере, /staff)</h4>
      <div className="card tbl-card">
        <table className="tbl">
          <thead><tr><th>Сотрудник</th><th>Роль</th><th>Активен</th><th /></tr></thead>
          <tbody>
            {list.map((u) => (
              <tr key={u.id} className={u.active ? '' : 'muted-row'}>
                <td><span className="who"><span className="st-ava sm">{(u.name || u.login)[0].toUpperCase()}</span><span><b>{u.name}</b>{u.id === user.id && <em className="pill">вы</em>}<small>{u.login}</small></span></span></td>
                <td><select className="in sm" value={u.role} onChange={(e) => upd(u, { role: e.target.value }, 'Роль изменена')}>{Object.entries(roles).map(([k, r]) => <option key={k} value={k}>{r.t}</option>)}</select></td>
                <td><Switch on={u.active} onChange={(v) => upd(u, { active: v }, v ? 'Сотрудник включён' : 'Сотрудник отключён')} label="Активен" /></td>
                <td className="r"><button className="btn ghost sm" onClick={() => resetPass(u)}><Icon name="key" />Пароль</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Card icon="add_circle" title="Новый сотрудник" className="mt">
        <div className="fld-grid">
          <Field label="Логин"><input className="in" value={f.login} onChange={(e) => setF({ ...f, login: e.target.value })} autoComplete="off" /></Field>
          <Field label="Имя"><input className="in" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Роль"><select className="in" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{Object.entries(roles).map(([k, r]) => <option key={k} value={k}>{r.t}</option>)}</select></Field>
          <Field label="Пароль" hint="Минимум 6 символов">
            <div className="in-wrap">
              <input className="in" type={show ? 'text' : 'password'} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" />
              <button type="button" className="in-act" onClick={() => setShow(!show)} aria-label={show ? 'Скрыть пароль' : 'Показать пароль'}><Icon name={show ? 'visibility_off' : 'visibility'} /></button>
            </div>
          </Field>
        </div>
        <div className="st-row"><button className="btn primary sm" onClick={addUser} disabled={!f.login || f.password.length < 6}><Icon name="add" />Добавить</button></div>
      </Card>
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
