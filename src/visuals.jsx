import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { parseKey } from './calc.js';

// Детерминированный псевдорандом для текстур
const rng = (seed) => () => {
  seed = (seed * 9301 + 49297) % 233280;
  return seed / 233280;
};

// Высота слоя (px при ширине 300) и нахлёст на слой выше
export function layerBox(key) {
  const { ing, role } = parseKey(key);
  if (!ing) return { h: 10, o: 0 };
  if (role === 'top') return { h: 80, o: 0 };
  if (role === 'bottom') return { h: 36, o: 3 };
  if (role === 'mid') return { h: 28, o: 3 };
  const map = {
    patty: [30, 3], crispy: [32, 3], smash: [17, 2], wagyu: [32, 3], cheese: [8, 3], sauce: [6, 3],
    tomato: [14, 3], onion: [9, 3], pickles: [9, 3], rings: [8, 3], lettuce: [14, 5], avocado: [13, 3],
    mushroom: [11, 3], caramel: [9, 3], pepper: [10, 3], bacon: [12, 3], egg: [17, 3], orings: [21, 3],
    fries: [22, 4], hash: [17, 3], pineapple: [14, 3], pastrami: [15, 3], crumbs: [9, 3], nachos: [14, 3],
    poppers: [19, 3], mac: [21, 3],
  };
  const [h, o] = map[ing.vis] || [12, 3];
  return { h, o };
}

function Grad({ id, a, b, dir = 'v' }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2={dir === 'h' ? '1' : '0'} y2={dir === 'h' ? '0' : '1'}>
      <stop offset="0" stopColor={a} />
      <stop offset="1" stopColor={b} />
    </linearGradient>
  );
}

