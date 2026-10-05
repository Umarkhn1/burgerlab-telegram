import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from './ctx.js';
import { CATEGORIES, INGREDIENTS, ING, SIZE_PRESETS } from './data.js';
import { stats, burgerType, fmtPrice, fmtWeight, fmtKcal, fmtCm, parseKey, layerLabel, layerMetrics, PACKAGING_CM, MODULE_CM, isStopped, checkBurger, approx } from './calc.js';
import { t, tn, nm } from './i18n.js';
import { BurgerStack, IngredientThumb } from './visuals.jsx';
import { Num, Stepper, Sheet, Icon } from './ui.jsx';

export function TypeBadge({ weight, big = false }) {
  const t = burgerType(weight);
  return <span className={`type-badge tone-${t.tone} ${big ? 'big' : ''}`}>{t.tone === 'fire' && <Icon name="local_fire_department" fill />}{t.label}</span>;
}

function StatsRow({ st }) {
  return (
    <div className="stats-row">
      <div className="stat main">
        <span className="stat-v"><Num value={st.total} format={fmtPrice} /></span>
        <span className="stat-l">{t('Цена')}</span>
      </div>
      <div className="stat">
        <span className="stat-v"><Num value={st.weight} format={(v) => approx(fmtWeight(v))} /></span>
        <span className="stat-l">{t('Вес')}</span>
      </div>
      <div className="stat">
        <span className="stat-v"><Num value={st.kcal} format={(v) => approx(fmtKcal(v))} /></span>
        <span className="stat-l">{t('Калории')}</span>
      </div>
      <div className="stat">
        <span className="stat-v"><Num value={st.cm} format={(v) => approx(fmtCm(Math.round(v * 10) / 10))} /></span>
        <span className="stat-l">{t('Высота')}</span>
      </div>
    </div>
  );
}

function SizeChips() {
  const { S, A } = useApp();
  return (
    <div className="chips size-chips" role="radiogroup" aria-label={t('Размер')}>
      {SIZE_PRESETS.map((p) => (
        <button key={p.id} role="radio" aria-checked={S.sizeId === p.id} className={`chip ${S.sizeId === p.id ? 'active' : ''}`} onClick={() => A.applySize(p.id)}>
          {p.name}
        </button>
      ))}
    </div>
  );
}

function Warnings({ st }) {
  const { S } = useApp();
  const errs = st.count ? checkBurger(S.layers.filter((l) => !l.hidden).map((l) => l.key)) : [];
  if (st.cm <= PACKAGING_CM && st.weight < 1500 && !errs.length) return null;
  return (
    <div className="warnings">
      {errs.map((e) => <div key={e} className="warn limit"><b>{t(e)}</b><span>{t('Исправь состав, чтобы добавить бургер в корзину')}</span></div>)}
      {st.cm > PACKAGING_CM && (
        <div className="warn"><b>{t('Нужна специальная упаковка')}</b><span>+{fmtPrice(st.packaging)} — {t('бургер выше {cm} см', { cm: PACKAGING_CM })}</span></div>
      )}
      {st.cm > MODULE_CM && (
        <div className="warn"><b><Icon name="warning" /> {t('Бургер выше {cm} см', { cm: MODULE_CM })}</b><span>{t('Кухня может разделить его на несколько модулей для безопасной доставки')}</span></div>
      )}
      {st.weight >= 3000 && (
        <div className="warn fire"><b>{t('Это настоящий монстр')}</b><span>{t('Такой бургер рассчитан на компанию. Сборка займёт около 25 минут.')}</span></div>
      )}
    </div>
  );
}

export function useLayerCounts(layers) {
  return useMemo(() => {
    const c = {};
    for (const l of layers) {
      const { ing, role } = parseKey(l.key);
      if (!ing) continue;
      if (role && role !== 'mid') continue;
      c[ing.id] = (c[ing.id] || 0) + 1;
    }
    return c;
  }, [layers]);
}

