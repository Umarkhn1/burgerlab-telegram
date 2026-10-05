import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AppCtx } from './ctx.js';
import { ING, SIZE_PRESETS, DEFAULT_LAYERS, CHALLENGES, STOP, PROD, applyMenu, applySettings, applyStop } from './data.js';
import { toLayers, uid, stats, insertIndexFor, parseKey, randomBurger, fmtPrice, fmtWeight, fmtCm, fmtKcal, encodeRecipe, decodeRecipe, encodeShort, decodeShort, challengeProgress, canAddIng, checkBurger, isStopped, itemIssues, itemUnit, flowOf, isClosed, estimateEta, statusInfo, PACKAGING_FEE, approx } from './calc.js';
import { tg, inTelegram, initTelegram, tgUser, startParam, haptic, setBackButton, miniAppLink, shareToTelegram, apiCreateOrder, apiGetOrder, apiConfig, apiMe, apiMyOrders, apiSetLang, apiRef, apiPay } from './telegram.js';
import { t, tn, nm, setLang, getLang, langFromCode } from './i18n.js';
import { Sheet, Toasts, Confetti, MiniBurger, Icon } from './ui.jsx';
import Builder, { TypeBadge } from './builder.jsx';
import { Home, Menu, Challenges, MyBurgers, Profile, ProductSheet } from './screens.jsx';
import { Cart, Checkout, Tracking } from './commerce.jsx';
import { StaffApp } from './staff.jsx';

// ---------- Хранилище (localStorage) ----------
const KEY = 'burgerlab:v1';
const DEFAULT_NAME = 'Гость';
const initial = () => ({
  profile: { name: tgUser()?.first_name || DEFAULT_NAME },
  lang: '',
  layers: toLayers(DEFAULT_LAYERS),
  sizeId: 'standard',
  editingId: null,
  saved: [],
  cart: [],
  orders: [],
  badges: {},
  addresses: [],
  pending: null,
  table: null,
  editingCid: null,
});
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return initial();
    const s = { ...initial(), ...JSON.parse(raw) };
    // Party Burger больше не продаётся — убираем его из старой корзины
    s.cart = (s.cart || []).filter((it) => it.kind !== 'party');
    return s;
  } catch { return initial(); }
}
function persist(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage недоступен — работаем в памяти */ }
}

// ---------- Меню, настройки и стоп-лист с сервера ----------
// Последний полученный конфиг кэшируется: без сети приложение открывается с ним.
const CFG_KEY = 'burgerlab:cfg';
function applyConfig(c) {
  if (!c?.menu?.products) return false;
  applyMenu(c.menu); applySettings(c.settings); applyStop(c.stop);
  return true;
}
async function fetchConfig() {
  const ctrl = new AbortController();
  const tm = setTimeout(() => ctrl.abort(), 4000);
  try {
    const c = await apiConfig(ctrl.signal);
    if (!applyConfig(c)) return null;
    try { localStorage.setItem(CFG_KEY, JSON.stringify(c)); } catch { /* ignore */ }
    return c;
  } catch { return null; } finally { clearTimeout(tm); }
}

// Почему бургер нельзя заказать (стоп-лист или лимиты конструктора). null — можно.
function burgerProblem(keys) {
  const out = [...new Set(keys.map((k) => parseKey(k).ing).filter((i) => i && isStopped(i.id)).map((i) => nm(i)))];
  if (out.length) return t('Нет в наличии: {list}. Замени эти слои', { list: out.join(', ') });
  return checkBurger(keys)[0] || null;
}
const visibleKeys = (layers) => layers.filter((l) => !l.hidden).map((l) => l.key);

// Демо-режим (вне Telegram): заказ переходит на следующий этап своего сценария
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
      display: 'standalone', orientation: 'portrait', background_color: '#FCF9F5', theme_color: '#FF5A00',
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
  } catch { /* не критично */ }
}