export function LayerShape({ layerKey, gid }) {
  const { ing, role } = parseKey(layerKey);
  if (!ing) return null;
  const { h } = layerBox(layerKey);
  const r = rng(ing.id.length * 97 + ing.id.charCodeAt(0));
  const G = `url(#${gid})`;

  if (role === 'top') {
    const seeds = [];
    if (ing.seeds !== 'none') {
      const rr = rng(11);
      for (let i = 0; i < 26; i++) {
        const x = 40 + rr() * 220, y = 16 + rr() * 44;
        const dx = (x - 150) / 150;
        if (y < 30 - 20 * (1 - dx * dx) + 8) continue;
        seeds.push(<ellipse key={i} cx={x} cy={y} rx="4" ry="2" transform={`rotate(${rr() * 80 - 40} ${x} ${y})`} fill={ing.seeds} opacity=".95" />);
      }
    }
    return (
      <>
        <defs><Grad id={gid} a={ing.c2} b={ing.c} /></defs>
        <path d="M6 76 C6 26 62 3 150 3 C238 3 294 26 294 76 Q150 86 6 76 Z" fill={G} />
        <path d="M6 76 Q150 86 294 76 L292 72 Q150 80 8 72 Z" fill="#000" opacity=".12" />
        <ellipse cx="96" cy="24" rx="46" ry="11" fill="#fff" opacity=".22" transform="rotate(-12 96 24)" />
        {seeds}
      </>
    );
  }
  if (role === 'bottom') {
    return (
      <>
        <defs><Grad id={gid} a={ing.c2} b={ing.c} /></defs>
        <path d="M6 5 Q150 -1 294 5 L291 20 Q287 35 262 35 L38 35 Q13 35 9 20 Z" fill={G} />
        <path d="M6 5 Q150 -1 294 5 Q150 13 6 5 Z" fill={ing.id === 'charcoal' ? '#4A4442' : '#F4D9A6'} />
      </>
    );
  }
  if (role === 'mid') {
    return (
      <>
        <defs><Grad id={gid} a={ing.c2} b={ing.c} /></defs>
        <rect x="8" y="3" width="284" height="23" rx="10" fill={G} />
        <path d="M8 6 Q150 0 292 6 Q150 12 8 6Z" fill={ing.id === 'charcoal' ? '#4A4442' : '#F4D9A6'} />
        <path d="M10 22 Q150 28 290 22 L290 24 Q150 30 10 24Z" fill={ing.id === 'charcoal' ? '#4A4442' : '#F4D9A6'} opacity=".8" />
      </>
    );
  }

  switch (ing.vis) {
    case 'patty':
    case 'wagyu': {
      const dots = [];
      for (let i = 0; i < 34; i++) dots.push(<ellipse key={i} cx={20 + r() * 260} cy={6 + r() * (h - 12)} rx={1 + r() * 2.2} ry={0.8 + r()} fill="#000" opacity={0.15 + r() * 0.2} />);
      const marb = ing.vis === 'wagyu' ? [0, 1, 2, 3, 4].map((i) => (
        <path key={'m' + i} d={`M${30 + i * 55} ${8 + (i % 2) * 6} q14 6 30 -2 t26 5`} stroke="#F2C7B2" strokeWidth="1.6" fill="none" opacity=".7" />
      )) : null;
      return (
        <>
          <defs><Grad id={gid} a={ing.c2} b={ing.c} /></defs>
          <path d={`M10 9 Q12 2 34 2 L266 2 Q290 2 292 11 L294 ${h - 10} Q290 ${h - 1} 268 ${h - 1} L32 ${h - 1} Q10 ${h - 1} 7 ${h - 10} Z`} fill={G} />
          <path d={`M14 4 Q150 -2 286 4`} stroke="#fff" strokeOpacity=".14" strokeWidth="2" fill="none" />
          {dots}{marb}
        </>
      );
    }
    case 'crispy': {
      const bumps = [];
      for (let x = 12; x < 290; x += 11) bumps.push(<circle key={x} cx={x} cy={3 + r() * 3} r={5 + r() * 2} fill={ing.c2} />);
      for (let x = 16; x < 288; x += 13) bumps.push(<circle key={'b' + x} cx={x} cy={h - 4 - r() * 3} r={4 + r() * 2} fill={ing.c} />);
      return (
        <>
          <defs><Grad id={gid} a={ing.c2} b={ing.c} /></defs>
          {bumps}
          <rect x="6" y="3" width="288" height={h - 6} rx="12" fill={G} />
          {Array.from({ length: 22 }, (_, i) => <circle key={'c' + i} cx={16 + r() * 268} cy={7 + r() * (h - 14)} r={1.4 + r()} fill="#fff" opacity=".25" />)}
        </>
      );
    }
    case 'smash': {
      let d = 'M0 9';
      for (let x = 0; x <= 300; x += 10) d += ` L${x} ${3 + r() * 3}`;
      d += ` L300 ${h - 2}`;
      for (let x = 300; x >= 0; x -= 10) d += ` L${x} ${h - 3 - r() * 3}`;
      d += ' Z';
      return (
        <>
          <defs><Grad id={gid} a={ing.c2} b={ing.c} /></defs>
          <path d={d} fill={G} />
          <path d={`M-4 ${h / 2} q8 -6 14 0 M290 ${h / 2} q8 -6 14 2`} stroke={ing.c} strokeWidth="4" strokeLinecap="round" fill="none" />
        </>
      );
    }
    case 'cheese': {
      const d = 'M2 0 H298 L292 8 L262 8 L256 22 Q253 27 250 22 L244 8 L176 8 L171 16 Q168 20 165 16 L160 8 L96 8 L88 26 Q84 31 80 26 L72 8 L30 8 L26 14 Q24 17 22 14 L18 8 L8 8 Z';
      return (
        <>
          <defs><Grad id={gid} a={ing.c2} b={ing.c} /></defs>
          <path d={d} fill={G} />
          {ing.spots && Array.from({ length: 9 }, (_, i) => <ellipse key={i} cx={20 + r() * 260} cy={2 + r() * 5} rx={3 + r() * 3} ry={1.4} fill={ing.spots} opacity=".8" />)}
        </>
      );
    }
    case 'sauce': {
      const drips = [40, 92, 150, 205, 258].map((x, i) => {
        const len = 5 + ((i * 7) % 9);
        return <path key={i} d={`M${x - 5} 4 Q${x - 4} ${4 + len} ${x} ${5 + len} Q${x + 4} ${4 + len} ${x + 5} 4 Z`} fill={ing.c} />;
      });
      return (
        <>
          <path d="M12 1 Q150 -3 288 1 L290 5 Q150 9 10 5 Z" fill={ing.c} />
          {drips}
          <path d="M40 2 Q120 0 180 2" stroke="#fff" strokeOpacity=".35" strokeWidth="1.2" fill="none" />
        </>
      );
    }
    case 'tomato':
      return (
        <>
          {[14, 110, 204].map((x, i) => (
            <g key={i}>
              <rect x={x} y={1} width="86" height={h - 2} rx="6" fill={ing.c} />
              <rect x={x + 7} y={3.5} width="72" height={h - 7} rx="4" fill={ing.c2} />
              {[18, 38, 58].map((sx) => <ellipse key={sx} cx={x + sx} cy={h / 2} rx="4" ry="2" fill="#FFE0A8" />)}
            </g>
          ))}
        </>
      );
    case 'onion':
      return (
        <>
          {[20, 70, 118, 170, 220, 262].map((x, i) => (
            <ellipse key={i} cx={x + 14} cy={h / 2} rx={28 + (i % 2) * 6} ry={h / 2 - 1} fill={ing.c2} stroke={ing.c} strokeWidth="2.5" opacity=".95" />
          ))}
        </>
      );
    case 'pickles':
      return (
        <>
          {[26, 80, 136, 190, 246, 278].map((x, i) => (
            <g key={i}>
              <ellipse cx={x} cy={h / 2} rx="27" ry={h / 2} fill={ing.c} />
              <ellipse cx={x} cy={h / 2} rx="20" ry={h / 2 - 2} fill={ing.c2} />
            </g>
          ))}
        </>
      );
    case 'rings':
      return (
        <>
          {Array.from({ length: 9 }, (_, i) => (
            <ellipse key={i} cx={24 + i * 32} cy={h / 2} rx="17" ry={h / 2 - 1} fill={ing.c2} stroke={ing.c} strokeWidth="2.5" />
          ))}
        </>
      );
    case 'lettuce': {
      let top = 'M-6 8', bot = '';
      for (let x = -6; x <= 306; x += 16) top += ` Q${x + 8} ${-2 + r() * 4} ${x + 16} ${6 + r() * 3}`;
      for (let x = 306; x >= -6; x -= 16) bot += ` Q${x - 8} ${h + 4 + r() * 4} ${x - 16} ${h - 2 + r() * 2}`;
      return (
        <>
          <defs><Grad id={gid} a={ing.c2} b={ing.c} /></defs>
          <path d={`${top} L306 ${h}${bot} Z`} fill={G} />
          {[40, 100, 170, 240].map((x) => <path key={x} d={`M${x} 4 q6 ${h / 2} -2 ${h}`} stroke="#E8F7C8" strokeOpacity=".6" strokeWidth="1.4" fill="none" />)}
        </>
      );
    }
    case 'avocado':
      return (
        <>
          {[18, 84, 150, 216].map((x, i) => (
            <g key={i}>
              <path d={`M${x} ${h - 1} Q${x + 33} ${-6} ${x + 70} ${h - 1} Z`} fill="#3E5F1B" />
              <path d={`M${x + 4} ${h - 1} Q${x + 33} ${-2} ${x + 66} ${h - 1} Z`} fill={ing.c2} />
            </g>
          ))}
        </>
      );
    case 'mushroom':
      return (
        <>
          {[16, 72, 128, 184, 240].map((x, i) => (
            <g key={i}>
              <path d={`M${x} ${h - 1} Q${x} 0 ${x + 26} 0 Q${x + 52} 0 ${x + 52} ${h - 1} Z`} fill={ing.c} />
              <path d={`M${x + 5} ${h - 1} Q${x + 6} 3 ${x + 26} 3 Q${x + 46} 3 ${x + 47} ${h - 1} Z`} fill={ing.c2} />
              <rect x={x + 20} y={4} width="12" height={h - 5} fill={ing.c2} stroke={ing.c} strokeWidth=".8" />
            </g>
          ))}
        </>
      );
    case 'caramel':
      return (
        <>
          {Array.from({ length: 7 }, (_, i) => {
            const y = 2 + (i % 3) * 2.6, x = 10 + i * 4;
            return <path key={i} d={`M${x} ${y} q20 6 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t30 0`} stroke={i % 2 ? ing.c : ing.c2} strokeWidth="3" strokeLinecap="round" fill="none" />;
          })}
        </>
      );
    case 'pepper':
      return (
        <>
          {Array.from({ length: 8 }, (_, i) => (
            <rect key={i} x={12 + i * 35} y={1 + (i % 2) * 1.5} width="36" height={h - 3} rx={(h - 3) / 2} fill={i % 3 === 1 ? ing.c2 : ing.c} />
          ))}
        </>
      );
    case 'bacon':
      return (
        <>
          <path d={`M6 5 q18 -8 36 0 t36 0 t36 0 t36 0 t36 0 t36 0 t36 0 t36 0`} stroke={ing.c} strokeWidth="8" strokeLinecap="round" fill="none" />
          <path d={`M6 5 q18 -8 36 0 t36 0 t36 0 t36 0 t36 0 t36 0 t36 0 t36 0`} stroke={ing.c2} strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d={`M14 ${h - 3} q18 -7 36 0 t36 0 t36 0 t36 0 t36 0 t36 0 t36 0 t30 0`} stroke="#8C2A1F" strokeWidth="6" strokeLinecap="round" fill="none" />
        </>
      );
    case 'egg':
      return (
        <>
          <path d={`M-2 ${h - 2} Q10 4 60 5 Q110 1 150 4 Q210 0 250 6 Q300 6 304 ${h - 2} Q150 ${h + 3} -2 ${h - 2} Z`} fill={ing.c} stroke="#EFE6CF" strokeWidth="1" />
          <ellipse cx="150" cy={h - 5} rx="46" ry={h - 2} fill={ing.c2} />
          <ellipse cx="135" cy={h - 11} rx="14" ry="3" fill="#fff" opacity=".45" />
        </>
      );
    case 'orings':
      return (
        <>
          {[40, 110, 180, 250].map((x, i) => (
            <ellipse key={i} cx={x + (i % 2) * 6} cy={h / 2} rx="40" ry={h / 2 - 3} fill="none" stroke={i % 2 ? ing.c : ing.c2} strokeWidth="8" />
          ))}
        </>
      );
    case 'fries':
      return (
        <>
          {Array.from({ length: 30 }, (_, i) => {
            const x = -12 + i * 11 + r() * 4, rot = (r() - 0.5) * 30;
            return <rect key={i} x={x} y={2 + r() * 4} width="9" height={h - 4} rx="2" fill={i % 3 ? ing.c : ing.c2} transform={`rotate(${rot + 90} ${x + 4} ${h / 2}) translate(0 0)`} />;
          })}
        </>
      );
    case 'hash':
      return (
        <>
          <defs><Grad id={gid} a={ing.c2} b={ing.c} /></defs>
          <rect x="18" y="1" width="264" height={h - 2} rx="8" fill={G} />
          {Array.from({ length: 26 }, (_, i) => <rect key={i} x={24 + r() * 250} y={3 + r() * (h - 8)} width={6 + r() * 8} height="1.6" rx=".8" fill="#8A5518" opacity=".5" />)}
        </>
      );
    case 'pineapple':
      return (
        <>
          <rect x="10" y="1" width="280" height={h - 2} rx={(h - 2) / 2} fill={ing.c} />
          <rect x="120" y="3" width="60" height={h - 6} rx="4" fill="#FFE98A" />
          {[40, 70, 210, 240].map((x) => <path key={x} d={`M${x} 2 l14 ${h - 4}`} stroke={ing.c2} strokeWidth="3" opacity=".65" />)}
        </>
      );
    case 'pastrami':
      return (
        <>
          {[0, 1, 2].map((i) => (
            <path key={i} d={`M4 ${4 + i * 4} q24 -9 48 0 t48 0 t48 0 t48 0 t48 0 t48 0`} stroke={i === 1 ? ing.c2 : ing.c} strokeWidth="6" fill="none" strokeLinecap="round" />
          ))}
        </>
      );
    case 'crumbs':
      return (
        <>
          {Array.from({ length: 60 }, (_, i) => <ellipse key={i} cx={6 + r() * 288} cy={1 + r() * (h - 2)} rx={3 + r() * 5} ry={1.2 + r() * 1.5} fill={i % 2 ? ing.c : ing.c2} transform={`rotate(${r() * 60 - 30})`} style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />)}
        </>
      );
    case 'nachos':
      return (
        <>
          {Array.from({ length: 10 }, (_, i) => {
            const x = 4 + i * 29, up = i % 2 === 0;
            return <path key={i} d={up ? `M${x} ${h} L${x + 17} 0 L${x + 36} ${h} Z` : `M${x} 1 L${x + 36} 1 L${x + 18} ${h} Z`} fill={up ? ing.c : ing.c2} stroke="#C98B1E" strokeWidth=".8" />;
          })}
        </>
      );
    case 'poppers':
      return (
        <>
          {[14, 86, 158, 228].map((x, i) => (
            <g key={i}>
              <rect x={x} y="1" width="62" height={h - 2} rx={(h - 2) / 2} fill={ing.c} />
              <rect x={x + 6} y="3" width="30" height="4" rx="2" fill={ing.c2} opacity=".8" />
            </g>
          ))}
        </>
      );
    case 'mac':
      return (
        <>
          <defs><Grad id={gid} a={ing.c2} b={ing.c} /></defs>
          <rect x="10" y="1" width="280" height={h - 2} rx="9" fill={G} />
          {Array.from({ length: 22 }, (_, i) => {
            const x = 20 + r() * 255, y = 5 + r() * (h - 10);
            return <path key={i} d={`M${x} ${y} a4 4 0 0 1 8 0`} stroke="#FFF0B8" strokeWidth="2.2" fill="none" strokeLinecap="round" />;
          })}
        </>
      );
    default:
      return <rect x="10" y="0" width="280" height={h} rx="6" fill={ing.c} />;
  }
}