function IngredientCard({ ing, qty, currentBun }) {
  const { S, A } = useApp();
  const out = isStopped(ing.id);
  const isBun = ing.cat === 'bun';
  const selected = isBun && currentBun === ing.id;
  return (
    <div className={`ing-card ${qty > 0 || selected ? 'has' : ''} ${out ? 'out' : ''}`}>
      <button className="ing-hit" onClick={() => (isBun ? A.setBun(ing.id) : A.addIng(ing.id))} disabled={out} aria-label={nm(ing)}>
        <div className="ing-thumb"><IngredientThumb ing={ing} size={isBun ? 70 : 56} /></div>
        <div className="ing-name">{nm(ing)}</div>
        <div className="ing-meta">{approx(fmtWeight(ing.w))} · {approx(fmtKcal(ing.kcal))}{ing.hot > 0 && <span className="hot"> · {Array.from({ length: Math.min(3, Math.ceil(ing.hot / 2)) }, (_, i) => <Icon key={i} name="local_fire_department" fill />)}</span>}</div>
        <div className="ing-price">{fmtPrice(ing.price)}</div>
      </button>
      {out ? <div className="ing-out">{t('Нет в наличии')}</div> : isBun ? (
        <div className="bun-row">
          <span className={`pill ${selected ? 'pill-on' : ''}`}>{selected ? t('Выбрана') : t('Выбрать')}</span>
          <Stepper qty={qty} label={nm(ing)} onMinus={() => A.removeIng(ing.id)} onPlus={() => A.addIng(ing.id)} />
        </div>
      ) : (
        <Stepper qty={qty} label={nm(ing)} onMinus={() => A.removeIng(ing.id)} onPlus={() => A.addIng(ing.id)} />
      )}
    </div>
  );
}

function IngredientPanel({ cat: wanted, setCat, counts, currentBun, vertical }) {
  // Скрытые в админке категории и позиции не показываем
  const cats = CATEGORIES.filter((c) => !c.hidden);
  const cat = cats.some((c) => c.id === wanted) ? wanted : cats[0]?.id;
  const list = INGREDIENTS.filter((i) => i.cat === cat && !i.hidden && !i.deleted);
  return (
    <>
      <div className={`chips cat-chips ${vertical ? 'vertical' : ''}`} role="tablist" aria-label={t('Категории')}>
        {cats.map((c) => {
          const n = INGREDIENTS.filter((i) => i.cat === c.id).reduce((s, i) => s + (counts[i.id] || 0), 0);
          return (
            <button key={c.id} role="tab" aria-selected={cat === c.id} className={`chip cat ${cat === c.id ? 'active' : ''}`} onClick={() => setCat(c.id)}>
              <span className="cat-ico"><Icon name={c.icon} /></span>{nm(c)}{n > 0 && <span className="cat-n">{n}</span>}
            </button>
          );
        })}
      </div>
      {cat === 'bun' && <p className="hint">{t('Нажми на булочку, чтобы заменить верх и низ. «+» добавляет среднюю булочку, как в клубном бургере.')}</p>}
      <div className="ing-grid">
        {list.map((ing) => <IngredientCard key={ing.id} ing={ing} qty={counts[ing.id] || 0} currentBun={currentBun} />)}
      </div>
    </>
  );
}

// Drag-and-drop список слоёв на pointer events (мышь + палец), плюс клавиатура
function SortableList({ items, onMove, renderRow, rowH = 60 }) {
  const [drag, setDrag] = useState(null);
  const startY = useRef(0);
  const clamp = (v) => Math.max(0, Math.min(items.length - 1, v));
  const target = drag ? clamp(drag.from + Math.round(drag.dy / rowH)) : -1;

  const handleProps = (i) => ({
    onPointerDown: (e) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      startY.current = e.clientY;
      setDrag({ from: i, dy: 0 });
    },
    onPointerMove: (e) => {
      if (!drag) return;
      setDrag((d) => d && { ...d, dy: e.clientY - startY.current });
    },
    onPointerUp: () => {
      if (!drag) return;
      if (target !== drag.from) onMove(drag.from, target);
      setDrag(null);
    },
    onPointerCancel: () => setDrag(null),
    onKeyDown: (e) => {
      if (e.key === 'ArrowUp' && i > 0) { e.preventDefault(); onMove(i, i - 1); }
      if (e.key === 'ArrowDown' && i < items.length - 1) { e.preventDefault(); onMove(i, i + 1); }
    },
  });

  return (
    <ol className="layer-list" style={{ '--row': `${rowH}px` }}>
      {items.map((it, i) => {
        let ty = 0;
        if (drag) {
          if (i === drag.from) ty = drag.dy;
          else if (drag.from < i && i <= target) ty = -rowH;
          else if (target <= i && i < drag.from) ty = rowH;
        }
        return (
          <li key={it.uid} className={`layer-row ${drag && i === drag.from ? 'dragging' : ''} ${it.hidden ? 'hidden' : ''}`} style={{ transform: `translateY(${ty}px)` }}>
            {renderRow(it, i, handleProps(i))}
          </li>
        );
      })}
    </ol>
  );
}

