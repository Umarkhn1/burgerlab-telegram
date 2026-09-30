import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from './ctx.js';
import { COMMUNITY, COMMUNITY_FILTERS, CHALLENGES, PARTY, SIZE_PRESETS, STOP, SETTINGS } from './data.js';
import { stats, toLayers, fmtPrice, fmtWeight, fmtKcal, fmtCm, parseKey, challengeProgress, plural, partyOption, statusInfo } from './calc.js';
import { BurgerStack, PartyBurgerArt } from './visuals.jsx';
import { inTelegram, haptic, getThemePref, setThemePref } from './telegram.js';
import { MiniBurger, Empty, ScreenHead, Icon } from './ui.jsx';
import { TypeBadge } from './builder.jsx';

export function composition(keys, max = 4) {
  const c = {};
  for (const k of keys) {
    const { ing, role } = parseKey(k);
    if (!ing || role) continue;
    c[ing.id] = c[ing.id] || { ing, n: 0 };
    c[ing.id].n++;
  }
  const arr = Object.values(c).sort((a, b) => b.n - a.n || b.ing.price - a.ing.price);
  const txt = arr.slice(0, max).map(({ ing, n }) => (n > 1 ? `${n}× ${ing.short || ing.name}` : ing.short || ing.name)).join(', ');
  return arr.length > max ? `${txt} и ещё ${arr.length - max}` : txt;
}

const HERO_SETS = [SIZE_PRESETS[2].layers, SIZE_PRESETS[3].layers, COMMUNITY[0].layers];

function HeroBurger() {
  const [i, setI] = useState(0);
  const [layers, setLayers] = useState(() => toLayers(HERO_SETS[0]));
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % HERO_SETS.length), 6500);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { if (i > 0 || layers.length === 0) setLayers(toLayers(HERO_SETS[i])); }, [i]);
  const st = stats(layers);
  return (
    <div className="hero-art">
      <div className="hero-disc" />
      <BurgerStack key={i} layers={layers} maxH={420} maxW={Math.min(340, (typeof window !== "undefined" ? window.innerWidth : 390) - 64)} maxScale={1.15} intro />
      <div className="hero-tag">
        <b>{fmtPrice(st.total)}</b>
        <span>{fmtWeight(st.weight)} · {fmtCm(st.cm)}</span>
      </div>
    </div>
  );
}

const BENEFITS = [
  { t: 'Собери сам', d: 'Полный контроль над каждым слоем.', i: 'science' },
  { t: 'Любой размер', d: 'От мини-бургера до giant burger.', i: 'straighten' },
  { t: 'Цена сразу', d: 'Стоимость меняется в реальном времени.', i: 'bolt' },
  { t: 'Сохрани рецепт', d: 'Любимый бургер — в один тап снова.', i: 'bookmark' },
  { t: 'Поделись', d: 'Отправь ссылку на бургер друзьям.', i: 'share' },
];

export function Home() {
  const { A } = useApp();
  const top = [...COMMUNITY].sort((a, b) => b.likes - a.likes).slice(0, 6);
  return (
    <div className="page home">
      <section className="hero">
        <div className="hero-text">
          <div className="brand-mark">BurgerLab — твой бургер. Твои правила.</div>
          <h1>Собери бургер, который существует только у тебя</h1>
          <p className="lead">Выбирай ингредиенты, меняй количество, создавай любой размер и заказывай свою собственную комбинацию.</p>
          <div className="hero-cta">
            <button className="btn primary lg" onClick={() => A.go('builder')}>Собрать бургер</button>
            <button className="btn outline lg" onClick={() => A.go('community')}>Посмотреть популярные</button>
          </div>
        </div>
        <HeroBurger />
      </section>

      <section className="benefits" aria-label="Преимущества">
        {BENEFITS.map((b) => (
          <div key={b.t} className="benefit">
            <span className="b-ico" aria-hidden="true"><Icon name={b.i} /></span>
            <div><h3>{b.t}</h3><p>{b.d}</p></div>
          </div>
        ))}
      </section>

      <section className="surprise">
        <div>
          <h2>Не знаешь, с чего начать?</h2>
          <p>Лаборатория соберёт случайный бургер за секунду. Понравится — оставь, нет — жми ещё.</p>
        </div>
        <button className="btn primary lg" onClick={() => { A.go('builder'); setTimeout(A.randomize, 250); }}><Icon name="casino" /> Удиви меня</button>
      </section>

      <section className="block">
        <div className="block-head">
          <h2>Сейчас собирают</h2>
          <button className="link" onClick={() => A.go('community')}>Все бургеры</button>
        </div>
        <div className="h-scroll">
          {top.map((b) => <CommunityCard key={b.id} b={b} compact />)}
        </div>
      </section>

      <section className="party-teaser" onClick={() => A.go('party')} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && A.go('party')}>
        <div className="pt-text">
          <h2>Party Burger</h2>
          <p>Один бургер на всю компанию: от 2 до 15 человек и больше.</p>
          <span className="btn primary">Выбрать размер</span>
        </div>
        <div className="pt-art"><PartyBurgerArt len={70} height={110} /></div>
      </section>

      <section className="block">
        <div className="block-head">
          <h2>Burger Challenge</h2>
          <button className="link" onClick={() => A.go('challenges')}>Все челленджи</button>
        </div>
        <div className="h-scroll">
          {CHALLENGES.map((c) => (
            <button key={c.id} className="mini-ch" onClick={() => A.go('challenges')}>
              <span className="mc-i"><Icon name={c.icon} /></span>
              <b>{c.title}</b>
              <span>{c.goal}</span>
            </button>
          ))}
        </div>
      </section>

      {!inTelegram && (
        <section className="demo-links">
          <h2>Для партнёров и инвесторов</h2>
          <p>Посмотри, как заказ проходит через кухню и что видит владелец ресторана.</p>
          <div className="dl-row">
            <button className="btn outline" onClick={() => A.go('kitchen')}>Экран кухни</button>
            <button className="btn outline" onClick={() => A.go('admin')}>Админ-панель</button>
          </div>
        </section>
      )}
    </div>
  );
}

