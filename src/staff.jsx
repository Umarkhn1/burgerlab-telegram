// Касса и админ-панель BurgerLab (страница /staff). Стиль и компоненты — как в Mini App.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { STATUSES, MODES, CANCEL_REASONS, STOP, applyMenu, applySettings, applyStop } from './data.js';
import { fmtPrice, fmtTime, fmtDateTime, fmtWeight, fmtCm, layerName, flowOf, nextStatus, isClosed, deadlines, statusInfo, atTime } from './calc.js';
import { Sheet, Toasts, Icon } from './ui.jsx';
import { PageHead, Switch, StopList, History, Reports, MenuEditor, Settings, Delivery, Staff, Audit } from './staffAdmin.jsx';

const SESSION_KEY = 'burgerlab:staff';
const SOUND_KEY = 'burgerlab:staff-sound';
const THEME_KEY = 'burgerlab:staff-theme';
const SYNC_MS = 3000;
const NEW = ['created', 'received'];

// Разделы меню. perm — право, без которого раздел не показывается.
const SECTIONS = [
  { id: 'desk', t: 'Касса', icon: 'point_of_sale', perm: 'orders', group: 'Работа' },
  { id: 'stop', t: 'Стоп-лист', icon: 'block', perm: 'stop', group: 'Работа' },
  { id: 'history', t: 'Заказы', icon: 'receipt_long', perm: 'history', group: 'Работа' },
  { id: 'reports', t: 'Отчёты', icon: 'bar_chart', perm: 'reports', group: 'Управление' },
  { id: 'menu', t: 'Меню и цены', icon: 'restaurant_menu', perm: 'menu', group: 'Управление' },
  { id: 'settings', t: 'Настройки', icon: 'tune', perm: 'settings', group: 'Управление' },
  { id: 'delivery', t: 'Доставка', icon: 'delivery_dining', perm: 'settings', group: 'Управление' },
  { id: 'staff', t: 'Сотрудники', icon: 'group', perm: 'staff', group: 'Управление' },
  { id: 'audit', t: 'Журнал', icon: 'history', perm: 'audit', group: 'Управление' },
];
const ROLE_NAMES = { admin: 'Администратор', cashier: 'Кассир' };