function LayerList() {
  const { S, A } = useApp();
  const [replace, setReplace] = useState(null);
  const rep = replace && S.layers.find((l) => l.uid === replace);
  const repInfo = rep && parseKey(rep.key);
  return (
    <>
      <SortableList
        items={S.layers}
        onMove={A.moveLayer}
        renderRow={(l, i, hp) => {
          const { ing } = parseKey(l.key);
          const m = layerMetrics(l.key);
          return (
            <>
              <button className="drag-handle" {...hp} aria-label={layerLabel(l.key)}>
                <svg width="14" height="18" viewBox="0 0 14 18" aria-hidden="true">{[3, 9, 15].map((y) => [4, 10].map((x) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.6" fill="currentColor" />))}</svg>
              </button>
              <span className="layer-n">{i + 1}</span>
              <span className="layer-sw"><IngredientThumb ing={ing} size={26} /></span>
              <span className="layer-txt">
                <span className="layer-name">{layerLabel(l.key)}</span>
                <span className="layer-sub">{approx(fmtWeight(m.w))} · {fmtPrice(m.price)}</span>
              </span>
              <span className="layer-actions">
                <button className="icon-btn sm" onClick={() => A.toggleHide(l.uid)} aria-label={l.hidden ? t('Показать') : t('Скрыть')} title={l.hidden ? t('Показать') : t('Скрыть')}>
                  {l.hidden ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 9 6 9 6a15 15 0 0 1-3.2 3.7M6.3 7.8C4.2 9.4 3 12 3 12s4 6 9 6a8.6 8.6 0 0 0 3.6-.8" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" /></svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12s4-6 9-6 9 6 9 6-4 6-9 6-9-6-9-6Z" stroke="currentColor" strokeWidth="1.8" fill="none" /><circle cx="12" cy="12" r="2.6" fill="currentColor" /></svg>
                  )}
                </button>
                <button className="icon-btn sm" onClick={() => setReplace(l.uid)} aria-label={t('Заменить')} title={t('Заменить')}>
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h13l-3-3M20 16H7l3 3" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                <button className="icon-btn sm" onClick={() => A.removeLayer(l.uid)} aria-label={t('Удалить')} title={t('Удалить')}>
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                </button>
              </span>
            </>
          );
        }}
      />
      <Sheet open={!!rep} onClose={() => setReplace(null)} title={t('Заменить на')}>
        {repInfo && (
          <div className="replace-grid">
            {INGREDIENTS.filter((i) => i.cat === repInfo.ing.cat && !i.hidden && !i.deleted).map((ing) => (
              <button key={ing.id} className={`replace-item ${ing.id === repInfo.ing.id ? 'current' : ''}`} disabled={isStopped(ing.id)}
                onClick={() => { A.replaceLayer(rep.uid, repInfo.role ? `${repInfo.role}:${ing.id}` : ing.id); setReplace(null); }}>
                <IngredientThumb ing={ing} size={48} />
                <span>{nm(ing)}</span>
                <small>{fmtPrice(repInfo.role ? ing.price / 2 : ing.price)}</small>
              </button>
            ))}
          </div>
        )}
      </Sheet>
    </>
  );
}

function ActionRow() {
  const { A } = useApp();
  return (
    <div className="action-row">
      <button className="btn ghost" onClick={A.randomize}><Icon name="casino" /> {t('Удиви меня')}</button>
      <button className="btn ghost" onClick={A.openSave}>{t('Сохранить рецепт')}</button>
      <button className="btn ghost" onClick={() => A.openShare()}>{t('Поделиться')}</button>
      <button className="btn ghost muted" onClick={A.reset}>{t('Начать заново')}</button>
    </div>
  );
}

// Бургер из корзины открыт на правку — кнопка обновляет ту же позицию
const cartLabel = (S) => t(S.editingCid && S.cart.some((c) => c.cid === S.editingCid) ? 'Обновить в корзине' : 'Добавить в корзину');

function CartBar({ st }) {
  const { A, S } = useApp();
  return (
    <div className="cart-bar">
      <div className="cb-price">
        <span className="cb-v"><Num value={st.total} format={fmtPrice} /></span>
        <span className="cb-l">{st.count} {tn(st.count, 'слой', 'слоя', 'слоёв', 'qatlam')} · {approx(fmtWeight(st.weight))}</span>
      </div>
      <button className="btn primary" onClick={A.addCurrentToCart} disabled={st.count === 0}>{cartLabel(S)}</button>
    </div>
  );
}

function useMonsterWatch(st) {
  const { A } = useApp();
  const prev = useRef(st);
  useEffect(() => {
    const p = prev.current;
    if (p.weight < 1500 && st.weight >= 1500) A.monster('monster', st);
    else if (p.weight < 3000 && st.weight >= 3000) A.monster('mega', st);
    else if (p.cm <= PACKAGING_CM && st.cm > PACKAGING_CM && st.weight < 1500) A.monster('tall', st);
    prev.current = st;
  }, [st.weight, st.cm]);
}

export default function Builder() {
  const { S, A, isDesktop, cfgRev } = useApp();
  const st = useMemo(() => stats(S.layers), [S.layers, cfgRev]);
  const [cat, setCat] = useState('meat');
  const [tab, setTab] = useState('ing');
  // Компактная сцена при прокрутке панели. Анимируется только transform (без пересчёта раскладки
  // и перерисовки слоёв), а гистерезис 8/48 px не даёт сцене дёргаться туда-обратно на границе.
  const [compact, setCompact] = useState(false);
  const compactRef = useRef(false);
  const onPanelScroll = (e) => {
    const y = e.currentTarget.scrollTop;
    const next = compactRef.current ? y > 8 : y > 48;
    if (next !== compactRef.current) { compactRef.current = next; setCompact(next); }
  };
  const counts = useLayerCounts(S.layers);
  const currentBun = S.layers.map((l) => parseKey(l.key)).find((p) => p.role === 'top' || p.role === 'bottom')?.ing.id;
  useMonsterWatch(st);

  const stageRef = useRef(null);
  const [stageSize, setStageSize] = useState({ w: 320, h: 300 });
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setStageSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [isDesktop]);

  const title = S.editingId ? S.saved.find((s) => s.id === S.editingId)?.name : null;

  const stage = (
    <div className="stage-card">
      <div className="stage-top">
        <SizeChips />
      </div>
      <div className="stage" ref={stageRef}>
        <div className="stage-badges">
          <TypeBadge weight={st.weight} />
          {title && <span className="editing"><Icon name="edit" /> {title}</span>}
        </div>
        <div className="stack-zoom">
          <BurgerStack layers={S.layers} maxH={Math.max(120, stageSize.h)} maxW={Math.min(stageSize.w - 90, isDesktop ? 460 : 320)} maxScale={isDesktop ? 1.6 : 1.05} ruler cm={st.cm} />
        </div>
      </div>
      <StatsRow st={st} />
    </div>
  );

  if (isDesktop) {
    return (
      <div className="builder desk">
        <aside className="b-left">
          <h2 className="col-title">{t('Ингредиенты')}</h2>
          <IngredientPanel cat={cat} setCat={setCat} counts={counts} currentBun={currentBun} vertical={false} />
        </aside>
        <section className="b-center">
          {stage}
          <ActionRow />
        </section>
        <aside className="b-right">
          <div className="col-head">
            <h2 className="col-title">{t('Состав сверху вниз')}</h2>
            <span className="muted-t">{st.count} {tn(st.count, 'слой', 'слоя', 'слоёв', 'qatlam')}</span>
          </div>
          <p className="hint">{t('Перетаскивай слои за ручку, чтобы поменять порядок.')}</p>
          <LayerList />
          <Warnings st={st} />
          <div className="summary">
            <div className="sum-line"><span>{t('Ингредиенты')}</span><b>{fmtPrice(st.price)}</b></div>
            {st.packaging > 0 && <div className="sum-line"><span>{t('Спецупаковка')}</span><b>{fmtPrice(st.packaging)}</b></div>}
            <div className="sum-line total"><span>{t('Итого')}</span><b><Num value={st.total} format={fmtPrice} /></b></div>
            <button className="btn primary block" onClick={A.addCurrentToCart} disabled={st.count === 0}>{cartLabel(S)}</button>
          </div>
        </aside>
      </div>
    );
  }

  // Насколько сжимается сцена: панель и цифры поднимаются на shift, бургер уменьшается в zoom раз
  const shift = Math.round(Math.max(120, stageSize.h) * 0.42);
  const zoom = (Math.max(120, stageSize.h) - shift) / Math.max(120, stageSize.h);
  return (
    <div className={`builder mob ${compact ? 'is-compact' : ''}`} style={{ '--shift': `${shift}px`, '--zoom': zoom }}>
      {stage}
      <div className="b-panel" onScroll={onPanelScroll}>
        <div className="seg" role="tablist">
          <button role="tab" aria-selected={tab === 'ing'} className={tab === 'ing' ? 'on' : ''} onClick={() => setTab('ing')}>{t('Ингредиенты')}</button>
          <button role="tab" aria-selected={tab === 'layers'} className={tab === 'layers' ? 'on' : ''} onClick={() => setTab('layers')}>{t('Слои')} · {S.layers.length}</button>
        </div>
        {tab === 'ing' ? (
          <IngredientPanel cat={cat} setCat={setCat} counts={counts} currentBun={currentBun} />
        ) : (
          <>
            <p className="hint">{t('Слои сверху вниз. Потяни за ручку, чтобы поменять порядок.')}</p>
            <LayerList />
          </>
        )}
        <Warnings st={st} />
        <ActionRow />
      </div>
      <CartBar st={st} />
    </div>
  );
}
