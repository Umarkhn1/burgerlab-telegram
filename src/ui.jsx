import React, { useEffect, useRef, useState } from 'react';
import { BurgerStack } from './visuals.jsx';
import { toLayers } from './calc.js';

// Иконка Material Symbols (список — src/icons.js). Не-латинское имя (старые эмодзи из меню) выводится как текст.
export function Icon({ name, fill = false, className = '', label }) {
  if (!name) return null;
  if (!/^[a-z0-9_]+$/.test(name)) return <span className={`ms-text ${className}`} aria-hidden="true">{name}</span>;
  return <span className={`ms ${fill ? 'fill' : ''} ${className}`} aria-hidden={label ? undefined : 'true'} aria-label={label} role={label ? 'img' : undefined}>{name}</span>;
}

export function useAnimated(value, dur = 420) {
  const [v, setV] = useState(value);
  const cur = useRef(value);
  useEffect(() => {
    const a = cur.current, b = value;
    if (a === b) return;
    const start = performance.now();
    let raf;
    const step = (t) => {
      const p = Math.min(1, (t - start) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      cur.current = a + (b - a) * e;
      setV(cur.current);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return v;
}

export function Num({ value, format }) {
  const v = useAnimated(value);
  return <>{format(v)}</>;
}

export function Sheet({ open, onClose, children, title, wide = false, className = '' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="overlay" onClick={onClose} role="presentation">
      <div className={`sheet ${wide ? 'sheet-wide' : ''} ${className}`} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        {title && (
          <div className="sheet-head">
            <h3>{title}</h3>
            <button className="icon-btn" onClick={onClose} aria-label="Закрыть"><Icon name="close" /></button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export function Toasts({ items }) {
  return (
    <div className="toasts" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.tone || ''}`}>{t.text}</div>
      ))}
    </div>
  );
}

export function Confetti({ run }) {
  const [pieces, setPieces] = useState([]);
  useEffect(() => {
    if (!run) return;
    const colors = ['#FF5A00', '#000000', '#F5A20F', '#19A35A', '#F5EDE2', '#E0352B'];
    setPieces(Array.from({ length: 90 }, (_, i) => ({
      id: `${run}-${i}`,
      left: Math.random() * 100,
      delay: Math.random() * 0.4,
      dur: 1.6 + Math.random() * 1.4,
      rot: Math.random() * 720 - 360,
      drift: (Math.random() - 0.5) * 160,
      c: colors[i % colors.length],
      w: 6 + Math.random() * 6,
      round: Math.random() < 0.3,
    })));
    const t = setTimeout(() => setPieces([]), 3400);
    return () => clearTimeout(t);
  }, [run]);
  if (!pieces.length) return null;
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p) => (
        <i key={p.id} style={{
          left: `${p.left}%`, background: p.c, width: p.w, height: p.round ? p.w : p.w * 1.6,
          borderRadius: p.round ? '50%' : 2, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`,
          '--rot': `${p.rot}deg`, '--drift': `${p.drift}px`,
        }} />
      ))}
    </div>
  );
}

export function MiniBurger({ keys, layers, h = 140, w = 150 }) {
  const ls = layers || toLayersMemo(keys);
  return <BurgerStack layers={ls} maxH={h} maxW={w} maxScale={0.6} animate={false} />;
}
const cache = new Map();
function toLayersMemo(keys) {
  const k = keys.join('|');
  if (!cache.has(k)) cache.set(k, toLayers(keys));
  return cache.get(k);
}

export function Stepper({ qty, onMinus, onPlus, disabled, label }) {
  return (
    <div className={`stepper ${qty > 0 ? 'on' : ''}`}>
      <button onClick={onMinus} disabled={qty === 0 || disabled} aria-label={`Убрать: ${label}`}><Icon name="remove" /></button>
      <span className="qty" aria-live="polite">{qty}</span>
      <button onClick={onPlus} disabled={disabled} aria-label={`Добавить: ${label}`}><Icon name="add" /></button>
    </div>
  );
}

export function Empty({ icon, title, text, action }) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon name={icon} /></div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function ScreenHead({ title, sub, onBack, right }) {
  return (
    <header className="screen-head">
      {onBack && <button className="icon-btn back" onClick={onBack} aria-label="Назад"><Icon name="arrow_back" /></button>}
      <div className="sh-text">
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {right}
    </header>
  );
}