// Слой перерисовывается только при смене ингредиента: SVG с текстурами — самая дорогая часть экрана
const LayerSvg = React.memo(function LayerSvg({ layerKey, gid }) {
  const { h } = layerBox(layerKey);
  return (
    <svg width="300" height={h} viewBox={`0 0 300 ${h}`} style={{ overflow: 'visible', display: 'block' }} aria-hidden="true">
      <LayerShape layerKey={layerKey} gid={gid} />
    </svg>
  );
});

// Миниатюра ингредиента для карточек
export function IngredientThumb({ ing, size = 84 }) {
  const gid = `t-${ing.id}`;
  if (ing.cat === 'bun') {
    return (
      <svg width="100%" height={size} viewBox="-10 -6 320 132" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <g transform="translate(0 0)"><LayerShape layerKey={`top:${ing.id}`} gid={gid + 'a'} /></g>
        <g transform="translate(0 84)"><LayerShape layerKey={`bottom:${ing.id}`} gid={gid + 'b'} /></g>
      </svg>
    );
  }
  const { h } = layerBox(ing.id);
  const sy = ing.vis === 'cheese' || ing.vis === 'sauce' ? 2.2 : Math.max(1, Math.min(3, 44 / h));
  return (
    <svg width="100%" height={size} viewBox="16 -6 268 80" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <g transform={`translate(0 ${34 - (h * sy) / 2}) scale(1 ${sy})`}>
        <LayerShape layerKey={ing.id} gid={gid} />
      </g>
    </svg>
  );
}

