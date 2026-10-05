import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from './ctx.js';
import { SIZE_PRESETS, STOP, SETTINGS, PRODUCTS, PRODUCT_CATS } from './data.js';
import { stats, toLayers, fmtPrice, fmtWeight, fmtKcal, fmtCm, statusInfo, productInfo, approx, cutletsSum } from './calc.js';
import { BurgerStack, ProductArt } from './visuals.jsx';
import { inTelegram, haptic, getThemePref, setThemePref, CONFIG, shareToTelegram } from './telegram.js';
import { t, tn, nm, LANGS, getLang } from './i18n.js';
import { MiniBurger, Empty, ScreenHead, Icon, Sheet, Stepper } from './ui.jsx';
import { TypeBadge } from './builder.jsx';

export const visibleProducts = () => PRODUCTS.filter((p) => !p.hidden && PRODUCT_CATS.some((c) => c.id === p.cat && !c.hidden));

// ── Главная: бургеры сменяют друг друга по кругу ──
// Собранный бургер уходит по дуге влево, справа выезжает следующий и собирается по слоям.
function heroSlides() {
  const presets = SIZE_PRESETS.filter((p) => p.layers).map((p) => ({ k: p.id, name: p.name, keys: p.layers, preset: p.id }));
  const hits = visibleProducts().filter((p) => p.keys?.length && p.hit).map((p) => ({ k: p.id, name: nm(p), keys: p.keys, product: p }));
  return [...presets, ...hits];
}

function HeroCarousel() {
  const { A } = useApp();
  const slides = useMemo(heroSlides, [getLang()]);
  const [i, setI] = useState(0);
  const [prev, setPrev] = useState(null);
  useEffect(() => {
    const tm = setInterval(() => {
      setI((v) => { setPrev(v); return (v + 1) % slides.length; });
    }, 4200);
    return () => clearInterval(tm);
  }, [slides.length]);
  useEffect(() => { if (prev == null) return; const tm = setTimeout(() => setPrev(null), 750); return () => clearTimeout(tm); }, [prev]);
  const cur = slides[i] || slides[0];
  const st = stats(toLayers(cur.keys));
  const price = cur.product ? cur.product.price : st.total;
  const w = Math.min(320, (typeof window !== 'undefined' ? window.innerWidth : 390) - 80);
  const open = () => (cur.product ? A.openProduct(cur.product) : A.applySizeAndGo(cur.preset));
  return (
    <div className="hero-art hc" onClick={open} role="button" tabIndex={0} aria-label={cur.name}>
      <div className="hero-disc" />
      {prev != null && slides[prev] && (
        <div className="hc-slot leave" key={`out-${slides[prev].k}-${prev}`}>
          <BurgerStack layers={toLayers(slides[prev].keys)} maxH={260} maxW={w} maxScale={1.1} animate={false} />
        </div>
      )}
      <div className="hc-slot enter" key={`in-${cur.k}-${i}`}>
        <BurgerStack layers={toLayers(cur.keys)} maxH={260} maxW={w} maxScale={1.1} intro />
      </div>
      <div className="hero-tag" key={`tag-${cur.k}`}>
        <b>{cur.name}</b>
        <span>{fmtPrice(price)} · {approx(fmtWeight(st.weight))}</span>
      </div>
      <div className="hc-dots" aria-hidden="true">{slides.map((s, n) => <i key={s.k} className={n === i ? 'on' : ''} />)}</div>
    </div>
  );
}

export function Home() {
  const { S, A } = useApp();
  const hits = visibleProducts().filter((p) => p.hit);
  const R = SETTINGS.referral || {};
  return (
    <div className="page home">
      <section className="hero">
        <HeroCarousel />
        <div className="hero-text">
          <div className="brand-mark">{t('BurgerLab — твой бургер. Твои правила.')}</div>
          <h1>{t('Собери бургер, который существует только у тебя')}</h1>
          <div className="hero-cta">
            <button className="btn primary lg" onClick={() => A.go('builder')}><Icon name="lunch_dining" /> {t('Собрать свой')}</button>
            <button className="btn outline lg" onClick={() => A.go('menu')}><Icon name="restaurant_menu" /> {t('Меню')}</button>
          </div>
        </div>
      </section>

      {hits.length > 0 && (
        <section className="block">
          <div className="block-head">
            <h2><Icon name="local_fire_department" fill /> {t('Хит продаж')}</h2>
            <button className="link" onClick={() => A.go('menu', { cat: 'hit' })}>{t('Всё меню')}</button>
          </div>
          <div className="h-scroll">{hits.map((p) => <ProductCard key={p.id} p={p} compact />)}</div>
        </section>
      )}

      {inTelegram && R.enabled && (R.inviterBonus > 0 || R.inviteeBonus > 0) && (
        <section className="ref-banner" onClick={() => A.go('profile', { focus: 'invite' })} role="button" tabIndex={0}>
          <span className="rb-ico"><Icon name="redeem" fill /></span>
          <div>
            <b>{t('Пригласи друга — получи {n} котлеток', { n: R.inviterBonus })}</b>
            <span>{t('1 котлетка = {sum}. Ими можно оплатить часть заказа', { sum: fmtPrice(R.rate) })}</span>
          </div>
          <Icon name="chevron_right" />
        </section>
      )}
      {S.profile.cutlets > 0 && <p className="fine center">{t('На твоём счёте {n} котлеток', { n: S.profile.cutlets })} · ≈ {fmtPrice(cutletsSum(S.profile.cutlets))}</p>}
    </div>
  );
}