export function CommunityCard({ b, compact = false, mine = false }) {
  const { S, A } = useApp();
  const st = useMemo(() => stats(toLayers(b.layers)), [b.layers]);
  const liked = !!S.likes[b.id];
  const likes = b.likes + (liked ? 1 : 0);
  return (
    <article className={`c-card ${compact ? 'compact' : ''}`}>
      <div className="c-art">
        <MiniBurger keys={b.layers} h={compact ? 150 : 180} w={compact ? 150 : 180} />
        <span className="c-type"><TypeBadge weight={st.weight} /></span>
      </div>
      <div className="c-body">
        <h3>{b.name}</h3>
        <div className="c-author">{mine ? 'Твой рецепт' : `${b.author}, ${b.city}`}</div>
        {!compact && <p className="c-comp">{composition(b.layers)}</p>}
        <div className="c-foot">
          <b className="c-price">{fmtPrice(st.total)}</b>
          <button className={`like ${liked ? 'on' : ''}`} onClick={() => A.toggleLike(b.id)} aria-pressed={liked} aria-label="Нравится">
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-9-9a4.8 4.8 0 0 1 9-3 4.8 4.8 0 0 1 9 3c-2 4.6-9 9-9 9Z" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" /></svg>
            {likes.toLocaleString('ru-RU')}
          </button>
        </div>
        <button className="btn dark block sm" onClick={() => A.loadRecipe(b, false)}>Собрать такой же</button>
      </div>
    </article>
  );
}

export function Community() {
  const { S } = useApp();
  const [f, setF] = useState('popular');
  const mine = S.saved.map((s) => ({ ...s, likes: 0, city: '', mine: true }));
  const list = useMemo(() => {
    const all = [...COMMUNITY, ...mine].map((b) => ({ b, st: stats(toLayers(b.layers)) }));
    const key = { popular: (x) => x.b.likes, cheese: (x) => x.st.cheese, meat: (x) => x.st.meat, hot: (x) => x.st.hot, big: (x) => x.st.weight, expensive: (x) => x.st.total }[f];
    return all.sort((a, b) => key(b) - key(a) || b.b.likes - a.b.likes);
  }, [f, S.saved]);
  return (
    <div className="page">
      <ScreenHead title="Burger Community" sub="Бургеры, которые собрали другие. Нравится — собери такой же и измени под себя." />
      <div className="chips wrap-mob">
        {COMMUNITY_FILTERS.map((x) => (
          <button key={x.id} className={`chip ${f === x.id ? 'active' : ''}`} onClick={() => setF(x.id)}><Icon name={x.icon} />{x.label}</button>
        ))}
      </div>
      <div className="c-grid">
        {list.map(({ b }) => <CommunityCard key={b.id} b={b} mine={b.mine} />)}
      </div>
    </div>
  );
}