// Главная визуализация: слои бургера сверху вниз, автоматический "отъезд камеры"
export function BurgerStack({ layers, maxH = 360, maxW = 300, maxScale = 1.25, animate = true, intro = false, ruler = false, cm = 0, compact = false }) {
  const visible = layers.filter((l) => !l.hidden);
  const seen = useRef(null);
  const [fresh, setFresh] = useState(() => new Set(intro ? visible.map((l) => l.uid) : []));

  useLayoutEffect(() => {
    if (!animate) return;
    if (seen.current === null) {
      seen.current = new Set(visible.map((l) => l.uid));
      return;
    }
    const n = new Set();
    for (const l of visible) if (!seen.current.has(l.uid)) n.add(l.uid);
    seen.current = new Set(visible.map((l) => l.uid));
    if (n.size) setFresh(n);
  }, [visible.map((l) => l.uid).join(',')]);

  useEffect(() => {
    if (!fresh.size) return;
    const t = setTimeout(() => setFresh(new Set()), 900 + fresh.size * 70);
    return () => clearTimeout(t);
  }, [fresh]);

  const boxes = visible.map((l) => layerBox(l.key));
  const total = boxes.reduce((s, b, i) => s + b.h - (i === 0 ? 0 : b.o), 0) + 30;
  const scale = Math.max(0.12, Math.min(maxScale, (maxH - 24) / total, maxW / 316));
  const freshList = visible.filter((l) => fresh.has(l.uid)).map((l) => l.uid);

  return (
    <div className="stack-wrap" style={{ height: maxH }}>
      {ruler && visible.length > 0 && (
        <div className="ruler" style={{ height: (total - 30) * scale, bottom: 30 * scale, transform: `translateX(${-(150 * scale) - 26}px)` }}>
          <span className="ruler-label">{cm.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} см</span>
        </div>
      )}
      <div className="stack" style={{ transform: `scale(${scale})`, height: total }}>
        {visible.map((l, i) => {
          const b = boxes[i];
          const fi = freshList.indexOf(l.uid);
          const isFresh = fi >= 0;
          const delay = isFresh ? (freshList.length > 1 ? (freshList.length - 1 - fi) * 55 : 0) : 0;
          return (
            <div
              key={l.uid}
              className={`layer${isFresh ? ' drop' : ''}`}
              style={{ height: b.h, marginTop: i === 0 ? 0 : -b.o, zIndex: visible.length - i, animationDelay: `${delay}ms` }}
            >
              <LayerSvg layerKey={l.key} gid={`g${l.uid}`} />
            </div>
          );
        })}
        <div className="plate-shadow" />
      </div>
      {visible.length === 0 && <div className="stack-empty">Добавь первый ингредиент</div>}
    </div>
  );
}