async function request(path, { method = 'GET', body, token } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw Object.assign(new Error('Нет связи с сервером'), { status: 0 });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Ошибка сервера (${res.status})`), { status: res.status });
  return data;
}

const read = (k, def) => { try { return localStorage.getItem(k) ?? def; } catch { return def; } };
const store = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch { /* ignore */ } };
const loadSession = () => { try { return JSON.parse(read(SESSION_KEY, 'null')); } catch { return null; } };

// Тема: светлая (по умолчанию) или тёмная — те же токены, что в Mini App
function useTheme() {
  const [theme, setTheme] = useState(() => read(THEME_KEY, 'light'));
  useEffect(() => { document.documentElement.dataset.theme = theme; store(THEME_KEY, theme); }, [theme]);
  return [theme, setTheme];
}

// ── Звук нового заказа (WebAudio, без файлов). Браузер разрешает звук после первого клика. ──
let audio = null;
function unlockAudio() {
  try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume(); } catch { /* нет звука */ }
}
function chime() {
  if (!audio) return;
  const t0 = audio.currentTime;
  [880, 1175, 1568].forEach((f, i) => {
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t0 + i * 0.16);
    g.gain.exponentialRampToValueAtTime(0.35, t0 + i * 0.16 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.16 + 0.35);
    o.connect(g).connect(audio.destination);
    o.start(t0 + i * 0.16); o.stop(t0 + i * 0.16 + 0.4);
  });
}

function useNow(ms) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}
const mmss = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function Logo() {
  return (
    <span className="logo">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="9" fill="#FF5A00" />
        <path d="M6 14c0-5 4.5-8 10-8s10 3 10 8z" fill="#fff" />
        <rect x="5" y="16" width="22" height="3" rx="1.5" fill="#000" />
        <rect x="6" y="21" width="20" height="5" rx="2.5" fill="#fff" />
      </svg>
      <span>Burger<b>Lab</b></span>
    </span>
  );
}

// ── Вход ──
function Login({ onLogin, theme, setTheme }) {
  const [f, setF] = useState({ login: '', password: '' });
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    unlockAudio();
    setBusy(true); setErr('');
    try { onLogin(await request('/staff/login', { method: 'POST', body: f })); }
    catch (x) { setErr(x.message); }
    setBusy(false);
  };
  return (
    <div className="st st-login">
      <button className="icon-btn st-theme-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Сменить тему"><Icon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} /></button>
      <form className="st-login-card" onSubmit={submit}>
        <Logo />
        <div>
          <h1>Касса и админ-панель</h1>
          <p className="muted-t">Вход для сотрудников BurgerLab</p>
        </div>
        <label className="fld">
          <span>Логин</span>
          <div className="in-wrap"><Icon name="account_circle" /><input className="in" value={f.login} onChange={(e) => setF({ ...f, login: e.target.value })} autoComplete="username" autoFocus /></div>
        </label>
        <label className="fld">
          <span>Пароль</span>
          <div className="in-wrap">
            <Icon name="lock" />
            <input className="in" type={show ? 'text' : 'password'} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="current-password" />
            <button type="button" className="in-act" onClick={() => setShow(!show)} aria-label={show ? 'Скрыть пароль' : 'Показать пароль'} title={show ? 'Скрыть пароль' : 'Показать пароль'}><Icon name={show ? 'visibility_off' : 'visibility'} /></button>
          </div>
        </label>
        {err && <p className="st-err"><Icon name="error" /> {err}</p>}
        <button className="btn primary block" disabled={busy || !f.login || !f.password}>{busy ? 'Входим…' : 'Войти'}</button>
      </form>
    </div>
  );
}

// ── Выпадающее меню ──
function MenuDropdown({ open, onClose, user, view, setView, badges, sound, setSound, theme, setTheme, logout }) {
  useEffect(() => {
    if (!open) return;
    const key = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open]);
  if (!open) return null;
  const items = SECTIONS.filter((s) => user.perms.includes(s.perm));
  const groups = [...new Set(items.map((s) => s.group))];
  return (
    <>
      <div className="st-menu-bg" onClick={onClose} />
      <div className="st-menu" role="menu">
        <div className="st-me">
          <span className="st-ava">{(user.name || user.login)[0].toUpperCase()}</span>
          <span><b>{user.name}</b><small>{ROLE_NAMES[user.role] || user.role} · {user.login}</small></span>
        </div>
        {groups.map((g) => (
          <div key={g} className="st-mgroup">
            <span className="st-mcap">{g}</span>
            {items.filter((s) => s.group === g).map((s) => (
              <button key={s.id} role="menuitem" className={`st-mi ${view === s.id ? 'on' : ''}`} onClick={() => { setView(s.id); onClose(); }}>
                <Icon name={s.icon} fill={view === s.id} /><span>{s.t}</span>{badges[s.id] ? <em className={s.id === 'desk' ? 'hot' : ''}>{badges[s.id]}</em> : null}
              </button>
            ))}
          </div>
        ))}
        <div className="st-mgroup">
          <span className="st-mcap">Интерфейс</span>
          <div className="st-mrow">
            <Icon name={sound ? 'notifications_active' : 'notifications_off'} /><span>Звук новых заказов</span>
            <Switch on={sound} onChange={(v) => { unlockAudio(); setSound(v); if (v) chime(); }} label="Звук" />
          </div>
          <div className="st-mrow">
            <Icon name={theme === 'dark' ? 'dark_mode' : 'light_mode'} /><span>Тема</span>
            <div className="seg xs">
              <button className={theme === 'light' ? 'on' : ''} onClick={() => setTheme('light')} aria-label="Светлая"><Icon name="light_mode" /></button>
              <button className={theme === 'dark' ? 'on' : ''} onClick={() => setTheme('dark')} aria-label="Тёмная"><Icon name="dark_mode" /></button>
            </div>
          </div>
        </div>
        <button className="st-mi danger" onClick={logout}><Icon name="logout" /><span>Выйти</span></button>
      </div>
    </>
  );
}

// ── Таймер заказа: ожидание приёма, готовность, доставка ──
function Timer({ o, now }) {
  const d = deadlines(o);
  if (NEW.includes(o.status)) {
    const late = now > d.acceptBy;
    return <span className={`oc-timer ${late ? 'late' : 'wait'}`}><Icon name="hourglass_top" />{mmss(now - o.createdAt)}</span>;
  }
  if (['accepted', 'cooking'].includes(o.status)) {
    const left = d.readyBy - now;
    return <span className={`oc-timer ${left < 0 ? 'late' : ''}`}><Icon name="timer" />{left < 0 ? `+${mmss(-left)}` : `к ${fmtTime(d.readyBy)}`}</span>;
  }
  if (o.mode === 'delivery' && ['ready', 'courier', 'delivering'].includes(o.status)) {
    return <span className={`oc-timer ${now > d.doneBy ? 'late' : ''}`}><Icon name="two_wheeler" />{now > o.etaAt ? `+${mmss(now - o.etaAt)}` : `к ${fmtTime(o.etaAt)}`}</span>;
  }
  if (o.status === 'ready') return <span className="oc-timer ok"><Icon name="check_circle" />{o.statusAt?.ready ? fmtTime(o.statusAt.ready) : 'готов'}</span>;
  return null;
}

function ModeChip({ o }) {
  const m = MODES[o.mode];
  const txt = o.mode === 'hall' ? `Стол ${o.table}` : o.mode === 'delivery' ? `${o.zone?.name?.split('—')[0].trim() || m.t}${o.zone?.km != null ? ` · ${o.zone.km} км` : ''}` : m.t;
  return <span className={`chip-mode m-${o.mode}`}><Icon name={m.icon} />{txt}</span>;
}

function Items({ o, open }) {
  return (
    <ul className="oc-items">
      {o.items.map((it, n) => (
        <li key={it.cid || n}>
          <div className="oc-item"><span className="q">{it.qty}×</span><span className="nm">{it.name}</span><b>{fmtPrice(it.unit * it.qty)}</b></div>
          {it.kind === 'burger' && (
            <>
              <small>{fmtWeight(it.weight)} · {fmtCm(it.cm)} · {it.count} слоёв{it.packaging ? ' · спецупаковка' : ''}</small>
              {open && <ol className="oc-layers">{it.keys.map((k, i) => <li key={i}>{layerName(k)}</li>)}</ol>}
            </>
          )}
          {it.kind === 'party' && <small>~{fmtWeight(it.weight)} · на {it.people} человек</small>}
        </li>
      ))}
    </ul>
  );
}

// ── Карточка заказа на кассе ──
function OrderCard({ o, now, act, openOrder, fresh }) {
  const [open, setOpen] = useState(false);
  const next = nextStatus(o);
  const isNew = NEW.includes(o.status);
  return (
    <article className={`oc st-${o.status} ${isNew ? 'is-new' : ''} ${fresh ? 'fresh' : ''}`}>
      <div className="oc-top">
        <button className="oc-id" onClick={() => openOrder(o.id)} title="Подробнее">#{o.id}</button>
        <ModeChip o={o} />
        <Timer o={o} now={now} />
      </div>
      <div className="oc-rows">
        <div className="oc-row">
          <Icon name="person" /><b>{o.customer?.name || o.tgName || 'Гость'}</b>
          {o.customer?.phone && <a href={`tel:${o.customer.phone.replace(/\s/g, '')}`}>{o.customer.phone}</a>}
          <span className="muted-t oc-time">{fmtTime(o.createdAt)}</span>
        </div>
        {o.mode === 'delivery' && (
          <div className="oc-row">
            <Icon name="location_on" /><span>{o.customer?.address}{o.customer?.details ? `, ${o.customer.details}` : ''}</span>
            {o.location && <a href={`https://maps.google.com/?q=${o.location.lat},${o.location.lng}`} target="_blank" rel="noopener">Карта</a>}
          </div>
        )}
        {o.desiredAt && <div className="oc-row accent"><Icon name="schedule" /><span>Ко времени <b>{fmtTime(o.desiredAt)}</b></span></div>}
      </div>
      <Items o={o} open={open} />
      {o.items.some((i) => i.kind === 'burger') && (
        <button className="oc-more" onClick={() => setOpen(!open)}><Icon name="expand_more" className={open ? 'rot' : ''} />{open ? 'Скрыть слои' : 'Слои сверху вниз'}</button>
      )}
      {o.comment && <p className="oc-comment"><Icon name="forum" />{o.comment}</p>}
      <div className="oc-foot">
        <span><Icon name={o.payment === 'cash' ? 'payments' : 'credit_card'} />{o.payment === 'cash' ? 'Наличные' : 'Карта'}{o.fee ? ` · доставка ${fmtPrice(o.fee)}` : ''}</span>
        <b>{fmtPrice(o.total)}</b>
      </div>
      {o.status === 'cancelled' && <p className="oc-cancel"><Icon name="cancel" />{o.cancelReason}</p>}
      {!isClosed(o) && (
        <div className="oc-actions">
          {isNew ? (
            <>
              <button className="btn primary sm" onClick={() => act(o, 'accepted')}><Icon name="check" />Принять</button>
              <button className="btn ghost sm" onClick={() => act(o, 'cancelled')}><Icon name="close" />Отклонить</button>
            </>
          ) : (
            <>
              {next && <button className="btn dark sm" onClick={() => act(o, next)}><Icon name="arrow_forward" />{statusInfo(o, next).t}</button>}
              <button className="icon-btn sm soft" onClick={() => openOrder(o.id)} aria-label="Ещё"><Icon name="more_horiz" /></button>
            </>
          )}
        </div>
      )}
    </article>
  );
}