export function Challenges() {
  const { S, A } = useApp();
  const st = stats(S.layers);
  return (
    <div className="page">
      <ScreenHead title="Burger Challenge" sub="Выполни условие, сохрани рецепт — и бейдж твой. Прогресс считается по бургеру в конструкторе." onBack={() => A.back()} />
      <div className="ch-grid">
        {CHALLENGES.map((c) => {
          const p = challengeProgress(st, c.id);
          const pct = Math.min(100, (p / c.target) * 100);
          const got = S.badges[c.id];
          return (
            <article key={c.id} className={`ch-card ${got ? 'got' : ''}`}>
              <div className="ch-top">
                <span className="ch-ico"><Icon name={c.icon} /></span>
                {got ? <span className="badge-got">Бейдж получен</span> : <span className="muted-t">Текущий бургер</span>}
              </div>
              <h3>{c.title}</h3>
              <p>{c.goal}</p>
              <div className="bar"><i style={{ width: `${pct}%` }} /></div>
              <div className="ch-prog">{Math.round(p).toLocaleString('ru-RU')} / {c.target.toLocaleString('ru-RU')} {c.unit}</div>
              <button className={`btn ${got ? 'outline' : 'primary'} block`} onClick={() => A.startChallenge(c.id)}>{got ? 'Собрать ещё' : 'Принять вызов'}</button>
            </article>
          );
        })}
      </div>
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
          <span>{fmtWeight(st.weight)}</span>
          <span>{fmtKcal(st.kcal)}</span>
          <span>{st.count} {plural(st.count, 'ингредиент', 'ингредиента', 'ингредиентов')}</span>
        </div>
        <div className="s-actions">
          <button className="btn primary sm" onClick={() => A.orderAgain(r)}>Заказать снова</button>
          <button className="btn outline sm" onClick={() => A.editSaved(r)}>Редактировать</button>
          <button className="btn outline sm" onClick={() => A.openShare(r)}>Поделиться</button>
          <button className="icon-btn sm" onClick={() => A.deleteSaved(r.id)} aria-label={`Удалить рецепт ${r.name}`} title="Удалить">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
      </div>
    </article>
  );
}

export function MyBurgers() {
  const { S, A } = useApp();
  return (
    <div className="page">
      <ScreenHead title="Мои бургеры" sub={S.saved.length ? `${S.saved.length} ${plural(S.saved.length, 'рецепт', 'рецепта', 'рецептов')}` : null} onBack={() => A.back()} />
      {S.saved.length === 0 ? (
        <Empty icon="bookmark" title="Здесь будут твои рецепты" text="Собери бургер и нажми «Сохранить рецепт» — он появится здесь, и его можно будет заказать снова в один тап." action={<button className="btn primary" onClick={() => A.go('builder')}>Собрать бургер</button>} />
      ) : (
        <div className="s-list">{S.saved.map((r) => <SavedCard key={r.id} r={r} />)}</div>
      )}
    </div>
  );
}

export function Party() {
  const { A } = useApp();
  const list = PARTY.filter((p) => !p.hidden);
  const [sel, setSel] = useState(() => (list.find((p) => p.id === 'p4') || list[0])?.id || 'custom');
  const [custom, setCustom] = useState(8);
  const opt = sel === 'custom' || !list.find((p) => p.id === sel) ? partyOption(custom) : PARTY.find((p) => p.id === sel);
  const out = STOP.party || STOP[opt.id];
  return (
    <div className="page">
      <ScreenHead title="Party Burger" sub="Один большой бургер на всю компанию. Режем на порции прямо на кухне." onBack={() => A.back()} />
      <div className="party-grid">
        {list.map((p) => (
          <button key={p.id} className={`party-opt ${sel === p.id ? 'on' : ''}`} onClick={() => setSel(p.id)} aria-pressed={sel === p.id} disabled={!!STOP[p.id]}>
            <b>{p.people}</b>
            <span>{plural(p.people, 'человек', 'человека', 'человек')}</span>
            <small>от {fmtPrice(p.price)}</small>
          </button>
        ))}
        {SETTINGS.partyCustom && (
          <button className={`party-opt ${opt.id === 'custom' ? 'on' : ''}`} onClick={() => setSel('custom')} aria-pressed={opt.id === 'custom'}>
            <b>…</b><span>Custom</span><small>любое число</small>
          </button>
        )}
      </div>
      <section className="party-show">
        <PartyBurgerArt len={opt.len} height={170} />
        {opt.id === 'custom' && (
          <label className="range">
            <span>Гостей: <b>{custom}</b></span>
            <input type="range" min="2" max="30" value={custom} onChange={(e) => setCustom(+e.target.value)} />
          </label>
        )}
        <div className="party-facts">
          <div><span>Размер</span><b>Party {opt.people}</b></div>
          <div><span>Вес</span><b>~{fmtWeight(opt.weight)}</b></div>
          <div><span>Длина</span><b>~{opt.len} см</b></div>
          <div><span>Цена</span><b>от {fmtPrice(opt.price)}</b></div>
        </div>
        <p className="hint">Внутри: говяжьи котлеты, чеддер, бекон, свежие овощи и BurgerLab Sauce. Подаётся на деревянной доске, нарезан на {opt.people * 2} порций.</p>
        <div className="party-cta">
          <button className="btn primary lg" onClick={() => A.addParty(opt)} disabled={!!out}>{out ? 'Сейчас недоступен' : 'Добавить в корзину'}</button>
          <button className="btn outline lg" onClick={() => A.loadRecipe({ name: `Party ${opt.people}`, layers: SIZE_PRESETS[4].layers }, false)}>Собрать свой вариант</button>
        </div>
      </section>
    </div>
  );
}