// Хот-дог (вид сбоку): булочка, сосиска, соус волной
export function HotdogArt({ w = 120, sauce = '#F5A20F', spicy = false }) {
  return (
    <svg viewBox="0 0 160 80" width={w} height={w / 2} aria-hidden="true">
      <defs>
        <linearGradient id="hd-bun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#F2B865" /><stop offset="1" stopColor="#C9782A" /></linearGradient>
        <linearGradient id="hd-saus" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#C2502E" /><stop offset="1" stopColor="#8E2F17" /></linearGradient>
      </defs>
      <path d="M14 44 Q14 70 40 70 L120 70 Q146 70 146 44 Z" fill="url(#hd-bun)" />
      <rect x="6" y="30" width="148" height="22" rx="11" fill="url(#hd-saus)" />
      <path d="M14 36 q8 -6 16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0" stroke={spicy ? '#E0352B' : sauce} strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M18 46 Q18 30 40 28 L120 28 Q142 30 142 46" fill="none" stroke="#E8A34E" strokeWidth="3" opacity=".7" />
      <ellipse cx="52" cy="62" rx="16" ry="3" fill="#fff" opacity=".22" />
    </svg>
  );
}

// Картинка товара меню: бургер по слоям, хот-дог или иконка в кружке
export function ProductArt({ p, size = 120 }) {
  if (p?.image) return <img className="prod-img" src={p.image} alt="" loading="lazy" decoding="async" draggable="false" />;
  if (p?.keys?.length) return <BurgerStack layers={toLayersCached(p.keys)} maxH={size} maxW={size} maxScale={0.6} animate={false} />;
  if (p?.cat === 'hotdogs') return <HotdogArt w={size} spicy={/чили|chili/i.test(p.name || '')} />;
  return <span className="prod-ico" style={{ width: size * 0.62, height: size * 0.62 }}><span className="ms fill" style={{ fontSize: size * 0.32 }}>{p?.icon || (p?.cat === 'healthy' ? 'eco' : p?.cat === 'drinks' ? 'local_drink' : p?.cat === 'sauces' ? 'water_drop' : 'restaurant')}</span></span>;
}
const keyCache = new Map();
function toLayersCached(keys) {
  const k = keys.join('|');
  if (!keyCache.has(k)) keyCache.set(k, keys.map((key, i) => ({ uid: `p${i}-${key}`, key, hidden: false })));
  return keyCache.get(k);
}