// ── Отклонение / отмена с причиной ──
function CancelSheet({ o, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  useEffect(() => setReason(''), [o?.id]);
  const isNew = o && NEW.includes(o.status);
  return (
    <Sheet open={!!o} onClose={onClose} title={o ? `${isNew ? 'Отклонить' : 'Отменить'} заказ #${o.id}` : ''} className="st">
      {o && (
        <div className="st-stack">
          <p className="muted-t">Клиент получит уведомление с этой причиной.</p>
          <div className="chips wrap">{CANCEL_REASONS.map((r) => <button key={r} className={`chip sm ${reason === r ? 'active' : ''}`} onClick={() => setReason(r)}>{r}</button>)}</div>
          <label className="fld"><span>Или своя причина</span><input className="in" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} /></label>
          <button className="btn primary block" disabled={!reason.trim()} onClick={() => onConfirm(o, reason.trim())}>{isNew ? 'Отклонить заказ' : 'Отменить заказ'}</button>
        </div>
      )}
    </Sheet>
  );
}

// ── Подробности заказа: все данные, смена статуса, время (админ), журнал ──
function OrderSheet({ id, onClose, api, user, act, toast, rev }) {
  const [o, setO] = useState(null);
  const [eta, setEta] = useState('');
  useEffect(() => {
    if (!id) { setO(null); return; }
    api(`/staff/orders/${id}`).then((d) => { setO(d.order); setEta(fmtTime(d.order.etaAt)); }).catch((e) => toast(e.message, 'err'));
  }, [id, rev]);
  const saveEta = async (ts) => {
    try { const d = await api(`/staff/orders/${o.id}/eta`, { method: 'POST', body: { etaAt: ts } }); setO(d.order); setEta(fmtTime(d.order.etaAt)); toast('Время изменено — клиент получил уведомление', 'ok'); }
    catch (e) { toast(e.message, 'err'); }
  };
  // Введённое ЧЧ:ММ (по часовому поясу заведения) — ближайшее будущее время
  const etaFromInput = () => {
    if (!/^\d{2}:\d{2}$/.test(eta)) return o.etaAt;
    const t = atTime(eta);
    return t < Date.now() - 60000 ? t + 86400_000 : t;
  };
  const flow = o ? flowOf(o) : [];
  const idx = o ? flow.indexOf(o.status) : -1;
  const Row = ({ icon, k, children }) => <div className="kv"><span><Icon name={icon} />{k}</span><b>{children}</b></div>;
  return (
    <Sheet open={!!id} onClose={onClose} title={o ? `Заказ #${o.id}` : 'Заказ'} wide className="st">
      {o && (
        <div className="st-stack">
          <div className="od-status"><Icon name={statusInfo(o).ms} fill /><b>{statusInfo(o).t}</b><ModeChip o={o} /></div>
          <div className="od-grid">
            <div className="card flat">
              <Row icon="schedule" k="Создан">{fmtDateTime(o.createdAt)}</Row>
              <Row icon="person" k="Клиент">{o.customer?.name || '—'}{o.username ? ` · @${o.username}` : ''}</Row>
              {o.customer?.phone && <Row icon="call" k="Телефон"><a href={`tel:${o.customer.phone.replace(/\s/g, '')}`}>{o.customer.phone}</a></Row>}
              {o.mode === 'delivery' && <Row icon="location_on" k="Адрес">{o.customer.address}{o.customer.details ? `, ${o.customer.details}` : ''}</Row>}
              {o.zone && <Row icon="map" k="Зона">{o.zone.name}{o.zone.km != null ? ` · ${o.zone.km} км` : ''}</Row>}
              {o.desiredAt && <Row icon="schedule" k="Ко времени">{fmtTime(o.desiredAt)}</Row>}
              {!isClosed(o) && <Row icon="timer" k="Получение">≈ {fmtTime(o.etaAt)}{o.etaManual ? ' (вручную)' : ''}</Row>}
              <Row icon={o.payment === 'cash' ? 'payments' : 'credit_card'} k="Оплата">{o.payment === 'cash' ? 'Наличные' : 'Карта'}</Row>
              {o.comment && <p className="oc-comment"><Icon name="forum" />{o.comment}</p>}
              {o.status === 'cancelled' && <p className="oc-cancel"><Icon name="cancel" />{o.cancelReason}{o.cancelledBy ? ` — ${o.cancelledBy}` : ''}</p>}
            </div>
            <div className="card flat">
              <Items o={o} open />
              {o.fee > 0 && <div className="kv"><span>Доставка</span><b>{fmtPrice(o.fee)}</b></div>}
              <div className="kv total"><span>Итого</span><b>{fmtPrice(o.total)}</b></div>
            </div>
          </div>

          {!isClosed(o) && user.perms.includes('orders') && (
            <section>
              <h4 className="st-h4">Статус</h4>
              <div className="chips wrap">
                {flow.map((st, i) => (
                  <button key={st} className={`chip sm ${i === idx ? 'active' : ''}`} disabled={i <= idx || (NEW.includes(o.status) && st !== 'accepted')} onClick={() => act(o, st)}>
                    {i < idx && <Icon name="check" />}{statusInfo(o, st).t}
                  </button>
                ))}
                <button className="chip sm danger" onClick={() => act(o, 'cancelled')}><Icon name="close" />Отменить</button>
              </div>
            </section>
          )}

          {!isClosed(o) && user.perms.includes('eta') && (
            <section>
              <h4 className="st-h4">Время готовности / доставки</h4>
              <div className="st-row">
                <input className="in sm w-time" type="time" value={eta} onChange={(e) => setEta(e.target.value)} />
                <button className="btn dark sm" onClick={() => saveEta(etaFromInput())}>Сохранить</button>
                {[5, 10, 15].map((m) => <button key={m} className="btn ghost sm" onClick={() => saveEta(Math.max(Date.now(), o.etaAt) + m * 60000)}>+{m} мин</button>)}
              </div>
            </section>
          )}

          <section>
            <h4 className="st-h4">Журнал заказа</h4>
            <ol className="od-log">
              {(o.log || []).map((l, i) => <li key={i}><time>{fmtDateTime(l.at)}</time><div><b>{l.action}</b><span>{l.by}{l.note ? ` · ${l.note}` : ''}</span></div></li>)}
            </ol>
          </section>
        </div>
      )}
    </Sheet>
  );
}

