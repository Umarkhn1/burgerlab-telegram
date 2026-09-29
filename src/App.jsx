import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AppCtx } from './ctx.js';
import { ING, SIZE_PRESETS, DEFAULT_LAYERS, CHALLENGES, MOCK_KITCHEN, STOP, applyMenu, applySettings, applyStop } from './data.js';
import { toLayers, uid, stats, insertIndexFor, parseKey, randomBurger, fmtPrice, fmtWeight, fmtCm, fmtKcal, encodeRecipe, decodeRecipe, encodeShort, decodeShort, challengeProgress, plural, canAddIng, checkBurger, isStopped, itemIssues, itemUnit, flowOf, isClosed, estimateEta, statusInfo, PACKAGING_FEE } from './calc.js';
import { tg, inTelegram, initTelegram, tgUser, startParam, haptic, setBackButton, miniAppLink, shareToTelegram, apiCreateOrder, apiGetOrder, apiConfig, apiMe, apiMyOrders } from './telegram.js';
import { BurgerStack } from './visuals.jsx';
import { Sheet, Toasts, Confetti, MiniBurger, Icon } from './ui.jsx';
import Builder, { TypeBadge } from './builder.jsx';
import { Home, Community, Challenges, MyBurgers, Party, Profile } from './screens.jsx';
import { Cart, Checkout, Tracking } from './commerce.jsx';
import { Kitchen, Admin } from './ops.jsx';
import { StaffApp } from './staff.jsx';

// ---------- Хранилище (localStorage; позже — REST API) ----------
const KEY = 'burgerlab:v1';
const DEFAULT_NAME = 'Гость';
const initial = () => ({
  profile: { name: tgUser()?.first_name || DEFAULT_NAME },
  layers: toLayers(DEFAULT_LAYERS),
  sizeId: 'standard',
  editingId: null,
  saved: [],
  cart: [],
  orders: [],
  badges: {},
  likes: {},
  stock: {},
  kitchenMock: MOCK_KITCHEN,
  addresses: [],
  pending: null,
  table: null,
  editingCid: null,
});
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return initial();
    return { ...initial(), ...JSON.parse(raw) };
  } catch { return initial(); }
}
function persist(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage недоступен — работаем в памяти */ }
}

// ---------- Меню, настройки и стоп-лист с сервера ----------
// Последний полученный конфиг кэшируется: без сети приложение открывается с ним.
const CFG_KEY = 'burgerlab:cfg';
function applyConfig(c) {
  if (!c?.menu) return false;
  applyMenu(c.menu); applySettings(c.settings); applyStop(c.stop);
  return true;
}
async function fetchConfig() {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    const c = await apiConfig(ctrl.signal);
    if (!applyConfig(c)) return null;
    try { localStorage.setItem(CFG_KEY, JSON.stringify(c)); } catch { /* ignore */ }
    return c;
  } catch { return null; } finally { clearTimeout(t); }
}

// Почему бургер нельзя заказать (стоп-лист или лимиты конструктора). null — можно.
function burgerProblem(keys) {
  const out = [...new Set(keys.map((k) => parseKey(k).ing).filter((i) => i && isStopped(i.id)).map((i) => i.name))];
  if (out.length) return `Нет в наличии: ${out.join(', ')}. Замени эти слои`;
  return checkBurger(keys)[0] || null;
}
const visibleKeys = (layers) => layers.filter((l) => !l.hidden).map((l) => l.key);

// Демо-режим: заказ переходит на следующий этап своего сценария
function advance(o) {
  const f = flowOf(o);
  const next = f[f.indexOf(o.status) + 1];
  return next ? { ...o, status: next, statusAt: { ...o.statusAt, [next]: Date.now() }, touched: Date.now() } : o;
}

// ---------- PWA ----------
function drawIcon(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  const s = size / 512;
  x.fillStyle = '#FF5A00';
  x.fillRect(0, 0, size, size);
  const rr = (X, Y, W, H, R, col) => { x.fillStyle = col; x.beginPath(); x.roundRect ? x.roundRect(X * s, Y * s, W * s, H * s, R * s) : x.rect(X * s, Y * s, W * s, H * s); x.fill(); };
  x.fillStyle = '#FFFFFF';
  x.beginPath(); x.ellipse(256 * s, 230 * s, 170 * s, 110 * s, 0, Math.PI, 0); x.fill();
  rr(86, 238, 340, 30, 15, '#000000');
  rr(80, 276, 352, 22, 11, '#FFFFFF');
  rr(92, 306, 328, 44, 22, '#000000');
  rr(96, 358, 320, 52, 22, '#FFFFFF');
  return c.toDataURL('image/png');
}
function setupPWA() {
  if (inTelegram) return; // внутри Telegram установка PWA не нужна
  try {
    const i192 = drawIcon(192), i512 = drawIcon(512), i180 = drawIcon(180);
    const start = location.href.split('#')[0];
    const manifest = {
      name: 'BurgerLab — твой бургер. Твои правила.', short_name: 'BurgerLab', start_url: start, scope: start,
      display: 'standalone', orientation: 'portrait', background_color: '#FFFFFF', theme_color: '#FF5A00',
      icons: [{ src: i192, sizes: '192x192', type: 'image/png' }, { src: i512, sizes: '512x512', type: 'image/png', purpose: 'any maskable' }],
    };
    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' }));
    document.head.appendChild(link);
    const apple = document.createElement('link');
    apple.rel = 'apple-touch-icon';
    apple.href = i180;
    document.head.appendChild(apple);
    // Service worker (офлайн-кэш) подключается при деплое на собственный домен: navigator.serviceWorker.register('/sw.js')
  } catch { /* не критично */ }
}