// ── Меню ──
const cartQty = (S, id) => S.cart.filter((c) => (c.kind === 'product' || c.kind === 'extra') && c.id === id).reduce((s, c) => s + c.qty, 0);

export function ProductCard({ p, compact = false }) {
  const { S, A } = useApp();
  const out = !!STOP[p.id];
  const info = productInfo(p);
  const qty = cartQty(S, p.id);
  return (
    <article className={`p-card ${compact ? 'compact' : ''} ${out ? 'out' : ''}`}>
      <button className="p-art" onClick={() => A.openProduct(p)} aria-label={nm(p)}>
        <ProductArt p={p} size={compact ? 110 : 120} />
        {p.hit && <span className="p-hit"><Icon name="local_fire_department" fill />{t('Хит')}</span>}
        {p.spicy && <span className="p-spicy" title={t('Можно острым')}>🌶</span>}
      </button>
      <div className="p-body">
        <h3>{nm(p)}</h3>
        {!compact && nm(p, 'note') && <p className="p-note">{nm(p, 'note')}</p>}
        {(info.w > 0 || info.kcal > 0) && <div className="p-meta">{info.w > 0 && approx(fmtWeight(info.w))}{info.w > 0 && info.kcal > 0 && ' · '}{info.kcal > 0 && approx(fmtKcal(info.kcal))}</div>}
        <div className="p-foot">
          <b>{fmtPrice(p.price)}</b>
          {out ? <span className="p-out">{t('Нет в наличии')}</span>
            : qty > 0 && !p.spicy ? <Stepper qty={qty} label={nm(p)} onMinus={() => A.productQty(p.id, -1)} onPlus={() => A.addProduct(p)} />
              : <button className="btn primary sm p-add" onClick={() => (p.spicy ? A.openProduct(p) : A.addProduct(p))} aria-label={t('В корзину')}><Icon name="add" />{qty > 0 ? qty : ''}</button>}
        </div>
      </div>
    </article>
  );
}

// Карточка товара: описание, острота, количество
export function ProductSheet({ p, onClose }) {
  const { A } = useApp();
  const [spicy, setSpicy] = useState(false);
  const [qty, setQty] = useState(1);
  useEffect(() => { setSpicy(false); setQty(1); }, [p?.id]);
  if (!p) return null;
  const info = productInfo(p);
  const out = !!STOP[p.id];
  return (
    <Sheet open onClose={onClose} title={nm(p)}>
      <div className="ps">
        <div className="ps-art"><ProductArt p={p} size={190} /></div>
        {nm(p, 'note') && <p className="ps-note">{nm(p, 'note')}</p>}
        {(info.w > 0 || info.kcal > 0) && (
          <div className="ps-facts">
            {info.w > 0 && <span><b>{approx(fmtWeight(info.w))}</b>{t('вес')}</span>}
            {info.kcal > 0 && <span><b>{approx(fmtKcal(info.kcal))}</b>{t('калории')}</span>}
            {p.keys?.length > 0 && <span><b>{approx(fmtCm(stats(toLayers(p.keys)).cm))}</b>{t('высота')}</span>}
          </div>
        )}
        {p.spicy && (
          <div className="seg" role="radiogroup" aria-label={t('Острота')}>
            <button role="radio" aria-checked={!spicy} className={!spicy ? 'on' : ''} onClick={() => setSpicy(false)}>{t('Не острый')}</button>
            <button role="radio" aria-checked={spicy} className={spicy ? 'on' : ''} onClick={() => { haptic('select'); setSpicy(true); }}>🌶 {t('Острый')}</button>
          </div>
        )}
        <div className="ps-buy">
          <Stepper qty={qty} label={nm(p)} onMinus={() => setQty((q) => Math.max(1, q - 1))} onPlus={() => setQty((q) => Math.min(20, q + 1))} />
          <button className="btn primary lg" disabled={out} onClick={() => { A.addProduct(p, { spicy, qty }); onClose(); }}>{out ? t('Нет в наличии') : `${t('В корзину')} · ${fmtPrice(p.price * qty)}`}</button>
        </div>
        {p.keys?.length > 0 && <button className="btn ghost block" onClick={() => { onClose(); A.loadRecipe({ name: nm(p), layers: p.keys }, false); }}><Icon name="tune" /> {t('Изменить состав в конструкторе')}</button>}
      </div>
    </Sheet>
  );
}