// ── Экран кассы ──
const COLS = [
  { id: 'new', t: 'Новые', icon: 'notifications_active', st: NEW },
  { id: 'work', t: 'Готовятся', icon: 'cooking', st: ['accepted', 'cooking'] },
  { id: 'ready', t: 'Готовы', icon: 'lunch_dining', st: ['ready'] },
  { id: 'road', t: 'У курьера', icon: 'two_wheeler', st: ['courier', 'delivering'] },
];

function Desk({ orders, now, act, openOrder, freshIds }) {
  const [mode, setMode] = useState('');
  const [showClosed, setShowClosed] = useState(false);
  const list = orders.filter((o) => !mode || o.mode === mode);
  const active = list.filter((o) => !isClosed(o));
  const closed = list.filter(isClosed).sort((a, b) => b.id - a.id);
  const cnt = (m) => orders.filter((o) => !isClosed(o) && (!m || o.mode === m)).length;
  return (
    <>
      <PageHead title="Касса" sub="Новые заказы появляются автоматически">
        <div className="seg sm">
          <button className={!mode ? 'on' : ''} onClick={() => setMode('')}>Все <em>{cnt('')}</em></button>
          {Object.entries(MODES).map(([k, m]) => <button key={k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}><Icon name={m.icon} /><span className="hide-s">{m.t}</span> <em>{cnt(k)}</em></button>)}
        </div>
      </PageHead>
      <div className="desk-cols">
        {COLS.filter((c) => c.id !== 'road' || mode === '' || mode === 'delivery').map((c) => {
          const items = active.filter((o) => c.st.includes(o.status)).sort((a, b) => a.id - b.id);
          return (
            <section key={c.id} className={`desk-col col-${c.id}`}>
              <h2><Icon name={c.icon} />{c.t}<span className="cnt">{items.length}</span></h2>
              {items.length === 0 && <div className="desk-empty">Пусто</div>}
              {items.map((o) => <OrderCard key={o.id} o={o} now={now} act={act} openOrder={openOrder} fresh={freshIds.has(o.id)} />)}
            </section>
          );
        })}
      </div>
      <button className="oc-more closed-t" onClick={() => setShowClosed(!showClosed)}><Icon name="expand_more" className={showClosed ? 'rot' : ''} />Завершённые и отменённые за сутки · {closed.length}</button>
      {showClosed && (
        <div className="closed-list">
          {closed.map((o) => (
            <button key={o.id} className="closed-row" onClick={() => openOrder(o.id)}>
              <Icon name={statusInfo(o).ms} className={o.status === 'cancelled' ? 'bad' : 'ok'} />
              <span><b>#{o.id} · {fmtPrice(o.total)}</b><small>{o.customer?.name || o.tgName} · {o.items.map((i) => i.name).join(', ')}</small></span>
              <em>{o.status === 'cancelled' ? o.cancelReason : STATUSES.done.t}</em>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function Clock() {
  const now = useNow(10000);
  return <span className="st-clock">{fmtTime(now)}</span>;
}

function StaffApp() {
  const [theme, setTheme] = useTheme();
  const [session, setSession] = useState(loadSession);
  const [view, setView] = useState('desk');
  const [menuOpen, setMenuOpen] = useState(false);
  const [orders, setOrders] = useState([]);
  const [online, setOnline] = useState(true);
  const [sound, setSoundState] = useState(() => read(SOUND_KEY, 'on') !== 'off');
  const [toasts, setToasts] = useState([]);
  const [cancelFor, setCancelFor] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [cfgRev, setCfgRev] = useState(0);
  const [rev, setRev] = useState(0);
  const [freshIds, setFreshIds] = useState(new Set());
  const seen = useRef(null);
  const revRef = useRef(0);
  const cfgRef = useRef(-1);
  const now = useNow(1000);
  const setSound = (v) => { setSoundState(v); store(SOUND_KEY, v ? 'on' : 'off'); };

  const toast = useCallback((text, tone) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  const logout = useCallback(() => { store(SESSION_KEY, null); setSession(null); setOrders([]); setMenuOpen(false); seen.current = null; revRef.current = 0; }, []);

  const api = useCallback(async (path, opts = {}) => {
    try { return await request(path, { ...opts, token: session?.token }); }
    catch (e) { if (e.status === 401) { logout(); toast('Сессия истекла — войдите снова', 'err'); } throw e; }
  }, [session?.token]);

  const reloadConfig = useCallback(async () => {
    const c = await request('/config');
    applyMenu(c.menu); applySettings(c.settings); applyStop(c.stop);
    cfgRef.current = c.rev;
    setCfgRev(c.rev);
  }, []);

  // Проверить сессию и права при входе
  useEffect(() => {
    if (!session?.token) return;
    api('/staff/me').then((d) => { const s = { ...session, user: d.user }; setSession(s); store(SESSION_KEY, s); }).catch(() => {});
    reloadConfig().catch(() => {});
  }, [session?.token]);

  // Первый доступный раздел, если текущий недоступен по правам
  const user = session?.user;
  useEffect(() => {
    if (user && !SECTIONS.some((s) => s.id === view && user.perms.includes(s.perm))) setView(SECTIONS.find((s) => user.perms.includes(s.perm))?.id || 'desk');
  }, [user?.perms?.join()]);

  // Синхронизация с сервером каждые 3 секунды. Касса получает новые заказы и отмечает их «Заказ на кассе».
  useEffect(() => {
    if (!session?.token || !user?.perms.includes('orders')) return;
    let stop = false;
    const tick = async () => {
      try {
        const d = await api(`/staff/sync?desk=1&rev=${revRef.current}`);
        if (stop) return;
        setOnline(true);
        if (d.confRev !== cfgRef.current) reloadConfig().catch(() => {});
        if (d.same) return;
        revRef.current = d.rev;
        setRev(d.rev);
        const ids = new Set(d.orders.map((o) => o.id));
        if (seen.current) {
          const fresh = d.orders.filter((o) => !seen.current.has(o.id) && !isClosed(o));
          if (fresh.length) {
            setFreshIds((s) => new Set([...s, ...fresh.map((o) => o.id)]));
            setTimeout(() => setFreshIds((s) => { const n = new Set(s); fresh.forEach((o) => n.delete(o.id)); return n; }), 15000);
            toast(`Новый заказ ${fresh.map((o) => `#${o.id}`).join(', ')}`, 'ok');
            try { if (document.hidden && 'Notification' in window && Notification.permission === 'granted') new Notification('BurgerLab: новый заказ', { body: fresh.map((o) => `#${o.id} · ${fmtPrice(o.total)}`).join('\n') }); } catch { /* ignore */ }
          }
        }
        seen.current = new Set([...(seen.current || []), ...ids]);
        setOrders(d.orders);
      } catch (e) {
        if (!stop && e.status !== 401) setOnline(false);
      }
    };
    tick();
    const t = setInterval(tick, SYNC_MS);
    return () => { stop = true; clearInterval(t); };
  }, [session?.token, user?.perms?.join()]);

  // Пока есть непринятые заказы — сигнал каждые 8 секунд и счётчик во вкладке браузера
  const waiting = orders.filter((o) => NEW.includes(o.status)).length;
  useEffect(() => {
    document.title = waiting ? `(${waiting}) Новые заказы — BurgerLab` : 'BurgerLab — касса';
    if (!waiting || !sound) return;
    chime();
    const t = setInterval(chime, 8000);
    return () => clearInterval(t);
  }, [waiting, sound]);

  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock);
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  const doStatus = async (o, to, reason) => {
    try {
      const d = await api(`/staff/orders/${o.id}/status`, { method: 'POST', body: { to, reason } });
      setOrders((list) => list.map((x) => (x.id === o.id ? d.order : x)));
      toast(`#${o.id}: ${statusInfo(d.order).t}`, to === 'cancelled' ? 'err' : 'ok');
      revRef.current = 0; // перечитать при следующей синхронизации
    } catch (e) { toast(e.message, 'err'); }
  };
  const act = (o, to) => (to === 'cancelled' ? setCancelFor(o) : doStatus(o, to));

  const onLogin = (d) => {
    const s = { token: d.token, user: d.user };
    store(SESSION_KEY, s);
    setSession(s);
    setView(SECTIONS.find((x) => d.user.perms.includes(x.perm))?.id || 'desk');
    try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch { /* ignore */ }
  };

  if (!session?.token || !user) return <><Login onLogin={onLogin} theme={theme} setTheme={setTheme} /><Toasts items={toasts} /></>;
  const sec = SECTIONS.find((s) => s.id === view) || SECTIONS[0];
  const stopCount = Object.keys(STOP).length;
  const P = { api, toast, user, openOrder: setOpenId, reloadConfig, cfgRev, rev };

  return (
    <div className={`st st-app ${waiting ? 'alarm' : ''}`}>
      <header className="st-bar">
        <Logo />
        <span className="st-sec"><Icon name={sec.icon} />{sec.t}</span>
        <div className="st-bar-r">
          {waiting > 0 && <button className="st-alert" onClick={() => setView('desk')}><Icon name="notifications_active" fill />{waiting}<span className="hide-s">&nbsp;{waiting === 1 ? 'новый' : 'новых'}</span></button>}
          <span className={`st-net ${online ? '' : 'off'}`} title={online ? 'Связь с сервером есть' : 'Нет связи с сервером'}><i />{online ? 'онлайн' : 'нет связи'}</span>
          <Clock />
          <button className={`icon-btn st-burger ${menuOpen ? 'on' : ''}`} onClick={() => setMenuOpen(!menuOpen)} aria-label="Меню" aria-expanded={menuOpen}><Icon name={menuOpen ? 'close' : 'menu'} /></button>
          <MenuDropdown open={menuOpen} onClose={() => setMenuOpen(false)} user={user} view={view} setView={setView}
            badges={{ desk: waiting, stop: stopCount }} sound={sound} setSound={setSound} theme={theme} setTheme={setTheme} logout={logout} />
        </div>
      </header>
      {!online && <div className="st-offline"><Icon name="wifi_off" />Нет связи с сервером. Заказы не потеряются: касса получит их, как только связь восстановится.</div>}
      <main className="st-main">
        <div className="st-page">
          {view === 'desk' && <Desk orders={orders} now={now} act={act} openOrder={setOpenId} freshIds={freshIds} />}
          {view === 'stop' && <StopList {...P} />}
          {view === 'history' && <History {...P} />}
          {view === 'reports' && <Reports {...P} />}
          {view === 'menu' && <MenuEditor {...P} />}
          {view === 'settings' && <Settings {...P} />}
          {view === 'delivery' && <Delivery {...P} />}
          {view === 'staff' && <Staff {...P} />}
          {view === 'audit' && <Audit {...P} />}
        </div>
      </main>
      <CancelSheet o={cancelFor} onClose={() => setCancelFor(null)} onConfirm={(o, reason) => { setCancelFor(null); doStatus(o, 'cancelled', reason); }} />
      <OrderSheet id={openId} onClose={() => setOpenId(null)} api={api} user={user} toast={toast} rev={rev} act={(o, to) => { if (to !== 'cancelled') setOpenId(null); act(o, to); }} />
      <Toasts items={toasts} />
    </div>
  );
}

createRoot(document.getElementById('root')).render(<StaffApp />);