const NAV_MOBILE = [
  ['home', 'Главная', 'home'],
  ['builder', 'Собрать', 'lunch_dining'],
  ['community', 'Community', 'groups'],
  ['cart', 'Корзина', 'shopping_bag'],
  ['profile', 'Профиль', 'person'],
];
const NAV_DESK = [
  ['home', 'Главная', 'home'], ['builder', 'Конструктор', 'lunch_dining'], ['community', 'Популярные', 'groups'],
  ['challenges', 'Challenges', 'emoji_events'], ['saved', 'Мои бургеры', 'bookmark'], ['party', 'Party Burger', 'celebration'],
  ['cart', 'Корзина', 'shopping_bag'], ['profile', 'Профиль', 'person'],
];
const NAV_DEMO = [
  ['kitchen', 'Экран кухни', 'soup_kitchen'],
  ['admin', 'Админ-панель', 'bar_chart'],
];
const NAV_ADMIN = ['panel', 'Админ', 'admin_panel_settings'];
const TAB_OF = { challenges: 'community', saved: 'profile', party: 'home', checkout: 'cart', tracking: 'profile', kitchen: 'profile', admin: 'profile' };

// Нижняя навигация прячется, пока открыта клавиатура (иначе она перекрывает поля ввода)
function useKeyboardOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const isField = (el) => el && (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'range', 'button', 'submit', 'color'].includes(el.type)));
    const on = (e) => isField(e.target) && setOpen(true);
    const off = () => setTimeout(() => setOpen(isField(document.activeElement)), 60);
    document.addEventListener('focusin', on);
    document.addEventListener('focusout', off);
    return () => { document.removeEventListener('focusin', on); document.removeEventListener('focusout', off); };
  }, []);
  return open;
}

function Logo() {
  return (
    <span className="logo">
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="9" fill="#FF5A00" />
        <path d="M6 14c0-5 4.5-8 10-8s10 3 10 8z" fill="#fff" />
        <rect x="5" y="16" width="22" height="3" rx="1.5" fill="#000" />
        <rect x="6" y="21" width="20" height="5" rx="2.5" fill="#fff" />
      </svg>
      <span>Burger<b>Lab</b></span>
    </span>
  );
}

function SaveModal({ open, onClose, onSave, defaultName, st }) {
  const [name, setName] = useState('');
  useEffect(() => { if (open) setName(defaultName || ''); }, [open]);
  const { S } = React.useContext(AppCtx);
  const author = S.profile.name.toUpperCase();
  const ideas = [
    `${author} MONSTER`,
    st.cheese >= 4 ? 'Сырная башня' : 'Chilanzar Classic',
    st.meat >= 4 ? 'Meat King' : st.hot >= 5 ? 'Огненный дракон' : 'Tashkent Smash',
    st.weight >= 1500 ? 'Семейный Гигант' : 'Мой идеальный',
  ];
  return (
    <Sheet open={open} onClose={onClose} title="Как назовем твоего монстра?">
      <div className="save-body">
        <label className="field">
          <span>Название бургера</span>
          <input autoFocus value={name} maxLength={28} onChange={(e) => setName(e.target.value)} placeholder={`${author} MONSTER`} onKeyDown={(e) => e.key === 'Enter' && onSave(name || `${author} MONSTER`)} />
        </label>
        <div className="chips wrap">
          {ideas.map((x) => <button key={x} className="chip" onClick={() => setName(x)}>{x}</button>)}
        </div>
        <button className="btn primary block lg" onClick={() => onSave(name.trim() || `${author} MONSTER`)}>Сохранить рецепт</button>
      </div>
    </Sheet>
  );
}

function RecipeCard({ r, big = false }) {
  const st = stats(toLayers(r.layers));
  return (
    <div className={`recipe-card ${big ? 'big' : ''}`}>
      <div className="rc-art"><MiniBurger keys={r.layers} h={big ? 230 : 170} w={220} /></div>
      <div className="rc-body">
        <TypeBadge weight={st.weight} />
        <h3>{r.name}</h3>
        <div className="rc-stats">
          <span>{st.count} {plural(st.count, 'ингредиент', 'ингредиента', 'ингредиентов')}</span>
          <span>{fmtWeight(st.weight)}</span>
          <b>{fmtPrice(st.total)}</b>
        </div>
        <div className="rc-author">Автор: {r.author}</div>
      </div>
    </div>
  );
}

function ShareModal({ recipe, onClose, toast }) {
  if (!recipe) return null;
  const st = stats(toLayers(recipe.layers));
  const layers = toLayers(recipe.layers);
  const tgLink = miniAppLink(encodeShort({ name: recipe.name, author: recipe.author, layers }));
  const link = tgLink || `${location.href.split('#')[0]}#r=${encodeRecipe({ name: recipe.name, author: recipe.author, layers })}`;
  const text = `Я создал ${recipe.name} в BurgerLab: ${fmtWeight(st.weight)}, ${st.meat} ${plural(st.meat, 'котлета', 'котлеты', 'котлет')}, ${st.cheese} ${plural(st.cheese, 'сыр', 'сыра', 'сыров')}, ${fmtPrice(st.total)}. Сможешь больше?`;
  const copy = async (msg) => {
    try { await navigator.clipboard.writeText(link); }
    catch {
      const ta = document.createElement('textarea'); ta.value = link; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch { /* ignore */ }
      ta.remove();
    }
    toast(msg || 'Ссылка скопирована');
  };
  const native = async (app) => {
    if (navigator.share) {
      try { await navigator.share({ title: recipe.name, text, url: link }); return; } catch { return; }
    }
    copy(`Ссылка скопирована — вставь её в ${app}`);
  };
  return (
    <Sheet open onClose={onClose} title="Поделиться бургером">
      <div className="share-card">
        <div className="sc-top">
          <span className="sc-brand">BurgerLab</span>
          <TypeBadge weight={st.weight} />
        </div>
        <div className="sc-art"><MiniBurger keys={recipe.layers} h={200} w={200} /></div>
        <div className="sc-h">Я создал<br /><b>{recipe.name}</b></div>
        <div className="sc-stats">
          <span><b>{fmtWeight(st.weight)}</b>вес</span>
          <span><b>{st.meat}</b>{plural(st.meat, 'котлета', 'котлеты', 'котлет')}</span>
          <span><b>{st.cheese}</b>{plural(st.cheese, 'сыр', 'сыра', 'сыров')}</span>
          <span><b>{fmtPrice(st.total)}</b>цена</span>
        </div>
        <div className="sc-q">Сможешь больше?</div>
      </div>
      <div className="share-btns">
        <button className="sb ig" onClick={() => native('Instagram')}>Instagram</button>
        <button className="sb tg" onClick={() => shareToTelegram(link, text)}>Telegram</button>
        <button className="sb tt" onClick={() => native('TikTok')}>TikTok</button>
        <button className="sb cp" onClick={() => copy()}>Copy link</button>
      </div>
    </Sheet>
  );
}