const NAV_MOBILE = [
  ['home', 'Главная', 'home'],
  ['builder', 'Собрать', 'lunch_dining'],
  ['menu', 'Меню', 'restaurant_menu'],
  ['cart', 'Корзина', 'shopping_bag'],
  ['profile', 'Профиль', 'person'],
];
const NAV_DESK = [
  ['home', 'Главная', 'home'], ['builder', 'Конструктор', 'lunch_dining'], ['menu', 'Меню', 'restaurant_menu'],
  ['saved', 'Мои бургеры', 'bookmark'], ['cart', 'Корзина', 'shopping_bag'], ['profile', 'Профиль', 'person'],
];
const TAB_OF = { challenges: 'profile', saved: 'profile', checkout: 'cart', tracking: 'profile' };

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
    st.cheese >= 4 ? t('Сырная башня') : 'Chilanzar Classic',
    st.meat >= 4 ? 'Meat King' : st.hot >= 5 ? t('Огненный дракон') : 'Tashkent Smash',
    st.weight >= 1500 ? t('Семейный гигант') : t('Мой идеальный'),
  ];
  return (
    <Sheet open={open} onClose={onClose} title={t('Как назовём твоего монстра?')}>
      <div className="save-body">
        <label className="field">
          <span>{t('Название бургера')}</span>
          <input autoFocus value={name} maxLength={28} onChange={(e) => setName(e.target.value)} placeholder={`${author} MONSTER`} onKeyDown={(e) => e.key === 'Enter' && onSave(name || `${author} MONSTER`)} />
        </label>
        <div className="chips wrap">
          {ideas.map((x) => <button key={x} className="chip" onClick={() => setName(x)}>{x}</button>)}
        </div>
        <button className="btn primary block lg" onClick={() => onSave(name.trim() || `${author} MONSTER`)}>{t('Сохранить рецепт')}</button>
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
          <span>{st.count} {tn(st.count, 'ингредиент', 'ингредиента', 'ингредиентов', 'ingredient')}</span>
          <span>{approx(fmtWeight(st.weight))}</span>
          <b>{fmtPrice(st.total)}</b>
        </div>
        <div className="rc-author">{t('Автор')}: {r.author}</div>
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
  const text = t('Я создал {name} в BurgerLab: {w}, {price}. Сможешь больше?', { name: recipe.name, w: approx(fmtWeight(st.weight)), price: fmtPrice(st.total) });
  const copy = async (msg) => {
    try { await navigator.clipboard.writeText(link); }
    catch {
      const ta = document.createElement('textarea'); ta.value = link; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch { /* ignore */ }
      ta.remove();
    }
    toast(msg || t('Ссылка скопирована'));
  };
  const native = async (app) => {
    if (navigator.share) {
      try { await navigator.share({ title: recipe.name, text, url: link }); return; } catch { return; }
    }
    copy(t('Ссылка скопирована — вставь её в {app}', { app }));
  };
  return (
    <Sheet open onClose={onClose} title={t('Поделиться бургером')}>
      <div className="share-card">
        <div className="sc-top">
          <span className="sc-brand">BurgerLab</span>
          <TypeBadge weight={st.weight} />
        </div>
        <div className="sc-art"><MiniBurger keys={recipe.layers} h={200} w={200} /></div>
        <div className="sc-h">{t('Я создал')}<br /><b>{recipe.name}</b></div>
        <div className="sc-stats">
          <span><b>{approx(fmtWeight(st.weight))}</b>{t('вес')}</span>
          <span><b>{st.meat}</b>{tn(st.meat, 'котлета', 'котлеты', 'котлет', 'kotlet')}</span>
          <span><b>{st.cheese}</b>{tn(st.cheese, 'сыр', 'сыра', 'сыров', 'pishloq')}</span>
          <span><b>{fmtPrice(st.total)}</b>{t('цена')}</span>
        </div>
        <div className="sc-q">{t('Сможешь больше?')}</div>
      </div>
      <div className="share-btns">
        <button className="sb ig" onClick={() => native('Instagram')}>Instagram</button>
        <button className="sb tg" onClick={() => shareToTelegram(link, text)}>Telegram</button>
        <button className="sb tt" onClick={() => native('TikTok')}>TikTok</button>
        <button className="sb cp" onClick={() => copy()}>{t('Скопировать')}</button>
      </div>
    </Sheet>
  );
}