export function Menu({ initialCat }) {
  const list = visibleProducts();
  const cats = [...(list.some((p) => p.hit) ? [{ id: 'hit', icon: 'local_fire_department' }] : []), ...PRODUCT_CATS.filter((c) => !c.hidden && list.some((p) => p.cat === c.id))];
  const [cat, setCat] = useState(cats.some((c) => c.id === initialCat) ? initialCat : cats[0]?.id);
  const shown = cat === 'hit' ? list.filter((p) => p.hit) : list.filter((p) => p.cat === cat);
  return (
    <div className="page">
      <ScreenHead title={t('Меню')} sub={t('Готовые бургеры, хот-доги, ПП-сеты, закуски, соусы и напитки')} />
      <div className="chips menu-chips" role="tablist">
        {cats.map((c) => (
          <button key={c.id} role="tab" aria-selected={cat === c.id} className={`chip ${cat === c.id ? 'active' : ''}`} onClick={() => setCat(c.id)}><Icon name={c.icon} fill={c.id === 'hit'} />{c.id === 'hit' ? t('Хит продаж') : nm(c)}</button>
        ))}
      </div>
      {shown.length ? <div className="p-grid">{shown.map((p) => <ProductCard key={p.id} p={p} />)}</div>
        : <Empty icon="restaurant_menu" title={t('Здесь пока пусто')} text={t('Загляни в другой раздел меню')} />}
    </div>
  );
}

export function SavedCard({ r }) {
  const { A } = useApp();
  const st = useMemo(() => stats(toLayers(r.layers)), [r.layers]);
  return (
    <article className="s-card">
      <div className="s-art"><MiniBurger keys={r.layers} h={150} w={140} /></div>
      <div className="s-body">
        <div className="s-title"><h3>{r.name}</h3><TypeBadge weight={st.weight} /></div>
        <div className="s-stats">
          <span><b>{fmtPrice(st.total)}</b></span>
          <span>{approx(fmtWeight(st.weight))}</span>
          <span>{approx(fmtKcal(st.kcal))}</span>
        </div>
        <div className="s-actions">
          <button className="btn primary sm" onClick={() => A.orderAgain(r)}>{t('Заказать снова')}</button>
          <button className="btn outline sm" onClick={() => A.editSaved(r)}>{t('Редактировать')}</button>
          <button className="btn outline sm" onClick={() => A.openShare(r)}>{t('Поделиться')}</button>
          <button className="icon-btn sm" onClick={() => A.deleteSaved(r.id)} aria-label={t('Удалить')} title={t('Удалить')}><Icon name="delete" /></button>
        </div>
      </div>
    </article>
  );
}

export function MyBurgers() {
  const { S, A } = useApp();
  return (
    <div className="page">
      <ScreenHead title={t('Мои бургеры')} sub={S.saved.length ? `${S.saved.length} ${tn(S.saved.length, 'рецепт', 'рецепта', 'рецептов', 'retsept')}` : null} onBack={() => A.back()} />
      {S.saved.length === 0 ? (
        <Empty icon="bookmark" title={t('Здесь будут твои рецепты')} text={t('Собери бургер и нажми «Сохранить рецепт» — он появится здесь, и его можно будет заказать снова в один тап.')} action={<button className="btn primary" onClick={() => A.go('builder')}>{t('Собрать бургер')}</button>} />
      ) : (
        <div className="s-list">{S.saved.map((r) => <SavedCard key={r.id} r={r} />)}</div>
      )}
    </div>
  );
}