export function Profile() {
  const { S, A } = useApp();
  const [name, setName] = useState(S.profile.name);
  const [theme, setTheme] = useState(getThemePref);
  const pickTheme = (t) => { haptic('select'); setTheme(t); setThemePref(t); };
  return (
    <div className="page">
      <ScreenHead title="Профиль" />
      <section className="profile-card">
        <div className="avatar" aria-hidden="true">{(S.profile.name || 'B')[0].toUpperCase()}</div>
        <label className="field grow">
          <span>Имя автора на карточках</span>
          <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => A.setProfile({ name: name.trim() || 'Гость' })} />
        </label>
      </section>
      <div className="p-stats">
        <div><b>{S.saved.length}</b><span>рецептов</span></div>
        <div><b>{S.orders.length}</b><span>заказов</span></div>
        <div><b>{Object.keys(S.badges).length}</b><span>бейджей</span></div>
      </div>

      <h2 className="sec-title">Оформление</h2>
      <div className="seg theme-seg" role="radiogroup" aria-label="Тема">
        {[['auto', 'contrast', 'Авто'], ['light', 'light_mode', 'Светлая'], ['dark', 'dark_mode', 'Тёмная']].map(([id, icon, t]) => (
          <button key={id} role="radio" aria-checked={theme === id} className={theme === id ? 'on' : ''} onClick={() => pickTheme(id)}><Icon name={icon} fill={theme === id} />{t}</button>
        ))}
      </div>

      <h2 className="sec-title">Бейджи</h2>
      <div className="badges">
        {CHALLENGES.map((c) => (
          <div key={c.id} className={`badge ${S.badges[c.id] ? 'on' : ''}`} title={c.goal}>
            <span><Icon name={c.icon} /></span><small>{c.title}</small>
          </div>
        ))}
      </div>

      {S.orders.length > 0 && (
        <>
          <h2 className="sec-title">Заказы</h2>
          <div className="order-list">
            {[...S.orders].reverse().map((o) => (
              <button key={o.id} className="order-row" onClick={() => A.go('tracking', { orderId: o.id })}>
                <span><b>Заказ #{o.id}</b><small>{o.items.map((i) => i.name).join(', ')}</small></span>
                <span className={`status ${o.status === 'done' ? 'ok' : ''}`}>{statusInfo(o).t}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <h2 className="sec-title">Разделы</h2>
      <div className="menu-list">
        <button onClick={() => A.go('saved')}><span><Icon name="bookmark" /> Мои бургеры</span><small>{S.saved.length}</small></button>
        <button onClick={() => A.go('challenges')}><span><Icon name="emoji_events" /> Challenges</span><small>{Object.keys(S.badges).length}/{CHALLENGES.length}</small></button>
        <button onClick={() => A.go('party')}><span><Icon name="celebration" /> Party Burger</span><small>2–15+ гостей</small></button>
        {!inTelegram && <button onClick={() => A.go('kitchen')}><span><Icon name="soup_kitchen" /> Экран кухни</span><small>демо</small></button>}
        {!inTelegram && <button onClick={() => A.go('admin')}><span><Icon name="bar_chart" /> Админ-панель</span><small>демо</small></button>}
        {!inTelegram && <button onClick={A.installHint}><span><Icon name="install_mobile" /> Установить на телефон</span><small>PWA</small></button>}
        {inTelegram && S.profile.admin && (S.profile.staffRole === 'cashier'
          ? <button onClick={() => A.go('panel')}><span><Icon name="point_of_sale" /> Касса</span><small>заказы, стоп-лист</small></button>
          : <button onClick={() => A.go('panel')}><span><Icon name="admin_panel_settings" /> Админ-панель</span><small>касса, меню, отчёты</small></button>)}
        <button className="danger" onClick={A.resetDemo}><span><Icon name="refresh" /> {inTelegram ? 'Очистить данные на устройстве' : 'Сбросить демо-данные'}</span><small>{inTelegram ? 'корзина, рецепты, бейджи' : 'корзина, рецепты, заказы'}</small></button>
      </div>
    </div>
  );
}