function MonsterPop({ m, onClose }) {
  useEffect(() => {
    if (!m) return;
    const t = setTimeout(onClose, 5200);
    return () => clearTimeout(t);
  }, [m]);
  if (!m) return null;
  const { kind, st } = m;
  return (
    <div className={`monster ${kind}`} role="status" onClick={onClose}>
      <div className="m-fire" aria-hidden="true"><Icon name={kind === 'tall' ? 'inventory_2' : kind === 'party' ? 'celebration' : 'local_fire_department'} fill /></div>
      <div className="m-body">
        <b>{kind === 'tall' ? 'Высота впечатляет!' : kind === 'party' ? 'Это уже Party Burger' : 'Ты создаешь монстра!'}</b>
        {kind === 'monster' && <span>Твой бургер уже: {fmtWeight(st.weight)} · {fmtCm(st.cm)} · {fmtKcal(st.kcal)}</span>}
        {kind === 'party' && <span>Этот бургер относится к категории Party Burger — {fmtWeight(st.weight)}, хватит на компанию</span>}
        {kind === 'tall' && <span>Для этого заказа потребуется специальная упаковка +{fmtPrice(PACKAGING_FEE)}</span>}
      </div>
    </div>
  );
}

function App() {
  const [S, setS] = useState(load);
  const [route, setRoute] = useState({ name: 'home', params: {} });
  const hist = useRef([]);
  const [toasts, setToasts] = useState([]);
  const [confetti, setConfetti] = useState(0);
  const [saveOpen, setSaveOpen] = useState(false);
  const [savedResult, setSavedResult] = useState(null);
  const [share, setShare] = useState(null);
  const [monster, setMonster] = useState(null);
  const [install, setInstall] = useState(false);
  const deferredPrompt = useRef(null);
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  const mainRef = useRef(null);
  const randomTimer = useRef([]);
  const [cfgRev, setCfgRev] = useState(0);
  const [net, setNet] = useState('ok');
  const sendingRef = useRef(false);
  const kbOpen = useKeyboardOpen();
  // Раздел «Админ»: флаг приходит с сервера (/api/me), доступ сервер всё равно проверяет по подписи Telegram
  const isAdmin = inTelegram && !!S.profile.admin;
  const wantPanel = useRef(/[?&]panel=1/.test(location.search));

  useEffect(() => { persist(S); }, [S]);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const on = () => setIsDesktop(mq.matches);
    mq.addEventListener('change', on);
    const bip = (e) => { e.preventDefault(); deferredPrompt.current = e; };
    window.addEventListener('beforeinstallprompt', bip);
    return () => { mq.removeEventListener('change', on); window.removeEventListener('beforeinstallprompt', bip); };
  }, []);
  useEffect(() => { if (mainRef.current) mainRef.current.scrollTop = 0; }, [route]);

  const toast = useCallback((text, tone) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }, []);

  // Демо-трекинг: заказ сам двигается по этапам
  useEffect(() => {
    const t = setInterval(() => {
      setS((s) => {
        if (!s.orders.some((o) => !isClosed(o) && !o.remote)) return s;
        return { ...s, orders: s.orders.map((o) => (!isClosed(o) && !o.remote && Date.now() - (o.touched || o.createdAt) > 8000 ? advance(o) : o)) };
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // Актуальные меню, цены и стоп-лист: раз в 30 секунд и при возвращении в приложение.
  // После обновления пересчитываем цены в корзине.
  const refreshConfig = useCallback(async () => {
    const c = await fetchConfig();
    if (!c) return;
    setCfgRev((r) => (r === c.rev ? r : c.rev));
    setS((s) => {
      const cart = s.cart.map((it) => { const unit = itemUnit(it); return unit === it.unit ? it : { ...it, unit }; });
      return cart.some((it, i) => it !== s.cart[i]) ? { ...s, cart } : s;
    });
  }, []);
  useEffect(() => {
    refreshConfig();
    const t = setInterval(refreshConfig, 30000);
    const vis = () => document.visibilityState === 'visible' && refreshConfig();
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); };
  }, []);

  // Рецепт из ссылки: #r=... (веб) или startapp=... (Telegram); стол в зале: ?table=5 или startapp=t5
  useEffect(() => {
    try {
      const tableM = location.search.match(/[?&]table=(\d+)/) || startParam().match(/^t(\d+)$/);
      if (tableM) {
        const n = Number(tableM[1]);
        setS((s) => ({ ...s, table: { n, at: Date.now() } }));
        setTimeout(() => toast(`Стол ${n}: собери заказ — мы принесём его к столу`, 'ok'), 400);
        return;
      }
      const orderM = location.search.match(/[?&]order=(\d+)/) || location.hash.match(/#order=(\d+)/);
      if (orderM) { const id = Number(orderM[1]); syncOrder(id).then((ok) => ok && setRoute({ name: 'tracking', params: { orderId: id } })); return; }
      const sp = startParam();
      if (sp.startsWith('order')) { const id = Number(sp.slice(5)); syncOrder(id).then((ok) => ok && setRoute({ name: 'tracking', params: { orderId: id } })); return; }
      const m = location.hash.match(/#r=([^&]+)/);
      const r = sp ? decodeShort(sp) : m ? decodeRecipe(decodeURIComponent(m[1])) : null;
      if (!r) return;
      setS((s) => ({ ...s, layers: r.layers, sizeId: 'custom', editingId: null }));
      setRoute({ name: 'builder', params: {} });
      setTimeout(() => toast(`${r.author} прислал бургер «${r.name}». Собери такой же или сделай лучше`), 400);
    } catch { /* ignore */ }
  }, []);

  // Номер и геолокация, которыми клиент поделился в боте, — подставляем в заказ
  useEffect(() => {
    if (!inTelegram) return;
    const pull = () => apiMe().then(({ phone, location, address, admin }) => {
      setS((s) => {
        const p = { ...s.profile };
        if (phone && p.phone !== phone) Object.assign(p, { phone, phoneFromBot: true });
        if (location && (p.botLocation?.lat !== location.lat || p.botLocation?.lng !== location.lng || p.botAddress !== address)) Object.assign(p, { botLocation: location, botAddress: address || '' });
        p.admin = !!admin;
        return p.phone === s.profile.phone && p.botLocation === s.profile.botLocation && p.botAddress === s.profile.botAddress && p.admin === !!s.profile.admin ? s : { ...s, profile: p };
      });
      if (admin && wantPanel.current) { wantPanel.current = false; hist.current = []; setRoute({ name: 'panel', params: {} }); }
    }).catch(() => {});
    pull();
    const vis = () => document.visibilityState === 'visible' && pull();
    document.addEventListener('visibilitychange', vis);
    return () => document.removeEventListener('visibilitychange', vis);
  }, []);

  // История заказов с сервера: заказы, оформленные с другого устройства, тоже видны в профиле
  useEffect(() => {
    if (!inTelegram) return;
    apiMyOrders().then(({ orders }) => {
      if (!orders?.length) return;
      setS((s) => {
        const byId = new Map(s.orders.map((o) => [o.id, o]));
        for (const o of orders) byId.set(o.id, { ...byId.get(o.id), ...o, remote: true });
        return { ...s, orders: [...byId.values()].sort((a, b) => a.createdAt - b.createdAt).slice(-30) };
      });
    }).catch(() => {});
  }, []);

  // ── Telegram Mini App ──
  useEffect(() => {
    if (!inTelegram) return;
    const u = tgUser();
    // Другой аккаунт Telegram на том же устройстве — не показываем чужие данные
    if (u && S.profile.tg && S.profile.tg !== u.id) { setS({ ...initial(), profile: { name: u.first_name || DEFAULT_NAME, tg: u.id } }); return; }
    if (u && !S.profile.tg) setS((s) => ({ ...s, profile: { ...s.profile, name: ['Bobur', DEFAULT_NAME].includes(s.profile.name) ? (u.first_name || s.profile.name) : s.profile.name, tg: u.id } }));
  }, []);

  const sheetOpen = saveOpen || !!savedResult || !!share || install;
  useEffect(() => {
    setBackButton(sheetOpen || route.name !== 'home', () => {
      if (sheetOpen) { setSaveOpen(false); setSavedResult(null); setShare(null); setInstall(false); return; }
      setRoute(hist.current.pop() || { name: 'home', params: {} });
    });
  }, [route, sheetOpen]);

  // Загрузить заказ с сервера и сохранить локально
  const syncOrder = async (id) => {
    if (!inTelegram) return !!S.orders.find((o) => o.id === id);
    try {
      const { order } = await apiGetOrder(id);
      setS((s) => {
        const exists = s.orders.some((o) => o.id === order.id);
        const orders = exists ? s.orders.map((o) => (o.id === order.id ? { ...o, ...order, remote: true } : o)) : [...s.orders, { ...order, remote: true }];
        return { ...s, orders };
      });
      return true;
    } catch { return false; }
  };

  // Живые статусы: опрашиваем сервер, пока есть активные заказы
  const activeRemote = S.orders.filter((o) => o.remote && !isClosed(o)).map((o) => o.id).join(',');
  useEffect(() => {
    if (!inTelegram || !activeRemote) return;
    const ids = activeRemote.split(',').map(Number);
    const tick = () => ids.forEach(async (id) => {
      try {
        const { order } = await apiGetOrder(id);
        setS((s) => {
          const cur = s.orders.find((o) => o.id === id);
          if (!cur || (cur.status === order.status && cur.etaAt === order.etaAt)) return s;
          if (cur.status !== order.status) haptic(order.status === 'cancelled' ? 'error' : 'success');
          return { ...s, orders: s.orders.map((o) => (o.id === id ? { ...o, ...order, remote: true } : o)) };
        });
      } catch { /* сеть */ }
    });
    tick();
    const t = setInterval(tick, 5000);
    return () => clearInterval(t);
  }, [activeRemote]);

  const update = (fn) => setS((s) => ({ ...s, ...fn(s) }));
  const editLayers = (fn) => update((s) => ({ layers: fn(s.layers), sizeId: 'custom' }));

  const checkBadges = (st, s) => {
    const got = CHALLENGES.filter((c) => !s.badges[c.id] && challengeProgress(st, c.id) >= c.target);
    if (!got.length) return s.badges;
    setTimeout(() => { toast(`Бейдж получен: ${got.map((c) => c.title).join(', ')}`, 'ok'); setConfetti(Date.now()); }, 500);
    return { ...s.badges, ...Object.fromEntries(got.map((c) => [c.id, Date.now()])) };
  };

  const burgerItem = (name, layers, author) => {
    const st = stats(layers);
    const keys = layers.filter((l) => !l.hidden).map((l) => l.key);
    return { cid: uid(), kind: 'burger', name, keys, author, qty: 1, unit: st.total, packaging: st.packaging, weight: st.weight, kcal: st.kcal, count: st.count };
  };

  const go = (name, params = {}) => {
    setRoute((r) => { hist.current.push(r); return { name, params }; });
  };

  // Заказ принят: сохранить локально, запомнить адрес и телефон, открыть статус
  const finishOrder = (order, payload) => {
    const c = payload.customer || {};
    setS((s) => {
      const addr = payload.mode === 'delivery' && c.address
        ? [{ address: c.address, details: c.details || '', location: payload.location || null, zoneId: order.zone?.id || payload.zoneId || null }, ...s.addresses.filter((a) => a.address !== c.address)].slice(0, 5)
        : s.addresses;
      return {
        ...s, orders: [...s.orders.filter((o) => o.id !== order.id), order], cart: [], pending: null, addresses: addr,
        profile: { ...s.profile, name: c.name || s.profile.name, phone: c.phone || s.profile.phone },
      };
    });
    hist.current = [{ name: 'home', params: {} }];
    setRoute({ name: 'tracking', params: { orderId: order.id } });
    setNet('ok');
    haptic('success');
    toast(`Заказ #${order.id} принят`, 'ok');
  };

  // Отправка заказа на сервер. Нет связи или сервер недоступен — заказ остаётся в очереди
  // и уходит повторно с тем же ключом (сервер не создаст дубль). Ошибка проверки — заказ снимается.
  const sendPending = async (p) => {
    if (sendingRef.current) return 'pending';
    sendingRef.current = true;
    try {
      const { order } = await apiCreateOrder({ ...p.payload, idem: p.idem });
      finishOrder({ ...order, remote: true }, p.payload);
      return true;
    } catch (e) {
      if (e.status === 0 || e.status >= 500 || e.retry) {
        setNet('offline');
        return 'pending';
      }
      setS((s) => ({ ...s, pending: null }));
      setNet('ok');
      if (e.code === 'stop' || e.code === 'min' || e.code === 'limits') refreshConfig();
      haptic('error');
      toast(e.message || 'Не удалось отправить заказ', 'err');
      return false;
    } finally {
      sendingRef.current = false;
    }
  };

  useEffect(() => {
    if (!inTelegram || !S.pending) return;
    const retry = () => sendPending(S.pending);
    retry();
    const t = setInterval(retry, 5000);
    window.addEventListener('online', retry);
    return () => { clearInterval(t); window.removeEventListener('online', retry); };
  }, [S.pending?.idem]);

  const A = {
    go,
    back: () => setRoute(hist.current.pop() || { name: 'home', params: {} }),
    applySize: (id) => {
      const p = SIZE_PRESETS.find((x) => x.id === id);
      if (!p.layers) { update(() => ({ sizeId: 'custom' })); toast('Custom: собирай что угодно — ограничений по размеру нет'); return; }
      update(() => ({ layers: toLayers(p.layers), sizeId: id }));
    },
    addIng: (id) => {
      const ing = ING[id];
      const why = canAddIng(visibleKeys(S.layers), id);
      if (why) { haptic('error'); toast(why, 'err'); return; }
      haptic('light');
      editLayers((ls) => {
        const next = [...ls];
        if (ing.cat === 'bun') {
          const idx = Math.max(1, Math.floor(next.length / 2));
          next.splice(idx, 0, { uid: uid(), key: `mid:${id}`, hidden: false });
          return next;
        }
        next.splice(insertIndexFor(next, ing), 0, { uid: uid(), key: id, hidden: false });
        return next;
      });
    },
    removeIng: (id) => { haptic('soft'); editLayers((ls) => {
      const ing = ING[id];
      const key = ing.cat === 'bun' ? `mid:${id}` : id;
      const i = ls.findIndex((l) => l.key === key);
      return i < 0 ? ls : ls.filter((_, j) => j !== i);
    }); },
    setBun: (id) => editLayers((ls) => {
      let hasTop = false, hasBottom = false;
      const next = ls.map((l) => {
        const { role } = parseKey(l.key);
        if (role === 'top') hasTop = true;
        if (role === 'bottom') hasBottom = true;
        return role ? { ...l, uid: role === 'mid' ? l.uid : uid(), key: `${role}:${id}` } : l;
      });
      if (!hasTop) next.unshift({ uid: uid(), key: `top:${id}`, hidden: false });
      if (!hasBottom) next.push({ uid: uid(), key: `bottom:${id}`, hidden: false });
      return next;
    }),
    toggleHide: (u) => editLayers((ls) => ls.map((l) => (l.uid === u ? { ...l, hidden: !l.hidden } : l))),
    removeLayer: (u) => editLayers((ls) => ls.filter((l) => l.uid !== u)),
    moveLayer: (from, to) => editLayers((ls) => { const n = [...ls]; const [x] = n.splice(from, 1); n.splice(to, 0, x); return n; }),
    replaceLayer: (u, key) => {
      const { ing, role } = parseKey(key);
      const why = role && role !== 'mid' ? (isStopped(ing.id) ? `${ing.name}: нет в наличии` : null) : canAddIng(visibleKeys(S.layers.filter((l) => l.uid !== u)), ing.id);
      if (why) { toast(why, 'err'); return; }
      editLayers((ls) => ls.map((l) => (l.uid === u ? { ...l, uid: uid(), key } : l)));
    },
    reset: () => { randomTimer.current.forEach(clearTimeout); update(() => ({ layers: toLayers(['top:brioche', 'bottom:brioche']), sizeId: 'custom', editingId: null, editingCid: null })); toast('Чистая булочка. Добавляй слои'); },
    randomize: () => {
      randomTimer.current.forEach(clearTimeout);
      let keys = null;
      for (let i = 0; i < 40 && !keys; i++) { const k = randomBurger(); if (!burgerProblem(k)) keys = k; }
      if (!keys) { toast('Сейчас не получается собрать случайный бургер из того, что есть в наличии', 'err'); return; }
      const top = keys[0], bottom = keys[keys.length - 1], mid = keys.slice(1, -1);
      update(() => ({ layers: toLayers([top, bottom]), sizeId: 'custom', editingId: null, editingCid: null }));
      const step = Math.max(70, Math.min(160, 1800 / mid.length));
      randomTimer.current = mid.slice().reverse().map((k, i) => setTimeout(() => {
        setS((s) => { const n = [...s.layers]; n.splice(1, 0, { uid: uid(), key: k, hidden: false }); return { ...s, layers: n }; });
      }, 200 + i * step));
      randomTimer.current.push(setTimeout(() => toast('Готово! Не нравится — жми ещё раз'), 300 + mid.length * step));
    },
    openSave: () => {
      if (!stats(S.layers).count) return toast('Сначала добавь хотя бы один ингредиент');
      setSaveOpen(true);
    },
    saveRecipe: (name) => {
      const st = stats(S.layers);
      const keys = S.layers.filter((l) => !l.hidden).map((l) => l.key);
      const r = { id: S.editingId || uid(), name, author: S.profile.name, layers: keys, createdAt: Date.now() };
      setS((s) => {
        const saved = s.editingId ? s.saved.map((x) => (x.id === s.editingId ? r : x)) : [r, ...s.saved];
        return { ...s, saved, editingId: r.id, badges: checkBadges(st, s) };
      });
      setSaveOpen(false);
      setSavedResult(r);
      haptic('success');
      if (st.weight >= 1500) setConfetti(Date.now());
    },
    openShare: (r) => {
      if (r) return setShare(r);
      const name = S.saved.find((x) => x.id === S.editingId)?.name || `${S.profile.name.toUpperCase()} MONSTER`;
      setShare({ name, author: S.profile.name, layers: S.layers.filter((l) => !l.hidden).map((l) => l.key) });
    },
    addCurrentToCart: () => {
      const st = stats(S.layers);
      if (!st.count) return;
      const problem = burgerProblem(visibleKeys(S.layers));
      if (problem) { haptic('error'); toast(problem, 'err'); return; }
      // Редактировали бургер из корзины — обновляем ту же позицию (количество и название сохраняются)
      const editing = S.editingCid && S.cart.find((c) => c.cid === S.editingCid);
      if (editing) {
        setS((s) => ({ ...s, editingCid: null, cart: s.cart.map((c) => (c.cid === editing.cid ? { ...burgerItem(c.name, s.layers, c.author), cid: c.cid, qty: c.qty } : c)), badges: checkBadges(st, s) }));
        haptic('medium');
        go('cart');
        toast(`«${editing.name}» обновлён · ${fmtPrice(st.total)}`, 'ok');
        return;
      }
      const name = S.saved.find((x) => x.id === S.editingId)?.name || `Мой бургер №${S.cart.filter((c) => c.kind === 'burger').length + 1}`;
      setS((s) => ({ ...s, cart: [...s.cart, burgerItem(name, s.layers, s.profile.name)], badges: checkBadges(st, s) }));
      haptic('medium');
      toast(`«${name}» в корзине · ${fmtPrice(st.total)}`, 'ok');
    },
    loadRecipe: (b, editing) => {
      update(() => ({ layers: toLayers(b.layers), sizeId: 'custom', editingId: editing ? b.id : null, editingCid: null }));
      go('builder');
      toast(editing ? `Редактируешь «${b.name}»` : `«${b.name}» в конструкторе — меняй как хочешь`);
    },
    editSaved: (r) => A.loadRecipe(r, true),
    orderAgain: (r) => {
      const problem = burgerProblem(r.layers);
      if (problem) { A.loadRecipe(r, false); toast(problem, 'err'); return; }
      setS((s) => ({ ...s, cart: [...s.cart, burgerItem(r.name, toLayers(r.layers), r.author)] }));
      go('cart');
      toast(`«${r.name}» снова в корзине`, 'ok');
    },
    deleteSaved: (id) => { update((s) => ({ saved: s.saved.filter((x) => x.id !== id), editingId: s.editingId === id ? null : s.editingId })); toast('Рецепт удалён'); },
    toggleLike: (id) => update((s) => ({ likes: { ...s.likes, [id]: !s.likes[id] } })),
    startChallenge: (id) => { const c = CHALLENGES.find((x) => x.id === id); go('builder'); toast(c.goal); },
    addParty: (opt) => {
      if (STOP.party || STOP[opt.id]) { toast('Party Burger сейчас недоступен', 'err'); return; }
      update((s) => ({ cart: [...s.cart, { cid: uid(), kind: 'party', name: `Party Burger на ${opt.people}`, qty: 1, unit: opt.price, weight: opt.weight, people: opt.people }] }));
      toast(`Party Burger на ${opt.people} в корзине`, 'ok');
    },
    addExtra: (u) => {
      if (STOP[u.id]) { toast(`${u.name}: нет в наличии`, 'err'); return; }
      update((s) => {
        const ex = s.cart.find((c) => c.kind === 'extra' && c.id === u.id);
        if (ex) return { cart: s.cart.map((c) => (c === ex ? { ...c, qty: c.qty + 1 } : c)) };
        return { cart: [...s.cart, { cid: uid(), kind: 'extra', id: u.id, name: u.name, note: u.note, icon: u.icon, qty: 1, unit: u.price }] };
      });
    },
    cartQty: (cid, d) => update((s) => ({ cart: s.cart.map((c) => (c.cid === cid ? { ...c, qty: Math.min(20, c.qty + d) } : c)).filter((c) => c.qty > 0) })),
    // Позиция остаётся в корзине, пока правки не сохранены: ушёл из конструктора — ничего не потерялось
    editCartItem: (it) => {
      update(() => ({ layers: toLayers(it.keys), sizeId: 'custom', editingId: null, editingCid: it.cid }));
      go('builder');
      toast(`Редактируешь «${it.name}». Нажми «Обновить в корзине», когда закончишь`);
    },
    cancelCartEdit: () => update(() => ({ editingCid: null })),
    // payload: { mode, customer, table, zoneId, location, desiredTime, payment, comment } — собирает экран оформления
    placeOrder: async (payload, t) => {
      if (inTelegram) {
        // Реальный заказ: сервер проверит подпись Telegram, пересчитает цены, стоп-лист и лимиты и передаст заказ на кассу.
        // Ключ idem защищает от дублей: повторная отправка вернёт уже созданный заказ.
        const pending = { idem: `${uid()}${Math.random().toString(36).slice(2, 8)}`, payload: { ...payload, items: S.cart, clientAt: Date.now() } };
        setS((s) => ({ ...s, pending }));
        return sendPending(pending);
      }
      const now = Date.now();
      const id = 4827 + S.orders.length;
      const o = { id, items: S.cart, createdAt: now, status: 'created', statusAt: { created: now }, sub: t.sub, fee: t.fee, total: t.total, ...payload };
      finishOrder({ ...o, etaAt: estimateEta(o, now) }, payload);
      return true;
    },
    dropPending: () => { setS((s) => ({ ...s, pending: null })); setNet('ok'); toast('Заказ не отправлен. Если он уже дошёл до кассы, он появится в /orders у бота'); },
    repeatOrder: (o) => {
      const items = o.items.map((it) => ({ ...it, cid: uid(), unit: itemUnit(it) }));
      const ok = items.filter((it) => !itemIssues(it).length);
      if (!ok.length) { toast('Позиций из этого заказа сейчас нет в наличии', 'err'); return; }
      setS((s) => ({ ...s, cart: [...s.cart, ...ok] }));
      go('cart');
      toast(ok.length < items.length ? `Добавлено ${ok.length} из ${items.length}: остального нет в наличии` : 'Заказ снова в корзине — проверь и оформи', ok.length < items.length ? 'err' : 'ok');
    },
    kitchenLive: (id, to) => update((s) => ({ orders: s.orders.map((o) => {
      if (o.id !== id) return o;
      const f = flowOf(o);
      return f.indexOf(to) > f.indexOf(o.status) ? { ...o, status: to, statusAt: { ...o.statusAt, [to]: Date.now() }, touched: Date.now() } : o;
    }) })),
    kitchenMock: (id, to) => update((s) => ({ kitchenMock: s.kitchenMock.map((o) => (o.id === id ? { ...o, status: to } : o)) })),
    toggleStock: (id) => update((s) => ({ stock: { ...s.stock, [id]: s.stock[id] === false } })),
    setProfile: (p) => update((s) => ({ profile: { ...s.profile, ...p } })),
    // В Telegram профиль (имя, телефон, адрес из бота, права) сохраняется — чистим только данные на устройстве
    resetDemo: () => {
      if (!window.confirm(inTelegram ? 'Удалить корзину, сохранённые рецепты и бейджи на этом устройстве?' : 'Удалить корзину, рецепты, заказы и бейджи?')) return;
      setS((s) => ({ ...initial(), ...(inTelegram ? { profile: s.profile, orders: s.orders.filter((o) => o.remote), addresses: s.addresses } : {}) }));
      hist.current = []; setRoute({ name: 'home', params: {} }); toast(inTelegram ? 'Данные на устройстве очищены' : 'Демо-данные сброшены');
    },
    installHint: async () => {
      if (deferredPrompt.current) { deferredPrompt.current.prompt(); deferredPrompt.current = null; return; }
      setInstall(true);
    },
    monster: (kind, st) => { haptic('heavy'); setMonster({ kind, st, t: Date.now() }); },
  };

  const cartCount = S.cart.reduce((s, i) => s + i.qty, 0);
  const tab = TAB_OF[route.name] || route.name;
  const navMobile = isAdmin ? [...NAV_MOBILE, NAV_ADMIN] : NAV_MOBILE;
  const tabIdx = navMobile.findIndex(([id]) => id === tab);
  const currentSt = useMemo(() => stats(S.layers), [S.layers]);

  let screen;
  switch (route.name) {
    case 'builder': screen = <Builder />; break;
    case 'community': screen = <Community />; break;
    case 'challenges': screen = <Challenges />; break;
    case 'saved': screen = <MyBurgers />; break;
    case 'party': screen = <Party />; break;
    case 'cart': screen = <Cart />; break;
    case 'checkout': screen = <Checkout />; break;
    case 'tracking': screen = <Tracking orderId={route.params.orderId} />; break;
    case 'kitchen': screen = <Kitchen />; break;
    case 'admin': screen = <Admin />; break;
    case 'profile': screen = <Profile />; break;
    case 'panel': screen = isAdmin ? <StaffApp embedded initData={tg.initData} /> : <Home />; break;
    default: screen = <Home />;
  }

  const activeOrder = S.orders.find((o) => !isClosed(o));

  return (
    <AppCtx.Provider value={{ S, A, isDesktop, cfgRev }}>
      <div className={`app ${isDesktop ? 'is-desk' : 'is-mob'} r-${route.name}`}>
        {isDesktop && route.name !== 'kitchen' && (
          <nav className="sidebar" aria-label="Навигация">
            <button className="side-logo" onClick={() => go('home')} aria-label="BurgerLab, главная"><Logo /></button>
            <div className="side-links">
              {(isAdmin ? [...NAV_DESK, NAV_ADMIN] : NAV_DESK).map(([id, t, d]) => (
                <button key={id} className={`side-link ${route.name === id ? 'on' : ''}`} onClick={() => go(id)} title={t}>
                  <Icon name={d} fill={route.name === id} /><span className="sl-t">{t}</span>{id === 'cart' && cartCount > 0 && <span className="count">{cartCount}</span>}
                </button>
              ))}
            </div>
            <div className="side-demo">
              {!inTelegram && <span className="side-cap">Демо для партнёров</span>}
              {!inTelegram && NAV_DEMO.map(([id, t, d]) => (
                <button key={id} className={`side-link ${route.name === id ? 'on' : ''}`} onClick={() => go(id)} title={t}><Icon name={d} /><span className="sl-t">{t}</span></button>
              ))}
              {activeOrder && <button className="side-order" onClick={() => go('tracking', { orderId: activeOrder.id })} title={`Заказ #${activeOrder.id}`}><Icon name={statusInfo(activeOrder).ms} /><span className="sl-t"> Заказ #{activeOrder.id}: {statusInfo(activeOrder).t.toLowerCase()}</span></button>}
            </div>
          </nav>
        )}
        {!isDesktop && route.name === 'home' && (
          <header className="mob-top"><Logo />{activeOrder && <button className="side-order sm" onClick={() => go('tracking', { orderId: activeOrder.id })}><Icon name={statusInfo(activeOrder).ms} /> #{activeOrder.id}</button>}</header>
        )}
        {S.pending && (
          <div className={`pending-bar ${net === 'offline' ? 'off' : ''}`} role="status">
            <span><Icon name={net === 'offline' ? 'wifi_off' : 'hourglass_top'} /> {net === 'offline' ? 'Нет связи. Заказ сохранён и отправится автоматически' : 'Отправляем заказ…'}</span>
            {net === 'offline' && <button className="link sm" onClick={A.dropPending}>Не отправлять</button>}
          </div>
        )}
        <main className="main" ref={mainRef}><div className="screen" key={route.name}>{screen}</div></main>
        {!isDesktop && route.name !== 'kitchen' && (
          <nav className={`tabbar ${kbOpen ? 'hide' : ''}`} aria-label="Навигация" style={{ '--n': navMobile.length, '--i': Math.max(0, tabIdx) }}>
            <span className={`tab-ind ${tabIdx < 0 ? 'off' : ''}`} aria-hidden="true" />
            {navMobile.map(([id, t, d]) => (
              <button key={id} className={`tab ${tab === id ? 'on' : ''} ${id === 'builder' ? 'tab-build' : ''}`} onClick={() => { if (tab !== id) haptic('select'); hist.current = []; setRoute({ name: id, params: {} }); }} aria-current={tab === id ? 'page' : undefined}>
                <span className="tab-ico"><Icon name={d} fill={tab === id} />{id === 'cart' && cartCount > 0 && <span className="count" key={cartCount}>{cartCount}</span>}</span>
                <span className="tab-t">{t}</span>
              </button>
            ))}
          </nav>
        )}

        <SaveModal open={saveOpen} onClose={() => setSaveOpen(false)} onSave={A.saveRecipe} st={currentSt} defaultName={S.saved.find((x) => x.id === S.editingId)?.name} />
        <Sheet open={!!savedResult} onClose={() => setSavedResult(null)} title="Рецепт сохранён">
          {savedResult && (
            <div className="saved-result">
              <RecipeCard r={savedResult} big />
              <div className="sr-btns">
                <button className="btn primary block lg" onClick={() => { A.addCurrentToCart(); setSavedResult(null); }}>Добавить в корзину</button>
                <div className="row2">
                  <button className="btn outline" onClick={() => { const r = savedResult; setSavedResult(null); setShare(r); }}>Поделиться</button>
                  <button className="btn outline" onClick={() => { setSavedResult(null); go('saved'); }}>Мои бургеры</button>
                </div>
              </div>
            </div>
          )}
        </Sheet>
        <ShareModal recipe={share} onClose={() => setShare(null)} toast={toast} />
        <Sheet open={install} onClose={() => setInstall(false)} title="BurgerLab на домашнем экране">
          <div className="install">
            <p><b>iPhone (Safari):</b> нажми «Поделиться» внизу экрана и выбери «На экран „Домой“».</p>
            <p><b>Android (Chrome):</b> открой меню ⋮ и выбери «Установить приложение» или «Добавить на главный экран».</p>
            <p className="fine">Иконка BurgerLab появится рядом с остальными приложениями, и сервис будет открываться без адресной строки.</p>
          </div>
        </Sheet>
        <MonsterPop m={monster} onClose={() => setMonster(null)} />
        <Confetti run={confetti} />
        <Toasts items={toasts} />
      </div>
    </AppCtx.Provider>
  );
}

// Старт: сначала меню, цены и стоп-лист (с сервера или из кэша), затем интерфейс
async function boot() {
  initTelegram();
  setupPWA();
  try { applyConfig(JSON.parse(localStorage.getItem(CFG_KEY) || 'null')); } catch { /* нет кэша */ }
  await fetchConfig();
  createRoot(document.getElementById('root')).render(<App />);
}
boot();
