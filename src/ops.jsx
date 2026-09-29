import React, { useMemo, useState } from 'react';
import { useApp } from './ctx.js';
import { COMMUNITY, INGREDIENTS, MOCK_USERS, SIZE_PRESETS, STATUSES, MODES, CATEGORIES } from './data.js';
import { Icon } from './ui.jsx';
import { stats, toLayers, fmtPrice, fmtWeight, fmtCm, burgerType, layerNameEn, parseKey, isClosed, PACKAGING_CM, MODULE_CM } from './calc.js';

function packagingFor(st) {
  if (st.cm > MODULE_CM) return 'Модульная упаковка (2+ бокса)';
  if (st.cm > PACKAGING_CM) return 'Спецупаковка Tall Box';
  if (st.weight >= 800) return 'Бокс XL';
  return 'Стандартный бокс';
}

function Ticket({ t, onStart, onReady }) {
  const [checked, setChecked] = useState({});
  const toggle = (k) => setChecked((c) => ({ ...c, [k]: !c[k] }));
  return (
    <article className={`ticket st-${t.status}`}>
      <header>
        <b>Заказ #{t.id}</b>
        <span className="t-time">{t.time}</span>
      </header>
      <div className="t-mode">{MODES[t.delivery]?.t || 'Доставка'}{t.live && <span className="live">новый из приложения</span>}</div>
      {t.burgers.map((b, bi) => {
        const st = stats(toLayers(b.keys));
        return (
          <div key={bi} className="t-burger">
            <h4>{b.name}{b.qty > 1 ? ` × ${b.qty}` : ''}</h4>
            <ol className="t-layers">
              {b.keys.map((k, i) => {
                const id = `${bi}-${i}`;
                return (
                  <li key={id}>
                    <button className={checked[id] ? 'on' : ''} onClick={() => toggle(id)} aria-pressed={!!checked[id]}>
                      <span className="tick">{checked[id] ? '✓' : ''}</span>{layerNameEn(k)}
                    </button>
                  </li>
                );
              })}
            </ol>
            <dl className="t-facts">
              <div><dt>Вес</dt><dd>{fmtWeight(st.weight)}</dd></div>
              <div><dt>Размер</dt><dd>{burgerType(st.weight).label} · {fmtCm(st.cm)}</dd></div>
              <div><dt>Упаковка</dt><dd>{packagingFor(st)}</dd></div>
            </dl>
          </div>
        );
      })}
      {t.party.map((p, i) => <div key={i} className="t-burger"><h4>{p.name}</h4><p className="t-note">Party-сборка по техкарте, нарезать на {p.people * 2} порций</p></div>)}
      {t.extras.length > 0 && <p className="t-extras">+ {t.extras.join(', ')}</p>}
      {t.comment && <p className="t-comment">«{t.comment}»</p>}
      <div className="t-btns">
        <button className="btn k-start" disabled={t.status !== 'new'} onClick={onStart}>Начать</button>
        <button className="btn k-ready" disabled={t.status !== 'cooking'} onClick={onReady}>Готов</button>
      </div>
    </article>
  );
}