function MonsterPop({ m, onClose }) {
  useEffect(() => {
    if (!m) return;
    const tm = setTimeout(onClose, 5200);
    return () => clearTimeout(tm);
  }, [m]);
  if (!m) return null;
  const { kind, st } = m;
  return (
    <div className={`monster ${kind}`} role="status" onClick={onClose}>
      <div className="m-fire" aria-hidden="true"><Icon name={kind === 'tall' ? 'inventory_2' : 'local_fire_department'} fill /></div>
      <div className="m-body">
        <b>{t(kind === 'tall' ? 'Высота впечатляет!' : kind === 'mega' ? 'Это уже мега-монстр' : 'Ты создаёшь монстра!')}</b>
        {kind === 'monster' && <span>{t('Твой бургер уже')}: {approx(fmtWeight(st.weight))} · {approx(fmtCm(st.cm))} · {approx(fmtKcal(st.kcal))}</span>}
        {kind === 'mega' && <span>{t('{w} — такой бургер рассчитан на компанию', { w: approx(fmtWeight(st.weight)) })}</span>}
        {kind === 'tall' && <span>{t('Для этого заказа потребуется специальная упаковка +{sum}', { sum: fmtPrice(PACKAGING_FEE) })}</span>}
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
  const [product, setProduct] = useState(null);
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
  // Сотрудник (администратор, кассир, повар из Telegram): в приложении у него только панель.
  // Флаг приходит с сервера (/api/me), доступ к данным сервер всё равно проверяет по подписи Telegram.
  const isStaff = inTelegram && !!S.profile.admin;
  const [clientMode, setClientMode] = useState(false);

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
    setToasts((x) => [...x.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), 2800);
  }, []);

  // Демо-трекинг вне Telegram: заказ сам двигается по этапам
  useEffect(() => {
    const tm = setInterval(() => {
      setS((s) => {
        if (!s.orders.some((o) => !isClosed(o) && !o.remote)) return s;
        return { ...s, orders: s.orders.map((o) => (!isClosed(o) && !o.remote && Date.now() - (o.touched || o.createdAt) > 8000 ? advance(o) : o)) };
      });
    }, 1000);
    return () => clearInterval(tm);
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
    const tm = setInterval(refreshConfig, 30000);
    const vis = () => document.visibilityState === 'visible' && refreshConfig();
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(tm); document.removeEventListener('visibilitychange', vis); };
  }, []);

  // Ссылки: рецепт (#r=... или startapp=r...), стол (?table=5 или startapp=t5), заказ, приглашение друга (startapp=ref<id>)
  useEffect(() => {
    try {
      const sp = startParam();
      if (/^ref\d+$/.test(sp)) {
        apiRef(sp).then((r) => r.ok && toast(t('Тебя пригласил друг! После первого заказа получишь котлетки 🍔'), 'ok')).catch(() => {});
        return;
      }
      const tableM = location.search.match(/[?&]table=(\d+)/) || sp.match(/^t(\d+)$/);
      if (tableM) {
        const n = Number(tableM[1]);
        setS((s) => ({ ...s, table: { n, at: Date.now() } }));
        setTimeout(() => toast(t('Стол {n}: собери заказ — мы принесём его к столу', { n }), 'ok'), 400);
        return;
      }
      const orderM = location.search.match(/[?&]order=(\d+)/) || location.hash.match(/#order=(\d+)/);
      if (orderM) { const id = Number(orderM[1]); setClientMode(true); syncOrder(id).then((ok) => ok && setRoute({ name: 'tracking', params: { orderId: id } })); return; }
      if (sp.startsWith('order')) { const id = Number(sp.slice(5)); setClientMode(true); syncOrder(id).then((ok) => ok && setRoute({ name: 'tracking', params: { orderId: id } })); return; }
      const m = location.hash.match(/#r=([^&]+)/);
      const r = sp ? decodeShort(sp) : m ? decodeRecipe(decodeURIComponent(m[1])) : null;
      if (!r) return;
      setClientMode(true);
      setS((s) => ({ ...s, layers: r.layers, sizeId: 'custom', editingId: null }));
      setRoute({ name: 'builder', params: {} });
      setTimeout(() => toast(t('{author} прислал бургер «{name}». Собери такой же или сделай лучше', r)), 400);
    } catch { /* ignore */ }
  }, []);

  // Данные из бота: телефон, геолокация, язык, котлетки, права сотрудника
  useEffect(() => {
    if (!inTelegram) return;
    const pull = () => apiMe().then((me) => {
      setS((s) => {
        const p = { ...s.profile };
        if (me.phone && p.phone !== me.phone) Object.assign(p, { phone: me.phone, phoneFromBot: true });
        if (me.location && (p.botLocation?.lat !== me.location.lat || p.botLocation?.lng !== me.location.lng || p.botAddress !== me.address)) Object.assign(p, { botLocation: me.location, botAddress: me.address || '' });
        Object.assign(p, { admin: !!me.admin, staffRole: me.role || null, cutlets: me.cutlets || 0, cutletLog: me.cutletLog || [], referral: me.referral });
        // Язык, выбранный в боте, если в приложении его ещё не меняли
        const lang = s.lang || me.lang || '';
        if (lang && lang !== getLang()) setLang(lang);
        return { ...s, profile: p, lang };
      });
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

  const sheetOpen = saveOpen || !!savedResult || !!share || install || !!product;
  useEffect(() => {
    if (isStaff && !clientMode) { setBackButton(false); return; }
    setBackButton(sheetOpen || route.name !== 'home', () => {
      if (sheetOpen) { setSaveOpen(false); setSavedResult(null); setShare(null); setInstall(false); setProduct(null); return; }
      setRoute(hist.current.pop() || { name: 'home', params: {} });
    });
  }, [route, sheetOpen, isStaff, clientMode]);

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
          if (!cur || (cur.status === order.status && cur.etaAt === order.etaAt && cur.paid === order.paid)) return s;
          if (cur.status !== order.status) haptic(order.status === 'cancelled' ? 'error' : 'success');
          return { ...s, orders: s.orders.map((o) => (o.id === id ? { ...o, ...order, remote: true } : o)) };
        });
      } catch { /* сеть */ }
    });
    tick();
    const tm = setInterval(tick, 5000);
    return () => clearInterval(tm);
  }, [activeRemote]);

  const update = (fn) => setS((s) => ({ ...s, ...fn(s) }));
  const editLayers = (fn) => update((s) => ({ layers: fn(s.layers), sizeId: 'custom' }));

  const checkBadges = (st, s) => {
    const got = CHALLENGES.filter((c) => !s.badges[c.id] && challengeProgress(st, c.id) >= c.target);
    if (!got.length) return s.badges;
    setTimeout(() => { toast(`${t('Бейдж получен')}: ${got.map((c) => c.title).join(', ')}`, 'ok'); setConfetti(Date.now()); }, 500);
    return { ...s.badges, ...Object.fromEntries(got.map((c) => [c.id, Date.now()])) };
  };

  const burgerItem = (name, layers, author) => {
    const st = stats(layers);
    const keys = layers.filter((l) => !l.hidden).map((l) => l.key);
    return { cid: uid(), kind: 'burger', name, keys, author, qty: 1, unit: st.total, packaging: st.packaging, weight: st.weight, kcal: st.kcal, count: st.count, spicy: false };
  };

  const go = (name, params = {}) => {
    setRoute((r) => { hist.current.push(r); return { name, params }; });
  };

  // Заказ принят: сохранить локально, запомнить адрес и телефон, открыть статус
  const finishOrder = (order, payload) => {
    const c = payload.customer || {};
    setS((s) => {
      const addr = payload.mode === 'delivery' && c.address
        ? [{ address: c.address, details: c.details || '', location: payload.location || null }, ...s.addresses.filter((a) => a.address !== c.address)].slice(0, 5)
        : s.addresses;
      const cutlets = Math.max(0, (s.profile.cutlets || 0) - (order.cutletsUsed || 0));
      return {
        ...s, orders: [...s.orders.filter((o) => o.id !== order.id), order], cart: [], pending: null, addresses: addr,
        profile: { ...s.profile, name: c.name || s.profile.name, phone: c.phone || s.profile.phone, cutlets },
      };
    });
    hist.current = [{ name: 'home', params: {} }];
    setRoute({ name: 'tracking', params: { orderId: order.id } });
    setNet('ok');
    haptic('success');
    toast(t('Заказ #{id} принят', { id: order.id }), 'ok');
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
      if (['stop', 'min', 'limits'].includes(e.code)) refreshConfig();
      haptic('error');
      toast(e.message || t('Не удалось отправить заказ'), 'err');
      return false;
    } finally {
      sendingRef.current = false;
    }
  };

  useEffect(() => {
    if (!inTelegram || !S.pending) return;
    const retry = () => sendPending(S.pending);
    retry();
    const tm = setInterval(retry, 5000);
    window.addEventListener('online', retry);
    return () => { clearInterval(tm); window.removeEventListener('online', retry); };
  }, [S.pending?.idem]);

  const A = {
    go,
    toast,
    back: () => setRoute(hist.current.pop() || { name: 'home', params: {} }),
    applySize: (id) => {
      const p = SIZE_PRESETS.find((x) => x.id === id);
      if (!p.layers) { update(() => ({ sizeId: 'custom' })); toast(t('Custom: собирай что угодно — ограничений по размеру нет')); return; }
      update(() => ({ layers: toLayers(p.layers), sizeId: id }));
    },
    applySizeAndGo: (id) => { if (id) A.applySize(id); go('builder'); },
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
      const why = role && role !== 'mid' ? (isStopped(ing.id) ? t('{name}: нет в наличии', { name: nm(ing) }) : null) : canAddIng(visibleKeys(S.layers.filter((l) => l.uid !== u)), ing.id);
      if (why) { toast(why, 'err'); return; }
      editLayers((ls) => ls.map((l) => (l.uid === u ? { ...l, uid: uid(), key } : l)));
    },
    reset: () => { randomTimer.current.forEach(clearTimeout); update(() => ({ layers: toLayers(['top:brioche', 'bottom:brioche']), sizeId: 'custom', editingId: null, editingCid: null })); toast(t('Чистая булочка. Добавляй слои')); },
    randomize: () => {
      randomTimer.current.forEach(clearTimeout);
      let keys = null;
      for (let i = 0; i < 40 && !keys; i++) { const k = randomBurger(); if (!burgerProblem(k)) keys = k; }
      if (!keys) { toast(t('Сейчас не получается собрать случайный бургер из того, что есть в наличии'), 'err'); return; }
      const top = keys[0], bottom = keys[keys.length - 1], mid = keys.slice(1, -1);
      update(() => ({ layers: toLayers([top, bottom]), sizeId: 'custom', editingId: null, editingCid: null }));
      const step = Math.max(70, Math.min(160, 1800 / mid.length));
      randomTimer.current = mid.slice().reverse().map((k, i) => setTimeout(() => {
        setS((s) => { const n = [...s.layers]; n.splice(1, 0, { uid: uid(), key: k, hidden: false }); return { ...s, layers: n }; });
      }, 200 + i * step));
      randomTimer.current.push(setTimeout(() => toast(t('Готово! Не нравится — жми ещё раз')), 300 + mid.length * step));
    },
    openSave: () => {
      if (!stats(S.layers).count) return toast(t('Сначала добавь хотя бы один ингредиент'));
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
      // Редактировали бургер из корзины — обновляем ту же позицию (количество, название и острота сохраняются)
      const editing = S.editingCid && S.cart.find((c) => c.cid === S.editingCid);
      if (editing) {
        setS((s) => ({ ...s, editingCid: null, cart: s.cart.map((c) => (c.cid === editing.cid ? { ...burgerItem(c.name, s.layers, c.author), cid: c.cid, qty: c.qty, spicy: c.spicy } : c)), badges: checkBadges(st, s) }));
        haptic('medium');
        go('cart');
        toast(t('«{name}» обновлён · {sum}', { name: editing.name, sum: fmtPrice(st.total) }), 'ok');
        return;
      }
      const name = S.saved.find((x) => x.id === S.editingId)?.name || t('Мой бургер №{n}', { n: S.cart.filter((c) => c.kind === 'burger').length + 1 });
      setS((s) => ({ ...s, cart: [...s.cart, burgerItem(name, s.layers, s.profile.name)], badges: checkBadges(st, s) }));
      haptic('medium');
      toast(t('«{name}» в корзине · {sum}', { name, sum: fmtPrice(st.total) }), 'ok');
    },
    loadRecipe: (b, editing) => {
      update(() => ({ layers: toLayers(b.layers), sizeId: 'custom', editingId: editing ? b.id : null, editingCid: null }));
      go('builder');
      toast(editing ? t('Редактируешь «{name}»', b) : t('«{name}» в конструкторе — меняй как хочешь', b));
    },
    editSaved: (r) => A.loadRecipe(r, true),
    orderAgain: (r) => {
      const problem = burgerProblem(r.layers);
      if (problem) { A.loadRecipe(r, false); toast(problem, 'err'); return; }
      setS((s) => ({ ...s, cart: [...s.cart, burgerItem(r.name, toLayers(r.layers), r.author)] }));
      go('cart');
      toast(t('«{name}» снова в корзине', r), 'ok');
    },
    deleteSaved: (id) => { update((s) => ({ saved: s.saved.filter((x) => x.id !== id), editingId: s.editingId === id ? null : s.editingId })); toast(t('Рецепт удалён')); },
    startChallenge: (id) => { const c = CHALLENGES.find((x) => x.id === id); go('builder'); toast(t(c.goal)); },
    // ── Меню ──
    openProduct: (p) => setProduct(p),
    // Одинаковые товары с одинаковой остротой складываются в одну позицию
    addProduct: (p, { spicy = false, qty = 1 } = {}) => {
      if (STOP[p.id] || p.hidden) { toast(t('{name}: нет в наличии', { name: nm(p) }), 'err'); return; }
      const sp = p.spicy ? !!spicy : undefined;
      setS((s) => {
        const ex = s.cart.find((c) => (c.kind === 'product' || c.kind === 'extra') && c.id === p.id && c.spicy === sp);
        if (ex) return { ...s, cart: s.cart.map((c) => (c === ex ? { ...c, kind: 'product', qty: Math.min(20, c.qty + qty) } : c)) };
        return { ...s, cart: [...s.cart, { cid: uid(), kind: 'product', id: p.id, cat: p.cat, name: p.name, nameUz: p.nameUz, note: p.note, icon: p.icon, qty, unit: p.price, spicy: sp }] };
      });
      haptic('light');
      toast(t('«{name}» в корзине', { name: nm(p) }), 'ok');
    },
    productQty: (id, d) => setS((s) => {
      const items = s.cart.filter((c) => (c.kind === 'product' || c.kind === 'extra') && c.id === id);
      const last = items[items.length - 1];
      if (!last) return s;
      return { ...s, cart: s.cart.map((c) => (c === last ? { ...c, qty: c.qty + d } : c)).filter((c) => c.qty > 0) };
    }),
    setSpicy: (cid, v) => { haptic('select'); update((s) => ({ cart: s.cart.map((c) => (c.cid === cid ? { ...c, spicy: v } : c)) })); },
    cartQty: (cid, d) => update((s) => ({ cart: s.cart.map((c) => (c.cid === cid ? { ...c, qty: Math.min(20, c.qty + d) } : c)).filter((c) => c.qty > 0) })),
    // Позиция остаётся в корзине, пока правки не сохранены: ушёл из конструктора — ничего не потерялось
    editCartItem: (it) => {
      update(() => ({ layers: toLayers(it.keys), sizeId: 'custom', editingId: null, editingCid: it.cid }));
      go('builder');
      toast(t('Редактируешь «{name}». Нажми «Обновить в корзине», когда закончишь', it));
    },
    cancelCartEdit: () => update(() => ({ editingCid: null })),
    // payload собирает экран оформления: способ получения, клиент, адрес, оплата, промокод, котлетки
    placeOrder: async (payload, tot) => {
      if (inTelegram) {
        // Реальный заказ: сервер проверит подпись Telegram, пересчитает цены, промокод, котлетки, стоп-лист и лимиты.
        // Ключ idem защищает от дублей: повторная отправка вернёт уже созданный заказ.
        const pending = { idem: `${uid()}${Math.random().toString(36).slice(2, 8)}`, payload: { ...payload, items: S.cart, clientAt: Date.now() } };
        setS((s) => ({ ...s, pending }));
        return sendPending(pending);
      }
      const now = Date.now();
      const id = 4827 + S.orders.length;
      const o = { id, items: S.cart, createdAt: now, status: 'created', statusAt: { created: now }, sub: tot.sub, fee: tot.fee, discount: tot.discount, total: tot.total, paid: false, ...payload, promo: payload.promo ? { code: payload.promo, discount: tot.discount } : null };
      finishOrder({ ...o, etaAt: estimateEta(o, now) }, payload);
      return true;
    },
    // Оплата Click / Payme (тестовый режим)
    payOrder: async (o) => {
      try {
        const order = inTelegram ? (await apiPay(o.id)).order : { ...o, paid: true };
        setS((s) => ({ ...s, orders: s.orders.map((x) => (x.id === o.id ? { ...x, ...order, remote: x.remote } : x)) }));
        haptic('success');
        return true;
      } catch (e) { toast(e.message, 'err'); return false; }
    },
    dropPending: () => { setS((s) => ({ ...s, pending: null })); setNet('ok'); toast(t('Заказ не отправлен. Если он уже дошёл до кассы, он появится в /orders у бота')); },
    repeatOrder: (o) => {
      const items = o.items.filter((it) => it.kind === 'burger' || it.kind === 'product' || it.kind === 'extra').map((it) => ({ ...it, kind: it.kind === 'extra' ? 'product' : it.kind, cid: uid(), unit: itemUnit(it) }));
      const ok = items.filter((it) => !itemIssues(it).length);
      if (!ok.length) { toast(t('Позиций из этого заказа сейчас нет в наличии'), 'err'); return; }
      setS((s) => ({ ...s, cart: [...s.cart, ...ok] }));
      go('cart');
      toast(ok.length < o.items.length ? t('Добавлено {n} из {all}: остального нет в наличии', { n: ok.length, all: o.items.length }) : t('Заказ снова в корзине — проверь и оформи'), ok.length < o.items.length ? 'err' : 'ok');
    },
    setProfile: (p) => update((s) => ({ profile: { ...s.profile, ...p } })),
    setLang: (lang) => {
      setLang(lang);
      haptic('select');
      update(() => ({ lang }));
      if (inTelegram) apiSetLang(lang).catch(() => {});
    },
    backToPanel: () => { setClientMode(false); hist.current = []; setRoute({ name: 'home', params: {} }); },
    // В Telegram профиль (имя, телефон, адрес из бота, права, котлетки) сохраняется — чистим только данные на устройстве
    resetDemo: () => {
      if (!window.confirm(t(inTelegram ? 'Удалить корзину, сохранённые рецепты и бейджи на этом устройстве?' : 'Удалить корзину, рецепты, заказы и бейджи?'))) return;
      setS((s) => ({ ...initial(), lang: s.lang, ...(inTelegram ? { profile: s.profile, orders: s.orders.filter((o) => o.remote), addresses: s.addresses } : {}) }));
      hist.current = []; setRoute({ name: 'home', params: {} }); toast(t(inTelegram ? 'Данные на устройстве очищены' : 'Данные сброшены'));
    },
    installHint: async () => {
      if (deferredPrompt.current) { deferredPrompt.current.prompt(); deferredPrompt.current = null; return; }
      setInstall(true);
    },
    monster: (kind, st) => { haptic('heavy'); setMonster({ kind, st, t: Date.now() }); },
  };

  const currentSt = useMemo(() => stats(S.layers), [S.layers]);

  // Сотрудник: только панель (касса, кухня или админка), без клиентских экранов
  if (isStaff && !clientMode) {
    return (
      <AppCtx.Provider value={{ S, A, isDesktop, cfgRev }}>
        <div className="app staff-only">
          <StaffApp embedded initData={tg.initData} onClientMode={() => { setClientMode(true); hist.current = []; setRoute({ name: 'home', params: {} }); }} />
        </div>
      </AppCtx.Provider>
    );
  }

  const cartCount = S.cart.reduce((s, i) => s + i.qty, 0);
  const tab = TAB_OF[route.name] || route.name;
  const tabIdx = NAV_MOBILE.findIndex(([id]) => id === tab);

  let screen;
  switch (route.name) {
    case 'builder': screen = <Builder />; break;
    case 'menu': screen = <Menu initialCat={route.params.cat} />; break;
    case 'challenges': screen = <Challenges />; break;
    case 'saved': screen = <MyBurgers />; break;
    case 'cart': screen = <Cart />; break;
    case 'checkout': screen = <Checkout />; break;
    case 'tracking': screen = <Tracking orderId={route.params.orderId} />; break;
    case 'profile': screen = <Profile focus={route.params.focus} />; break;
    default: screen = <Home />;
  }

  const activeOrder = S.orders.find((o) => !isClosed(o));

  return (
    <AppCtx.Provider value={{ S, A, isDesktop, cfgRev }}>
      <div className={`app ${isDesktop ? 'is-desk' : 'is-mob'} r-${route.name}`}>
        {isDesktop && (
          <nav className="sidebar" aria-label={t('Навигация')}>
            <button className="side-logo" onClick={() => go('home')} aria-label="BurgerLab"><Logo /></button>
            <div className="side-links">
              {NAV_DESK.map(([id, label, d]) => (
                <button key={id} className={`side-link ${route.name === id ? 'on' : ''}`} onClick={() => go(id)} title={t(label)}>
                  <Icon name={d} fill={route.name === id} /><span className="sl-t">{t(label)}</span>{id === 'cart' && cartCount > 0 && <span className="count">{cartCount}</span>}
                </button>
              ))}
            </div>
            <div className="side-demo">
              {activeOrder && <button className="side-order" onClick={() => go('tracking', { orderId: activeOrder.id })} title={`#${activeOrder.id}`}><Icon name={statusInfo(activeOrder).ms} /><span className="sl-t"> #{activeOrder.id}: {t(statusInfo(activeOrder).t).toLowerCase()}</span></button>}
            </div>
          </nav>
        )}
        {!isDesktop && route.name === 'home' && (
          <header className="mob-top"><Logo />{activeOrder && <button className="side-order sm" onClick={() => go('tracking', { orderId: activeOrder.id })}><Icon name={statusInfo(activeOrder).ms} /> #{activeOrder.id}</button>}</header>
        )}
        {S.pending && (
          <div className={`pending-bar ${net === 'offline' ? 'off' : ''}`} role="status">
            <span><Icon name={net === 'offline' ? 'wifi_off' : 'hourglass_top'} /> {t(net === 'offline' ? 'Нет связи. Заказ сохранён и отправится автоматически' : 'Отправляем заказ…')}</span>
            {net === 'offline' && <button className="link sm" onClick={A.dropPending}>{t('Не отправлять')}</button>}
          </div>
        )}
        <main className="main" ref={mainRef}><div className="screen" key={route.name}>{screen}</div></main>
        {!isDesktop && (
          <nav className={`tabbar ${kbOpen ? 'hide' : ''}`} aria-label={t('Навигация')} style={{ '--n': NAV_MOBILE.length, '--i': Math.max(0, tabIdx) }}>
            <span className={`tab-ind ${tabIdx < 0 ? 'off' : ''}`} aria-hidden="true" />
            {NAV_MOBILE.map(([id, label, d]) => (
              <button key={id} className={`tab ${tab === id ? 'on' : ''} ${id === 'builder' ? 'tab-build' : ''}`} onClick={() => { if (tab !== id) haptic('select'); hist.current = []; setRoute({ name: id, params: {} }); }} aria-current={tab === id ? 'page' : undefined}>
                <span className="tab-ico"><Icon name={d} fill={tab === id} />{id === 'cart' && cartCount > 0 && <span className="count" key={cartCount}>{cartCount}</span>}</span>
                <span className="tab-t">{t(label)}</span>
              </button>
            ))}
          </nav>
        )}

        <SaveModal open={saveOpen} onClose={() => setSaveOpen(false)} onSave={A.saveRecipe} st={currentSt} defaultName={S.saved.find((x) => x.id === S.editingId)?.name} />
        <Sheet open={!!savedResult} onClose={() => setSavedResult(null)} title={t('Рецепт сохранён')}>
          {savedResult && (
            <div className="saved-result">
              <RecipeCard r={savedResult} big />
              <div className="sr-btns">
                <button className="btn primary block lg" onClick={() => { A.addCurrentToCart(); setSavedResult(null); }}>{t('Добавить в корзину')}</button>
                <div className="row2">
                  <button className="btn outline" onClick={() => { const r = savedResult; setSavedResult(null); setShare(r); }}>{t('Поделиться')}</button>
                  <button className="btn outline" onClick={() => { setSavedResult(null); go('saved'); }}>{t('Мои бургеры')}</button>
                </div>
              </div>
            </div>
          )}
        </Sheet>
        <ShareModal recipe={share} onClose={() => setShare(null)} toast={toast} />
        {product && <ProductSheet p={PROD[product.id] || product} onClose={() => setProduct(null)} />}
        <Sheet open={install} onClose={() => setInstall(false)} title={t('BurgerLab на домашнем экране')}>
          <div className="install">
            <p><b>iPhone (Safari):</b> {t('нажми «Поделиться» внизу экрана и выбери «На экран „Домой“».')}</p>
            <p><b>Android (Chrome):</b> {t('открой меню ⋮ и выбери «Установить приложение» или «Добавить на главный экран».')}</p>
          </div>
        </Sheet>
        <MonsterPop m={monster} onClose={() => setMonster(null)} />
        <Confetti run={confetti} />
        <Toasts items={toasts} />
      </div>
    </AppCtx.Provider>
  );
}

// Старт: язык, меню, цены и стоп-лист (с сервера или из кэша), затем интерфейс
async function boot() {
  initTelegram();
  setupPWA();
  try { setLang(JSON.parse(localStorage.getItem(KEY) || '{}').lang || langFromCode(tgUser()?.language_code || navigator.language)); } catch { setLang('ru'); }
  try { applyConfig(JSON.parse(localStorage.getItem(CFG_KEY) || 'null')); } catch { /* нет кэша */ }
  await fetchConfig();
  createRoot(document.getElementById('root')).render(<App />);
}
boot();