// ── Котлетки и приглашение друга ──
function InviteCard() {
  const { S, A } = useApp();
  const R = SETTINGS.referral || {};
  const link = CONFIG.botUsername && S.profile.tg ? `https://t.me/${CONFIG.botUsername}?start=ref${S.profile.tg}` : '';
  const text = t('Собери свой бургер в BurgerLab! По моей ссылке после первого заказа получишь {n} котлеток 🍔', { n: R.inviteeBonus });
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); A.toast(t('Ссылка скопирована'), 'ok'); } catch { A.toast(link); }
  };
  const ref = S.profile.referral || { invited: 0, rewarded: 0 };
  return (
    <section className="cutlets" id="invite">
      <div className="ct-top">
        <span className="ct-ico" aria-hidden="true">🍔</span>
        <div>
          <span className="ct-l">{t('Котлетки')}</span>
          <b className="ct-v">{S.profile.cutlets || 0}</b>
          <span className="ct-sum">≈ {fmtPrice(cutletsSum(S.profile.cutlets || 0))}</span>
        </div>
      </div>
      <p className="ct-hint">{t('Котлетками можно оплатить до {p}% заказа. 1 котлетка = {sum}.', { p: R.maxPercent, sum: fmtPrice(R.rate) })}</p>
      {R.enabled && link && (
        <>
          <div className="ct-ref">
            <b>{t('Пригласи друга')}</b>
            <span>{t('Друг получит {a}, а ты {b} котлеток — после его первого заказа.', { a: R.inviteeBonus, b: R.inviterBonus })}</span>
            <small>{t('Приглашено: {n} · уже заказали: {m}', { n: ref.invited, m: ref.rewarded })}</small>
          </div>
          <div className="row2">
            <button className="btn primary" onClick={() => shareToTelegram(link, text)}><Icon name="share" /> {t('Пригласить')}</button>
            <button className="btn outline" onClick={copy}><Icon name="link" /> {t('Ссылка')}</button>
          </div>
        </>
      )}
      {S.profile.cutletLog?.length > 0 && (
        <details className="ct-log">
          <summary>{t('История котлеток')}</summary>
          {S.profile.cutletLog.map((l, n) => <div key={n} className="kv"><span>{t(String(l.reason || '').replace(/ #\d+.*$/, ''))}{l.orderId ? ` · #${l.orderId}` : ''}</span><b className={l.delta > 0 ? 'plus' : ''}>{l.delta > 0 ? '+' : ''}{l.delta}</b></div>)}
        </details>
      )}
    </section>
  );
}

export function Profile({ focus }) {
  const { S, A } = useApp();
  const [name, setName] = useState(S.profile.name);
  const [theme, setTheme] = useState(getThemePref);
  const pickTheme = (v) => { haptic('select'); setTheme(v); setThemePref(v); };
  useEffect(() => { if (focus === 'invite') setTimeout(() => document.getElementById('invite')?.scrollIntoView({ behavior: 'smooth' }), 250); }, [focus]);
  return (
    <div className="page">
      <ScreenHead title={t('Профиль')} />
      <section className="profile-card">
        <div className="avatar" aria-hidden="true">{(S.profile.name || 'B')[0].toUpperCase()}</div>
        <label className="field grow">
          <span>{t('Имя автора на карточках')}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => A.setProfile({ name: name.trim() || t('Гость') })} />
        </label>
      </section>

      {inTelegram && <InviteCard />}

      <h2 className="sec-title">{t('Язык')}</h2>
      <div className="seg" role="radiogroup" aria-label={t('Язык')}>
        {Object.entries(LANGS).map(([id, label]) => <button key={id} role="radio" aria-checked={getLang() === id} className={getLang() === id ? 'on' : ''} onClick={() => A.setLang(id)}>{label}</button>)}
      </div>

      <h2 className="sec-title">{t('Оформление')}</h2>
      <div className="seg theme-seg" role="radiogroup" aria-label={t('Тема')}>
        {[['auto', 'contrast', t('Авто')], ['light', 'light_mode', t('Светлая')], ['dark', 'dark_mode', t('Тёмная')]].map(([id, icon, label]) => (
          <button key={id} role="radio" aria-checked={theme === id} className={theme === id ? 'on' : ''} onClick={() => pickTheme(id)}><Icon name={icon} fill={theme === id} />{label}</button>
        ))}
      </div>

      {S.orders.length > 0 && (
        <>
          <h2 className="sec-title">{t('Заказы')}</h2>
          <div className="order-list">
            {[...S.orders].reverse().map((o) => (
              <button key={o.id} className="order-row" onClick={() => A.go('tracking', { orderId: o.id })}>
                <span><b>{t('Заказ')} #{o.id}</b><small>{o.items.map((i) => nm(i)).join(', ')}</small></span>
                <span className={`status ${o.status === 'done' ? 'ok' : ''}`}>{t(statusInfo(o).t)}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <h2 className="sec-title">{t('Разделы')}</h2>
      <div className="menu-list">
        <button onClick={() => A.go('saved')}><span><Icon name="bookmark" /> {t('Мои бургеры')}</span><small>{S.saved.length}</small></button>
        {inTelegram && S.profile.admin && <button onClick={A.backToPanel}><span><Icon name="admin_panel_settings" /> {t('Вернуться в панель')}</span><small>{t('для сотрудников')}</small></button>}
        {!inTelegram && <button onClick={A.installHint}><span><Icon name="install_mobile" /> {t('Установить на телефон')}</span><small>PWA</small></button>}
        <button className="danger" onClick={A.resetDemo}><span><Icon name="refresh" /> {t(inTelegram ? 'Очистить данные на устройстве' : 'Сбросить данные')}</span><small>{t('корзина и рецепты')}</small></button>
      </div>
    </div>
  );
}