export function Kitchen() {
  const { S, A } = useApp();
  const live = S.orders.filter((o) => !isClosed(o)).map((o) => ({
    id: o.id,
    time: new Date(o.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
    status: ['created', 'received', 'accepted'].includes(o.status) ? 'new' : o.status === 'cooking' ? 'cooking' : 'ready',
    comment: o.comment, delivery: o.mode, live: true,
    burgers: o.items.filter((i) => i.kind === 'burger').map((i) => ({ name: i.name, keys: i.keys, qty: i.qty })),
    party: o.items.filter((i) => i.kind === 'party'),
    extras: o.items.filter((i) => i.kind === 'extra').map((i) => `${i.name}${i.qty > 1 ? ` × ${i.qty}` : ''}`),
  }));
  const mock = S.kitchenMock.map((m) => ({ ...m, burgers: [{ name: m.name, keys: m.layers, qty: 1 }], party: [], extras: [] }));
  const all = [...live, ...mock];
  const cols = [
    { id: 'new', t: 'Новые' },
    { id: 'cooking', t: 'Готовятся' },
    { id: 'ready', t: 'Готовы' },
  ];
  const act = (t, to) => (t.live ? A.kitchenLive(t.id, to) : A.kitchenMock(t.id, to));
  return (
    <div className="kitchen">
      <header className="k-head">
        <button className="icon-btn back k" onClick={() => A.back()} aria-label="Назад"><Icon name="arrow_back" /></button>
        <div>
          <h1>Кухня · BurgerLab Tashkent City</h1>
          <p>Слои показаны строго сверху вниз — собирай в этом порядке, отмечая каждый.</p>
        </div>
        <div className="k-clock">{new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</div>
      </header>
      <div className="k-cols">
        {cols.map((c) => {
          const items = all.filter((t) => t.status === c.id);
          return (
            <section key={c.id} className="k-col">
              <h2>{c.t} <span>{items.length}</span></h2>
              {items.length === 0 && <div className="k-empty">Пусто</div>}
              {items.map((t) => (
                <Ticket key={`${t.live ? 'l' : 'm'}${t.id}`} t={t} onStart={() => act(t, 'cooking')} onReady={() => act(t, 'ready')} />
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Admin ----------

const MOCK_ORDERS = (() => {
  const names = COMMUNITY.map((c) => c.name);
  const out = [];
  let seed = 7;
  const r = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 40; i++) {
    const c = COMMUNITY[Math.floor(r() * r() * COMMUNITY.length)];
    const h = 11 + Math.floor(r() * 11), m = Math.floor(r() * 60);
    out.push({ id: 4780 + i, name: c.name, keys: c.layers, time: `${h}:${String(m).padStart(2, '0')}`, pay: r() < 0.68 ? 'Карта' : 'Наличные', status: i > 34 ? 'Готовится' : 'Доставлен' });
  }
  return out.sort((a, b) => (a.time < b.time ? 1 : -1));
})();

const HOURLY = [4, 9, 21, 28, 17, 11, 9, 14, 22, 26, 19, 4];
const WEEK = [2.9, 3.4, 3.1, 3.8, 4.6, 6.2, 5.7];

function Bars({ data, labels, fmt, h = 150 }) {
  const max = Math.max(...data);
  return (
    <div className="bars" style={{ height: h }}>
      {data.map((v, i) => (
        <div key={i} className="bar-col" title={`${labels[i]}: ${fmt(v)}`}>
          <span className="bv">{fmt(v)}</span>
          <i style={{ height: `${(v / max) * 100}%` }} />
          <span className="bl">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

export function Admin() {
  const { S, A } = useApp();
  const [tab, setTab] = useState('analytics');
  const real = S.orders;

  const m = useMemo(() => {
    const baseOrders = 184, baseRevenue = 21_476_000;
    const realRev = real.reduce((s, o) => s + o.total, 0);
    const orders = baseOrders + real.length;
    const revenue = baseRevenue + realRev;
    const ingCount = {};
    const burgerCount = {};
    let layersSum = 0, n = 0;
    const all = [...MOCK_ORDERS.map((o) => ({ name: o.name, keys: o.keys })), ...real.flatMap((o) => o.items.filter((i) => i.kind === 'burger').map((i) => ({ name: i.name, keys: i.keys })))];
    for (const o of all) {
      burgerCount[o.name] = (burgerCount[o.name] || 0) + 1;
      layersSum += o.keys.length; n++;
      for (const k of o.keys) {
        const { ing, role } = parseKey(k);
        if (!ing || role) continue;
        ingCount[ing.id] = (ingCount[ing.id] || 0) + 1;
      }
    }
    const topIng = Object.entries(ingCount).sort((a, b) => b[1] - a[1]);
    const topBurger = Object.entries(burgerCount).sort((a, b) => b[1] - a[1])[0];
    return { orders, revenue, avg: revenue / orders, topIng, topBurger, avgLayers: layersSum / n };
  }, [real]);

  const ingName = (id) => INGREDIENTS.find((i) => i.id === id)?.name;
  const tabs = [
    ['orders', 'Заказы'], ['sales', 'Продажи'], ['ingredients', 'Ингредиенты'], ['menu', 'Меню'], ['users', 'Пользователи'], ['analytics', 'Аналитика'],
  ];

  return (
    <div className="page admin">
      <header className="screen-head">
        <button className="icon-btn back" onClick={() => A.back()} aria-label="Назад"><Icon name="arrow_back" /></button>
        <div className="sh-text"><h1>Админ-панель</h1><p>BurgerLab Tashkent City · сегодня</p></div>
      </header>
      <div className="chips admin-tabs" role="tablist">
        {tabs.map(([id, t]) => <button key={id} role="tab" aria-selected={tab === id} className={`chip ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{t}</button>)}
      </div>

      <div className="kpis">
        <div className="kpi"><span>Заказы сегодня</span><b>{m.orders}</b></div>
        <div className="kpi"><span>Выручка</span><b>{fmtPrice(m.revenue)}</b></div>
        <div className="kpi"><span>Средний чек</span><b>{fmtPrice(Math.round(m.avg / 100) * 100)}</b></div>
        <div className="kpi"><span>Популярный ингредиент</span><b>{ingName(m.topIng[0][0])}</b></div>
        <div className="kpi"><span>Популярный бургер</span><b>{m.topBurger[0]}</b></div>
        <div className="kpi"><span>Ингредиентов в бургере</span><b>{m.avgLayers.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}</b></div>
      </div>

      {tab === 'analytics' && (
        <div className="admin-grid">
          <section className="panel">
            <h3>Заказы по часам</h3>
            <Bars data={HOURLY} labels={HOURLY.map((_, i) => `${11 + i}`)} fmt={(v) => v} />
          </section>
          <section className="panel">
            <h3>Топ ингредиентов</h3>
            <div className="hbars">
              {m.topIng.slice(0, 7).map(([id, c]) => (
                <div key={id} className="hbar"><span>{ingName(id)}</span><i style={{ width: `${(c / m.topIng[0][1]) * 100}%` }} /><b>{c}</b></div>
              ))}
            </div>
          </section>
          <section className="panel">
            <h3>Размеры бургеров</h3>
            <div className="hbars">
              {[['Standard', 22], ['Big', 41], ['XL', 24], ['Giant', 10], ['Party / Monster', 3]].map(([k, v]) => (
                <div key={k} className="hbar"><span>{k}</span><i style={{ width: `${(v / 41) * 100}%` }} /><b>{v}%</b></div>
              ))}
            </div>
          </section>
          <section className="panel">
            <h3>Воронка конструктора</h3>
            <div className="hbars">
              {[['Открыли конструктор', 100], ['Добавили ингредиент', 86], ['Сохранили рецепт', 38], ['Поделились', 17], ['Заказали', 29]].map(([k, v]) => (
                <div key={k} className="hbar"><span>{k}</span><i style={{ width: `${v}%` }} /><b>{v}%</b></div>
              ))}
            </div>
          </section>
        </div>
      )}

      {tab === 'orders' && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>#</th><th>Время</th><th>Бургер</th><th>Сумма</th><th>Оплата</th><th>Статус</th></tr></thead>
            <tbody>
              {[...real].reverse().map((o) => (
                <tr key={'r' + o.id} className="hl"><td>{o.id}</td><td>{new Date(o.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</td><td>{o.items.map((i) => i.name).join(', ')}</td><td>{fmtPrice(o.total)}</td><td>{o.payment === 'card' ? 'Карта' : 'Наличные'}</td><td>{STATUSES[o.status].t}</td></tr>
              ))}
              {MOCK_ORDERS.map((o) => (
                <tr key={o.id}><td>{o.id}</td><td>{o.time}</td><td>{o.name}</td><td>{fmtPrice(stats(toLayers(o.keys)).total)}</td><td>{o.pay}</td><td>{o.status}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'sales' && (
        <div className="admin-grid">
          <section className="panel wide">
            <h3>Выручка за неделю, млн сум</h3>
            <Bars data={WEEK} labels={['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']} fmt={(v) => v.toLocaleString('ru-RU')} h={190} />
          </section>
          <section className="panel">
            <h3>Способы оплаты</h3>
            <div className="hbars">
              <div className="hbar"><span>Карта</span><i style={{ width: '68%' }} /><b>68%</b></div>
              <div className="hbar"><span>Наличные</span><i style={{ width: '32%' }} /><b>32%</b></div>
            </div>
          </section>
          <section className="panel">
            <h3>Допродажи в корзине</h3>
            <div className="hbars">
              {[['Картофель фри', 44], ['Лимонад', 37], ['Соус к фри', 21], ['Чизкейк', 12]].map(([k, v]) => (
                <div key={k} className="hbar"><span>{k}</span><i style={{ width: `${(v / 44) * 100}%` }} /><b>{v}%</b></div>
              ))}
            </div>
          </section>
        </div>
      )}

      {tab === 'ingredients' && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Ингредиент</th><th>Категория</th><th>Цена</th><th>Вес</th><th>Ккал</th><th>В наличии</th></tr></thead>
            <tbody>
              {INGREDIENTS.map((i) => (
                <tr key={i.id}>
                  <td>{i.name}</td><td>{CATEGORIES.find((c) => c.id === i.cat).name}</td><td>{fmtPrice(i.price)}</td><td>{i.w} г</td><td>{i.kcal}</td>
                  <td>
                    <button className={`switch ${S.stock[i.id] === false ? '' : 'on'}`} role="switch" aria-checked={S.stock[i.id] !== false} aria-label={`${i.name} в наличии`} onClick={() => A.toggleStock(i.id)}><i /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="fine">Выключи ингредиент — он сразу станет недоступен в конструкторе.</p>
        </div>
      )}

      {tab === 'menu' && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Позиция</th><th>Тип</th><th>Слоёв</th><th>Вес</th><th>Цена</th></tr></thead>
            <tbody>
              {SIZE_PRESETS.filter((p) => p.layers).map((p) => {
                const st = stats(toLayers(p.layers));
                return <tr key={p.id}><td>Шаблон {p.name}</td><td>{burgerType(st.weight).label}</td><td>{st.count}</td><td>{fmtWeight(st.weight)}</td><td>{fmtPrice(st.total)}</td></tr>;
              })}
              {COMMUNITY.map((c) => {
                const st = stats(toLayers(c.layers));
                return <tr key={c.id}><td>{c.name}</td><td>{burgerType(st.weight).label}</td><td>{st.count}</td><td>{fmtWeight(st.weight)}</td><td>{fmtPrice(st.total)}</td></tr>;
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'users' && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Пользователь</th><th>Телефон</th><th>Заказов</th><th>Потратил</th><th>Любимый бургер</th></tr></thead>
            <tbody>
              {MOCK_USERS.map((u) => <tr key={u.phone}><td>{u.name}</td><td>{u.phone}</td><td>{u.orders}</td><td>{fmtPrice(u.spent)}</td><td>{u.fav}</td></tr>)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
